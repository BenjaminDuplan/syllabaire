// Écran « J'écoute » (lot D) — voir ARCHITECTURE.md §11.
// Le jeu joue une syllabe, l'enfant tape la bonne tuile parmi trois.
// `App` n'est pas importé (import circulaire avec app.js) : on passe par window.App.
import { Store } from './store.js';
import { Data } from './data.js';
import { Audio } from './audio.js';
import { Srs } from './srs.js';
import { Tirage } from './tirage.js';
import { Rewards } from './rewards.js';

// ---------------------------------------------------------------------------
// Réglages de rythme (ms)
// ---------------------------------------------------------------------------
const DUREE_RETOURNEE = 1500;   // la bonne tuile reste retournée
const DUREE_APRES_ERREUR = 2000; // délai minimal avant la suivante après une erreur
const GARDE_AUDIO = 5000;        // un son qui ne se termine jamais ne bloque pas la manche
const COULEURS = ['vert', 'rose', 'bleu', 'jaune', 'violet', 'orange', 'turquoise', 'corail'];
const COULEURS_REPLI = {
  vert: '#6cc66c', rose: '#f28ab2', bleu: '#5aa9e6', jaune: '#f7c948',
  violet: '#a78bdb', orange: '#f59f4c', turquoise: '#3cc5b9', corail: '#f47c6b',
};

// ---------------------------------------------------------------------------
// Clé phonétique : deux syllabes qui se prononcent pareil (sa / ça, sé / sai,
// ki / qui, gé / jé…) ne doivent jamais être proposées ensemble, sinon la
// question n'a pas de bonne réponse unique.
// ---------------------------------------------------------------------------
const VOYELLE_SON = {
  a: 'a', i: 'i', y: 'i', u: 'y', o: 'o', au: 'o', eau: 'o', ou: 'u',
  e: 'e', eu: 'e', oeu: 'e',
  // é et è confondus exprès : trop proches à l'oreille pour un QCM de CP.
  eacute: 'E', er: 'E', ez: 'E', egrave: 'E', ecirc: 'E', ai: 'E', ei: 'E', et: 'E',
  elle: 'El', enne: 'En', erre: 'Er', esse: 'Es', ette: 'Et',
  oi: 'wa', an: 'A', en: 'A', in: 'I', ain: 'I', ein: 'I', on: 'O', oin: 'wI',
  ian: 'jA', ion: 'jO', ien: 'jI', ieu: 'je',
  ill: 'ij', ail: 'aj', eil: 'Ej', euil: 'ej', ouil: 'uj',
};
const CONSONNE_SON = {
  ccedil: 's', k: 'k', qu: 'k', gu: 'g', ge: 'j', ph: 'f', h: '', ch: 'S',
  cr: 'kr', cl: 'kl',
};

function clePhonetique(syllabe) {
  if (!syllabe) return '';
  const v = syllabe.voyelle;
  const c = syllabe.consonne;
  const douce = /^(e|i|y)/.test(v); // c et g devant e, é, è, ê, i, y
  let son;
  if (c === 'c') son = douce ? 's' : 'k';
  else if (c === 'g') son = douce ? 'j' : 'g';
  else son = CONSONNE_SON[c] ?? c;
  return son + '|' + (VOYELLE_SON[v] ?? v);
}

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------
function melanger(tableau) {
  const t = tableau.slice();
  for (let i = t.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [t[i], t[j]] = [t[j], t[i]];
  }
  return t;
}

function autreEcriture(ecriture) {
  return ecriture === 'cursif' ? 'script' : 'cursif';
}

function syllabeParId(id) {
  if (Data.syllabesParId && typeof Data.syllabesParId.get === 'function') {
    const s = Data.syllabesParId.get(id);
    if (s) return s;
  }
  return (Data.syllabes || []).find((s) => s.id === id) || null;
}

function dateLocale() {
  const d = new Date();
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`;
}

const ICONE_MAISON = `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M6 23 24 8l18 15" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 21v19h9V29h6v11h9V21" fill="currentColor"/></svg>`;
const ICONE_MEGAPHONE = `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M8 26v12a3 3 0 0 0 3 3h7l18 12V11L18 23h-7a3 3 0 0 0-3 3z" fill="currentColor"/><path class="onde onde-1" d="M44 24a10 10 0 0 1 0 16" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round"/><path class="onde onde-2" d="M50 17a19 19 0 0 1 0 30" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round"/></svg>`;
const ICONE_ETOILE = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17.1l-5.9 3.2 1.3-6.5L2.5 9.3l6.6-.8z" fill="currentColor"/></svg>`;

// ---------------------------------------------------------------------------
// Écran
// ---------------------------------------------------------------------------
export const Listen = {
  // Exposé pour les tests et, au besoin, pour d'autres lots.
  clePhonetique,

  monter(conteneur, params = {}) {
    const profilId = params.profilId ?? Store.etat?.profilActif ?? Store.profilActif?.()?.id;
    const profil = (Store.profil && Store.profil(profilId)) || null;
    const couleurProfil = profil?.couleur || 'vert';

    let vivant = true;
    const minuteurs = new Set();
    let manche = [];
    try { manche = Tirage.manche(profilId) || []; } catch (e) { console.warn('Listen : tirage impossible', e); }

    if (!manche.length) {
      // Aucun son ouvert : rien à écouter, retour à l'accueil sans message.
      queueMicrotask(() => window.App?.aller('accueil'));
      return () => {};
    }

    // Règle commune (ARCHITECTURE §7) : total = tuiles tirées au départ, reprises exclues.
    const totalOrigine = manche.length;
    manche.forEach((m) => { m.reprise = !!m.reprise; });
    let index = 0;
    let score = 0;
    let verrou = true;      // true tant que la question n'accepte pas de tap
    let question = null;    // { item, syllabe, tuiles: [ { el, id } ] }
    const gains = new Map(); // sonId → niveau atteint
    const dejaReinjectees = new Set();

    try { Audio.precharger(manche.map((m) => m.syllabeId)); } catch (e) { /* facultatif */ }

    // ---- attente annulable ------------------------------------------------
    const attendre = (ms) => new Promise((resoudre) => {
      const t = setTimeout(() => { minuteurs.delete(t); resoudre(); }, ms);
      minuteurs.add(t);
    });
    // Un son qui échoue (fichier absent, iOS verrouillé) ou ne finit jamais ne bloque rien.
    const jouer = (fabrique) => {
      let p;
      try { p = Promise.resolve(fabrique()); } catch (e) { p = Promise.resolve(); }
      return Promise.race([p.catch(() => {}), attendre(GARDE_AUDIO)]);
    };

    // ---- squelette DOM ----------------------------------------------------
    conteneur.innerHTML = '';
    const racine = document.createElement('div');
    racine.className = 'ecoute';
    racine.style.setProperty('--couleur-profil', `var(--p-${couleurProfil}, ${COULEURS_REPLI[couleurProfil] || '#6cc66c'})`);
    racine.innerHTML = `
      <header class="ecoute-barre">
        <button type="button" class="ecoute-maison" aria-label="Accueil">${ICONE_MAISON}</button>
        <div class="ecoute-progression" aria-live="polite">
          <div class="ecoute-pastilles"></div>
          <div class="ecoute-compte"></div>
        </div>
        <div class="ecoute-score" aria-label="Points">${ICONE_ETOILE}<span class="ecoute-score-valeur">0</span></div>
      </header>
      <div class="ecoute-scene">
        <button type="button" class="ecoute-megaphone" aria-label="Réécouter">${ICONE_MEGAPHONE}</button>
        <div class="ecoute-tuiles"></div>
      </div>`;
    conteneur.appendChild(racine);

    const elPastilles = racine.querySelector('.ecoute-pastilles');
    const elCompte = racine.querySelector('.ecoute-compte');
    const elScore = racine.querySelector('.ecoute-score-valeur');
    const elScoreBloc = racine.querySelector('.ecoute-score');
    const elMegaphone = racine.querySelector('.ecoute-megaphone');
    const elTuiles = racine.querySelector('.ecoute-tuiles');

    // ---- mégaphone --------------------------------------------------------
    let jetonSon = 0;
    function jouerSyllabeCourante() {
      if (!question || !vivant) return Promise.resolve();
      const jeton = ++jetonSon;
      elMegaphone.classList.add('joue');
      try { Audio.stop(); } catch (e) { /* rien */ }
      return jouer(() => Audio.jouerSyllabe(question.item.syllabeId)).then(() => {
        if (jeton === jetonSon) elMegaphone.classList.remove('joue');
      });
    }
    const surMegaphone = () => {
      try { Audio.fx('tap'); } catch (e) { /* rien */ }
      jouerSyllabeCourante();
    };
    elMegaphone.addEventListener('click', surMegaphone);

    const surMaison = () => {
      try { Audio.fx('tap'); } catch (e) { /* rien */ }
      window.App?.aller('accueil');
    };
    racine.querySelector('.ecoute-maison').addEventListener('click', surMaison);

    // ---- progression ------------------------------------------------------
    // Seules les tuiles d'origine font avancer le compteur ; une reprise s'affiche sans l'avancer.
    function majProgression() {
      const faites = manche.slice(0, index).filter((m) => !m.reprise).length;
      const enReprise = !!manche[index]?.reprise;
      elPastilles.innerHTML = '';
      for (let i = 0; i < totalOrigine; i++) {
        const p = document.createElement('span');
        p.className = 'ecoute-pastille' + (i < faites ? ' faite' : '') + (i === faites && !enReprise ? ' courante' : '');
        elPastilles.appendChild(p);
      }
      const affiche = enReprise ? Math.max(faites, 1) : faites + 1;
      elCompte.textContent = `${Math.min(affiche, totalOrigine)} / ${totalOrigine}`;
      elScore.textContent = String(score);
    }

    // ---- composition des trois propositions ------------------------------
    function sonsActifs() {
      try {
        const liste = Srs.sonsActifs(profilId) || [];
        return new Set(liste.map((s) => (typeof s === 'string' ? s : s.id)));
      } catch (e) { return null; }
    }

    function cleTirage(id) {
      try { return typeof Tirage.clePhonetique === 'function' ? Tirage.clePhonetique(id) : null; } catch (e) { return null; }
    }

    function propositions(bonneId) {
      const bonne = syllabeParId(bonneId);
      const cles = new Set([clePhonetique(bonne)]);
      const clesTirage = new Set([cleTirage(bonneId)].filter(Boolean));
      const choisies = [];
      const essayer = (id) => {
        if (choisies.length >= 2 || !id || id === bonneId || choisies.includes(id)) return;
        const s = syllabeParId(id);
        if (!s) return;
        const cle = clePhonetique(s);
        const cleA = cleTirage(id);
        if (cles.has(cle) || (cleA && clesTirage.has(cleA))) return; // se prononce comme une autre proposition
        cles.add(cle);
        if (cleA) clesTirage.add(cleA);
        choisies.push(id);
      };

      let proposes = [];
      try { proposes = Tirage.distracteurs(bonneId, 2) || []; } catch (e) { proposes = []; }
      proposes.forEach(essayer);

      if (choisies.length < 2) {
        // Un second tirage peut suffire si Tirage est aléatoire.
        try { (Tirage.distracteurs(bonneId, 6) || []).forEach(essayer); } catch (e) { /* rien */ }
      }
      if (choisies.length < 2 && bonne) {
        // Repli : syllabes proches (même consonne ou même voyelle), sons actifs d'abord.
        const actifs = sonsActifs();
        const toutes = Data.syllabes || [];
        const proches = toutes.filter((s) => s.consonne === bonne.consonne || s.voyelle === bonne.voyelle);
        const ouverts = (s) => !actifs || (actifs.has(s.consonne) && actifs.has(s.voyelle));
        melanger(proches.filter(ouverts)).forEach((s) => essayer(s.id));
        melanger(proches).forEach((s) => essayer(s.id));
        melanger(toutes.filter((s) => s.palier <= bonne.palier)).forEach((s) => essayer(s.id));
      }
      return melanger([bonneId, ...choisies]);
    }

    function creerTuile(id, ecriture, couleur, rang) {
      const s = syllabeParId(id);
      const texte = s ? s.texte : id;
      const el = document.createElement('div');
      el.setAttribute('role', 'button');
      el.className = `tuile ${ecriture} ecoute-tuile entree`;
      el.style.setProperty('--couleur', `var(--p-${couleur}, ${COULEURS_REPLI[couleur]})`);
      el.style.setProperty('--rang', String(rang));
      el.setAttribute('aria-label', texte);
      el.innerHTML = `<div class="tuile-face avant ${ecriture}"></div><div class="tuile-face arriere ${autreEcriture(ecriture)}"></div>`;
      el.querySelector('.avant').textContent = texte;
      el.querySelector('.arriere').textContent = texte;
      return el;
    }

    // ---- une question -----------------------------------------------------
    async function poserQuestion(avecConsigne) {
      if (!vivant) return;
      if (index >= manche.length) { terminer(); return; }
      const item = manche[index];
      majProgression();

      const ids = propositions(item.syllabeId);
      const couleurs = melanger(COULEURS);
      elTuiles.innerHTML = '';
      question = { item, tuiles: [] };
      ids.forEach((id, rang) => {
        const el = creerTuile(id, item.ecriture || 'script', couleurs[rang], rang);
        el.addEventListener('click', () => surTap(id, el));
        elTuiles.appendChild(el);
        question.tuiles.push({ id, el });
      });
      verrou = true;
      const tuilesPosees = question.tuiles.slice();
      attendre(800).then(() => tuilesPosees.forEach((t) => t.el.classList.remove('entree')));

      if (avecConsigne) {
        await jouer(() => Audio.jouerPhrase('quelle-tuile'));
        if (!vivant) return;
      }
      // Les tuiles deviennent tapables dès que la syllabe commence : l'enfant peut répondre vite.
      verrou = false;
      jouerSyllabeCourante();
    }

    // ---- gains d'étoiles ---------------------------------------------------
    function niveaux(syllabe) {
      const n = {};
      if (!syllabe) return n;
      for (const sonId of [syllabe.consonne, syllabe.voyelle]) {
        try { n[sonId] = Srs.niveauSon(profilId, sonId); } catch (e) { n[sonId] = 0; }
      }
      return n;
    }
    function enregistrer(syllabeId, ok) {
      const syllabe = syllabeParId(syllabeId);
      const avant = niveaux(syllabe);
      try { Srs.resultat(profilId, syllabeId, ok); } catch (e) { console.warn('Listen : Srs.resultat', e); }
      const apres = niveaux(syllabe);
      for (const sonId of Object.keys(apres)) {
        if (apres[sonId] > avant[sonId]) {
          gains.set(sonId, Math.max(gains.get(sonId) || 0, apres[sonId]));
        }
      }
    }

    // ---- réponse -----------------------------------------------------------
    async function surTap(id, el) {
      if (verrou || !vivant || !question) return;
      verrou = true;
      jetonSon++;
      elMegaphone.classList.remove('joue');
      try { Audio.stop(); } catch (e) { /* rien */ }
      const { item } = question;
      const bonne = question.tuiles.find((t) => t.id === item.syllabeId);
      racine.classList.add('verrouillee');
      question.tuiles.forEach((t) => t.el.classList.remove('entree'));

      if (id === item.syllabeId) {
        score++;
        elScore.textContent = String(score);
        elScoreBloc.classList.remove('gagne');
        void elScoreBloc.offsetWidth; // relance l'animation
        elScoreBloc.classList.add('gagne');
        enregistrer(item.syllabeId, true);
        try { Rewards.point(el); } catch (e) { /* rien */ }
        try { Audio.fx('flip'); } catch (e) { /* rien */ }
        el.classList.add('choisie', 'retournee');
        question.tuiles.forEach((t) => { if (t.el !== el) t.el.classList.add('estompee'); });
        await attendre(DUREE_RETOURNEE);
      } else {
        el.classList.add('essayee');
        try { Rewards.presque(el); } catch (e) { /* rien */ }
        if (bonne) bonne.el.classList.add('clignote');
        question.tuiles.forEach((t) => { if (t !== bonne && t.el !== el) t.el.classList.add('estompee'); });
        enregistrer(item.syllabeId, false);
        // Une reprise ratée ne donne rien et n'est pas reprise à nouveau.
        if (!item.reprise && !dejaReinjectees.has(item.syllabeId)) {
          dejaReinjectees.add(item.syllabeId);
          try {
            const avant = new Set(manche);
            manche = Tirage.reinjecter(manche, index, item.syllabeId, item.ecriture) || manche;
            // Marquage propre, même si Tirage l'a déjà fait : l'élément ajouté est la reprise.
            manche.forEach((m, i) => { if (i > index && !avant.has(m) && m.syllabeId === item.syllabeId) m.reprise = true; });
          } catch (e) { console.warn('Listen : Tirage.reinjecter', e); }
        }
        const delai = attendre(DUREE_APRES_ERREUR);
        await jouer(() => Audio.jouerPhrase('presque'));
        if (!vivant) return;
        await jouerSyllabeCourante();
        await delai;
      }
      if (!vivant) return;
      racine.classList.remove('verrouillee');
      index++;
      poserQuestion(false);
    }

    // ---- fin de manche -----------------------------------------------------
    function terminer() {
      if (!vivant) return;
      const total = totalOrigine;
      try {
        const progres = Store.progres(profilId);
        progres.manches = (progres.manches || 0) + 1;
        progres.points = (progres.points || 0) + score;
        if (!Array.isArray(progres.historique)) progres.historique = [];
        progres.historique.push({ date: dateLocale(), mode: 'ecoute', score, total });
        Store.sauver();
      } catch (e) { console.warn('Listen : sauvegarde', e); }
      const listeGains = [...gains].map(([sonId, niveau]) => ({ sonId, niveau }));
      window.App?.aller('fin', { score, total, mode: 'ecoute', profilId, gains: listeGains });
    }

    // ---- départ --------------------------------------------------------------
    poserQuestion(true);

    return function demonter() {
      vivant = false;
      verrou = true;
      minuteurs.forEach((t) => clearTimeout(t));
      minuteurs.clear();
      try { Audio.stop(); } catch (e) { /* rien */ }
      elMegaphone.removeEventListener('click', surMegaphone);
    };
  },
};
