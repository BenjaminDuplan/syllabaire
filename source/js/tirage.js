// Tirage — composition d'une manche. Voir ARCHITECTURE.md §7 et CLAUDE.md §5.

import { Store } from './store.js';
import { Data } from './data.js';
import { Srs } from './srs.js';

const MAX_DUES = 3;
const TUILES_PAR_DEFI = 5;        // au plus un défi pour 5 tuiles (2 dans une manche de 10)
const NIVEAU_DEFI = 2;            // argent : les deux sons de la syllabe doivent y être (réglage « auto »)

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

// ---------- défis : syllabes qui se ressemblent ----------

// Niveau d'étoiles d'une syllabe = celui de son son le moins avancé.
function niveauSyllabe(profilId, sy) {
  return Math.min(Srs.niveauSon(profilId, sy.consonne), Srs.niveauSon(profilId, sy.voyelle));
}

// Une syllabe a droit à un défi selon le réglage parent : jamais / toujours /
// auto (ses deux sons au moins argent, pour ne pas piéger un son qu'on découvre).
function defiPermis(profilId, sy) {
  const mode = Store.reglages().defis || 'auto';
  if (mode === 'jamais') return false;
  if (mode === 'toujours') return true;
  return niveauSyllabe(profilId, sy) >= NIVEAU_DEFI;
}

// Syllabes « voisines » d'une syllabe, parmi `jouables` : d'abord les pièges
// (un son commun, l'autre dans une paire de data/confusions.json : ba/da,
// bon/bou), puis la série (même consonne, autre voyelle : ga/go/gu). Jamais
// un homophone (clé phonétique identique), jamais la même graphie.
function voisines(sy, jouables, clePhon) {
  const cle = clePhon(sy.id);
  const pieges = [], serie = [];
  const vC = Data.voisins(sy.consonne), vV = Data.voisins(sy.voyelle);
  for (const t of jouables) {
    if (t.id === sy.id || t.texte === sy.texte || clePhon(t.id) === cle) continue;
    if ((t.voyelle === sy.voyelle && vC.has(t.consonne)) || (t.consonne === sy.consonne && vV.has(t.voyelle))) pieges.push(t);
    else if (t.consonne === sy.consonne) serie.push(t);
  }
  return [...melanger(pieges), ...melanger(serie)];
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
    const tuiles = this.ajouterDefis(profilId, choisies, jouables, n);
    return tuiles.map((t, i) => {
      const item = { syllabeId: t.sy.id, ecriture: ecriturePour(i) };
      if (t.defi) item.defi = true;
      return item;
    });
  },

  // Défis : juste après une syllabe bien connue, glisse une voisine qui lui
  // ressemble (ba puis da, bon puis bou, ga puis go). Au plus un défi pour 5
  // tuiles ; la manche garde sa longueur n (on retire des tuiles ordinaires en
  // fin de manche). Renvoie [ { sy, defi } ] ; les syllabes dues ne bougent pas.
  ajouterDefis(profilId, choisies, jouables, n) {
    const tuiles = choisies.map(sy => ({ sy }));
    const quota = Math.floor(n / TUILES_PAR_DEFI);
    if (quota <= 0 || !Data.confusions.length) return tuiles;
    const dues = new Set(Srs.dues(profilId));
    const pris = new Set(choisies.map(s => s.id));
    const clePhon = id => this.clePhonetique(id);
    const candidats = melanger(tuiles.map((t, i) => i).filter(i => defiPermis(profilId, tuiles[i].sy)));
    const ancres = [];
    for (const i of candidats) {
      if (ancres.length >= quota) break;
      const v = voisines(tuiles[i].sy, jouables, clePhon).find(t => !pris.has(t.id));
      if (!v) continue;
      pris.add(v.id);
      tuiles[i].ancre = true;
      ancres.push({ i, v });
    }
    if (!ancres.length) return tuiles;
    // Insertion de la fin vers le début pour garder les indices valides.
    ancres.sort((a, b) => b.i - a.i);
    for (const { i, v } of ancres) tuiles.splice(i + 1, 0, { sy: v, defi: true });
    // Retour à n tuiles : on retire des tuiles ordinaires (ni due, ni ancre, ni défi), en partant de la fin.
    for (let k = tuiles.length - 1; k >= 0 && tuiles.length > n; k--) {
      const t = tuiles[k];
      if (!t.defi && !t.ancre && !dues.has(t.sy.id)) tuiles.splice(k, 1);
    }
    while (tuiles.length > n) tuiles.pop();
    return tuiles;
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
    // Syllabe bien connue : les pièges d'abord (ba → da, bon → bou), puis les proches ordinaires.
    if (cible && profilId && defiPermis(profilId, cible)) voisines(cible, jouables, id => this.clePhonetique(id)).forEach(essayer);
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
