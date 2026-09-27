// Carte — écran « carte des sons » (lot B). Voir ARCHITECTURE.md §9.
// Les 79 sons, regroupés par palier (ordre du livre à l'intérieur de chaque
// palier), colorés selon leur niveau (gris / bronze / argent / or).
import { Store } from './store.js';
import { Data } from './data.js';
import { Audio } from './audio.js';
import { Srs } from './srs.js';
import { Ours } from './ours.js';
import { pastilleSon, CADENAS_SVG } from './rewards.js';

function son(fn) {
  try {
    const r = fn();
    if (r && typeof r.catch === 'function') r.catch(() => {});
  } catch (e) { /* silencieux */ }
}

const ETOILE =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.8l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17l-6.1 3.4 1.4-6.8L2.2 8.9l6.9-.8z"/></svg>';

function niveau(profilId, id) {
  try { return Srs.niveauSon(profilId, id) | 0; } catch (e) { return 0; }
}

function bloc(titre, classe, sons, profilId, ouverts) {
  const paliers = [...new Set(sons.map((s) => s.palier))].sort((a, b) => a - b);
  const lignes = paliers.map((p) => {
    const ouvert = ouverts.has(p);
    const duPalier = sons.filter((s) => s.palier === p); // ordre du livre conservé
    const pastilles = duPalier.map((s) => pastilleSon(s, ouvert ? niveau(profilId, s.id) : 0, { verrou: !ouvert })).join('');
    return `
      <div class="carte-palier${ouvert ? '' : ' ferme'}">
        <div class="carte-palier-num" aria-label="Étape ${p}">
          ${ouvert ? `<span>${p}</span>` : `<span class="carte-cadenas">${CADENAS_SVG}</span>`}
        </div>
        <div class="carte-palier-sons">${pastilles}</div>
      </div>`;
  }).join('');
  return `
    <section class="carte-bloc ${classe}">
      <h2 class="carte-bloc-titre">${titre}</h2>
      ${lignes}
    </section>`;
}

export const Carte = {
  monter(conteneur, params = {}) {
    let profil = null;
    try { profil = params.profilId != null ? Store.profil(params.profilId) : Store.profilActif(); } catch (e) { /* aucun */ }
    const profilId = params.profilId != null ? params.profilId : profil && profil.id;
    const couleur = (profil && profil.couleur) || 'vert';
    let points = 0;
    try { points = Number(Store.progres(profilId).points) || 0; } catch (e) { /* aucun */ }
    let ouverts;
    try { ouverts = new Set(Srs.paliersOuverts(profilId)); } catch (e) { ouverts = new Set([1]); }

    const consonnes = Data.consonnes || [];
    const voyelles = Data.voyelles || [];
    const tous = [...consonnes, ...voyelles];
    const compte = [0, 0, 0, 0];
    for (const s of tous) if (ouverts.has(s.palier)) compte[niveau(profilId, s.id)]++;

    conteneur.innerHTML = `
      <div class="carte" style="--profil: var(--p-${couleur}, #5cc06a)">
        <header class="carte-entete">
          <button type="button" class="rw-bouton rw-bouton-rond carte-retour" data-action="accueil" aria-label="Accueil">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M5.5 10v9.5h5v-5h3v5h5V10" fill="currentColor"/></svg>
          </button>
          <div class="carte-ours">${Ours.svg(Ours.stade(points), couleur)}</div>
          <div class="carte-titres">
            <h1 class="carte-titre">Ma carte des sons</h1>
            <p class="carte-legende">
              <span class="carte-leg niveau-1">${ETOILE}<b>${compte[1]}</b></span>
              <span class="carte-leg niveau-2">${ETOILE}${ETOILE}<b>${compte[2]}</b></span>
              <span class="carte-leg niveau-3">${ETOILE}${ETOILE}${ETOILE}<b>${compte[3]}</b></span>
            </p>
          </div>
        </header>
        <div class="carte-corps">
          ${bloc('Les consonnes', 'carte-consonnes', consonnes, profilId, ouverts)}
          ${bloc('Les voyelles', 'carte-voyelles', voyelles, profilId, ouverts)}
        </div>
      </div>`;

    const racine = conteneur.querySelector('.carte');
    const surClic = (ev) => {
      const retour = ev.target.closest('[data-action="accueil"]');
      if (retour) {
        son(() => Audio.fx('tap'));
        if (window.App && typeof window.App.aller === 'function') window.App.aller('accueil', {});
        return;
      }
      const b = ev.target.closest('.rw-son[data-son]');
      if (!b) return;
      b.classList.remove('rw-tape');
      void b.offsetWidth; // relance l'animation
      b.classList.add('rw-tape');
      if (b.classList.contains('verrou')) return; // palier pas encore ouvert : juste un petit rebond
      son(() => Audio.jouerSon(b.dataset.son));
    };
    racine.addEventListener('click', surClic);
    return function demonter() { racine.removeEventListener('click', surClic); };
  },
};
