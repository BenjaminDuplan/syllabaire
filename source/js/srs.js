// Srs — révision espacée (boîtes de Leitner par syllabe et par profil),
// étoiles par son, paliers. Voir ARCHITECTURE.md §6 et CLAUDE.md §5.
// Horloge = progres.manches (incrémenté par l'écran de jeu en fin de manche).

import { Store } from './store.js';
import { Data } from './data.js';

// Délai (en manches) avant de revoir une syllabe, par boîte.
export const INTERVALLES = [0, 1, 3, 7, 20];
// Réussites nécessaires : bronze, argent, or.
export const SEUILS_ETOILES = [3, 8, 15];
const PART_OUVERTURE = 0.8;

export const Srs = {
  // Met à jour la boîte de la syllabe et les compteurs de ses deux sons. Ne sauve pas.
  // Renvoie { boite, sons: [{ sonId, avant, apres }] } (information en plus du contrat).
  resultat(profilId, syllabeId, ok) {
    const p = Store.progres(profilId);
    const b = p.boites[syllabeId] || (p.boites[syllabeId] = { boite: 0, prochaine: 0, vues: 0, reussites: 0 });
    b.vues++;
    if (ok) { b.reussites++; b.boite = Math.min(4, b.boite + 1); }
    else b.boite = 0;
    b.prochaine = p.manches + INTERVALLES[b.boite];

    const sy = Data.syllabesParId.get(syllabeId);
    const sons = [];
    if (sy) {
      for (const sonId of new Set([sy.consonne, sy.voyelle])) {
        const avant = this.niveauSon(profilId, sonId);
        const c = p.sons[sonId] || (p.sons[sonId] = { ok: 0, ko: 0 });
        if (ok) c.ok++; else c.ko++;
        sons.push({ sonId, avant, apres: this.niveauSon(profilId, sonId) });
      }
    }
    return { boite: b.boite, sons };
  },

  // Syllabes dont la date de révision est arrivée, les plus urgentes d'abord
  // (boîte la plus basse, puis retard le plus grand).
  dues(profilId) {
    const p = Store.progres(profilId);
    return Object.entries(p.boites)
      .filter(([id, b]) => b.prochaine <= p.manches && Data.syllabesParId.has(id))
      .sort(([, a], [, b]) => (a.boite - b.boite) || (a.prochaine - b.prochaine))
      .map(([id]) => id);
  },

  niveauSon(profilId, sonId) {
    const ok = Store.progres(profilId).sons[sonId]?.ok || 0;
    return SEUILS_ETOILES.filter(s => ok >= s).length;
  },

  // [1] au départ ; n+1 s'ouvre quand 80 % des sons (non désactivés) du palier n sont ≥ bronze.
  paliersOuverts(profilId) {
    const reg = Store.reglages();
    const desactives = new Set(reg.sonsDesactives);
    const max = Data.sons.reduce((m, s) => Math.max(m, s.palier), 1);
    const ouverts = new Set([1, ...reg.paliersForces]);
    for (let n = 1; n < max; n++) {
      if (!ouverts.has(n)) break;
      const sons = Data.sons.filter(s => s.palier === n && !desactives.has(s.id));
      const bronze = sons.filter(s => this.niveauSon(profilId, s.id) >= 1).length;
      if (sons.length === 0 || bronze / sons.length >= PART_OUVERTURE) ouverts.add(n + 1);
      else break;
    }
    return [...ouverts].sort((a, b) => a - b);
  },

  // Ids des sons jouables : paliers ouverts, moins les sons fermés par le parent.
  sonsActifs(profilId) {
    const ouverts = new Set(this.paliersOuverts(profilId));
    const desactives = new Set(Store.reglages().sonsDesactives);
    return Data.sons.filter(s => ouverts.has(s.palier) && !desactives.has(s.id)).map(s => s.id);
  },
};
