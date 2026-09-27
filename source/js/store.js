// Store — état persistant (localStorage), voir ARCHITECTURE.md §3.
// Toute modification : muter Store.etat puis appeler Store.sauver().

const CLE = 'syllabaire.v1';

function reglagesParDefaut() {
  return {
    ecriture: 'alterne',
    tuilesParManche: 10,
    sonsDesactives: [],
    paliersForces: [],
  };
}

function etatVide() {
  return {
    version: 1,
    profils: [],
    profilActif: null,
    reglages: reglagesParDefaut(),
    progres: {},
  };
}

// Complète un état lu (ancien ou partiel) avec les valeurs par défaut.
function normaliser(e) {
  const base = etatVide();
  if (!e || typeof e !== 'object') return base;
  const etat = Object.assign(base, e);
  etat.version = 1;
  if (!Array.isArray(etat.profils)) etat.profils = [];
  etat.reglages = Object.assign(reglagesParDefaut(), e.reglages || {});
  if (!Array.isArray(etat.reglages.sonsDesactives)) etat.reglages.sonsDesactives = [];
  if (!Array.isArray(etat.reglages.paliersForces)) etat.reglages.paliersForces = [];
  if (!etat.progres || typeof etat.progres !== 'object') etat.progres = {};
  if (etat.profilActif && !etat.profils.some(p => p.id === etat.profilActif)) etat.profilActif = null;
  return etat;
}

function aujourdhui() {
  const d = new Date();
  const z = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

export const Store = {
  etat: etatVide(),
  // true si rien n'était enregistré sur l'appareil au dernier charger() (premier lancement).
  neuf: true,

  charger() {
    let brut = null;
    try { brut = localStorage.getItem(CLE); } catch (e) { console.warn('Store : localStorage illisible', e); }
    this.neuf = !brut;
    let lu = null;
    if (brut) {
      try { lu = JSON.parse(brut); } catch (e) { console.warn('Store : état corrompu, repart de zéro', e); }
    }
    this.etat = normaliser(lu);
    return this.etat;
  },

  sauver() {
    try { localStorage.setItem(CLE, JSON.stringify(this.etat)); }
    catch (e) { console.warn('Store : sauvegarde impossible', e); }
  },

  profilActif() {
    return this.profil(this.etat.profilActif);
  },

  profil(id) {
    if (!id) return null;
    return this.etat.profils.find(p => p.id === id) || null;
  },

  creerProfil({ prenom, couleur }) {
    const max = this.etat.profils.reduce((m, p) => {
      const n = parseInt(String(p.id).replace(/^p/, ''), 10);
      return Number.isFinite(n) && n > m ? n : m;
    }, 0);
    const profil = {
      id: 'p' + (max + 1),
      prenom: String(prenom || '').trim() || 'Enfant',
      couleur: couleur || 'vert',
      voix: 'auto',
      cree: aujourdhui(),
    };
    this.etat.profils.push(profil);
    this.progres(profil.id);
    this.sauver();
    return profil;
  },

  supprimerProfil(id) {
    this.etat.profils = this.etat.profils.filter(p => p.id !== id);
    delete this.etat.progres[id];
    if (this.etat.profilActif === id) this.etat.profilActif = null;
    this.sauver();
  },

  reglages() {
    return this.etat.reglages;
  },

  progres(profilId) {
    const tous = this.etat.progres;
    if (!tous[profilId]) {
      tous[profilId] = { points: 0, manches: 0, boites: {}, sons: {}, historique: [] };
    }
    const p = tous[profilId];
    p.points ??= 0; p.manches ??= 0; p.boites ??= {}; p.sons ??= {}; p.historique ??= [];
    return p;
  },

  exporter() {
    return JSON.stringify(this.etat, null, 2);
  },

  // Remplace tout l'état. Lève une Error si le JSON est illisible ou de version inconnue.
  importer(json) {
    const e = typeof json === 'string' ? JSON.parse(json) : json;
    if (!e || e.version !== 1) throw new Error('Sauvegarde non reconnue (version attendue : 1)');
    this.etat = normaliser(e);
    this.sauver();
    return true;
  },
};
