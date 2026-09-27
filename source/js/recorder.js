// recorder.js — lot C : cabine d'enregistrement, IndexedDB, export zip.
// Contrat : ARCHITECTURE.md §10. Les voix valent "papa" ou "maman".
//
// Stockage : base IndexedDB « syllabaire-audio », store « voix »,
// clé « <voix>/<id> », valeur { blob, type, date }.

import { Data } from './data.js';

const NOM_BASE = 'syllabaire-audio';
const NOM_STORE = 'voix';
const NOMS_VOIX = { papa: 'Papa', maman: 'Maman' };

// ---------------------------------------------------------------------------
// IndexedDB
// ---------------------------------------------------------------------------

let promesseBase = null;

function requete(req) {
  return new Promise((resoudre, rejeter) => {
    req.onsuccess = () => resoudre(req.result);
    req.onerror = () => rejeter(req.error);
  });
}

function cle(voix, id) { return `${voix}/${id}`; }

async function transaction(mode, travail) {
  const base = await Recorder.ouvrir();
  return new Promise((resoudre, rejeter) => {
    const tx = base.transaction(NOM_STORE, mode);
    const store = tx.objectStore(NOM_STORE);
    let resultat;
    Promise.resolve(travail(store)).then((r) => { resultat = r; }, rejeter);
    tx.oncomplete = () => resoudre(resultat);
    tx.onerror = () => rejeter(tx.error);
    tx.onabort = () => rejeter(tx.error || new Error('transaction annulée'));
  });
}

// Safari a longtemps refusé certains Blob en IndexedDB : on retombe alors sur
// un ArrayBuffer, reconverti en Blob à la lecture.
function versBlob(valeur) {
  if (!valeur || !valeur.blob) return null;
  if (valeur.blob instanceof Blob) return valeur.blob;
  try { return new Blob([valeur.blob], { type: valeur.type || '' }); } catch (e) { return null; }
}

// ---------------------------------------------------------------------------
// Enregistrement
// ---------------------------------------------------------------------------

const MIME_CANDIDATS = [
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
];

function meilleurMime() {
  if (typeof MediaRecorder === 'undefined') return '';
  if (typeof MediaRecorder.isTypeSupported !== 'function') return '';
  return MIME_CANDIDATS.find((t) => MediaRecorder.isTypeSupported(t)) || '';
}

function extensionDe(type) {
  const t = (type || '').toLowerCase();
  if (t.includes('mp4') || t.includes('aac') || t.includes('m4a')) return 'm4a';
  if (t.includes('webm')) return 'webm';
  if (t.includes('ogg')) return 'ogg';
  if (t.includes('wav')) return 'wav';
  return 'm4a';
}

let flux = null;            // MediaStream gardé pour ne demander le micro qu'une fois
let ctxAnalyse = null;      // AudioContext dédié au vumètre
let analyseur = null;
let tamponAnalyse = null;
let enCours = null;         // { recorder, annule, minuterie }

async function obtenirFlux() {
  if (flux && flux.getAudioTracks().some((p) => p.readyState === 'live')) return flux;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    const e = new Error('Micro indisponible sur ce navigateur (HTTPS requis).');
    e.name = 'MicroIndisponible';
    throw e;
  }
  flux = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  brancherAnalyseur();
  return flux;
}

function brancherAnalyseur() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!ctxAnalyse || ctxAnalyse.state === 'closed') ctxAnalyse = new Ctx();
    const source = ctxAnalyse.createMediaStreamSource(flux);
    analyseur = ctxAnalyse.createAnalyser();
    analyseur.fftSize = 1024;
    tamponAnalyse = new Float32Array(analyseur.fftSize);
    source.connect(analyseur); // pas de sortie vers les haut-parleurs
  } catch (e) {
    analyseur = null;
  }
}

// ---------------------------------------------------------------------------
// Zip « store » (sans compression), écrit à la main
// ---------------------------------------------------------------------------

let tableCrc = null;
function crc32(octets) {
  if (!tableCrc) {
    tableCrc = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      tableCrc[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < octets.length; i++) crc = tableCrc[(crc ^ octets[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dateDos(d) {
  const heure = (d.getHours() << 11) | (d.getMinutes() << 5) | (Math.floor(d.getSeconds() / 2));
  const jour = ((Math.max(d.getFullYear(), 1980) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { heure, jour };
}

function construireZip(fichiers) {
  // fichiers : [{ nom, octets: Uint8Array, date: Date }]
  const encodeur = new TextEncoder();
  const morceaux = [];
  const central = [];
  let decalage = 0;

  for (const f of fichiers) {
    const nom = encodeur.encode(f.nom);
    const crc = crc32(f.octets);
    const taille = f.octets.length;
    const { heure, jour } = dateDos(f.date || new Date());

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);        // version nécessaire
    local.setUint16(6, 0x0800, true);    // drapeaux : noms en UTF-8
    local.setUint16(8, 0, true);         // méthode 0 = store
    local.setUint16(10, heure, true);
    local.setUint16(12, jour, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, taille, true);
    local.setUint32(22, taille, true);
    local.setUint16(26, nom.length, true);
    local.setUint16(28, 0, true);
    morceaux.push(new Uint8Array(local.buffer), nom, f.octets);

    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);            // version créatrice
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint16(10, 0, true);
    c.setUint16(12, heure, true);
    c.setUint16(14, jour, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, taille, true);
    c.setUint32(24, taille, true);
    c.setUint16(28, nom.length, true);
    c.setUint16(30, 0, true);            // extra
    c.setUint16(32, 0, true);            // commentaire
    c.setUint16(34, 0, true);            // disque
    c.setUint16(36, 0, true);            // attributs internes
    c.setUint32(38, 0, true);            // attributs externes
    c.setUint32(42, decalage, true);     // position de l'en-tête local
    central.push(new Uint8Array(c.buffer), nom);

    decalage += 30 + nom.length + taille;
  }

  const tailleCentral = central.reduce((s, m) => s + m.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true);
  fin.setUint16(4, 0, true);
  fin.setUint16(6, 0, true);
  fin.setUint16(8, fichiers.length, true);
  fin.setUint16(10, fichiers.length, true);
  fin.setUint32(12, tailleCentral, true);
  fin.setUint32(16, decalage, true);
  fin.setUint16(20, 0, true);

  return new Blob([...morceaux, ...central, new Uint8Array(fin.buffer)], { type: 'application/zip' });
}

// ---------------------------------------------------------------------------
// Liste des entrées à enregistrer (syllabes, sons isolés, phrases)
// ---------------------------------------------------------------------------

let promesseExtra = null;
function chargerExtra() {
  if (!promesseExtra) {
    promesseExtra = fetch(new URL('../data/audio_extra.json', import.meta.url))
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => []);
  }
  return promesseExtra;
}

async function entreesACabiner() {
  if (!Array.isArray(Data.syllabes) || !Data.syllabes.length) {
    try { await Data.charger(); } catch (e) { /* on fait avec ce qu'on a */ }
  }
  const extra = await chargerExtra();
  const texteExtra = new Map(extra.map((x) => [x.id, x.texte]));
  const entrees = [];

  const syllabes = [...(Data.syllabes || [])];
  const paliers = [...new Set(syllabes.map((s) => s.palier))].sort((a, b) => a - b);
  for (const p of paliers) {
    for (const s of syllabes) {
      if (s.palier === p) entrees.push({ id: s.id, texte: s.texte, genre: 'syllabe', palier: p });
    }
  }

  const sons = [...(Data.sons || [])];
  const rangType = (s) => (s.type === 'consonne' ? 0 : 1);
  sons.sort((a, b) => rangType(a) - rangType(b) || a.ordre - b.ordre);
  for (const s of sons) {
    if (s.id === 'h') continue; // h muet : pas de son isolé
    entrees.push({ id: `son-${s.id}`, texte: s.affiche, genre: 'son', palier: s.palier });
  }

  for (const x of extra) {
    if (x.id.startsWith('phrase-')) entrees.push({ id: x.id, texte: x.texte, genre: 'phrase', palier: null });
  }
  // Sons présents dans audio_extra mais absents de Data (sécurité)
  const connus = new Set(entrees.map((e) => e.id));
  for (const x of extra) {
    if (x.id.startsWith('son-') && x.id !== 'son-h' && !connus.has(x.id)) {
      entrees.push({ id: x.id, texte: texteExtra.get(x.id), genre: 'son', palier: null });
    }
  }
  return entrees;
}

// ---------------------------------------------------------------------------
// Utilitaires DOM
// ---------------------------------------------------------------------------

function el(balise, attrs = {}, ...enfants) {
  const n = document.createElement(balise);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'texte') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const e of enfants.flat()) {
    if (e === null || e === undefined || e === false) continue;
    n.append(e instanceof Node ? e : document.createTextNode(String(e)));
  }
  return n;
}

const nf = new Intl.NumberFormat('fr-FR');

// Lecteur unique pour la cabine (synthèse ou enregistrement).
let lecteur = null;
let urlLecteur = null;
function jouer(source) {
  arreterLecture();
  lecteur = document.createElement('audio');
  if (source instanceof Blob) {
    urlLecteur = URL.createObjectURL(source);
    lecteur.src = urlLecteur;
  } else {
    lecteur.src = source;
  }
  return lecteur.play().catch(() => {});
}
function arreterLecture() {
  if (lecteur) { try { lecteur.pause(); } catch (e) { /* rien */ } lecteur = null; }
  if (urlLecteur) { URL.revokeObjectURL(urlLecteur); urlLecteur = null; }
}

// ---------------------------------------------------------------------------
// API publique
// ---------------------------------------------------------------------------

export const Recorder = {
  // Ouvre (une fois) la base IndexedDB. Renvoie une promesse de IDBDatabase.
  ouvrir() {
    if (!promesseBase) {
      promesseBase = new Promise((resoudre, rejeter) => {
        if (typeof indexedDB === 'undefined') { rejeter(new Error('IndexedDB indisponible')); return; }
        const req = indexedDB.open(NOM_BASE, 1);
        req.onupgradeneeded = () => {
          const base = req.result;
          if (!base.objectStoreNames.contains(NOM_STORE)) base.createObjectStore(NOM_STORE);
        };
        req.onsuccess = () => resoudre(req.result);
        req.onerror = () => rejeter(req.error);
        req.onblocked = () => rejeter(new Error('IndexedDB bloquée'));
      }).catch((e) => { promesseBase = null; throw e; });
    }
    return promesseBase;
  },

  // Blob enregistré, ou null (ne lève jamais d'erreur : utilisé par Audio).
  async blob(voix, id) {
    try {
      const valeur = await transaction('readonly', (s) => requete(s.get(cle(voix, id))));
      return versBlob(valeur);
    } catch (e) {
      return null;
    }
  },

  // Ids enregistrés pour cette voix.
  async lister(voix) {
    try {
      const plage = IDBKeyRange.bound(`${voix}/`, `${voix}0`, false, true);
      const cles = await transaction('readonly', (s) => requete(s.getAllKeys(plage)));
      return (cles || []).map((k) => String(k).slice(voix.length + 1));
    } catch (e) {
      return [];
    }
  },

  // Enregistre au micro jusqu'à Recorder.arreter() ou dureeMax, sauve et renvoie le Blob.
  // Renvoie null si l'enregistrement a été annulé (Recorder.annuler()).
  // Option dureeMin (ms) : une prise plus courte n'est pas sauvée (renvoie null,
  // Recorder.dernierRefus = 'court') et l'ancienne prise est conservée.
  async enregistrer(voix, id, { dureeMax = 3000, dureeMin = 0 } = {}) {
    Recorder.dernierRefus = null;
    if (enCours) Recorder.annuler();
    if (typeof MediaRecorder === 'undefined') {
      const e = new Error('Enregistrement impossible sur ce navigateur.');
      e.name = 'MicroIndisponible';
      throw e;
    }
    const jeton = { annule: false, arretDemande: false, recorder: null, minuterie: null };
    enCours = jeton;
    if (ctxAnalyse && ctxAnalyse.state === 'suspended') ctxAnalyse.resume().catch(() => {});

    let f;
    try {
      f = await obtenirFlux();
    } catch (e) {
      if (enCours === jeton) enCours = null;
      throw e;
    }
    if (ctxAnalyse && ctxAnalyse.state === 'suspended') ctxAnalyse.resume().catch(() => {});
    if (jeton.annule) { if (enCours === jeton) enCours = null; return null; }

    const mime = meilleurMime();
    const rec = mime ? new MediaRecorder(f, { mimeType: mime }) : new MediaRecorder(f);
    jeton.recorder = rec;
    const morceaux = [];

    const blob = await new Promise((resoudre, rejeter) => {
      rec.ondataavailable = (ev) => { if (ev.data && ev.data.size) morceaux.push(ev.data); };
      rec.onerror = (ev) => rejeter(ev.error || new Error('MediaRecorder'));
      rec.onstop = () => {
        jeton.fin = performance.now();
        clearTimeout(jeton.minuterie);
        const type = (rec.mimeType || mime || (morceaux[0] && morceaux[0].type) || 'audio/mp4');
        resoudre(new Blob(morceaux, { type }));
      };
      rec.start();
      jeton.debut = performance.now();
      jeton.dureeMax = dureeMax;
      jeton.minuterie = setTimeout(() => { if (rec.state !== 'inactive') rec.stop(); }, dureeMax);
      // Relâché pendant la demande d'autorisation ou le démarrage : on s'arrête tout de suite.
      if (jeton.arretDemande) rec.stop();
    }).finally(() => { if (enCours === jeton) enCours = null; });

    if (jeton.annule || !blob.size) return null;
    if (dureeMin && (jeton.fin || performance.now()) - jeton.debut < dureeMin) { Recorder.dernierRefus = 'court'; return null; }
    const valeur = { blob, type: blob.type, date: new Date().toISOString() };
    try {
      await transaction('readwrite', (s) => requete(s.put(valeur, cle(voix, id))));
    } catch (e) {
      // Repli Safari : stocker les octets bruts.
      const octets = await blob.arrayBuffer();
      await transaction('readwrite', (s) => requete(s.put({ ...valeur, blob: octets }, cle(voix, id))));
    }
    return blob;
  },

  async supprimer(voix, id) {
    await transaction('readwrite', (s) => requete(s.delete(cle(voix, id))));
  },

  // Blob zip (méthode store) : <id>.<ext> + manifest.json { "<voix>": [ids] }.
  async exporterZip(voix) {
    const ids = (await Recorder.lister(voix)).sort();
    const fichiers = [];
    const faits = [];
    for (const id of ids) {
      const valeur = await transaction('readonly', (s) => requete(s.get(cle(voix, id))));
      const b = versBlob(valeur);
      if (!b) continue;
      const octets = new Uint8Array(await b.arrayBuffer());
      fichiers.push({
        nom: `${id}.${extensionDe(valeur.type || b.type)}`,
        octets,
        date: valeur.date ? new Date(valeur.date) : new Date(),
      });
      faits.push(id);
    }
    const manifeste = JSON.stringify({ [voix]: faits }, null, 1);
    fichiers.push({ nom: 'manifest.json', octets: new TextEncoder().encode(manifeste), date: new Date() });
    return construireZip(fichiers);
  },

  // --- Ajouts du lot C (hors contrat, compatibles) -------------------------

  // Arrête l'enregistrement en cours (le Blob est sauvé normalement).
  arreter() {
    if (!enCours) return;
    enCours.arretDemande = true;
    const r = enCours.recorder;
    if (r && r.state !== 'inactive') r.stop();
  },

  // Interrompt l'enregistrement en cours sans rien sauver.
  annuler() {
    if (!enCours) return;
    enCours.annule = true;
    Recorder.arreter();
  },

  enregistrementEnCours() { return !!enCours; },

  dernierRefus: null,

  // Niveau sonore courant du micro, entre 0 et 1 (0 hors enregistrement).
  niveau() {
    if (!analyseur || !tamponAnalyse) return 0;
    analyseur.getFloatTimeDomainData(tamponAnalyse);
    let somme = 0;
    for (let i = 0; i < tamponAnalyse.length; i++) somme += tamponAnalyse[i] * tamponAnalyse[i];
    const rms = Math.sqrt(somme / tamponAnalyse.length);
    return Math.min(1, rms * 4);
  },

  // Coupe le micro (libère l'icône d'enregistrement d'iOS et rend le son normal).
  liberer() {
    Recorder.annuler();
    if (flux) flux.getTracks().forEach((p) => p.stop());
    flux = null;
    analyseur = null;
    if (ctxAnalyse) { ctxAnalyse.close().catch(() => {}); ctxAnalyse = null; }
  },

  // Supprime tous les enregistrements d'une voix.
  async vider(voix) {
    const plage = IDBKeyRange.bound(`${voix}/`, `${voix}0`, false, true);
    await transaction('readwrite', (s) => requete(s.delete(plage)));
  },

  // Nombre total d'entrées à enregistrer et liste détaillée (pour l'écran parent).
  entrees: entreesACabiner,

  // -------------------------------------------------------------------------
  // Cabine
  // -------------------------------------------------------------------------
  monterCabine(conteneur, { voix = 'papa' } = {}) {
    let detruit = false;
    let entrees = [];
    let faits = new Set();
    let filtrePalier = 'tout';      // 'tout' | 1..6 | 'sons' | 'phrases'
    let nonFaitsSeulement = false;
    let enchainer = true;
    let courant = null;             // id courant
    let animation = null;
    let appuiActif = false;
    let enregistrementPromesse = null;

    conteneur.classList.add('cabine');
    conteneur.innerHTML = '';

    const compteur = el('span', { class: 'cabine-compteur', 'aria-live': 'polite' });
    const jauge = el('div', { class: 'cabine-jauge' }, el('div', { class: 'cabine-jauge-plein' }));
    const entete = el('div', { class: 'cabine-entete' },
      el('h3', { texte: `Voix de ${NOMS_VOIX[voix] || voix}` }),
      compteur,
      jauge,
    );

    const filtres = el('div', { class: 'cabine-filtres', role: 'group', 'aria-label': 'Filtrer' });
    const caseNonFaits = el('input', { type: 'checkbox', id: `cabine-nonfaits-${voix}` });
    const caseEnchainer = el('input', { type: 'checkbox', id: `cabine-enchainer-${voix}`, checked: true });
    const options = el('div', { class: 'cabine-options' },
      el('label', { class: 'interrupteur', for: caseNonFaits.id }, caseNonFaits, el('span', { texte: 'Non faits seulement' })),
      el('label', { class: 'interrupteur', for: caseEnchainer.id }, caseEnchainer, el('span', { texte: 'Passer au suivant après chaque prise' })),
    );

    const liste = el('div', { class: 'cabine-liste', role: 'listbox', 'aria-label': 'Entrées à enregistrer' });

    // Panneau principal
    const texteGrand = el('div', { class: 'cabine-texte script' });
    const texteCursif = el('div', { class: 'cabine-texte-cursif cursif' });
    const infoEntree = el('div', { class: 'cabine-info' });
    const etat = el('div', { class: 'cabine-etat', 'aria-live': 'polite' });
    const vumetre = el('div', { class: 'cabine-vumetre', 'aria-hidden': 'true' }, el('div', { class: 'cabine-vumetre-niveau' }));
    const minuteur = el('div', { class: 'cabine-duree', 'aria-hidden': 'true' }, el('div', { class: 'cabine-duree-plein' }));

    const btnSynthese = el('button', { type: 'button', class: 'bouton secondaire' }, '🔈 Écouter la synthèse');
    const btnMicro = el('button', {
      type: 'button', class: 'cabine-micro',
      'aria-label': 'Maintenir appuyé pour enregistrer (ou barre d\'espace)',
    }, el('span', { class: 'cabine-micro-icone', 'aria-hidden': 'true', texte: '🎙️' }),
       el('span', { class: 'cabine-micro-texte', texte: 'Maintenir pour parler' }));
    const btnReecoute = el('button', { type: 'button', class: 'bouton secondaire' }, '▶︎ Réécouter ma voix');
    const btnSupprimer = el('button', { type: 'button', class: 'bouton danger-leger' }, 'Supprimer');
    const btnPrec = el('button', { type: 'button', class: 'bouton secondaire', 'aria-label': 'Entrée précédente' }, '← Précédente');
    const btnSuiv = el('button', { type: 'button', class: 'bouton secondaire', 'aria-label': 'Entrée suivante' }, 'Suivante →');

    const panneau = el('div', { class: 'cabine-panneau' },
      el('div', { class: 'cabine-carte' }, infoEntree, texteGrand, texteCursif),
      el('div', { class: 'cabine-actions' }, btnSynthese, btnReecoute, btnSupprimer),
      el('div', { class: 'cabine-zone-micro' }, btnMicro, vumetre, minuteur),
      etat,
      el('div', { class: 'cabine-nav' }, btnPrec, btnSuiv),
      el('p', { class: 'cabine-aide', texte: 'Maintiens le bouton micro (ou la barre d\'espace), dis la syllabe, relâche. Une prise remplace la précédente.' }),
    );

    conteneur.append(
      entete,
      el('div', { class: 'cabine-barre' }, filtres, options),
      el('div', { class: 'cabine-corps' }, liste, panneau),
    );
    texteGrand.textContent = 'Chargement…';

    function dureePour(e) { return e && e.genre === 'phrase' ? 5000 : 3000; }

    function visibles() {
      return entrees.filter((e) => {
        if (filtrePalier === 'sons' && e.genre !== 'son') return false;
        if (filtrePalier === 'phrases' && e.genre !== 'phrase') return false;
        if (typeof filtrePalier === 'number' && !(e.genre === 'syllabe' && e.palier === filtrePalier)) return false;
        if (nonFaitsSeulement && faits.has(e.id) && e.id !== courant) return false;
        return true;
      });
    }

    function entreeCourante() { return entrees.find((e) => e.id === courant) || null; }

    function majCompteur() {
      const total = entrees.length;
      const n = entrees.reduce((s, e) => s + (faits.has(e.id) ? 1 : 0), 0);
      compteur.textContent = `${nf.format(n)} / ${nf.format(total)} faits`;
      jauge.firstChild.style.width = total ? `${(100 * n) / total}%` : '0';
      // Compteurs par filtre
      for (const b of filtres.querySelectorAll('button')) {
        const f = b.dataset.filtre;
        const sous = entrees.filter((e) => (f === 'tout') || (f === 'sons' && e.genre === 'son')
          || (f === 'phrases' && e.genre === 'phrase') || (e.genre === 'syllabe' && String(e.palier) === f));
        const k = sous.filter((e) => faits.has(e.id)).length;
        b.querySelector('small').textContent = `${k}/${sous.length}`;
      }
    }

    function construireFiltres() {
      filtres.innerHTML = '';
      const paliers = [...new Set(entrees.filter((e) => e.genre === 'syllabe').map((e) => e.palier))].sort((a, b) => a - b);
      const choix = [['tout', 'Tout'], ...paliers.map((p) => [String(p), `Palier ${p}`]), ['sons', 'Sons seuls'], ['phrases', 'Phrases']];
      for (const [val, libelle] of choix) {
        const b = el('button', { type: 'button', class: 'puce', 'data-filtre': val, 'aria-pressed': String(String(filtrePalier) === val) },
          libelle, ' ', el('small'));
        b.addEventListener('click', () => {
          filtrePalier = /^\d+$/.test(val) ? Number(val) : val;
          for (const x of filtres.querySelectorAll('button')) x.setAttribute('aria-pressed', String(x === b));
          const v = visibles();
          if (!v.some((e) => e.id === courant)) courant = (v.find((e) => !faits.has(e.id)) || v[0] || {}).id || null;
          rendreListe();
          rendreCourant();
        });
        filtres.append(b);
      }
    }

    function rendreListe() {
      liste.innerHTML = '';
      const v = visibles();
      if (!v.length) {
        liste.append(el('p', { class: 'cabine-vide', texte: nonFaitsSeulement ? 'Tout est enregistré ici. Bravo !' : 'Rien à afficher.' }));
        return;
      }
      let groupe = null;
      const frag = document.createDocumentFragment();
      for (const e of v) {
        const g = e.genre === 'syllabe' ? `Palier ${e.palier}` : e.genre === 'son' ? 'Sons seuls' : 'Phrases';
        if (g !== groupe) { groupe = g; frag.append(el('div', { class: 'cabine-groupe', texte: g })); }
        const b = el('button', {
          type: 'button', role: 'option',
          class: `cabine-item ${e.genre}${faits.has(e.id) ? ' fait' : ''}${e.id === courant ? ' courant' : ''}`,
          'data-id': e.id, 'aria-selected': String(e.id === courant),
          title: e.id,
        }, e.texte);
        frag.append(b);
      }
      liste.append(frag);
    }

    liste.addEventListener('click', (ev) => {
      const b = ev.target.closest('.cabine-item');
      if (!b) return;
      aller(b.dataset.id);
    });

    function majItem(id) {
      const b = liste.querySelector(`.cabine-item[data-id="${CSS.escape(id)}"]`);
      if (!b) return;
      b.classList.toggle('fait', faits.has(id));
      b.classList.toggle('courant', id === courant);
      b.setAttribute('aria-selected', String(id === courant));
    }

    function aller(id, { defiler = true } = {}) {
      if (appuiActif) return;
      const ancien = courant;
      courant = id;
      if (ancien) majItem(ancien);
      if (nonFaitsSeulement && ancien && faits.has(ancien)) {
        const vieux = liste.querySelector(`.cabine-item[data-id="${CSS.escape(ancien)}"]`);
        if (vieux) vieux.remove();
      }
      if (!liste.querySelector(`.cabine-item[data-id="${CSS.escape(id)}"]`)) rendreListe();
      majItem(id);
      rendreCourant();
      if (defiler) {
        const b = liste.querySelector(`.cabine-item[data-id="${CSS.escape(id)}"]`);
        if (b) {
          // Défilement interne de la liste seulement (pas de la page).
          const haut = b.offsetTop; // la liste est l'offsetParent (position: relative)
          if (haut < liste.scrollTop + 30) liste.scrollTop = Math.max(0, haut - 40);
          else if (haut + b.offsetHeight > liste.scrollTop + liste.clientHeight) liste.scrollTop = haut + b.offsetHeight - liste.clientHeight + 10;
        }
      }
    }

    function voisin(sens) {
      const v = visibles();
      const i = v.findIndex((e) => e.id === courant);
      if (i < 0) return v[0] || null;
      return v[i + sens] || null;
    }

    function suivantApresPrise() {
      const v = visibles();
      const i = v.findIndex((e) => e.id === courant);
      for (let k = i + 1; k < v.length; k++) if (!faits.has(v[k].id)) return v[k];
      return v[i + 1] || null;
    }

    function rendreCourant() {
      const e = entreeCourante();
      etat.textContent = '';
      etat.className = 'cabine-etat';
      if (!e) {
        texteGrand.textContent = '—';
        texteCursif.textContent = '';
        infoEntree.textContent = '';
        for (const b of [btnSynthese, btnMicro, btnReecoute, btnSupprimer, btnPrec, btnSuiv]) b.disabled = true;
        return;
      }
      texteGrand.textContent = e.texte;
      texteCursif.textContent = e.genre === 'phrase' ? '' : e.texte;
      texteGrand.classList.toggle('phrase', e.genre === 'phrase');
      texteCursif.hidden = e.genre === 'phrase';
      const genre = e.genre === 'syllabe' ? `Syllabe · palier ${e.palier}` : e.genre === 'son' ? 'Son seul' : 'Phrase d\'encouragement';
      infoEntree.textContent = `${genre} · ${faits.has(e.id) ? 'enregistrée ✓' : 'à enregistrer'}`;
      infoEntree.classList.toggle('fait', faits.has(e.id));
      btnSynthese.disabled = false;
      btnMicro.disabled = false;
      btnReecoute.disabled = !faits.has(e.id);
      btnSupprimer.disabled = !faits.has(e.id);
      btnPrec.disabled = !voisin(-1);
      btnSuiv.disabled = !voisin(1);
    }

    function message(texte, genre = '') {
      etat.textContent = texte;
      etat.className = `cabine-etat ${genre}`;
    }

    function animer() {
      if (detruit) return;
      const n = Recorder.niveau();
      vumetre.firstChild.style.transform = `scaleX(${Math.max(0.02, n).toFixed(3)})`;
      vumetre.classList.toggle('fort', n > 0.9);
      const jeton = enCours;
      if (jeton && jeton.debut) {
        const p = Math.min(1, (performance.now() - jeton.debut) / jeton.dureeMax);
        minuteur.firstChild.style.transform = `scaleX(${p.toFixed(3)})`;
      }
      animation = requestAnimationFrame(animer);
    }

    async function debutAppui() {
      const e = entreeCourante();
      if (!e || appuiActif || enregistrementPromesse) return;
      appuiActif = true;
      arreterLecture();
      btnMicro.classList.add('actif');
      conteneur.classList.add('enregistre');
      message('J\'écoute… relâche quand tu as fini.', 'info');
      minuteur.firstChild.style.transform = 'scaleX(0)';
      cancelAnimationFrame(animation);
      animation = requestAnimationFrame(animer);
      const id = e.id;
      enregistrementPromesse = Recorder.enregistrer(voix, id, { dureeMax: dureePour(e), dureeMin: 350 });
      let blob = null;
      try {
        blob = await enregistrementPromesse;
      } catch (err) {
        const refus = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
        message(refus
          ? 'Micro refusé. Autorise le micro pour ce site (Réglages > Safari > Micro), puis réessaie.'
          : `Micro indisponible : ${err && err.message ? err.message : err}`, 'erreur');
      } finally {
        enregistrementPromesse = null;
        appuiActif = false;
        btnMicro.classList.remove('actif');
        conteneur.classList.remove('enregistre');
        cancelAnimationFrame(animation);
        vumetre.firstChild.style.transform = 'scaleX(0.02)';
      }
      if (detruit) return;
      if (!blob) {
        if (Recorder.dernierRefus === 'court') message('Trop court : maintiens le bouton pendant que tu parles.', 'erreur');
        else if (etat.classList.contains('info')) message('Rien n\'a été capté. Réessaie en maintenant le bouton.', 'erreur');
        return;
      }
      faits.add(id);
      majItem(id);
      majCompteur();
      rendreCourant();
      message(`« ${e.texte} » enregistré ✓`, 'ok');
      if (enchainer && courant === id) {
        const s = suivantApresPrise();
        if (s) setTimeout(() => {
          if (!detruit && !appuiActif && courant === id) { aller(s.id); message(`« ${e.texte} » enregistré ✓`, 'ok'); }
        }, 450);
      }
    }

    function finAppui() {
      if (!appuiActif) return;
      Recorder.arreter();
    }

    // Pointeur : maintenir appuyé.
    btnMicro.addEventListener('pointerdown', (ev) => {
      if (ev.button !== undefined && ev.button !== 0) return;
      ev.preventDefault();
      try { btnMicro.setPointerCapture(ev.pointerId); } catch (e) { /* rien */ }
      debutAppui();
    });
    for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) btnMicro.addEventListener(t, finAppui);
    btnMicro.addEventListener('contextmenu', (ev) => ev.preventDefault());
    btnMicro.addEventListener('click', (ev) => ev.preventDefault());

    // Clavier : barre d'espace maintenue (et flèches pour naviguer).
    function surToucheBas(ev) {
      if (detruit || !conteneur.isConnected) return;
      const cible = ev.target;
      if (cible && (cible.tagName === 'INPUT' && cible.type !== 'checkbox' || cible.tagName === 'TEXTAREA' || cible.tagName === 'SELECT')) return;
      if (ev.code === 'Space' || ev.key === ' ') {
        ev.preventDefault();
        if (!ev.repeat) debutAppui();
      } else if (ev.key === 'ArrowRight' && !appuiActif) {
        const s = voisin(1); if (s) { ev.preventDefault(); aller(s.id); }
      } else if (ev.key === 'ArrowLeft' && !appuiActif) {
        const s = voisin(-1); if (s) { ev.preventDefault(); aller(s.id); }
      }
    }
    function surToucheHaut(ev) {
      if (ev.code === 'Space' || ev.key === ' ') { ev.preventDefault(); finAppui(); }
    }
    document.addEventListener('keydown', surToucheBas);
    document.addEventListener('keyup', surToucheHaut);
    // Si la fenêtre perd le focus pendant un appui, on arrête proprement.
    window.addEventListener('blur', finAppui);

    btnSynthese.addEventListener('click', () => {
      const e = entreeCourante();
      if (e) jouer(new URL(`../audio/tts/${e.id}.m4a`, import.meta.url).href);
    });
    btnReecoute.addEventListener('click', async () => {
      const e = entreeCourante();
      if (!e) return;
      const b = await Recorder.blob(voix, e.id);
      if (b) jouer(b); else message('Pas encore d\'enregistrement pour cette entrée.', 'info');
    });
    btnSupprimer.addEventListener('click', async () => {
      const e = entreeCourante();
      if (!e) return;
      await Recorder.supprimer(voix, e.id).catch(() => {});
      faits.delete(e.id);
      majItem(e.id);
      majCompteur();
      rendreCourant();
      message(`Enregistrement de « ${e.texte} » supprimé. La synthèse reprend le relais.`, 'info');
    });
    btnPrec.addEventListener('click', () => { const s = voisin(-1); if (s) aller(s.id); });
    btnSuiv.addEventListener('click', () => { const s = voisin(1); if (s) aller(s.id); });

    caseNonFaits.addEventListener('change', () => {
      nonFaitsSeulement = caseNonFaits.checked;
      const v = visibles();
      if (nonFaitsSeulement && faits.has(courant)) {
        const s = v.find((e) => !faits.has(e.id));
        courant = s ? s.id : null;
      }
      rendreListe();
      rendreCourant();
    });
    caseEnchainer.addEventListener('change', () => { enchainer = caseEnchainer.checked; });

    // Chargement initial
    (async () => {
      try {
        const [liste1, ids] = await Promise.all([entreesACabiner(), Recorder.lister(voix)]);
        if (detruit) return;
        entrees = liste1;
        faits = new Set(ids);
      } catch (e) {
        message(`Impossible de charger la liste : ${e.message || e}`, 'erreur');
        return;
      }
      construireFiltres();
      const premier = entrees.find((e) => !faits.has(e.id)) || entrees[0];
      courant = premier ? premier.id : null;
      majCompteur();
      rendreListe();
      rendreCourant();
      if (courant) aller(courant);
      if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices) {
        message('Ce navigateur ne permet pas d\'enregistrer (il faut Safari ou Chrome récents, en HTTPS).', 'erreur');
      }
    })();

    return function demonter() {
      detruit = true;
      cancelAnimationFrame(animation);
      document.removeEventListener('keydown', surToucheBas);
      document.removeEventListener('keyup', surToucheHaut);
      window.removeEventListener('blur', finAppui);
      arreterLecture();
      Recorder.liberer();
      conteneur.classList.remove('cabine', 'enregistre');
    };
  },
};
