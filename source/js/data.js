// Data — chargement des données du syllabaire, voir ARCHITECTURE.md §4.

let promesse = null;

export const Data = {
  sons: [],
  syllabes: [],
  audioExtra: [],          // en plus du contrat : entrées « son-* » et « phrase-* »
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
      const [sons, syllabes, extra] = await Promise.all([
        lire('sons.json'),
        lire('syllabes.json'),
        lire('audio_extra.json').catch(e => { console.warn(e); return []; }),
      ]);
      this.sons = sons;
      this.syllabes = syllabes;
      this.audioExtra = extra;
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
};
