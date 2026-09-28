// App — démarrage, routeur d'écrans, écran d'accueil. Voir ARCHITECTURE.md §8.

import { Store } from './store.js';
import { Data } from './data.js';
import { Audio } from './audio.js';
import { Game } from './game.js';
import { Listen } from './listen.js';
import { Rewards } from './rewards.js';
import { Carte } from './carte.js';
import { Apprendre } from './apprendre.js';
import { Parent } from './parent.js';
import { Ours } from './ours.js';

// Profils créés au tout premier lancement. Les prénoms réels se saisissent
// dans l'écran parent : ils ne doivent jamais figurer dans le code (dépôt public).
const PROFILS_PAR_DEFAUT = [
  { prenom: 'Enfant 1', couleur: 'vert' },
  { prenom: 'Enfant 2', couleur: 'rose' },
];

// ---------- utilitaires partagés (exportés en plus du contrat) ----------

const ICONES = {
  maison: '<path d="M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-4.5v-5.5h-5V21H5a1 1 0 0 1-1-1z"/>',
  megaphone: '<path d="M3 10v4a1 1 0 0 0 1 1h2l5 4V5L6 9H4a1 1 0 0 0-1 1z"/><path d="M15 9a4 4 0 0 1 0 6M17.5 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  coche: '<path d="M5 12.5 10 17.5 19.5 7" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>',
  croix: '<path d="M7 7l10 10M17 7 7 17" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/>',
  etoile: '<path d="M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9z"/>',
  cadenas: '<path d="M7 10V7a5 5 0 0 1 10 0v3" fill="none" stroke="currentColor" stroke-width="2.2"/><rect x="5" y="10" width="14" height="11" rx="2.5"/>',
  carte: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9 4v14M15 6v14" stroke="currentColor" stroke-width="2"/>',
  oreille: '<path d="M7 9a5 5 0 0 1 10 0c0 3-3 4-3 7a3 3 0 0 1-5.5 1.6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M10 9.5a2 2 0 0 1 4 0c0 1.2-1 1.6-1.6 2.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  livre: '<path d="M3 5.5C5.5 4.5 8.5 4.5 12 6.5c3.5-2 6.5-2 9-1V19c-2.5-1-5.5-1-9 1-3.5-2-6.5-2-9-1z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 6.5V20" stroke="currentColor" stroke-width="2"/>',
};

export function icone(nom) {
  return `<svg class="icone" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${ICONES[nom] || ''}</svg>`;
}

// « 2026-09-27T18:02:00 » en heure locale.
export function dateLocale(d = new Date()) {
  const z = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`;
}

// Réduit la taille de police d'un élément texte jusqu'à ce qu'il tienne dans son parent.
export function ajusterTexte(el) {
  if (!el || !el.parentElement) return;
  el.style.fontSize = '';
  const parent = el.parentElement;
  const maxL = parent.clientWidth * 0.9, maxH = parent.clientHeight * 0.95;
  let taille = parseFloat(getComputedStyle(el).fontSize);
  for (let i = 0; i < 30 && taille > 12 && (el.scrollWidth > maxL || el.offsetHeight > maxH); i++) {
    taille *= 0.92;
    el.style.fontSize = taille + 'px';
  }
}

const echapper = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- écrans de secours (quand un autre lot n'est pas encore prêt) ----------

function monterIndisponible(conteneur, nom) {
  conteneur.innerHTML = `
    <div class="ecran-secours">
      <p>Cet écran arrive bientôt.</p>
      <button class="bouton-texte" data-aller="accueil">${icone('maison')} Accueil</button>
    </div>`;
  conteneur.querySelector('[data-aller]').addEventListener('click', () => App.aller('accueil'));
}

function monterFinSecours(conteneur, { score = 0, total = 0, mode = 'lis', profilId } = {}) {
  conteneur.innerHTML = `
    <div class="ecran-secours fin-secours">
      <p class="fin-score">${icone('etoile')} ${score} / ${total}</p>
      <div class="rang-boutons">
        <button class="bouton-texte grand" data-encore>Encore !</button>
        <button class="bouton-texte" data-accueil>${icone('maison')} Accueil</button>
      </div>
    </div>`;
  conteneur.querySelector('[data-encore]').addEventListener('click', () =>
    App.aller(mode === 'ecoute' ? 'ecoute' : 'jeu', { profilId }));
  conteneur.querySelector('[data-accueil]').addEventListener('click', () => App.aller('accueil'));
  try { Audio.fx('fanfare'); } catch (e) { /* silencieux */ }
}

// ---------- écran d'accueil ----------

function oursHTML(profil) {
  try {
    const points = Store.progres(profil.id).points;
    return Ours.svg(Ours.stade(points), profil.couleur);
  } catch (e) {
    console.warn('Ours indisponible :', e.message);
    return `<span class="accueil-ours-secours"></span>`;
  }
}

function monterAccueil(conteneur) {
  const profils = Store.etat.profils;
  conteneur.innerHTML = `
    <header class="accueil-haut">
      <h1 class="titre script">Syllabaire</h1>
      <button class="bouton-rond petit bouton-cadenas" aria-label="Espace parent">${icone('cadenas')}</button>
    </header>
    <div class="profils">
      ${profils.length ? profils.map(p => `
        <article class="accueil-profil" data-profil="${p.id}" style="--couleur: var(--p-${echapper(p.couleur)})">
          <div class="accueil-ours">${oursHTML(p)}</div>
          <h2 class="prenom">${echapper(p.prenom)}</h2>
          <div class="modes">
            <button class="bouton-mode" data-mode="jeu">${icone('livre')}<span>Je lis</span></button>
            <button class="bouton-mode" data-mode="ecoute">${icone('oreille')}<span>J'écoute</span></button>
            <button class="bouton-mode" data-mode="apprendre">${icone('megaphone')}<span>J'apprends</span></button>
          </div>
          <button class="lien-carte" data-mode="carte">${icone('carte')} carte des sons</button>
        </article>`).join('') : `<p class="message-vide">Demande à un parent de créer ton profil (cadenas en haut).</p>`}
    </div>`;

  conteneur.querySelector(".bouton-cadenas").addEventListener('click', () => { Audio.fx('tap'); App.aller('parent'); });
  conteneur.querySelectorAll('.accueil-profil [data-mode]').forEach(b => {
    b.addEventListener('click', () => {
      const profilId = b.closest('[data-profil]').dataset.profil;
      Store.etat.profilActif = profilId;
      Store.sauver();
      Audio.fx('tap');
      App.aller(b.dataset.mode, { profilId });
    });
  });
}

// ---------- routeur ----------

let demonter = null;

const ECRANS = {
  accueil: (c) => monterAccueil(c),
  jeu: (c, p) => Game.monter(c, p),
  ecoute: (c, p) => Listen.monter(c, p),
  fin: (c, p) => Rewards.monterFin(c, p),
  carte: (c, p) => Carte.monter(c, p),
  apprendre: (c, p) => Apprendre.monter(c, p),
  parent: (c, p) => Parent.monter(c, p),
};

export const App = {
  ecranActuel: null,

  aller(nom, params = {}) {
    const ecran = document.getElementById('ecran');
    if (typeof demonter === 'function') {
      try { demonter(); } catch (e) { console.warn('Démontage de', App.ecranActuel, e); }
    }
    demonter = null;
    // Nouveau <section> vide à chaque écran : aucun reste de l'écran précédent.
    const section = document.createElement('section');
    section.className = `ecran ecran-${nom}`;
    ecran.replaceChildren(section);
    App.ecranActuel = nom;
    document.body.dataset.ecran = nom;

    const monter = ECRANS[nom];
    if (!monter) { console.warn('App.aller : écran inconnu', nom); return App.aller('accueil'); }
    if (params.profilId === undefined && Store.etat.profilActif) params = { ...params, profilId: Store.etat.profilActif };
    try {
      const r = monter(section, params);
      if (typeof r === 'function') demonter = r;
    } catch (e) {
      console.warn(`Écran « ${nom} » indisponible :`, e.message);
      section.replaceChildren();
      if (nom === 'fin') monterFinSecours(section, params);
      else monterIndisponible(section, nom);
    }
    window.scrollTo(0, 0);
  },
};
window.App = App;

// ---------- démarrage ----------

async function demarrer() {
  Store.charger();
  const deverrouiller = () => Audio.debloquer();
  document.addEventListener('pointerdown', deverrouiller, { once: true, capture: true });
  document.addEventListener('keydown', deverrouiller, { once: true, capture: true });

  try {
    await Data.charger();
  } catch (e) {
    console.error(e);
    document.getElementById('ecran').innerHTML =
      `<section class="ecran ecran-secours"><p>Impossible de charger le syllabaire.</p></section>`;
    return;
  }
  if (Store.neuf && Store.etat.profils.length === 0) {
    PROFILS_PAR_DEFAUT.forEach(p => Store.creerProfil(p));
  }
  App.aller('accueil');
}

demarrer();
