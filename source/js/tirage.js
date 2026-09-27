// Tirage — composition d'une manche. Voir ARCHITECTURE.md §7 et CLAUDE.md §5.

import { Store } from './store.js';
import { Data } from './data.js';
import { Srs } from './srs.js';

const MAX_DUES = 3;

function autreEcriture(e) { return e === 'script' ? 'cursif' : 'script'; }

function ecriturePour(index) {
  const r = Store.reglages().ecriture;
  if (r === 'script' || r === 'cursif') return r;
  return index % 2 === 0 ? 'script' : 'cursif';
}

// Syllabes dont les deux sons sont actifs pour ce profil.
function syllabesJouables(profilId) {
  const actifs = new Set(Srs.sonsActifs(profilId));
  return Data.syllabes.filter(s => actifs.has(s.consonne) && actifs.has(s.voyelle));
}

// Poids d'une syllabe : les moins vues et celles aux sons peu vus d'abord ;
// les syllabes acquises ou en attente de révision sortent rarement.
function poids(p, sy) {
  const b = p.boites[sy.id];
  const vues = b?.vues || 0;
  const vuSon = id => { const c = p.sons[id]; return c ? c.ok + c.ko : 0; };
  let w = 1 / Math.pow(1 + vues, 1.5);
  w *= 1 / (1 + (vuSon(sy.consonne) + vuSon(sy.voyelle)) / 20);
  if (b && b.boite >= 4) w *= 0.1;
  else if (b && b.prochaine > p.manches) w *= 0.3;
  return w;
}

function tirerPondere(liste, poidsDe) {
  const total = liste.reduce((t, x) => t + poidsDe(x), 0);
  let r = Math.random() * total;
  for (const x of liste) { r -= poidsDe(x); if (r <= 0) return x; }
  return liste[liste.length - 1];
}

function melanger(t) {
  for (let i = t.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [t[i], t[j]] = [t[j], t[i]];
  }
  return t;
}

// ---------- clé phonétique (pour écarter les homophones du mode « J'écoute ») ----------

const VOYELLES_PHON = {
  eacute: 'E', egrave: 'E', ecirc: 'E', ai: 'E', ei: 'E', et: 'E', er: 'E', ez: 'E',
  eau: 'o', au: 'o', o: 'o',
  y: 'i', i: 'i',
  in: 'in', ain: 'in', ein: 'in',
  an: 'an', en: 'an',
  eu: 'eu', oeu: 'eu',
  e: 'e',
};
const CONSONNES_PHON = { ccedil: 's', s: 's', k: 'k', qu: 'k', j: 'j', ge: 'j', gu: 'g', ph: 'f', w: 'w', h: '' };

function voyelleDouce(voyelleId) {
  const a = Data.sonsParId.get(voyelleId)?.affiche || voyelleId;
  return /^[eéèêiy]/.test(a);
}

export const Tirage = {
  // Clé de prononciation approximative : deux syllabes de même clé sont homophones
  // (ki/qui, sa/ça, sé/sai/set, gé/jé). Règles : ARCHITECTURE.md §7.
  clePhonetique(syllabeId) {
    const sy = Data.syllabesParId.get(syllabeId);
    if (!sy) return String(syllabeId);
    let c;
    if (sy.consonne === 'c') c = voyelleDouce(sy.voyelle) ? 's' : 'k';
    else if (sy.consonne === 'g') c = voyelleDouce(sy.voyelle) ? 'j' : 'g';
    else c = CONSONNES_PHON[sy.consonne] ?? sy.consonne;
    const v = VOYELLES_PHON[sy.voyelle] ?? sy.voyelle;
    return c + v;
  },

  manche(profilId, n = Store.reglages().tuilesParManche) {
    n = Math.max(1, n | 0);
    const p = Store.progres(profilId);
    const jouables = syllabesJouables(profilId);
    if (!jouables.length) { console.warn('Tirage : aucune syllabe jouable'); return []; }
    const parId = new Map(jouables.map(s => [s.id, s]));
    let dues = Srs.dues(profilId).filter(id => parId.has(id)).slice(0, MAX_DUES).map(id => parId.get(id));
    const poidsDe = sy => poids(p, sy);

    const choisies = [];
    const dejaPris = new Set();
    let consonnePrec = null;
    for (let i = 0; i < n; i++) {
      // Une syllabe ne revient qu'une fois, sauf si le vivier est trop petit.
      let vivier = jouables.filter(s => !dejaPris.has(s.id));
      if (!vivier.length) vivier = jouables;
      const okConsonne = s => s.consonne !== consonnePrec;

      let choix = dues.find(okConsonne);
      if (choix) dues = dues.filter(s => s !== choix);
      else {
        const possibles = vivier.filter(s => okConsonne(s) && !dues.includes(s));
        choix = possibles.length ? tirerPondere(possibles, poidsDe) : (dues.shift() || tirerPondere(vivier, poidsDe));
      }
      choisies.push(choix);
      dejaPris.add(choix.id);
      consonnePrec = choix.consonne;
    }
    return choisies.map((s, i) => ({ syllabeId: s.id, ecriture: ecriturePour(i) }));
  },

  // k syllabes proches (même consonne ou même voyelle, sons actifs du profil actif),
  // de graphie différente de la bonne réponse.
  distracteurs(syllabeId, k = 2) {
    const cible = Data.syllabesParId.get(syllabeId);
    const profilId = Store.etat.profilActif;
    const jouables = profilId ? syllabesJouables(profilId) : Data.syllabes;
    const cles = new Set([this.clePhonetique(syllabeId)]);   // aucune clé en double : ni homophone de la cible, ni entre eux
    const textes = new Set([cible?.texte]);
    const resultat = [];
    const essayer = (s) => {
      if (resultat.length >= k || s.id === syllabeId || textes.has(s.texte)) return;
      const cle = this.clePhonetique(s.id);
      if (cles.has(cle)) return;
      cles.add(cle); textes.add(s.texte); resultat.push(s.id);
    };
    melanger(jouables.filter(s => s.consonne === cible?.consonne || s.voyelle === cible?.voyelle)).forEach(essayer);
    // Complément si le vivier proche est trop maigre.
    if (resultat.length < k) melanger([...jouables]).forEach(essayer);
    if (resultat.length < k) melanger([...Data.syllabes]).forEach(essayer);
    return resultat;
  },

  // Insère une reprise 3 positions plus loin (ou en fin), dans l'autre écriture.
  // L'élément inséré porte `reprise: true`. Une syllabe n'est reprise qu'une fois par manche.
  // Mute et renvoie la manche.
  reinjecter(manche, index, syllabeId, ecriture) {
    if (manche.some(t => t.reprise && t.syllabeId === syllabeId)) return manche;   // une seule reprise par syllabe
    const item = { syllabeId, ecriture: autreEcriture(ecriture), reprise: true };
    const pos = index + 3;
    if (pos <= manche.length) manche.splice(pos, 0, item);
    else manche.push(item);
    return manche;
  },
};
