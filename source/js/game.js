// Game — écran « Je lis ». Voir ARCHITECTURE.md et CLAUDE.md §5.
// L'enfant lit la tuile à voix haute, le parent valide ✓ / ✗.

import { Store } from './store.js';
import { Data } from './data.js';
import { Audio } from './audio.js';
import { Srs } from './srs.js';
import { Tirage } from './tirage.js';
import { Rewards } from './rewards.js';
import { App, icone, dateLocale, ajusterTexte } from './app.js';

const DUREE_RETOURNE = 1500;   // temps d'affichage de l'autre écriture
const DUREE_FLIP = 600;        // animation CSS

function autre(e) { return e === 'script' ? 'cursif' : 'script'; }

// Contenu d'une face : consonne et voyelle dans deux <span> pour le surlignage.
function faceHTML(sy) {
  const c = Data.sonsParId.get(sy.consonne)?.affiche ?? '';
  const v = Data.sonsParId.get(sy.voyelle)?.affiche ?? '';
  if (c + v !== sy.texte) return `<span class="partie">${sy.texte}</span>`;
  return `<span class="partie consonne">${c}</span><span class="partie voyelle">${v}</span>`;
}

function attendre(ms, estVivant) {
  return new Promise(ok => setTimeout(ok, ms)).then(() => estVivant());
}

export const Game = {
  monter(conteneur, params = {}) {
    const profilId = params.profilId || Store.etat.profilActif;
    const profil = Store.profil(profilId);
    if (!profil) { App.aller('accueil'); return; }
    if (Store.etat.profilActif !== profilId) { Store.etat.profilActif = profilId; Store.sauver(); }

    const manche = Tirage.manche(profilId);
    const total = manche.length;
    let index = 0;
    let score = 0;
    let occupe = false;
    let vivant = true;
    const niveauxInitiaux = new Map();      // sonId → niveau au début de la manche
    const estVivant = () => vivant;

    conteneur.classList.add('ecran-jeu');
    conteneur.style.setProperty('--couleur', `var(--p-${profil.couleur})`);
    conteneur.innerHTML = `
      <header class="jeu-haut">
        <button class="bouton-rond petit maison" aria-label="Accueil">${icone('maison')}</button>
        <div class="progression" aria-label="Progression">
          <div class="pastilles"></div>
          <span class="compte"></span>
        </div>
        <div class="score" aria-label="Score">${icone('etoile')}<span class="score-valeur">0</span></div>
      </header>
      <div class="jeu-scene"><div class="tuile-place"></div></div>
      <footer class="jeu-bas">
        <button class="bouton-rond megaphone" aria-label="Écouter la syllabe">${icone('megaphone')}</button>
        <div class="validation">
          <button class="bouton-rond presque" aria-label="Presque">${icone('croix')}<span class="etiquette">Presque</span></button>
          <button class="bouton-rond bravo" aria-label="Bravo">${icone('coche')}<span class="etiquette">Bravo</span></button>
        </div>
      </footer>`;

    const $ = s => conteneur.querySelector(s);
    const place = $('.tuile-place');
    const btnOk = $('.bravo'), btnKo = $('.presque'), btnMega = $('.megaphone');
    let tuile = null;

    if (!total) {
      place.innerHTML = `<p class="message-vide">Aucune syllabe à lire pour l'instant.<br>Demande à un parent d'ouvrir des sons.</p>`;
      btnOk.disabled = btnKo.disabled = btnMega.disabled = true;
    }

    // Précharge syllabes, sons isolés et phrases de la manche.
    const ids = new Set(['phrase-a-toi', 'phrase-presque', 'phrase-bravo', 'phrase-super']);
    for (const t of manche) {
      const sy = Data.syllabesParId.get(t.syllabeId);
      ids.add(t.syllabeId);
      if (sy) { if (sy.consonne !== 'h') ids.add('son-' + sy.consonne); ids.add('son-' + sy.voyelle); }
    }
    Audio.precharger([...ids]);

    // La progression ne compte que les tuiles d'origine : une reprise ne fait pas avancer le compteur.
    function majProgression() {
      const faites = manche.slice(0, index).filter(t => !t.reprise).length;
      const enReprise = !!manche[index]?.reprise;
      const pastilles = [];
      for (let i = 0; i < total; i++) {
        const cls = i < faites ? ' faite' : (i === faites && !enReprise ? ' courante' : '');
        pastilles.push(`<span class="pastille${cls}"></span>`);
      }
      $('.pastilles').innerHTML = pastilles.join('');
      $('.compte').textContent = `${Math.min(enReprise ? Math.max(faites, 1) : faites + 1, total)} / ${total}`;
      $('.score-valeur').textContent = score;
    }

    function afficher() {
      const t = manche[index];
      const sy = Data.syllabesParId.get(t.syllabeId);
      place.innerHTML = `
        <div class="tuile ${t.ecriture}" style="--couleur: var(--p-${profil.couleur})">
          <div class="tuile-face avant"><span class="texte">${faceHTML(sy)}</span></div>
          <div class="tuile-face arriere"><span class="texte">${faceHTML(sy)}</span></div>
        </div>`;
      tuile = place.firstElementChild;
      tuile.classList.add('entree');
      // rAF pour le cas normal, setTimeout si l'onglet est en arrière-plan (rAF suspendu).
      const ajuster = () => tuile?.querySelectorAll('.texte').forEach(ajusterTexte);
      requestAnimationFrame(ajuster);
      setTimeout(ajuster, 120);
      document.fonts?.ready.then(ajuster);
      majProgression();
      occupe = false;
      activer(true);
    }

    function activer(oui) {
      btnOk.disabled = btnKo.disabled = !oui;
    }

    function noterResultat(syllabeId, ok) {
      const sy = Data.syllabesParId.get(syllabeId);
      if (sy) for (const s of [sy.consonne, sy.voyelle]) {
        if (!niveauxInitiaux.has(s)) niveauxInitiaux.set(s, Srs.niveauSon(profilId, s));
      }
      Srs.resultat(profilId, syllabeId, ok);
      Store.sauver();       // le résultat validé survit à un abandon de manche
    }

    async function retourner() {
      if (!vivant) return false;
      Audio.fx('flip');
      tuile.classList.remove('entree');
      tuile.classList.add('retournee');
      return attendre(DUREE_FLIP + DUREE_RETOURNE, estVivant);
    }

    async function valider() {
      if (occupe || !tuile) return;
      occupe = true; activer(false);
      const t = manche[index];
      noterResultat(t.syllabeId, true);
      score++;          // première lecture réussie, ou reprise réussie qui rend le point
      majProgression();
      try { Rewards.point(tuile); }
      catch (e) { console.warn('Rewards.point indisponible :', e.message); Audio.fx('point'); }
      if (Math.random() < 0.5) Audio.jouerPhrase(Math.random() < 0.5 ? 'bravo' : 'super');
      if (!(await retourner())) return;
      suivante();
    }

    async function rater() {
      if (occupe || !tuile) return;
      occupe = true; activer(false);
      const t = manche[index];
      const sy = Data.syllabesParId.get(t.syllabeId);
      noterResultat(t.syllabeId, false);
      try { Rewards.presque(tuile); }
      catch (e) { console.warn('Rewards.presque indisponible :', e.message); Audio.fx('rate'); }
      await Audio.jouerPhrase('presque'); if (!vivant) return;
      await Audio.jouerSyllabe(t.syllabeId); if (!vivant) return;
      const face = tuile.querySelector('.avant');
      const partieC = face.querySelector('.consonne'), partieV = face.querySelector('.voyelle');
      if (partieC && partieV) {
        partieC.classList.add('surligne');
        await Audio.jouerSon(sy.consonne);
        if (!(await attendre(250, estVivant))) return;
        partieC.classList.remove('surligne');
        partieV.classList.add('surligne');
        await Audio.jouerSon(sy.voyelle);
        if (!(await attendre(250, estVivant))) return;
        partieV.classList.remove('surligne');
        face.classList.add('surligne-tout');
        await Audio.jouerSyllabe(t.syllabeId);
        if (!(await attendre(200, estVivant))) return;
        face.classList.remove('surligne-tout');
      }
      if (!t.reprise) Tirage.reinjecter(manche, index, t.syllabeId, t.ecriture);
      majProgression();
      if (!(await retourner())) return;
      suivante();
    }

    function suivante() {
      if (!vivant) return;
      index++;
      if (index < manche.length) afficher();
      else terminer();
    }

    function terminer() {
      const p = Store.progres(profilId);
      p.manches++;
      p.points += score;
      p.historique.push({ date: dateLocale(), mode: 'lis', score, total });
      Store.sauver();
      const gains = [];
      for (const [sonId, avant] of niveauxInitiaux) {
        const niveau = Srs.niveauSon(profilId, sonId);
        if (niveau > avant) gains.push({ sonId, niveau });
      }
      App.aller('fin', { score, total, mode: 'lis', profilId, gains });
    }

    function megaphone() {
      if (!tuile) return;
      Audio.fx('tap');
      Audio.jouerSyllabe(manche[Math.min(index, manche.length - 1)].syllabeId);
    }

    btnOk.addEventListener('click', valider);
    btnKo.addEventListener('click', rater);
    btnMega.addEventListener('click', megaphone);
    $('.maison').addEventListener('click', () => { Audio.fx('tap'); App.aller('accueil'); });

    // Clavier (Mac) : → ou Entrée = Bravo, ← = Presque, espace = mégaphone.
    const clavier = (e) => {
      if (e.repeat) return;
      if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); valider(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); rater(); }
      else if (e.key === ' ') { e.preventDefault(); megaphone(); }
    };
    document.addEventListener('keydown', clavier);

    const redimension = () => tuile?.querySelectorAll('.texte').forEach(ajusterTexte);
    window.addEventListener('resize', redimension);

    if (total) {
      afficher();
      Audio.jouerPhrase('a-toi');
    } else majProgression();

    return function demonter() {
      vivant = false;
      Audio.stop();
      document.removeEventListener('keydown', clavier);
      window.removeEventListener('resize', redimension);
    };
  },
};
