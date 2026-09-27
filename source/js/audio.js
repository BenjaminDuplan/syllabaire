// Audio — mégaphone, résolution de la voix, bruitages WebAudio, déblocage iOS.
// Voir ARCHITECTURE.md §5. Toute lecture résout sa promesse à la fin du son,
// ou immédiatement (avec un avertissement) si le fichier manque.

import { Store } from './store.js';
import { Recorder } from './recorder.js';

let ctx = null;
let maitre = null;             // gain général
let debloque = false;
let courant = null;            // { source?, element?, fin() } : lecture vocale en cours
const tampons = new Map();     // clé (url ou "idb:voix/id") → Promise<AudioBuffer|null>
let manifeste = null;          // Promise<{papa:[], maman:[]}>
let recorderEnPanne = false;   // évite de répéter l'avertissement
const manquants = new Set();   // fichiers déjà signalés absents

function contexte() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  maitre = ctx.createGain();
  maitre.gain.value = 0.9;
  maitre.connect(ctx.destination);
  return ctx;
}

function avertirManquant(cle, raison) {
  if (manquants.has(cle)) return;
  manquants.add(cle);
  console.warn(`Audio : ${cle} indisponible (${raison}), rien n'est joué`);
}

// ---------- résolution de la source ----------

// Le manifeste liste des ids (« m-a », fichier .m4a) ou des noms complets (« m-a.webm »).
function tableFichiers(liste) {
  const t = new Map();
  for (const e of liste || []) {
    const m = /^(.*)\.(m4a|mp4|webm|ogg|wav)$/.exec(e);
    t.set(m ? m[1] : e, m ? e : `${e}.m4a`);
  }
  return t;
}

function chargerManifeste() {
  if (!manifeste) {
    manifeste = fetch('audio/voix/manifest.json')
      .then(r => (r.ok ? r.json() : {}))
      .catch(() => ({}))
      .then(m => ({ papa: tableFichiers(m?.papa), maman: tableFichiers(m?.maman) }));
  }
  return manifeste;
}

function voixCandidates() {
  const v = Store.profilActif()?.voix || 'auto';
  if (v === 'papa') return ['papa'];
  if (v === 'maman') return ['maman'];
  if (v === 'tts') return [];
  return ['papa', 'maman'];
}

async function blobEnregistre(voix, id) {
  if (recorderEnPanne) return null;
  try {
    return (await Recorder.blob(voix, id)) || null;
  } catch (e) {
    recorderEnPanne = true;
    console.warn('Audio : Recorder.blob indisponible, voix enregistrées ignorées', e?.message || e);
    return null;
  }
}

// Renvoie { cle, charger: () => Promise<ArrayBuffer|null> } pour l'identifiant audio `id`.
async function resoudre(id) {
  const voix = voixCandidates();
  for (const v of voix) {
    const b = await blobEnregistre(v, id);
    if (b) return { cle: `idb:${v}/${id}`, blob: b };
  }
  if (voix.length) {
    const m = await chargerManifeste();
    for (const v of voix) {
      if (m[v]?.has(id)) return { cle: `audio/voix/${v}/${m[v].get(id)}`, url: `audio/voix/${v}/${m[v].get(id)}` };
    }
  }
  return { cle: `audio/tts/${id}.m4a`, url: `audio/tts/${id}.m4a` };
}

async function lireOctets(src) {
  if (src.blob) return src.blob.arrayBuffer();
  const r = await fetch(src.url);
  if (!r.ok) { avertirManquant(src.url, `HTTP ${r.status}`); return null; }
  return r.arrayBuffer();
}

function decoder(octets) {
  const c = contexte();
  if (!c || !octets) return Promise.resolve(null);
  // Safari ancien : decodeAudioData à rappels uniquement.
  return new Promise((ok) => {
    try {
      const p = c.decodeAudioData(octets, ok, () => ok(null));
      if (p && p.catch) p.catch(() => ok(null));
    } catch (e) { ok(null); }
  });
}

async function tampon(id) {
  const src = await resoudre(id);
  if (!tampons.has(src.cle)) {
    const p = (async () => {
      try {
        const buf = await decoder(await lireOctets(src));
        if (!buf) avertirManquant(src.cle, 'décodage impossible');
        return buf;
      } catch (e) {
        avertirManquant(src.cle, e?.message || 'erreur réseau');
        return null;
      }
    })();
    tampons.set(src.cle, p);
    // Un fichier absent peut apparaître plus tard (synthèse en cours de génération) : ne pas figer l'échec.
    p.then(b => { if (!b) tampons.delete(src.cle); });
  }
  return tampons.get(src.cle);
}

// ---------- lecture ----------

// Joue l'identifiant audio `id`. La promesse résout toujours : à la fin du son,
// dès que Audio.stop() est appelé (même pendant le chargement), ou en cas d'erreur (404 compris).
function jouerId(id) {
  Audio.stop();
  return new Promise((fin) => {
    let fini = false;
    let garde = null;
    const jeton = {};
    const terminer = () => {
      if (fini) return;
      fini = true;
      clearTimeout(garde);
      if (courant === jeton) courant = null;
      fin();
    };
    jeton.fin = terminer;
    courant = jeton;
    (async () => {
      const buf = await tampon(id);
      if (fini || !buf) return terminer();          // arrêté entre-temps, ou fichier absent
      const c = contexte();
      if (c.state === 'suspended') { try { await c.resume(); } catch (e) { /* geste requis */ } }
      if (fini) return;
      const s = c.createBufferSource();
      s.buffer = buf;
      s.connect(maitre);
      // Filet de sécurité : si le contexte reste suspendu, onended ne vient jamais.
      garde = setTimeout(terminer, buf.duration * 1000 + 600);
      s.onended = terminer;
      jeton.source = s;
      s.start();
    })().catch((e) => { console.warn(`Audio : lecture de ${id} impossible`, e); terminer(); });
  });
}

// ---------- bruitages synthétisés ----------

function note(c, { f, t0, duree, type = 'triangle', vol = 0.25, f2 = null, dest = maitre }) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t0);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + duree);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duree);
  o.connect(g).connect(dest);
  o.start(t0);
  o.stop(t0 + duree + 0.05);
}

const BRUITAGES = {
  point(c, t) {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      note(c, { f, t0: t + i * 0.07, duree: 0.22, vol: 0.22 }));
  },
  rate(c, t) {
    note(c, { f: 392, t0: t, duree: 0.28, type: 'sine', vol: 0.16 });
    note(c, { f: 329.63, t0: t + 0.22, duree: 0.4, type: 'sine', vol: 0.14 });
  },
  fanfare(c, t) {
    const seq = [[392, 0], [523.25, 0.14], [659.25, 0.28], [783.99, 0.42], [659.25, 0.62], [783.99, 0.74]];
    seq.forEach(([f, d]) => note(c, { f, t0: t + d, duree: 0.2, type: 'square', vol: 0.07 }));
    seq.forEach(([f, d]) => note(c, { f, t0: t + d, duree: 0.2, vol: 0.12 }));
    [523.25, 659.25, 783.99, 1046.5].forEach(f =>
      note(c, { f, t0: t + 0.9, duree: 0.6, vol: 0.1 }));
  },
  flip(c, t) {
    const duree = 0.28;
    const n = Math.floor(c.sampleRate * duree);
    const b = c.createBuffer(1, n, c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const s = c.createBufferSource();
    s.buffer = b;
    const filtre = c.createBiquadFilter();
    filtre.type = 'bandpass';
    filtre.Q.value = 1.2;
    filtre.frequency.setValueAtTime(500, t);
    filtre.frequency.exponentialRampToValueAtTime(3000, t + duree);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duree);
    s.connect(filtre).connect(g).connect(maitre);
    s.start(t);
    s.stop(t + duree + 0.02);
  },
  tap(c, t) {
    note(c, { f: 1400, f2: 700, t0: t, duree: 0.05, type: 'sine', vol: 0.2 });
  },
};

// ---------- API ----------

export const Audio = {
  debloquer() {
    const c = contexte();
    if (!c) return;
    if (c.state === 'suspended') c.resume().catch(() => {});
    if (debloque) return;
    debloque = true;
    try {
      const silence = c.createBuffer(1, 1, 22050);
      const s = c.createBufferSource();
      s.buffer = silence;
      s.connect(c.destination);
      s.start(0);
    } catch (e) { console.warn('Audio : déblocage partiel', e); }
    chargerManifeste();
  },

  jouerSyllabe(syllabeId) {
    return jouerId(syllabeId);
  },

  jouerSon(sonId) {
    if (sonId === 'h') return Promise.resolve();   // h muet : pas de fichier
    return jouerId(`son-${sonId}`);
  },

  jouerPhrase(cle) {
    return jouerId(`phrase-${cle}`);
  },

  fx(nom) {
    const c = contexte();
    const f = BRUITAGES[nom];
    if (!c || !f) { if (!f) console.warn(`Audio.fx : bruitage inconnu « ${nom} »`); return; }
    if (c.state === 'suspended') c.resume().catch(() => {});
    try { f(c, c.currentTime + 0.01); } catch (e) { console.warn('Audio.fx', nom, e); }
  },

  // ids : identifiants audio complets (« ch-ou », « son-ch », « phrase-bravo »).
  precharger(ids = []) {
    return Promise.all([...new Set(ids)].map(id => tampon(id).catch(() => null)));
  },

  stop() {
    const c = courant;
    courant = null;
    if (!c) return;
    try { c.source?.stop(); } catch (e) { /* déjà arrêté */ }
    c.fin?.();
  },
};
