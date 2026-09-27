// Rewards — étoiles, secousse douce, confettis, écran de fin (lot B).
// Voir ARCHITECTURE.md §8 et §9. `App` est lu sur window.App (pas d'import
// circulaire avec app.js).
import { Store } from './store.js';
import { Data } from './data.js';
import { Audio } from './audio.js';
import { Ours } from './ours.js';

// Appel audio tolérant : ni exception synchrone, ni promesse rejetée ne remonte.
function son(fn) {
  try {
    const r = fn();
    if (r && typeof r.catch === 'function') r.catch(() => {});
    return r;
  } catch (e) {
    return undefined;
  }
}

const calme = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const ETOILE_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.8l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17l-6.1 3.4 1.4-6.8L2.2 8.9l6.9-.8z"/></svg>';

const COULEURS_CONFETTIS = [
  '#5cc06a', '#f58fb5', '#5aa9f0', '#f7c948', '#a77be0', '#f7964a', '#3cc8c0', '#ff7f6b',
];

const NOMS_NIVEAU = ['', 'bronze', 'argent', 'or'];

let confettisEnCours = null; // { arreter() }

function etoiles(n) {
  let s = '';
  for (let i = 0; i < n; i++) s += `<span class="rw-etoile">${ETOILE_SVG}</span>`;
  return s;
}

// Pastille d'un son (partagée avec la carte des sons).
export function pastilleSon(son, niveau, { verrou = false, balise = 'button' } = {}) {
  const n = Math.max(0, Math.min(3, niveau | 0));
  const lg = [...son.affiche].length;
  const classes = `rw-son script niveau-${n}${verrou ? ' verrou' : ''}${lg >= 4 ? ' long4' : lg === 3 ? ' long3' : ''}`;
  const attrs = balise === 'button'
    ? ` type="button" data-son="${son.id}"${verrou ? ' aria-disabled="true"' : ''}`
    : '';
  return `<${balise} class="${classes}"${attrs} aria-label="${son.affiche}${n ? ' ' + NOMS_NIVEAU[n] : ''}">` +
    `<span class="rw-son-texte">${son.affiche}</span>` +
    (verrou
      ? `<span class="rw-son-cadenas">${CADENAS_SVG}</span>`
      : `<span class="rw-son-etoiles">${etoiles(n)}</span>`) +
    `</${balise}>`;
}

export const CADENAS_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V7.5a5 5 0 0 1 10 0V10" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><rect x="4.5" y="10" width="15" height="11" rx="3" fill="currentColor"/><circle cx="12" cy="15.3" r="1.7" fill="#fff"/></svg>';

export const Rewards = {
  // Petite pluie d'étoiles jaunes autour de l'élément (800 ms) + bruitage.
  point(el) {
    son(() => Audio.fx('point'));
    if (!el || typeof el.getBoundingClientRect !== 'function' || calme()) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const couche = document.createElement('div');
    couche.className = 'rw-pluie';
    document.body.appendChild(couche);
    const n = 8 + Math.floor(Math.random() * 5); // 8 à 12
    for (let i = 0; i < n; i++) {
      const e = document.createElement('div');
      e.className = 'rw-etoile-vol';
      e.innerHTML = ETOILE_SVG;
      const taille = 18 + Math.random() * 18;
      // départ réparti sur le pourtour de l'élément
      const ang = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      const x0 = cx + Math.cos(ang) * r.width * 0.45;
      const y0 = cy + Math.sin(ang) * r.height * 0.4;
      e.style.left = `${x0 - taille / 2}px`;
      e.style.top = `${y0 - taille / 2}px`;
      e.style.width = e.style.height = `${taille}px`;
      couche.appendChild(e);
      const dx = Math.cos(ang) * (30 + Math.random() * 40);
      const dy = -(60 + Math.random() * 80);
      const rot = (Math.random() < 0.5 ? -1 : 1) * (90 + Math.random() * 180);
      e.animate(
        [
          { transform: 'translate(0,0) scale(.3) rotate(0deg)', opacity: 0 },
          { transform: `translate(${dx * 0.3}px, ${dy * 0.3}px) scale(1.1) rotate(${rot * 0.3}deg)`, opacity: 1, offset: 0.25 },
          { transform: `translate(${dx}px, ${dy}px) scale(.7) rotate(${rot}deg)`, opacity: 0 },
        ],
        { duration: 650 + Math.random() * 150, delay: Math.random() * 80, easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'both' }
      );
    }
    setTimeout(() => couche.remove(), 900);
  },

  // Secousse douce (400 ms), halo orange doux, jamais de rouge.
  presque(el) {
    son(() => Audio.fx('rate'));
    if (!el || calme()) return;
    el.classList.add('rw-presque');
    setTimeout(() => el.classList.remove('rw-presque'), 420);
    if (typeof el.animate === 'function') {
      // propriété `translate` : se compose avec un éventuel `transform` (tuile retournée)
      el.animate(
        [
          { translate: '0 0' },
          { translate: '-9px 0' },
          { translate: '8px 0' },
          { translate: '-6px 0' },
          { translate: '4px 0' },
          { translate: '-2px 0' },
          { translate: '0 0' },
        ],
        { duration: 400, easing: 'ease-in-out' }
      );
    }
  },

  // Confettis plein écran sur #confettis. Renvoie une promesse résolue à la fin.
  confettis(duree = 2500) {
    if (confettisEnCours) confettisEnCours.arreter();
    let canvas = document.getElementById('confettis');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'confettis';
      document.body.appendChild(canvas);
    }
    const ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx || calme()) return Promise.resolve();

    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    let L = 0, H = 0;
    const dimensionner = () => {
      L = window.innerWidth; H = window.innerHeight;
      canvas.width = Math.round(L * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width = `${L}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    dimensionner();
    window.addEventListener('resize', dimensionner);

    const parts = [];
    for (let i = 0; i < 150; i++) {
      parts.push({
        x: Math.random() * L,
        y: -10 - Math.random() * H * 0.35,
        vx: (Math.random() - 0.5) * 3,
        vy: 3 + Math.random() * 3,
        l: 7 + Math.random() * 7,
        h: 4 + Math.random() * 5,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.3,
        osc: Math.random() * Math.PI * 2,
        rond: Math.random() < 0.25,
        c: COULEURS_CONFETTIS[i % COULEURS_CONFETTIS.length],
      });
    }

    return new Promise((fin) => {
      const debut = performance.now();
      let prec = debut, raf = 0, fini = false;
      const arreter = () => {
        if (fini) return;
        fini = true;
        cancelAnimationFrame(raf);
        window.removeEventListener('resize', dimensionner);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (confettisEnCours && confettisEnCours.arreter === arreter) confettisEnCours = null;
        fin();
      };
      confettisEnCours = { arreter };
      const image = (t) => {
        const dt = Math.min(3, (t - prec) / 16.67);
        prec = t;
        const ecoule = t - debut;
        const alpha = ecoule > duree ? Math.max(0, 1 - (ecoule - duree) / 600) : 1;
        ctx.clearRect(0, 0, L, H);
        ctx.globalAlpha = alpha;
        let visibles = 0;
        for (const p of parts) {
          p.vy += 0.09 * dt;               // gravité
          p.vx *= 0.995;
          p.osc += 0.1 * dt;
          p.x += (p.vx + Math.sin(p.osc) * 0.8) * dt;
          p.y += p.vy * dt;
          p.rot += p.vr * dt;
          // relance en haut tant que la durée n'est pas écoulée
          if (p.y > H + 20 && ecoule < duree * 0.6) { p.y = -20; p.vy = 2 + Math.random() * 2; }
          if (p.y > H + 20) continue;
          visibles++;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.c;
          if (p.rond) {
            ctx.beginPath(); ctx.arc(0, 0, p.h * 0.7, 0, Math.PI * 2); ctx.fill();
          } else {
            ctx.scale(1, Math.abs(Math.cos(p.osc)) * 0.8 + 0.2); // effet de papier qui tourne
            ctx.fillRect(-p.l / 2, -p.h / 2, p.l, p.h);
          }
          ctx.restore();
        }
        ctx.globalAlpha = 1;
        if (alpha <= 0 || visibles === 0) { arreter(); return; }
        raf = requestAnimationFrame(image);
      };
      raf = requestAnimationFrame(image);
    });
  },

  // Écran de fin de manche. Renvoie la fonction de nettoyage.
  monterFin(conteneur, params = {}) {
    const { score = 0, total = 10, mode = 'lis', profilId = null, gains = [] } = params;
    const minuteries = [];
    const plusTard = (fn, ms) => minuteries.push(setTimeout(fn, ms));

    let profil = null, points = score;
    try { profil = profilId != null ? Store.profil(profilId) : Store.profilActif(); } catch (e) { /* profil absent */ }
    const pid = profilId != null ? profilId : profil && profil.id;
    try { points = Number(Store.progres(pid).points) || 0; } catch (e) { /* progrès absent */ }
    const couleur = (profil && profil.couleur) || 'vert';
    const prenom = profil && profil.prenom;
    const stadeAvant = Ours.stade(Math.max(0, points - score));
    const stadeApres = Ours.stade(points);
    const parfait = total > 0 && score >= total;
    const ratio = total > 0 ? score / total : 0;

    let titre;
    if (parfait) titre = 'Parfait !';
    else if (ratio >= 0.7) titre = 'Bravo !';
    else if (ratio >= 0.4) titre = 'Super !';
    else titre = 'Bien joué !';
    const sousTitre = parfait
      ? 'Toutes les syllabes, champion !'
      : (ratio >= 0.4 ? 'Tu progresses à chaque manche.' : 'Chaque manche te rend plus fort.');

    const seuil = Ours.prochainSeuil(points);
    const bas = Ours.seuils[stadeApres];
    const progression = seuil == null ? 1 : (points - bas) / (seuil - bas);
    const texteOurs = stadeApres > stadeAvant
      ? 'Ton ours a grandi !'
      : (seuil == null ? 'Ton ours est un grand roi !' : `Encore ${seuil - points} point${seuil - points > 1 ? 's' : ''} et ton ours grandit`);

    const sons = (Data && Data.sonsParId) || null;
    const listeGains = (Array.isArray(gains) ? gains : [])
      .map((g) => ({ son: (sons && sons.get(g.sonId)) || { id: g.sonId, affiche: g.sonId }, niveau: g.niveau }))
      .filter((g) => g.niveau > 0);

    conteneur.innerHTML = `
      <div class="rw-fin mode-${mode}" style="--profil: var(--p-${couleur}, #5cc06a)">
        <div class="rw-fin-haut">
          <p class="rw-fin-titre">${titre}</p>
          <p class="rw-fin-score" aria-label="${score} sur ${total}">
            <span class="rw-fin-nb">${score}</span><span class="rw-fin-sur">/</span><span class="rw-fin-total">${total}</span>
          </p>
          <p class="rw-fin-sous">${prenom ? `${prenom}, ` + sousTitre.charAt(0).toLowerCase() + sousTitre.slice(1) : sousTitre}</p>
        </div>
        <div class="rw-fin-milieu">
          <div class="rw-fin-ours-bloc">
            <div class="rw-fin-ours" data-couleur="${couleur}">${Ours.svg(stadeAvant, couleur)}</div>
            <p class="rw-fin-ours-texte">${stadeApres > stadeAvant ? '' : texteOurs}</p>
            <div class="rw-jauge" aria-hidden="true"><span style="width:${Math.round(progression * 100)}%"></span></div>
          </div>
          ${listeGains.length ? `
          <div class="rw-fin-gains">
            <p class="rw-fin-gains-titre">Nouvelles étoiles</p>
            <div class="rw-fin-gains-liste">
              ${listeGains.map((g, i) => `<div class="rw-gain" style="--i:${i}">${pastilleSon(g.son, g.niveau, { balise: 'div' })}<span class="rw-gain-nom">${NOMS_NIVEAU[g.niveau] || ''}</span></div>`).join('')}
            </div>
          </div>` : ''}
        </div>
        <div class="rw-fin-boutons">
          <button type="button" class="rw-bouton rw-bouton-encore" data-action="encore">Encore&nbsp;!</button>
          <button type="button" class="rw-bouton rw-bouton-accueil" data-action="accueil">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.5 12 4l9 7.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M5.5 10v9.5h5v-5h3v5h5V10" fill="currentColor"/></svg>
            Accueil
          </button>
        </div>
      </div>`;

    const racine = conteneur.querySelector('.rw-fin');
    const surClic = (ev) => {
      const b = ev.target.closest('[data-action]');
      if (!b) return;
      son(() => Audio.fx('tap'));
      const App = window.App;
      if (!App || typeof App.aller !== 'function') return;
      if (b.dataset.action === 'encore') App.aller(mode === 'ecoute' ? 'ecoute' : 'jeu', { profilId: pid });
      else App.aller('accueil', {});
    };
    racine.addEventListener('click', surClic);

    // Enchaînement : voix, puis croissance de l'ours.
    if (parfait) {
      plusTard(() => { son(() => Audio.fx('fanfare')); Rewards.confettis(3000); }, 250);
      plusTard(() => son(() => Audio.jouerPhrase('parfait')), 1100);
    } else {
      plusTard(() => son(() => Audio.jouerPhrase('super')), 400);
    }
    if (stadeApres > stadeAvant) {
      plusTard(() => {
        const boite = racine.querySelector('.rw-fin-ours');
        Ours.animerCroissance(boite, stadeAvant, stadeApres).then(() => {
          const t = racine.querySelector('.rw-fin-ours-texte');
          if (t) { t.textContent = texteOurs; t.classList.add('rw-apparait'); }
          if (!parfait) Rewards.confettis(1800);
        });
      }, parfait ? 2200 : 1300);
    }

    return function demonter() {
      minuteries.forEach(clearTimeout);
      racine.removeEventListener('click', surClic);
      if (confettisEnCours) confettisEnCours.arreter();
    };
  },
};
