// Apprendre — écran « J'apprends » : tous les sons du livre, à écouter à
// volonté, hors quiz. Voir ARCHITECTURE.md §9.
// Tap sur un son = on l'entend, et un panneau en bas le montre en grand avec
// quelques syllabes où il apparaît (la partie correspondante surlignée).
// Pas de score, pas de chronomètre, pas d'ours : l'écran reste calme.
import { Store } from './store.js';
import { Data } from './data.js';
import { Audio } from './audio.js';
import { Srs } from './srs.js';
import { CADENAS_SVG } from './rewards.js';
import { icone } from './app.js';

const MAX_EXEMPLES = 6;
const MIN_EXEMPLES_ACTIFS = 3;

// Appel audio silencieux : aucune erreur ne doit remonter jusqu'à l'enfant.
function son(fn) {
  try {
    const r = fn();
    if (r && typeof r.catch === 'function') r.catch(() => {});
    return r;
  } catch (e) { return undefined; }
}

const echapper = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Classe de taille selon la longueur de la graphie (« ouil », « enne » : plus petit).
function classeLongueur(texte) {
  const lg = [...texte].length;
  return lg >= 4 ? ' long4' : lg === 3 ? ' long3' : '';
}

function melanger(liste) {
  const t = [...liste];
  for (let i = t.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [t[i], t[j]] = [t[j], t[i]];
  }
  return t;
}

// Syllabes d'exemple pour un son : d'abord celles dont l'autre son est actif,
// par palier croissant (mélangées à l'intérieur d'un palier), une seule par
// son partenaire, 6 au plus. Moins de 3 → on complète avec les plus simples.
function choisirExemples(sonId, actifs) {
  const toutes = Data.syllabesDuSon(sonId);
  const partenaire = (sy) => (sy.consonne === sonId ? sy.voyelle : sy.consonne);
  // Mélange puis tri stable par palier = mélange à l'intérieur de chaque palier.
  const ordonner = (liste) => melanger(liste).sort((a, b) => a.palier - b.palier);
  const choix = [];
  const vus = new Set();
  const prendre = (liste) => {
    for (const sy of liste) {
      if (choix.length >= MAX_EXEMPLES) break;
      const p = partenaire(sy);
      if (vus.has(p)) continue;
      vus.add(p);
      choix.push(sy);
    }
  };
  prendre(ordonner(toutes.filter((sy) => actifs.has(partenaire(sy)))));
  if (choix.length < MIN_EXEMPLES_ACTIFS) prendre(ordonner(toutes));
  return choix;
}

function tuileSon(s, ouvert) {
  const aff = echapper(s.affiche);
  return `
    <button type="button" class="ap-son${ouvert ? '' : ' ferme'}${classeLongueur(s.affiche)}" data-son="${echapper(s.id)}" aria-label="${aff}">
      <span class="ap-son-script script">${aff}</span>
      <span class="ap-son-cursif cursif" aria-hidden="true">${aff}</span>
      ${ouvert ? '' : `<span class="ap-son-cadenas">${CADENAS_SVG}</span>`}
    </button>`;
}

function bloc(titre, classe, sons, ouverts) {
  const paliers = [...new Set(sons.map((s) => s.palier))].sort((a, b) => a - b);
  const lignes = paliers.map((p) => {
    const ouvert = ouverts.has(p);
    const duPalier = sons.filter((s) => s.palier === p); // ordre du livre conservé
    return `
      <div class="ap-palier${ouvert ? '' : ' ferme'}">
        <div class="ap-palier-num" aria-label="Étape ${p}"><span>${p}</span></div>
        <div class="ap-palier-sons">${duPalier.map((s) => tuileSon(s, ouvert)).join('')}</div>
      </div>`;
  }).join('');
  return `
    <section class="ap-bloc ${classe}">
      <h2 class="ap-bloc-titre">${titre}</h2>
      ${lignes}
    </section>`;
}

// Puce d'exemple : consonne et voyelle dans deux .partie, celle du son choisi surlignée.
function puceExemple(sy, sonId) {
  const c = Data.sonsParId.get(sy.consonne);
  const v = Data.sonsParId.get(sy.voyelle);
  const partie = (s, id) => `<span class="partie${id === sonId ? ' surligne' : ''}">${echapper(s ? s.affiche : '')}</span>`;
  return `<button type="button" class="ap-exemple script" data-syllabe="${echapper(sy.id)}" aria-label="${echapper(sy.texte)}">` +
    partie(c, sy.consonne) + partie(v, sy.voyelle) + `</button>`;
}

export const Apprendre = {
  monter(conteneur, params = {}) {
    let profil = null;
    try { profil = params.profilId != null ? Store.profil(params.profilId) : Store.profilActif(); } catch (e) { /* aucun */ }
    const profilId = params.profilId != null ? params.profilId : profil && profil.id;
    const couleur = (profil && profil.couleur) || 'vert';
    let ouverts;
    try { ouverts = new Set(Srs.paliersOuverts(profilId)); } catch (e) { ouverts = new Set([1]); }
    let actifs;
    try { actifs = new Set(Srs.sonsActifs(profilId)); } catch (e) { actifs = new Set(); }

    const consonnes = Data.consonnes || [];
    const voyelles = Data.voyelles || [];

    conteneur.innerHTML = `
      <div class="apprendre" style="--profil: var(--p-${echapper(couleur)}, var(--accent))">
        <header class="ap-entete">
          <button type="button" class="bouton-rond petit ap-retour" data-action="accueil" aria-label="Accueil">${icone('maison')}</button>
          <h1 class="ap-titre">J'apprends les sons</h1>
        </header>
        <div class="ap-corps">
          ${bloc('Les consonnes', 'ap-consonnes', consonnes, ouverts)}
          ${bloc('Les voyelles', 'ap-voyelles', voyelles, ouverts)}
        </div>
        <aside class="ap-zoom" hidden aria-live="polite">
          <button type="button" class="ap-fermer" data-action="fermer" aria-label="Fermer">${icone('croix')}</button>
          <div class="ap-zoom-son">
            <div class="ap-zoom-graphies">
              <span class="ap-zoom-script script"></span>
              <span class="ap-zoom-cursif cursif"></span>
            </div>
            <button type="button" class="ap-megaphone" data-action="rejouer" aria-label="Écouter encore">${icone('megaphone')}</button>
          </div>
          <div class="ap-exemples"></div>
        </aside>
      </div>`;

    const racine = conteneur.querySelector('.apprendre');
    const corps = racine.querySelector('.ap-corps');
    const zoom = racine.querySelector('.ap-zoom');
    const zoomScript = zoom.querySelector('.ap-zoom-script');
    const zoomCursif = zoom.querySelector('.ap-zoom-cursif');
    const zoomGraphies = zoom.querySelector('.ap-zoom-graphies');
    const listeExemples = zoom.querySelector('.ap-exemples');
    let selection = null;     // id du son choisi
    let lecture = 0;          // jeton : seule la dernière lecture retire son « actif »

    // Préchargement des sons actifs, sans attendre.
    son(() => Audio.precharger([...actifs].filter((id) => id !== 'h').map((id) => `son-${id}`)));

    // Le corps garde sous le panneau une marge égale à sa hauteur.
    const ajusterMarge = () => {
      corps.style.paddingBottom = zoom.hidden ? '' : `${zoom.offsetHeight + 16}px`;
    };
    let observateur = null;
    if (typeof ResizeObserver === 'function') {
      observateur = new ResizeObserver(ajusterMarge);
      observateur.observe(zoom);
    }
    window.addEventListener('resize', ajusterMarge);

    // Joue un son ou une syllabe en marquant l'élément « actif » le temps de la lecture.
    const jouer = (el, fn) => {
      son(() => Audio.stop());
      racine.querySelectorAll('.actif').forEach((e) => e.classList.remove('actif'));
      const jeton = ++lecture;
      if (el) el.classList.add('actif');
      const r = son(fn);
      const finir = () => { if (jeton === lecture && el) el.classList.remove('actif'); };
      if (r && typeof r.then === 'function') r.then(finir, finir);
      else setTimeout(finir, 400);
    };

    const tuileDe = (id) => racine.querySelector(`.ap-son[data-son="${CSS.escape(id)}"]`);

    const ouvrirZoom = (id) => {
      const s = Data.sonsParId.get(id);
      if (!s) return;
      selection = id;
      racine.querySelectorAll('.ap-son.selection').forEach((e) => e.classList.remove('selection'));
      const tuile = tuileDe(id);
      if (tuile) tuile.classList.add('selection');
      zoomScript.textContent = s.affiche;
      zoomCursif.textContent = s.affiche;
      zoomGraphies.className = `ap-zoom-graphies${classeLongueur(s.affiche)}`;
      listeExemples.innerHTML = choisirExemples(id, actifs).map((sy) => puceExemple(sy, id)).join('');
      zoom.hidden = false;
      ajusterMarge();
      // La tuile choisie ne doit pas rester cachée sous le panneau.
      if (tuile) {
        const bas = tuile.getBoundingClientRect().bottom;
        const haut = zoom.getBoundingClientRect().top;
        if (bas > haut - 8) window.scrollBy({ top: bas - haut + 24, behavior: 'smooth' });
      }
    };

    const fermerZoom = () => {
      selection = null;
      zoom.hidden = true;
      racine.querySelectorAll('.ap-son.selection').forEach((e) => e.classList.remove('selection'));
      ajusterMarge();
    };

    const surClic = (ev) => {
      const action = ev.target.closest('[data-action]');
      if (action) {
        const a = action.dataset.action;
        if (a === 'accueil') {
          son(() => Audio.fx('tap'));
          if (window.App && typeof window.App.aller === 'function') window.App.aller('accueil', {});
        } else if (a === 'fermer') {
          son(() => Audio.stop());
          son(() => Audio.fx('tap'));
          fermerZoom();
        } else if (a === 'rejouer' && selection) {
          const id = selection;
          jouer(action, () => Audio.jouerSon(id));
        }
        return;
      }
      const ex = ev.target.closest('.ap-exemple[data-syllabe]');
      if (ex) {
        const id = ex.dataset.syllabe;
        jouer(ex, () => Audio.jouerSyllabe(id));
        return;
      }
      const t = ev.target.closest('.ap-son[data-son]');
      if (!t) return;
      const id = t.dataset.son;
      ouvrirZoom(id);
      jouer(t, () => Audio.jouerSon(id));
    };
    racine.addEventListener('click', surClic);

    return function demonter() {
      racine.removeEventListener('click', surClic);
      window.removeEventListener('resize', ajusterMarge);
      if (observateur) observateur.disconnect();
      lecture++;
      son(() => Audio.stop());
    };
  },
};
