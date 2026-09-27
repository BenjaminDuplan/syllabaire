// Ours — la mascotte qui grandit (lot B). Voir ARCHITECTURE.md §9.
// Dessin SVG inline, fait main, calculé à partir de quelques proportions
// par stade. Aucun id interne (plusieurs ours peuvent cohabiter sur une page).

const SEUILS = [0, 30, 100, 250, 500];

// Palette des profils : token du contrat + repli hexadécimal si style.css absent.
const PALETTE = {
  vert: '#5cc06a',
  rose: '#f58fb5',
  bleu: '#5aa9f0',
  jaune: '#f7c948',
  violet: '#a77be0',
  orange: '#f7964a',
  turquoise: '#3cc8c0',
  corail: '#ff7f6b',
};

const FOURRURE = '#b97a4c';
const FOURRURE_OMBRE = '#a3683e';
const CLAIR = '#f0d2ad';
const CONTOUR = '#6b4228';
const SOMBRE = '#3b2518';
const ROSE_JOUE = '#f4a3a0';
const OR = '#f7c948';
const OR_FONCE = '#d9a21b';

function couleurProfil(nom) {
  const cle = PALETTE[nom] ? nom : 'vert';
  return `var(--p-${cle}, ${PALETTE[cle]})`;
}

// Proportions par stade (unités locales, sol en y = 0, vers le haut = négatif).
// `haut` = hauteur visée dans le cadre de 200 : l'ours grandit à l'écran.
const STADES = [
  { assis: true, tete: 44, corpsL: 40, corpsH: 36, haut: 112 },
  { tete: 40, corpsL: 34, corpsH: 38, jambe: 22, haut: 128 },
  { tete: 38, corpsL: 38, corpsH: 46, jambe: 30, haut: 150 },
  { tete: 37, corpsL: 44, corpsH: 54, jambe: 36, haut: 170 },
  { tete: 38, corpsL: 47, corpsH: 57, jambe: 37, haut: 184, couronne: true },
];

const f = (n) => Math.round(n * 10) / 10;

function trait(sw) {
  return `stroke="${CONTOUR}" stroke-width="${f(sw)}" stroke-linejoin="round" stroke-linecap="round"`;
}

// --- Tête -----------------------------------------------------------------
function tete(cx, cy, r, sw, stade) {
  const t = trait(sw);
  const oreilleR = r * 0.36;
  const ox = r * 0.72, oy = r * 0.72;
  const yeuxY = cy - r * 0.08;
  const yeuxX = r * 0.36;
  const oeil = r * 0.12;
  const museauY = cy + r * 0.3;
  let s = '';
  // oreilles
  for (const sens of [-1, 1]) {
    s += `<circle cx="${f(cx + sens * ox)}" cy="${f(cy - oy)}" r="${f(oreilleR)}" fill="${FOURRURE}" ${t}/>`;
    s += `<circle cx="${f(cx + sens * ox)}" cy="${f(cy - oy)}" r="${f(oreilleR * 0.55)}" fill="${ROSE_JOUE}"/>`;
  }
  // crâne
  s += `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${FOURRURE}" ${t}/>`;
  // joues roses
  for (const sens of [-1, 1]) {
    s += `<ellipse cx="${f(cx + sens * r * 0.6)}" cy="${f(cy + r * 0.24)}" rx="${f(r * 0.16)}" ry="${f(r * 0.1)}" fill="${ROSE_JOUE}" opacity=".75"/>`;
  }
  // yeux (plus grands chez l'ourson), avec reflet
  const grand = stade <= 1 ? 1.2 : 1;
  for (const sens of [-1, 1]) {
    const ex = cx + sens * yeuxX;
    s += `<ellipse cx="${f(ex)}" cy="${f(yeuxY)}" rx="${f(oeil * grand)}" ry="${f(oeil * grand * 1.15)}" fill="${SOMBRE}"/>`;
    s += `<circle cx="${f(ex + oeil * 0.35)}" cy="${f(yeuxY - oeil * 0.45)}" r="${f(oeil * 0.42 * grand)}" fill="#fff"/>`;
  }
  // museau
  s += `<ellipse cx="${f(cx)}" cy="${f(museauY)}" rx="${f(r * 0.4)}" ry="${f(r * 0.29)}" fill="${CLAIR}" ${trait(sw * 0.7)}/>`;
  // truffe
  s += `<ellipse cx="${f(cx)}" cy="${f(museauY - r * 0.1)}" rx="${f(r * 0.15)}" ry="${f(r * 0.1)}" fill="${SOMBRE}"/>`;
  s += `<ellipse cx="${f(cx - r * 0.04)}" cy="${f(museauY - r * 0.13)}" rx="${f(r * 0.05)}" ry="${f(r * 0.03)}" fill="#fff" opacity=".7"/>`;
  // sourire
  const by = museauY + r * 0.02, bw = r * 0.14;
  s += `<path d="M ${f(cx)} ${f(by)} v ${f(r * 0.06)} M ${f(cx - bw)} ${f(by + r * 0.05)} q ${f(bw / 2)} ${f(r * 0.1)} ${f(bw)} 0 q ${f(bw / 2)} ${f(r * 0.1)} ${f(bw)} 0" fill="none" ${trait(sw * 0.75)} stroke="${SOMBRE}"/>`;
  return s;
}

// --- Petite couronne ----------------------------------------------------------
function couronne(cx, haut, r, sw) {
  const w = r * 0.9, h = r * 0.55;
  const x0 = cx - w / 2, y0 = haut + h * 0.35; // base, un peu enfoncée dans la tête
  const d = `M ${f(x0)} ${f(y0)} L ${f(x0 - w * 0.04)} ${f(y0 - h)} L ${f(x0 + w * 0.25)} ${f(y0 - h * 0.5)} ` +
    `L ${f(cx)} ${f(y0 - h * 1.15)} L ${f(x0 + w * 0.75)} ${f(y0 - h * 0.5)} L ${f(x0 + w * 1.04)} ${f(y0 - h)} L ${f(x0 + w)} ${f(y0)} Z`;
  let s = `<g transform="rotate(-8 ${f(cx)} ${f(y0)})">`;
  s += `<path d="${d}" fill="${OR}" stroke="${OR_FONCE}" stroke-width="${f(sw)}" stroke-linejoin="round"/>`;
  s += `<rect x="${f(x0)}" y="${f(y0 - h * 0.22)}" width="${f(w)}" height="${f(h * 0.26)}" rx="${f(h * 0.1)}" fill="${OR_FONCE}" opacity=".45"/>`;
  s += `<circle cx="${f(cx)}" cy="${f(y0 - h * 1.15)}" r="${f(r * 0.07)}" fill="#fff6d1" stroke="${OR_FONCE}" stroke-width="${f(sw * 0.6)}"/>`;
  s += `<circle cx="${f(cx)}" cy="${f(y0 - h * 0.1)}" r="${f(r * 0.06)}" fill="#ff7f9d"/>`;
  s += `</g>`;
  return s;
}

// --- Accessoires de couleur (cou) -------------------------------------------------
// stade 1 : nœud papillon ; 2 : foulard ; 3 : petite écharpe ; 4 : grande écharpe à franges
function accessoire(stade, cx, cou, largeur, sw, couleur) {
  if (stade === 0) return '';
  const t = `stroke="${CONTOUR}" stroke-width="${f(sw * 0.8)}" stroke-linejoin="round"`;
  if (stade === 1) {
    const a = largeur * 0.32, h = largeur * 0.22;
    return `<path d="M ${f(cx)} ${f(cou)} L ${f(cx - a)} ${f(cou - h)} L ${f(cx - a)} ${f(cou + h)} Z M ${f(cx)} ${f(cou)} L ${f(cx + a)} ${f(cou - h)} L ${f(cx + a)} ${f(cou + h)} Z" style="fill:${couleur}" ${t}/>` +
      `<circle cx="${f(cx)}" cy="${f(cou)}" r="${f(h * 0.5)}" style="fill:${couleur}" ${t}/>`;
  }
  if (stade === 2) {
    const a = largeur * 0.7;
    return `<path d="M ${f(cx - a)} ${f(cou - 5)} Q ${f(cx)} ${f(cou + 7)} ${f(cx + a)} ${f(cou - 5)} Q ${f(cx + a * 0.3)} ${f(cou + largeur * 0.4)} ${f(cx)} ${f(cou + largeur * 0.72)} Q ${f(cx - a * 0.3)} ${f(cou + largeur * 0.4)} ${f(cx - a)} ${f(cou - 5)} Z" style="fill:${couleur}" ${t}/>` +
      `<circle cx="${f(cx - largeur * 0.12)}" cy="${f(cou + largeur * 0.12)}" r="${f(largeur * 0.05)}" fill="#fff" opacity=".7"/>` +
      `<circle cx="${f(cx + largeur * 0.14)}" cy="${f(cou + largeur * 0.08)}" r="${f(largeur * 0.05)}" fill="#fff" opacity=".7"/>` +
      `<circle cx="${f(cx)}" cy="${f(cou + largeur * 0.3)}" r="${f(largeur * 0.05)}" fill="#fff" opacity=".7"/>`;
  }
  // écharpe
  const a = largeur * 0.8, h = largeur * 0.28;
  const longue = stade === 4;
  const pan = longue ? largeur * 0.95 : largeur * 0.62;
  const px = cx + largeur * 0.28;
  let s = '';
  // pan qui pend
  s += `<path d="M ${f(px - h * 0.5)} ${f(cou)} L ${f(px + h * 0.7)} ${f(cou)} L ${f(px + h * 0.95)} ${f(cou + pan)} L ${f(px - h * 0.2)} ${f(cou + pan)} Z" style="fill:${couleur}" ${t}/>`;
  s += `<path d="M ${f(px - h * 0.35)} ${f(cou + pan * 0.55)} L ${f(px + h * 0.83)} ${f(cou + pan * 0.55)}" stroke="#fff" stroke-opacity=".55" stroke-width="${f(h * 0.22)}"/>`;
  if (longue) {
    for (let i = 0; i < 4; i++) {
      const x = px - h * 0.15 + i * (h * 1.05) / 3;
      s += `<path d="M ${f(x)} ${f(cou + pan)} v ${f(h * 0.45)}" stroke="${CONTOUR}" stroke-width="${f(sw * 0.7)}" stroke-linecap="round" style="stroke:${couleur}"/>`;
    }
  }
  // tour du cou
  s += `<rect x="${f(cx - a)}" y="${f(cou - h / 2)}" width="${f(a * 2)}" height="${f(h)}" rx="${f(h / 2)}" style="fill:${couleur}" ${t}/>`;
  s += `<path d="M ${f(cx - a * 0.5)} ${f(cou - h * 0.4)} v ${f(h * 0.8)} M ${f(cx + a * 0.2)} ${f(cou - h * 0.4)} v ${f(h * 0.8)}" stroke="#fff" stroke-opacity=".55" stroke-width="${f(h * 0.2)}"/>`;
  // nœud
  s += `<circle cx="${f(px + h * 0.1)}" cy="${f(cou)}" r="${f(h * 0.55)}" style="fill:${couleur}" ${t}/>`;
  return s;
}

// --- Ours assis (stade 0) -------------------------------------------------------
function oursAssis(p, sw, couleur) {
  const t = trait(sw);
  const { tete: r, corpsL: bl, corpsH: bh } = p;
  const cy = -bh;              // centre du corps
  let s = '';
  // corps
  s += `<ellipse cx="0" cy="${f(cy)}" rx="${f(bl)}" ry="${f(bh)}" fill="${FOURRURE}" ${t}/>`;
  s += `<ellipse cx="0" cy="${f(cy + bh * 0.12)}" rx="${f(bl * 0.6)}" ry="${f(bh * 0.66)}" fill="${CLAIR}"/>`;
  // pattes avant posées sur le ventre
  for (const sens of [-1, 1]) {
    const ax = sens * bl * 0.8, ay = cy + bh * 0.02;
    s += `<ellipse cx="${f(ax)}" cy="${f(ay)}" rx="${f(bl * 0.19)}" ry="${f(bh * 0.36)}" transform="rotate(${sens * -30} ${f(ax)} ${f(ay)})" fill="${FOURRURE_OMBRE}" ${t}/>`;
  }
  // pieds tendus devant (plantes visibles)
  for (const sens of [-1, 1]) {
    const px = sens * bl * 0.62, py = -bh * 0.22;
    s += `<ellipse cx="${f(px)}" cy="${f(py)}" rx="${f(bl * 0.32)}" ry="${f(bh * 0.3)}" fill="${FOURRURE}" ${t}/>`;
    s += `<ellipse cx="${f(px)}" cy="${f(py + bh * 0.04)}" rx="${f(bl * 0.17)}" ry="${f(bh * 0.16)}" fill="${CLAIR}"/>`;
    for (const k of [-1, 0, 1]) {
      s += `<circle cx="${f(px + k * bl * 0.13)}" cy="${f(py - bh * 0.17)}" r="${f(bl * 0.045)}" fill="${CLAIR}"/>`;
    }
  }
  const teteY = cy - bh - r * 0.62;
  s += tete(0, teteY, r, sw, 0);
  return { svg: s, sommet: teteY - r * 1.05 };
}

// --- Ours debout (stades 1 à 4) -----------------------------------------------------
function oursDebout(p, stade, sw, couleur) {
  const t = trait(sw);
  const { tete: r, corpsL: bl, corpsH: bh, jambe } = p;
  const pieds = bl * 0.46;
  const cy = -jambe - bh * 0.72;
  let s = '';
  // jambes + pieds
  for (const sens of [-1, 1]) {
    const x = sens * pieds;
    s += `<rect x="${f(x - bl * 0.26)}" y="${f(-jambe - bh * 0.3)}" width="${f(bl * 0.52)}" height="${f(jambe + bh * 0.3)}" rx="${f(bl * 0.24)}" fill="${FOURRURE_OMBRE}" ${t}/>`;
    s += `<ellipse cx="${f(x + sens * bl * 0.06)}" cy="${f(-bl * 0.12)}" rx="${f(bl * 0.34)}" ry="${f(bl * 0.17)}" fill="${FOURRURE}" ${t}/>`;
  }
  // bras
  const brasY = cy - bh * 0.35;
  for (const sens of [-1, 1]) {
    const x = sens * bl * 0.88;
    const angle = stade >= 3 ? sens * -28 : sens * -18;
    s += `<g transform="rotate(${angle} ${f(x)} ${f(brasY)})">` +
      `<rect x="${f(x - bl * 0.2)}" y="${f(brasY)}" width="${f(bl * 0.4)}" height="${f(bh * 0.95)}" rx="${f(bl * 0.2)}" fill="${FOURRURE_OMBRE}" ${t}/>` +
      `<ellipse cx="${f(x)}" cy="${f(brasY + bh * 0.86)}" rx="${f(bl * 0.12)}" ry="${f(bl * 0.08)}" fill="${CLAIR}"/>` +
      `</g>`;
  }
  // corps + ventre
  s += `<ellipse cx="0" cy="${f(cy)}" rx="${f(bl)}" ry="${f(bh)}" fill="${FOURRURE}" ${t}/>`;
  s += `<ellipse cx="0" cy="${f(cy + bh * 0.14)}" rx="${f(bl * 0.62)}" ry="${f(bh * 0.7)}" fill="${CLAIR}"/>`;
  // tête
  const teteY = cy - bh - r * 0.55;
  s += tete(0, teteY, r, sw, stade);
  // accessoire de couleur noué sous le menton, par-dessus la tête
  const cou = teteY + r * 0.93;
  s += accessoire(stade, 0, cou, bl, sw, couleur);
  let sommet = teteY - r * 1.05;
  if (p.couronne) {
    s += couronne(0, teteY - r * 0.92, r, sw);
    sommet = teteY - r * 0.92 - r * 0.55 * 0.9;
  }
  return { svg: s, sommet };
}

export const Ours = {
  seuils: SEUILS,

  stade(points) {
    const n = Number(points) || 0;
    let s = 0;
    for (let i = 0; i < SEUILS.length; i++) if (n >= SEUILS[i]) s = i;
    return s;
  },

  // Points restant avant le stade suivant (null si stade maximal).
  prochainSeuil(points) {
    const s = Ours.stade(points);
    return s >= SEUILS.length - 1 ? null : SEUILS[s + 1];
  },

  svg(stade, couleur = 'vert') {
    const st = Math.max(0, Math.min(4, Number(stade) || 0));
    const p = STADES[st];
    const coul = couleurProfil(couleur);
    // premier passage pour mesurer la hauteur, puis mise à l'échelle
    const trace = (sw) => (p.assis ? oursAssis(p, sw, coul) : oursDebout(p, st, sw, coul));
    const mesure = trace(3);
    const hauteur = -mesure.sommet;
    const echelle = p.haut / hauteur;
    const sw = 3.4 / echelle; // trait visuel constant quelle que soit la taille
    const dessin = trace(sw).svg;
    const ombre = `<ellipse cx="100" cy="193" rx="${f(40 + st * 10)}" ry="6" fill="#000" opacity=".08"/>`;
    return `<svg class="ours ours-stade-${st}" data-stade="${st}" data-couleur="${couleur}" viewBox="0 0 200 200" ` +
      `xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Ourson">` +
      ombre +
      `<g transform="translate(100 192) scale(${f(echelle * 100) / 100})">${dessin}</g></svg>`;
  },

  // Petite animation de croissance, puis remplacement par le nouveau stade.
  // Renvoie une promesse résolue à la fin (≈ 1,2 s).
  animerCroissance(container, deStade, aStade) {
    if (!container) return Promise.resolve();
    const ancien = container.querySelector('svg.ours');
    const couleur = (ancien && ancien.getAttribute('data-couleur')) || container.dataset.couleur || 'vert';
    const poser = () => { container.innerHTML = Ours.svg(aStade, couleur); };
    const calme = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!ancien || typeof container.animate !== 'function' || calme) { poser(); return Promise.resolve(); }
    container.classList.add('ours-grandit');
    return new Promise((fin) => {
      const a1 = container.animate(
        [
          { transform: 'scale(1)', offset: 0 },
          { transform: 'scale(1.1, 0.9)', offset: 0.35 },
          { transform: 'scale(0.92, 1.1)', offset: 0.7 },
          { transform: 'scale(0.6)', opacity: 0.4, offset: 1 },
        ],
        { duration: 480, easing: 'ease-in' }
      );
      a1.onfinish = () => {
        poser();
        const a2 = container.animate(
          [
            { transform: 'scale(0.6)', opacity: 0.4 },
            { transform: 'scale(1.18)', opacity: 1, offset: 0.4 },
            { transform: 'scale(0.94)', offset: 0.65 },
            { transform: 'scale(1.04)', offset: 0.85 },
            { transform: 'scale(1)', opacity: 1 },
          ],
          { duration: 720, easing: 'ease-out' }
        );
        a2.onfinish = () => { container.classList.remove('ours-grandit'); fin(); };
      };
    });
  },
};
