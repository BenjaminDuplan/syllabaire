// parent.js — lot C : écran parent (cadenas, réglages, sons, profils,
// progrès, cabine, sauvegarde, à propos). Contrat : ARCHITECTURE.md §10.
// Toute modification = mutation de Store.etat puis Store.sauver().

import { Store } from './store.js';
import { Data } from './data.js';
import { Srs } from './srs.js';
import { Recorder } from './recorder.js';

const COULEURS = [
  ['vert', 'Vert'], ['rose', 'Rose'], ['bleu', 'Bleu'], ['jaune', 'Jaune'],
  ['violet', 'Violet'], ['orange', 'Orange'], ['turquoise', 'Turquoise'], ['corail', 'Corail'],
];
const NIVEAUX = ['gris', 'bronze', 'argent', 'or'];
const ONGLETS = [
  ['reglages', 'Réglages'], ['sons', 'Sons'], ['profils', 'Profils'], ['progres', 'Progrès'],
  ['cabine', 'Cabine'], ['sauvegarde', 'Sauvegarde'], ['apropos', 'À propos'],
];
const nf = new Intl.NumberFormat('fr-FR');

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

function el(balise, attrs = {}, ...enfants) {
  const n = document.createElement(balise);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'texte') n.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const e of enfants.flat()) {
    if (e === null || e === undefined || e === false) continue;
    n.append(e instanceof Node ? e : document.createTextNode(String(e)));
  }
  return n;
}

function sauver() { try { Store.sauver(); } catch (e) { /* silencieux */ } }

function reglages() {
  const r = Store.etat.reglages || (Store.etat.reglages = {});
  if (!r.ecriture) r.ecriture = 'alterne';
  if (!r.tuilesParManche) r.tuilesParManche = 10;
  if (!Array.isArray(r.sonsDesactives)) r.sonsDesactives = [];
  if (!Array.isArray(r.paliersForces)) r.paliersForces = [];
  return r;
}

function profils() { return Array.isArray(Store.etat.profils) ? Store.etat.profils : []; }

const REPLIS = {
  vert: '#4caf6a', rose: '#e86fa4', bleu: '#4a8fe0', jaune: '#f2c230',
  violet: '#9a6fd6', orange: '#f28c38', turquoise: '#2bb5b0', corail: '#f07167',
};
function couleurCss(c) { const k = REPLIS[c] ? c : 'vert'; return `var(--p-${k}, ${REPLIS[k]})`; }

function aujourdhui() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function telecharger(blob, nom) {
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: nom, style: { display: 'none' } });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function allerAccueil() {
  if (window.App && typeof window.App.aller === 'function') window.App.aller('accueil');
}

function sonsTries() {
  const rang = (s) => (s.type === 'consonne' ? 0 : 1);
  return [...(Data.sons || [])].sort((a, b) => rang(a) - rang(b) || a.ordre - b.ordre);
}

function niveauSon(profilId, sonId) {
  if (!profilId) return 0;
  try { return Srs.niveauSon(profilId, sonId) || 0; } catch (e) { return 0; }
}

function paliersOuverts(profilId) {
  if (!profilId) return [1];
  try { return Srs.paliersOuverts(profilId) || [1]; } catch (e) { return [1]; }
}

// Bloc de confirmation dans la page (remplace confirm()).
function confirmation(conteneur, { question, oui = 'Oui', non = 'Annuler', danger = true, surOui }) {
  conteneur.innerHTML = '';
  const bloc = el('div', { class: 'confirmation', role: 'alertdialog', 'aria-live': 'assertive' },
    el('p', { texte: question }),
    el('div', { class: 'rangee' },
      el('button', { type: 'button', class: `bouton ${danger ? 'danger' : 'principal'}`, onclick: async () => { conteneur.innerHTML = ''; await surOui(); } }, oui),
      el('button', { type: 'button', class: 'bouton secondaire', onclick: () => { conteneur.innerHTML = ''; } }, non),
    ),
  );
  conteneur.append(bloc);
  bloc.querySelector('button').focus();
}

// Groupe de boutons à choix unique.
function segments(nom, choix, valeur, surChoix) {
  const g = el('div', { class: 'segments', role: 'radiogroup', 'aria-label': nom });
  for (const [val, libelle, classe] of choix) {
    const b = el('button', {
      type: 'button', role: 'radio', class: `segment ${classe || ''}`,
      'aria-checked': String(val === valeur),
    }, libelle);
    b.addEventListener('click', () => {
      for (const x of g.children) x.setAttribute('aria-checked', String(x === b));
      surChoix(val);
    });
    g.append(b);
  }
  return g;
}

// ---------------------------------------------------------------------------
// Cadenas
// ---------------------------------------------------------------------------

function monterCadenas(zone, surOuverture) {
  const a = 3 + Math.floor(Math.random() * 7);   // 3..9
  const b = 3 + Math.floor(Math.random() * 7);
  const attendu = a + b;
  let saisie = '';
  let essais = 0;

  const affichage = el('div', { class: 'cadenas-saisie', 'aria-live': 'polite' });
  const info = el('p', { class: 'cadenas-info', 'aria-live': 'polite' });
  const pave = el('div', { class: 'cadenas-pave' });

  function maj() { affichage.textContent = saisie || '?'; affichage.classList.toggle('vide', !saisie); }

  function valider() {
    if (!saisie) return;
    if (Number(saisie) === attendu) { surOuverture(); return; }
    essais += 1;
    saisie = '';
    maj();
    if (essais >= 3) {
      info.textContent = 'Retour à l\'accueil…';
      setTimeout(allerAccueil, 700);
      pave.querySelectorAll('button').forEach((x) => { x.disabled = true; });
      return;
    }
    info.textContent = `Ce n'est pas ça. Encore ${3 - essais} essai${3 - essais > 1 ? 's' : ''}.`;
    affichage.classList.remove('secoue');
    void affichage.offsetWidth;
    affichage.classList.add('secoue');
  }

  function taper(t) {
    if (t === 'effacer') saisie = saisie.slice(0, -1);
    else if (t === 'ok') { valider(); return; }
    else if (saisie.length < 2) saisie += t;
    maj();
  }

  for (const t of ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'effacer', '0', 'ok']) {
    const libelle = t === 'effacer' ? '⌫' : t === 'ok' ? 'OK' : t;
    pave.append(el('button', {
      type: 'button', class: `touche ${t === 'ok' ? 'touche-ok' : ''} ${t === 'effacer' ? 'touche-effacer' : ''}`,
      'aria-label': t === 'effacer' ? 'Effacer' : t === 'ok' ? 'Valider' : t,
      onclick: () => taper(t),
    }, libelle));
  }

  function clavier(ev) {
    if (!zone.isConnected) { document.removeEventListener('keydown', clavier); return; }
    if (/^[0-9]$/.test(ev.key)) taper(ev.key);
    else if (ev.key === 'Backspace') taper('effacer');
    else if (ev.key === 'Enter') taper('ok');
  }
  document.addEventListener('keydown', clavier);

  zone.append(el('div', { class: 'cadenas' },
    el('div', { class: 'cadenas-icone', 'aria-hidden': 'true', texte: '🔒' }),
    el('h2', { texte: 'Espace des parents' }),
    el('p', { class: 'cadenas-question' }, `${a} + ${b} = `, affichage),
    info,
    pave,
  ));
  maj();
  return () => document.removeEventListener('keydown', clavier);
}

// ---------------------------------------------------------------------------
// Onglets
// ---------------------------------------------------------------------------

function ongletReglages(zone) {
  const r = reglages();
  zone.append(
    el('section', { class: 'bloc' },
      el('h3', { texte: 'Écriture des tuiles' }),
      segments('Écriture', [
        ['alterne', el('span', {}, 'Alternée ', el('span', { class: 'apercu script', texte: 'ma' }), ' / ', el('span', { class: 'apercu cursif', texte: 'ma' }))],
        ['script', el('span', {}, 'Script ', el('span', { class: 'apercu script', texte: 'ma' }))],
        ['cursif', el('span', {}, 'Cursive ', el('span', { class: 'apercu cursif', texte: 'ma' }))],
      ], r.ecriture, (v) => { reglages().ecriture = v; sauver(); }),
      el('p', { class: 'aide', texte: 'Alternée : une tuile sur deux en script, l\'autre en cursive.' }),
    ),
    el('section', { class: 'bloc' },
      el('h3', { texte: 'Tuiles par manche' }),
      segments('Tuiles par manche', [5, 10, 15, 20].map((n) => [n, String(n)]), Number(r.tuilesParManche),
        (v) => { reglages().tuilesParManche = v; sauver(); }),
    ),
    el('section', { class: 'bloc' },
      el('h3', { texte: 'Syllabes qui se ressemblent' }),
      segments('Syllabes qui se ressemblent', [
        ['auto', 'Dès l\'argent'], ['toujours', 'Toujours'], ['jamais', 'Jamais'],
      ], r.defis || 'auto', (v) => { reglages().defis = v; sauver(); }),
      el('p', { class: 'aide', texte: 'Glisse dans la manche une syllabe proche juste après une syllabe bien connue (ba puis da, bon puis bou, ga puis go), et les propose comme pièges dans « J\'écoute ». Dès l\'argent : seulement quand les deux sons ont au moins deux étoiles. Au plus 2 défis par manche de 10.' }),
    ),
  );

  const blocVoix = el('section', { class: 'bloc' },
    el('h3', { texte: 'Voix entendue par chaque enfant' }),
    el('p', { class: 'aide', texte: 'Auto : Papa si la syllabe est enregistrée, sinon Maman, sinon la synthèse.' }),
  );
  const compteVoix = el('p', { class: 'aide' });
  if (!profils().length) blocVoix.append(el('p', { class: 'vide', texte: 'Aucun profil. Créez-en un dans l\'onglet Profils.' }));
  for (const p of profils()) {
    blocVoix.append(el('div', { class: 'ligne-profil' },
      el('span', { class: 'pastille', style: { background: couleurCss(p.couleur) } }),
      el('strong', { class: 'nom', texte: p.prenom }),
      segments(`Voix de ${p.prenom}`, [['auto', 'Auto'], ['papa', 'Papa'], ['maman', 'Maman'], ['tts', 'Synthèse']],
        p.voix || 'auto', (v) => { p.voix = v; sauver(); }),
    ));
  }
  blocVoix.append(compteVoix);
  zone.append(blocVoix);
  Promise.all([Recorder.lister('papa'), Recorder.lister('maman')]).then(([pa, ma]) => {
    compteVoix.textContent = `Enregistrements sur cet appareil : Papa ${nf.format(pa.length)}, Maman ${nf.format(ma.length)}.`;
  });
}

function ongletSons(zone, ctx) {
  const r = reglages();
  const liste = profils();
  if (!ctx.profilVu || !liste.some((p) => p.id === ctx.profilVu)) ctx.profilVu = (Store.etat.profilActif && liste.some((p) => p.id === Store.etat.profilActif)) ? Store.etat.profilActif : (liste[0] && liste[0].id);
  const pid = ctx.profilVu;

  if (liste.length > 1) {
    zone.append(el('div', { class: 'bloc bloc-plat' },
      el('span', { class: 'etiquette', texte: 'Niveaux affichés pour :' }),
      segments('Profil', liste.map((p) => [p.id, p.prenom]), pid, (v) => { ctx.profilVu = v; ctx.remonter(); }),
    ));
  }

  // Paliers
  const ouverts = paliersOuverts(pid);
  const paliers = [...new Set((Data.sons || []).map((s) => s.palier))].sort((a, b) => a - b);
  const grillePaliers = el('div', { class: 'paliers' });
  for (const n of paliers) {
    const force = r.paliersForces.includes(n);
    const ouvert = ouverts.includes(n) || force;
    grillePaliers.append(el('div', { class: `palier ${ouvert ? 'ouvert' : 'ferme'}` },
      el('div', { class: 'palier-titre' }, `Palier ${n}`),
      el('div', { class: 'palier-etat', texte: ouvert ? (force && !ouverts.includes(n) ? 'ouvert (forcé)' : 'ouvert') : '🔒 verrouillé' }),
      n === paliers[0] ? el('span', { class: 'palier-etat', texte: 'toujours ouvert' }) : el('button', {
        type: 'button', class: `bouton petit ${force ? 'principal' : 'secondaire'}`, 'aria-pressed': String(force),
        onclick: () => {
          const f = reglages().paliersForces;
          const i = f.indexOf(n);
          if (i >= 0) f.splice(i, 1); else { f.push(n); f.sort((a, b) => a - b); }
          sauver();
          ctx.remonter();
        },
      }, force ? 'Ne plus forcer' : 'Forcer l\'ouverture'),
    ));
  }
  zone.append(el('section', { class: 'bloc' },
    el('h3', { texte: 'Paliers' }),
    el('p', { class: 'aide', texte: 'Un palier s\'ouvre tout seul quand 80 % des sons du palier précédent sont au moins bronze. Forcer l\'ouverture vaut pour tous les enfants.' }),
    grillePaliers,
  ));

  // Sons
  const des = new Set(r.sonsDesactives);
  const sections = [['consonne', 'Consonnes'], ['voyelle', 'Voyelles']];
  const blocSons = el('section', { class: 'bloc' },
    el('h3', { texte: 'Sons (ordre du livre)' }),
    el('p', { class: 'aide', texte: 'Touchez un son pour le fermer (il ne sortira plus en jeu) ou le rouvrir. L\'étoile indique le niveau de l\'enfant : gris, bronze (3 réussites), argent (8), or (15).' }),
  );
  for (const [type, titre] of sections) {
    const grille = el('div', { class: 'grille-sons' });
    for (const s of sonsTries().filter((x) => x.type === type)) {
      const niv = niveauSon(pid, s.id);
      const ferme = des.has(s.id);
      const verrouille = !(ouverts.includes(s.palier) || r.paliersForces.includes(s.palier));
      const libelle = (f) => (f ? 'fermé' : verrouille ? 'palier à venir' : 'actif');
      const b = el('button', {
        type: 'button', class: `case-son niveau-${NIVEAUX[niv] || 'gris'}${ferme ? ' ferme' : ''}${verrouille ? ' verrouille' : ''}`,
        'aria-pressed': String(!ferme),
        'aria-label': `${s.affiche}, palier ${s.palier}, niveau ${NIVEAUX[niv]}, ${libelle(ferme)}`,
      },
        el('span', { class: 'case-son-texte script', texte: s.affiche }),
        el('span', { class: 'case-son-meta' },
          el('span', { class: 'case-son-palier', texte: `P${s.palier}` }),
          el('span', { class: 'etoile', 'aria-hidden': 'true', texte: '★' }),
        ),
        el('span', { class: 'case-son-etat', texte: libelle(ferme) }),
      );
      b.addEventListener('click', () => {
        const liste2 = reglages().sonsDesactives;
        const i = liste2.indexOf(s.id);
        if (i >= 0) liste2.splice(i, 1); else liste2.push(s.id);
        sauver();
        const f = liste2.includes(s.id);
        b.classList.toggle('ferme', f);
        b.setAttribute('aria-pressed', String(!f));
        b.querySelector('.case-son-etat').textContent = libelle(f);
      });
      grille.append(b);
    }
    blocSons.append(el('h4', { texte: titre }), grille);
  }
  zone.append(blocSons);
}

function ongletProfils(zone, ctx) {
  const zoneConfirm = el('div', { class: 'zone-confirmation' });
  const liste = el('div', { class: 'liste-profils' });

  function palette(valeur, surChoix, nom) {
    const g = el('div', { class: 'palette', role: 'radiogroup', 'aria-label': nom });
    for (const [c, libelle] of COULEURS) {
      const b = el('button', {
        type: 'button', role: 'radio', class: 'couleur', 'aria-label': libelle, title: libelle,
        'aria-checked': String(c === valeur), style: { background: couleurCss(c) },
      });
      b.addEventListener('click', () => {
        for (const x of g.children) x.setAttribute('aria-checked', String(x === b));
        surChoix(c);
      });
      g.append(b);
    }
    return g;
  }

  for (const p of profils()) {
    const champ = el('input', { type: 'text', value: p.prenom, maxlength: '20', 'aria-label': `Prénom de ${p.prenom}`, autocomplete: 'off' });
    const pastille = el('span', { class: 'pastille grande', style: { background: couleurCss(p.couleur) } });
    const retour = el('span', { class: 'retour-ok', 'aria-live': 'polite' });
    const renommer = () => {
      const v = champ.value.trim();
      if (!v) { champ.value = p.prenom; return; }
      if (v === p.prenom) return;
      p.prenom = v;
      sauver();
      retour.textContent = 'Enregistré ✓';
      setTimeout(() => { retour.textContent = ''; }, 1500);
    };
    champ.addEventListener('change', renommer);
    champ.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') champ.blur(); });
    const carte = el('div', { class: 'carte-profil' },
      el('div', { class: 'rangee' }, pastille, champ, retour),
      palette(p.couleur, (c) => { p.couleur = c; pastille.style.background = couleurCss(c); sauver(); }, `Couleur de ${p.prenom}`),
      el('div', { class: 'rangee fin' },
        el('button', {
          type: 'button', class: 'bouton danger-leger',
          onclick: () => confirmation(zoneConfirmLocal, {
            question: `Supprimer le profil « ${p.prenom} » et toute sa progression ? C'est définitif (sauf si vous avez une sauvegarde).`,
            oui: 'Oui, supprimer',
            surOui: () => {
              Store.supprimerProfil(p.id);
              if (Store.etat.progres) delete Store.etat.progres[p.id];
              if (Store.etat.profilActif === p.id) Store.etat.profilActif = null;
              sauver();
              ctx.remonter();
            },
          }),
        }, 'Supprimer ce profil'),
      ),
    );
    const zoneConfirmLocal = el('div', { class: 'zone-confirmation' });
    carte.append(zoneConfirmLocal);
    liste.append(carte);
  }
  if (!profils().length) liste.append(el('p', { class: 'vide', texte: 'Aucun profil pour l\'instant.' }));

  // Création
  let couleurNouveau = (COULEURS.find(([c]) => !profils().some((p) => p.couleur === c)) || COULEURS[0])[0];
  const champNouveau = el('input', { type: 'text', maxlength: '20', placeholder: 'Prénom', 'aria-label': 'Prénom du nouveau profil', autocomplete: 'off' });
  const erreur = el('p', { class: 'erreur', 'aria-live': 'polite' });
  const creer = () => {
    const prenom = champNouveau.value.trim();
    if (!prenom) { erreur.textContent = 'Indiquez un prénom.'; champNouveau.focus(); return; }
    Store.creerProfil({ prenom, couleur: couleurNouveau });
    sauver();
    ctx.remonter();
  };
  champNouveau.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') creer(); });

  zone.append(
    el('section', { class: 'bloc' }, el('h3', { texte: 'Profils' }), liste, zoneConfirm),
    el('section', { class: 'bloc' },
      el('h3', { texte: 'Nouveau profil' }),
      el('div', { class: 'rangee' }, champNouveau,
        el('button', { type: 'button', class: 'bouton principal', onclick: creer }, 'Créer')),
      palette(couleurNouveau, (c) => { couleurNouveau = c; }, 'Couleur du nouveau profil'),
      erreur,
    ),
  );
}

function statsProfil(p) {
  const pr = Store.progres(p.id) || {};
  const hist = Array.isArray(pr.historique) ? pr.historique : [];
  const limite = Date.now() - 7 * 24 * 3600 * 1000;
  const recents = hist.filter((h) => { const t = Date.parse(h.date); return !Number.isNaN(t) && t >= limite && h.total > 0; });
  const moyenne = recents.length ? recents.reduce((s, h) => s + h.score / h.total, 0) / recents.length : null;

  const sons = Object.entries(pr.sons || {})
    .map(([id, v]) => ({ id, ok: v.ok || 0, ko: v.ko || 0 }))
    .filter((x) => x.ok + x.ko > 0)
    .map((x) => ({ ...x, taux: x.ok / (x.ok + x.ko), note: (x.ok + 1) / (x.ok + x.ko + 2) }));
  // Note lissée (succès + 1) / (essais + 2) : un son vu une fois ne passe pas devant un son solide.
  const tries = [...sons].sort((a, b) => b.note - a.note || b.ok - a.ok);
  const nForts = Math.min(5, Math.ceil(tries.length / 2));
  const forts = tries.slice(0, nForts);
  const faibles = tries.slice(nForts).filter((x) => x.ko > 0).reverse().slice(0, 5);

  const boites = [0, 0, 0, 0, 0];
  for (const v of Object.values(pr.boites || {})) {
    const k = Math.max(0, Math.min(4, Number(v.boite) || 0));
    boites[k] += 1;
  }
  return { pr, recents, moyenne, forts, faibles, boites };
}

function ongletProgres(zone) {
  if (!profils().length) {
    zone.append(el('p', { class: 'vide', texte: 'Aucun profil pour l\'instant.' }));
    return;
  }
  const affiche = (id) => { const s = Data.sonsParId && Data.sonsParId.get(id); return s ? s.affiche : id; };
  const LIB_BOITES = ['À revoir', 'Boîte 1', 'Boîte 2', 'Boîte 3', 'Acquises'];

  for (const p of profils()) {
    const st = statsProfil(p);
    const totalBoites = st.boites.reduce((a, b) => a + b, 0);
    const pillsSons = (liste, genre) => (liste.length
      ? el('div', { class: 'pills' }, liste.map((x) => el('span', { class: `pill ${genre}`, title: `${x.ok} réussites, ${x.ko} ratés` },
        el('span', { class: 'script', texte: affiche(x.id) }), el('small', { texte: ` ${Math.round(x.taux * 100)} %` }))))
      : el('p', { class: 'vide', texte: 'Pas encore assez de parties.' }));

    const barres = el('div', { class: 'boites' });
    st.boites.forEach((n, i) => {
      barres.append(el('div', { class: `boite b${i}` },
        el('span', { class: 'boite-lib', texte: LIB_BOITES[i] }),
        el('span', { class: 'boite-barre' }, el('span', { style: { width: totalBoites ? `${(100 * n) / totalBoites}%` : '0' } })),
        el('span', { class: 'boite-n', texte: nf.format(n) }),
      ));
    });

    zone.append(el('section', { class: 'bloc carte-progres', style: { '--couleur-profil': couleurCss(p.couleur) } },
      el('h3', {}, el('span', { class: 'pastille', style: { background: couleurCss(p.couleur) } }), p.prenom),
      el('div', { class: 'chiffres' },
        el('div', { class: 'chiffre' }, el('strong', { texte: nf.format(st.pr.manches || 0) }), el('span', { texte: 'manches jouées' })),
        el('div', { class: 'chiffre' }, el('strong', { texte: nf.format(st.pr.points || 0) }), el('span', { texte: 'points' })),
        el('div', { class: 'chiffre' },
          el('strong', { texte: st.moyenne === null ? '—' : `${Math.round(st.moyenne * 100)} %` }),
          el('span', { texte: `score moyen sur 7 jours (${st.recents.length} manche${st.recents.length > 1 ? 's' : ''})` })),
      ),
      el('div', { class: 'deux-colonnes' },
        el('div', {}, el('h4', { texte: 'Sons les plus forts' }), pillsSons(st.forts, 'fort')),
        el('div', {}, el('h4', { texte: 'Sons à travailler' }), pillsSons(st.faibles, 'faible')),
      ),
      el('h4', { texte: `Syllabes vues : ${nf.format(totalBoites)}` }),
      barres,
    ));
  }
}

function ongletCabine(zone, ctx) {
  const choix = el('div', { class: 'bloc bloc-plat' },
    el('span', { class: 'etiquette', texte: 'Qui enregistre ?' }),
    segments('Voix', [['papa', 'Papa'], ['maman', 'Maman']], ctx.voixCabine || null, (v) => {
      ctx.voixCabine = v;
      lancer();
      // Amène la cabine sous la barre collante pour garder le micro à l'écran.
      requestAnimationFrame(() => {
        const nav = document.querySelector('.parent-onglets');
        const marge = nav ? nav.getBoundingClientRect().bottom + 8 : 150;
        window.scrollTo({ top: sous.getBoundingClientRect().top + window.scrollY - marge, behavior: 'smooth' });
      });
    }),
  );
  const sous = el('div', { class: 'zone-cabine' });
  zone.append(choix, sous);

  function lancer() {
    if (ctx.nettoyerCabine) { ctx.nettoyerCabine(); ctx.nettoyerCabine = null; }
    sous.innerHTML = '';
    if (!ctx.voixCabine) {
      sous.append(el('p', { class: 'aide', texte: 'Choisissez Papa ou Maman. Chaque syllabe enregistrée remplace la voix de synthèse pour l\'enfant qui a choisi cette voix. Les enregistrements restent sur cet appareil ; exportez-les depuis l\'onglet Sauvegarde.' }));
      return;
    }
    ctx.nettoyerCabine = Recorder.monterCabine(sous, { voix: ctx.voixCabine });
  }
  lancer();
}

function ongletSauvegarde(zone, ctx) {
  const msg = el('p', { class: 'message', 'aria-live': 'polite' });
  const zoneConfirm = el('div', { class: 'zone-confirmation' });
  const entree = el('input', { type: 'file', accept: '.json,application/json', class: 'cache-fichier', id: 'parent-import' });

  entree.addEventListener('change', () => {
    const f = entree.files && entree.files[0];
    if (!f) return;
    const lecteur = new FileReader();
    lecteur.onload = () => {
      const texte = String(lecteur.result || '');
      entree.value = '';
      confirmation(zoneConfirm, {
        question: `Remplacer tous les profils, réglages et progrès de cet appareil par le contenu de « ${f.name} » ?`,
        oui: 'Oui, remplacer',
        surOui: () => {
          try {
            const r = Store.importer(texte);
            if (r === false) throw new Error('fichier non reconnu');
            sauver();
            msg.className = 'message ok';
            msg.textContent = 'Sauvegarde importée ✓';
          } catch (e) {
            msg.className = 'message erreur';
            msg.textContent = `Import impossible : ${e && e.message ? e.message : 'fichier invalide'}.`;
          }
        },
      });
    };
    lecteur.onerror = () => { msg.className = 'message erreur'; msg.textContent = 'Lecture du fichier impossible.'; };
    lecteur.readAsText(f);
  });

  const blocVoix = el('div', { class: 'voix-export' });
  zone.append(
    el('section', { class: 'bloc' },
      el('h3', { texte: 'Profils, réglages et progrès' }),
      el('p', { class: 'aide', texte: 'Un petit fichier .json qui contient tout sauf les voix enregistrées. Pratique pour changer d\'iPad ou avant une mise à jour.' }),
      el('div', { class: 'rangee' },
        el('button', {
          type: 'button', class: 'bouton principal',
          onclick: () => {
            const blob = new Blob([Store.exporter()], { type: 'application/json' });
            telecharger(blob, `syllabaire-sauvegarde-${aujourdhui()}.json`);
            msg.className = 'message ok';
            msg.textContent = 'Sauvegarde téléchargée.';
          },
        }, '⬇︎ Télécharger la sauvegarde'),
        el('label', { class: 'bouton secondaire', for: 'parent-import', tabindex: '0',
          onkeydown: (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); entree.click(); } } }, '⬆︎ Importer une sauvegarde…'),
        entree,
      ),
      zoneConfirm,
      msg,
    ),
    el('section', { class: 'bloc' },
      el('h3', { texte: 'Voix enregistrées' }),
      el('p', { class: 'aide' },
        'Le zip contient un fichier par syllabe et un manifest.json. Pour que la voix serve sur tous les appareils, copier les fichiers audio dans ',
        el('code', { texte: 'source/audio/voix/papa/' }), ' (ou maman) et reporter la liste du manifest dans ',
        el('code', { texte: 'source/audio/voix/manifest.json' }), '.'),
      blocVoix,
    ),
  );

  async function rendreVoix() {
    blocVoix.innerHTML = '';
    for (const [voix, nom] of [['papa', 'Papa'], ['maman', 'Maman']]) {
      const ids = await Recorder.lister(voix);
      if (!zone.isConnected && ctx.onglet !== 'sauvegarde') return;
      const conf = el('div', { class: 'zone-confirmation' });
      const n = ids.length;
      const bExport = el('button', { type: 'button', class: 'bouton secondaire', disabled: n === 0 }, `⬇︎ Exporter la voix de ${nom} (.zip)`);
      bExport.addEventListener('click', async () => {
        bExport.disabled = true;
        const ancien = bExport.textContent;
        bExport.textContent = 'Préparation…';
        try {
          const zip = await Recorder.exporterZip(voix);
          telecharger(zip, `voix-${voix}-${aujourdhui()}.zip`);
        } catch (e) {
          msg.className = 'message erreur';
          msg.textContent = `Export impossible : ${e.message || e}`;
        }
        bExport.textContent = ancien;
        bExport.disabled = false;
      });
      const bVider = el('button', {
        type: 'button', class: 'bouton danger-leger', disabled: n === 0,
        onclick: () => confirmation(conf, {
          question: `Effacer les ${nf.format(n)} enregistrements de ${nom} sur cet appareil ? Exportez-les d'abord si vous voulez les garder.`,
          oui: 'Oui, effacer',
          surOui: async () => { await Recorder.vider(voix); rendreVoix(); },
        }),
      }, 'Vider');
      blocVoix.append(el('div', { class: 'ligne-voix' },
        el('strong', { texte: nom }),
        el('span', { class: 'compte', texte: `${nf.format(n)} enregistrement${n > 1 ? 's' : ''}` }),
        el('div', { class: 'rangee' }, bExport, bVider),
        conf,
      ));
    }
  }
  rendreVoix();
}

function ongletAPropos(zone) {
  const lien = (href, texte) => el('a', { href, target: '_blank', rel: 'noopener' }, texte || href);
  zone.append(el('section', { class: 'bloc apropos' },
    el('h3', { texte: 'Crédits' }),
    el('dl', {},
      el('dt', { texte: 'Syllabaire d\'origine' }),
      el('dd', {}, 'Syllabaire à spirale de ', el('strong', { texte: 'Chat d\'école' }), ', professeure des écoles en CP — ',
        lien('https://www.chatdecole.site/un-syllabaire-pour-la-classe/'), '. Usage familial.'),
      el('dt', { texte: 'Écriture cursive' }),
      el('dd', {}, 'Police ', el('span', { class: 'cursif apercu-grand', texte: 'Écriture A' }),
        ', police cursive officielle du ministère de l\'Éducation nationale (Éduscol, 2013), ',
        'licence Creative Commons BY-ND (attribution, pas de modification) : utilisée telle quelle, sans modification ni sous-ensemble.'),
      el('dt', { texte: 'Écriture script' }),
      el('dd', {}, 'Police ', el('span', { class: 'script apercu-grand', texte: 'Andika' }),
        ' de SIL International, SIL Open Font License 1.1 (OFL), dessinée pour les lecteurs débutants.'),
      el('dt', { texte: 'Voix de synthèse' }),
      el('dd', { texte: 'Audrey (français, France), voix fournie par macOS, pré-enregistrée pour chaque syllabe.' }),
      el('dt', { texte: 'Vie privée' }),
      el('dd', { texte: 'Prénoms, scores et voix enregistrées restent sur cet appareil. Aucun compte, aucun envoi.' }),
    ),
  ));
}

// ---------------------------------------------------------------------------
// Écran
// ---------------------------------------------------------------------------

export const Parent = {
  monter(conteneur) {
    const ctx = { onglet: 'reglages', profilVu: null, voixCabine: null, nettoyerCabine: null, remonter: null };
    let nettoyerCadenas = null;

    conteneur.innerHTML = '';
    conteneur.classList.add('ecran-parent');

    const titre = el('h2', { class: 'parent-titre', texte: 'Espace des parents' });
    const retour = el('button', { type: 'button', class: 'bouton retour', onclick: allerAccueil }, '← Accueil');
    const barre = el('header', { class: 'parent-barre' }, retour, titre);
    const corps = el('div', { class: 'parent-corps' });
    conteneur.append(barre, corps);

    const pret = (!Array.isArray(Data.sons) || !Data.sons.length)
      ? Promise.resolve().then(() => Data.charger()).catch(() => {})
      : Promise.resolve();

    function ouvrir() {
      if (nettoyerCadenas) { nettoyerCadenas(); nettoyerCadenas = null; }
      corps.innerHTML = '';
      const nav = el('nav', { class: 'parent-onglets', role: 'tablist', 'aria-label': 'Sections' });
      const panneau = el('div', { class: 'parent-panneau', role: 'tabpanel' });
      for (const [id, libelle] of ONGLETS) {
        nav.append(el('button', {
          type: 'button', role: 'tab', class: 'onglet', 'data-onglet': id,
          'aria-selected': String(id === ctx.onglet),
          onclick: () => { ctx.onglet = id; rendre(); },
        }, libelle));
      }
      corps.append(nav, panneau);

      function rendre() {
        if (ctx.nettoyerCabine) { ctx.nettoyerCabine(); ctx.nettoyerCabine = null; }
        for (const b of nav.children) b.setAttribute('aria-selected', String(b.dataset.onglet === ctx.onglet));
        const y = window.scrollY;
        panneau.innerHTML = '';
        panneau.dataset.onglet = ctx.onglet;
        const f = {
          reglages: ongletReglages, sons: ongletSons, profils: ongletProfils, progres: ongletProgres,
          cabine: ongletCabine, sauvegarde: ongletSauvegarde, apropos: ongletAPropos,
        }[ctx.onglet];
        try {
          f(panneau, ctx);
        } catch (e) {
          panneau.append(el('p', { class: 'message erreur', texte: `Erreur d'affichage : ${e.message || e}` }));
          console.error(e);
        }
        return y;
      }
      ctx.remonter = () => { const y = window.scrollY; rendre(); window.scrollTo(0, y); };
      pret.then(rendre);
    }

    nettoyerCadenas = monterCadenas(corps, ouvrir);

    return function demonter() {
      if (nettoyerCadenas) nettoyerCadenas();
      if (ctx.nettoyerCabine) ctx.nettoyerCabine();
      conteneur.classList.remove('ecran-parent');
    };
  },
};
