#!/usr/bin/env python3
"""Génère les syllabes consonne + voyelle à partir de sons.json.

Sorties :
  source/data/syllabes.json           les syllabes retenues (à valider par Benjamin)
  source/data/syllabes_exclues.json   les combinaisons écartées, avec la règle
  Relecture syllabes.html (racine)    page de relecture : cases à cocher + export

Règles (CLAUDE.md §4) : on écarte les combinaisons impossibles ou trompeuses
(ç devant e/i, c ou g « doux », gu/ge/qu hors de leur usage, graphies rares
après consonnes rares…). Ce n'est pas une liste de « vrais mots » : une
syllabe décodable mais sans mot (« plou ») est conservée.
"""
import json
import html
from pathlib import Path

RACINE = Path(__file__).resolve().parents[2]
DATA = RACINE / "source" / "data"
SONS = json.loads((DATA / "sons.json").read_text(encoding="utf-8"))
CONSONNES = [s for s in SONS if s["type"] == "consonne"]
VOYELLES = [s for s in SONS if s["type"] == "voyelle"]
# Dans tout ce script, un son est désigné par ce qui s'affiche (« ç », « é »),
# et son identifiant ASCII (« ccedil », « eacute ») ne sert qu'aux fichiers.
PALIER = {s["affiche"]: s["palier"] for s in SONS}
SLUG = {s["affiche"]: s["id"] for s in SONS}

def S(txt):
    return set(txt.split())

COURANTES = S("a i o u e é è ê ou oi au eau an en on in ai ei eu")
FINALES = S("er ez et")
NASALES_RARES = S("ain ein oin")
SEMI = S("ian ion ien ieu")
DOUBLES = S("elle enne erre esse ette")
MOUILLEES = S("ill ail eil euil ouil")
TOUTES = {v["affiche"] for v in VOYELLES}

SIMPLES = S("l r m s t p d b f v n")
GROUPES_R = S("br cr dr fr gr pr tr vr")
GROUPES_L = S("bl cl fl gl pl")

# Voyelles autorisées par consonne. Chaque règle porte un nom, repris dans
# la page de relecture pour expliquer une exclusion.
AUTORISE = {}
REGLE = {}

def regle(consonnes, voyelles, nom):
    for c in consonnes:
        AUTORISE[c] = set(voyelles)
        REGLE[c] = nom

regle(SIMPLES, TOUTES - {"oeu"}, "consonne simple : tout sauf « oeu »")
regle(GROUPES_R, TOUTES - {"y", "oeu"} - SEMI, "groupe consonne + r : pas de y, oeu, ian/ion/ien/ieu")
regle(GROUPES_L, TOUTES - {"y", "oeu"} - SEMI - MOUILLEES, "groupe consonne + l : pas de y, oeu, semi-voyelles ni graphies mouillées")
regle(["z"], S("a i u o e é er ou è an et on in oin ian ion ien"), "z : voyelles courantes, zin, zion… — validé par Benjamin le 27/09/2026")
regle(["j"], S("a i o u e é è ou oi au an en on in ai eu er ez et ette oin"), "j : voyelles courantes, finales, ette, oin")
regle(["ch"], S("a i o u e é è ê ou oi au an en on in ai eu er ez et elle ette esse ien"), "ch : courantes, finales, elle/ette/esse, ien")
regle(["h"], S("a i o u e é è ê ou on an au ai eu er ein"), "h : voyelles courantes seulement")
regle(["c"], S("a i u o e é er ou è ê oi au eau an en ai ei et on in ain ein oin eu oeu ian ion ien ieu elle esse ette ail eil euil"), "c : c dur (ca, co, cu) et c doux (ce, ci) — validé par Benjamin le 27/09/2026")
regle(["ç"], S("a on"), "ç : seulement « ça » — validé par Benjamin le 27/09/2026")
regle(["g"], S("a i y u o e é er ez ou è ê oi au eau an en ai ei et on ain oin ion ien ail ouil"), "g : g dur (ga, go) et g doux (ge, gi) — validé par Benjamin le 27/09/2026")
regle(["gu"], S("e é è ê i y ei eu en in er ez et ette erre ill"), "gu : seulement devant e, i, y")
regle(["ge"], S("a u o oi an ai on"), "ge : geon, gea, geoi… — validé par Benjamin le 27/09/2026")
regle(["qu"], S("a e i o é è ê y eu en in an oi ai er ez et elle ette erre ill"), "qu : usages réels (que, qui, quoi, quand…)")
regle(["k"], S("a i o u e é è ou on an"), "k : voyelles courantes seulement")
regle(["w"], S("a i e é o ou"), "w : wagon, kiwi, web…")
regle(["gn"], S("a i o u e é è ou on an eau ai er ez et"), "gn : courantes, agneau, gagner")
regle(["ph"], S("a i y u o e é er ou è an on"), "ph : phare, photo, éléphant… — validé par Benjamin le 27/09/2026")

# oeu : seulement bœuf, sœur, vœu, nœud, mœurs, cœur
for c in "b s v n m".split():
    AUTORISE[c].add("oeu")

# Exclusions ponctuelles (syllabes à éviter avec un enfant). La liste complète
# a été relue et validée par Benjamin le 27/09/2026 (1 104 syllabes).
# « cu » et « con » existent dans le livre papier (cube, concombre) : on les garde.
EXCLUS_PONCTUELS = {("c", "ouil"): "syllabe vulgaire"}

def tts_pour(consonne, voyelle):
    """Texte à donner à la synthèse quand la graphie brute est mal lue.

    Mesuré le 27/09/2026 avec la voix Audrey : le e muet final est avalé
    (« pe » dure 0,06 s), on écrit « eu » à la place ; « que » est plus net
    en « keu ». Les syllabes en « ge » (geon, gea…) se lisent mieux brutes
    qu'avec un j (« jon », « jan » sont pris pour des prénoms anglais).
    Retourne None quand le texte brut convient. Vérifier à l'oreille :
    gen_tts.py --say-test.
    """
    texte = consonne + voyelle
    if voyelle == "e":
        texte = {"qu": "keu", "gu": "gueu"}.get(consonne, consonne + "eu")
    if voyelle == "ê":                    # « mê » est épelé (1,6 s) ; « mè » se dit pareil
        texte = consonne + "è"
    if voyelle == "y":                    # « ty », « my » sont lus à l'anglaise
        texte = consonne + "i"
    texte = TTS_MESURE.get(texte, texte)  # cas mesurés un par un (mots anglais, abréviations)
    return None if texte == consonne + voyelle else texte


# Graphies dont la lecture brute par Audrey est fausse (durée anormale mesurée le
# 27/09/2026 : « len », « ron », « pen », « ran » lus comme des mots anglais, « za », « ba »,
# « vo » épelés, « gea » lu « geai »… ; détection par tools/verifier_tts.py),
# avec la graphie de remplacement qui donne la bonne durée. Clé = texte brut ou
# texte déjà transformé par les règles ci-dessus.
TTS_MESURE = {
    "ba": "bah",
    "ben": "bens",
    "berre": "berres",
    "bin": "bint",
    "bon": "bond",
    "brain": "braint",
    "bran": "brans",
    "bren": "brend",
    "broin": "broint",
    "bron": "bront",
    "can": "cant",
    "chan": "chant",
    "chau": "chauh",
    "chen": "chent",
    "ché": "chée",
    "clin": "clind",
    "clu": "clue",
    "con": "conc",
    "cra": "crah",
    "crain": "craint",
    "crau": "cro",
    "cren": "crent",
    "dan": "dant",
    "den": "dent",
    "dieu": "dieuh",
    "dri": "drih",
    "droin": "droint",
    "fan": "fant",
    "fein": "feint",
    "fez": "fezh",
    "fian": "fiand",
    "flin": "flind",
    "fran": "frand",
    "frei": "frè",
    "fresse": "fresses",
    "gea": "jah",
    "gen": "gend",
    "geo": "jo",
    "geu": "jeu",
    "gi": "gih",
    "glan": "glant",
    "glen": "glend",
    "gler": "glerh",
    "gran": "grand",
    "groin": "groins",
    "guen": "guent",
    "gui": "ghi",
    "hi": "hie",
    "hé": "héh",
    "jan": "jant",
    "jau": "jaux",
    "jin": "jint",
    "join": "joint",
    "jon": "jont",
    "kan": "kand",
    "kon": "kond",
    "len": "lent",
    "man": "mant",
    "mein": "meint",
    "men": "ment",
    "nein": "neint",
    "nion": "niont",
    "non": "nont",
    "pen": "pent",
    "plen": "plent",
    "pri": "prih",
    "prin": "prind",
    "quette": "quettes",
    "quo": "quoh",
    "rain": "raint",
    "ran": "rant",
    "ren": "rend",
    "rer": "rerh",
    "resse": "resses",
    "ron": "ront",
    "san": "sans",
    "sin": "sint",
    "tei": "teih",
    "ten": "tend",
    "tra": "trah",
    "tren": "trens",
    "trer": "trerh",
    "van": "vant",
    "vi": "vih",
    "vo": "voh",
    "vroi": "vroih",
    "za": "zah",
    "zi": "zih",
    "zion": "ziont",
    "zo": "zoh",
    "zon": "zond"
}


def main():
    retenues, exclues = [], []
    for c in CONSONNES:
        for v in VOYELLES:
            cid, vid = c["affiche"], v["affiche"]
            texte = cid + vid
            item = {"id": f"{SLUG[cid]}-{SLUG[vid]}", "consonne": SLUG[cid], "voyelle": SLUG[vid],
                    "texte": texte, "palier": max(PALIER[cid], PALIER[vid])}
            if (cid, vid) in EXCLUS_PONCTUELS:
                item["regle"] = EXCLUS_PONCTUELS[(cid, vid)]
                exclues.append(item)
            elif vid in AUTORISE[cid]:
                tts = tts_pour(cid, vid)
                if tts:
                    item["tts"] = tts
                retenues.append(item)
            else:
                item["regle"] = REGLE[cid]
                exclues.append(item)

    (DATA / "syllabes.json").write_text(json.dumps(retenues, ensure_ascii=False, indent=1), encoding="utf-8")
    (DATA / "syllabes_exclues.json").write_text(json.dumps(exclues, ensure_ascii=False, indent=1), encoding="utf-8")
    ecrire_relecture(retenues, exclues)
    par_palier = {}
    for s in retenues:
        par_palier[s["palier"]] = par_palier.get(s["palier"], 0) + 1
    print(f"{len(retenues)} syllabes retenues, {len(exclues)} exclues")
    print("par palier :", dict(sorted(par_palier.items())))


def ecrire_relecture(retenues, exclues):
    """Page autonome : tableau consonnes × voyelles, cases à cocher, export JSON."""
    donnees = {"retenues": retenues, "exclues": exclues,
               "consonnes": [[c["affiche"], c["id"]] for c in CONSONNES],
               "voyelles": [[v["affiche"], v["id"]] for v in VOYELLES],
               "paliers": PALIER}
    page = TEMPLATE.replace("__DONNEES__", json.dumps(donnees, ensure_ascii=False))
    (RACINE / "Relecture syllabes.html").write_text(page, encoding="utf-8")


TEMPLATE = r"""<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Relecture des syllabes</title>
<link rel="stylesheet" href="source/css/fonts.css">
<style>
:root{--ok:#dff5e1;--ko:#f6e0e0;--ligne:#e5e5e5;--enc:#333}
body{font-family:-apple-system,Helvetica,sans-serif;margin:16px;color:var(--enc)}
h1{font-size:1.4rem;margin:0 0 4px}
p.aide{margin:0 0 12px;color:#555;max-width:70ch}
.barre{display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin:12px 0;position:sticky;top:0;background:#fff;padding:8px 0;border-bottom:1px solid var(--ligne);z-index:2}
button{font-size:1rem;padding:8px 14px;border-radius:8px;border:1px solid #888;background:#fafafa;cursor:pointer}
button.primaire{background:#2b7a3b;color:#fff;border-color:#2b7a3b}
label.mode{display:inline-flex;gap:6px;align-items:center}
.grille{overflow:auto;max-height:78vh;border:1px solid var(--ligne)}
table{border-collapse:collapse;font-size:1.05rem}
th,td{border:1px solid var(--ligne);padding:2px 4px;text-align:center;white-space:nowrap}
th{background:#f3f3f3;position:sticky;top:0;z-index:1}
th.c{position:sticky;left:0;z-index:1;background:#f3f3f3}
td{cursor:pointer;min-width:44px;user-select:none}
td.ok{background:var(--ok)} td.ko{background:var(--ko);color:#999}
td.modif{outline:2px solid #e0a800;outline-offset:-2px}
.script{font-family:Andika,"Century Gothic",sans-serif}
.cursif{font-family:EcritureA,"Snell Roundhand",cursive;font-size:1.6rem}
.p1{border-left:3px solid #4caf50}.p2{border-left:3px solid #8bc34a}.p3{border-left:3px solid #ffc107}
.p4{border-left:3px solid #ff9800}.p5{border-left:3px solid #f44336}.p6{border-left:3px solid #9c27b0}
#compte{font-weight:600}
</style></head><body>
<h1>Relecture des syllabes</h1>
<p class="aide">Vert = retenue, rouge = écartée (survoler pour lire la règle). <b>Cliquer une case pour l'inverser.</b>
Les cases modifiées sont cerclées d'orange. Quand c'est bon, « Exporter » télécharge <code>syllabes.json</code> :
le déposer dans <code>source/data/</code> à la place de l'actuel. La couleur de gauche de chaque consonne indique son palier.</p>
<div class="barre">
 <span id="compte"></span>
 <label class="mode"><input type="radio" name="ecr" value="script" checked> script</label>
 <label class="mode"><input type="radio" name="ecr" value="cursif"> cursive</label>
 <button id="annuler">Annuler mes changements</button>
 <button id="exporter" class="primaire">Exporter syllabes.json</button>
</div>
<div class="grille"><table id="t"></table></div>
<script>
const D = __DONNEES__;
const etat = new Map();   // id -> {retenue:bool, item, origine:bool}
for (const s of D.retenues) etat.set(s.id, {retenue:true, origine:true, item:s});
for (const s of D.exclues)  etat.set(s.id, {retenue:false, origine:false, item:s});
const t = document.getElementById('t');
function rendre(){
  const ecr = document.querySelector('input[name=ecr]:checked').value;
  let h = '<tr><th class="c"></th>' + D.voyelles.map(([v])=>`<th class="${ecr}">${v}</th>`).join('') + '</tr>';
  for (const [c, cid] of D.consonnes){
    h += `<tr><th class="c p${D.paliers[c]} ${ecr}">${c}</th>`;
    for (const [v, vid] of D.voyelles){
      const id = cid+'-'+vid, e = etat.get(id);
      const cls = (e.retenue?'ok':'ko') + (e.retenue!==e.origine?' modif':'') + ' ' + ecr;
      const titre = e.retenue ? `palier ${e.item.palier}` : (e.item.regle||'');
      h += `<td class="${cls}" data-id="${id}" title="${titre}">${c}${v}</td>`;
    }
    h += '</tr>';
  }
  t.innerHTML = h; compter();
}
function compter(){
  let n=0, m=0; for (const e of etat.values()){ if(e.retenue) n++; if(e.retenue!==e.origine) m++; }
  document.getElementById('compte').textContent = `${n} retenues · ${m} modifiées`;
}
t.addEventListener('click', ev=>{
  const td = ev.target.closest('td[data-id]'); if(!td) return;
  const e = etat.get(td.dataset.id); e.retenue = !e.retenue; rendre();
});
document.querySelectorAll('input[name=ecr]').forEach(r=>r.addEventListener('change', rendre));
document.getElementById('annuler').onclick = ()=>{ for(const e of etat.values()) e.retenue=e.origine; rendre(); };
document.getElementById('exporter').onclick = ()=>{
  const liste = [];
  for (const [, cid] of D.consonnes) for (const [, vid] of D.voyelles){
    const e = etat.get(cid+'-'+vid); if(!e.retenue) continue;
    const {regle, ...item} = e.item; liste.push(item);
  }
  const blob = new Blob([JSON.stringify(liste, null, 1)], {type:'application/json'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'syllabes.json'; a.click();
};
rendre();
</script></body></html>
"""

if __name__ == "__main__":
    main()
