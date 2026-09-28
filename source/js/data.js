// Data — chargement des données du syllabaire, voir ARCHITECTURE.md §4.

let promesse = null;

export const Data = {
  sons: [],
  syllabes: [],
  audioExtra: [],          // en plus du contrat : entrées « son-* » et « phrase-* »
  confusions: [],          // paires de sons qui se confondent (data/confusions.json)
  _voisins: new Map(),     // sonId → Set des sons qui se confondent avec lui
  sonsParId: new Map(),
  syllabesParId: new Map(),
  consonnes: [],
  voyelles: [],
  _parSon: new Map(),

  charger() {
    if (promesse) return promesse;
    const lire = async (nom) => {
      const r = await fetch(`data/${nom}`);
      if (!r.ok) throw new Error(`Data : ${nom} introuvable (${r.status})`);
      return r.json();
    };
    promesse = (async () => {
      const [sons, syllabes, extra, confusions] = await Promise.all([
        lire('sons.json'),
        lire('syllabes.json'),
        lire('audio_extra.json').catch(e => { console.warn(e); return []; }),
        lire('confusions.json').catch(e => { console.warn(e); return {}; }),
      ]);
      this.sons = sons;
      this.syllabes = syllabes;
      this.audioExtra = extra;
      this.confusions = [...(confusions.consonnes || []), ...(confusions.voyelles || [])];
      this._voisins = new Map(sons.map(s => [s.id, new Set()]));
      for (const [a, b] of this.confusions) {
        this._voisins.get(a)?.add(b);
        this._voisins.get(b)?.add(a);
      }
      this.sonsParId = new Map(sons.map(s => [s.id, s]));
      this.syllabesParId = new Map(syllabes.map(s => [s.id, s]));
      const parOrdre = (a, b) => a.ordre - b.ordre;
      this.consonnes = sons.filter(s => s.type === 'consonne').sort(parOrdre);
      this.voyelles = sons.filter(s => s.type === 'voyelle').sort(parOrdre);
      this._parSon = new Map(sons.map(s => [s.id, []]));
      for (const sy of syllabes) {
        this._parSon.get(sy.consonne)?.push(sy);
        this._parSon.get(sy.voyelle)?.push(sy);
      }
      return this;
    })();
    promesse.catch(() => { promesse = null; });
    return promesse;
  },

  syllabesDuSon(sonId) {
    return this._parSon.get(sonId) || [];
  },

  // Sons qui se confondent avec celui-ci (b → {d, p}). Set vide si aucun.
  voisins(sonId) {
    return this._voisins.get(sonId) || new Set();
  },
};
