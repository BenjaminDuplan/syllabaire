# ARCHITECTURE — contrat entre modules

Ce fichier est le **contrat** que suivent tous les modules du jeu. Il est
écrit pour permettre à plusieurs personnes (ou agents) de travailler en
parallèle sur des fichiers différents. **On ne modifie pas une API décrite
ici sans mettre ce fichier à jour** ; on peut ajouter des fonctions, pas en
changer la signature.

Contexte produit : `../CLAUDE.md` (sections 1, 2, 5). Ce document ne le
répète pas.

---

## 1. Fichiers et propriétaires

| Fichier | Rôle | Lot |
|---|---|---|
| `index.html` | page unique, tous les écrans, liens CSS/JS | A |
| `css/style.css` | thème, tokens, tuile, boutons, écrans accueil/jeu/fin | A |
| `css/fonts.css` | `@font-face` EcritureA + Andika (existe déjà, ne pas toucher) | — |
| `css/rewards.css` | styles de la carte des sons, de l'ours, de l'écran de fin | B |
| `css/parent.css` | styles de l'écran parent et de la cabine | C |
| `css/ecoute.css` | styles du mode « J'écoute » | D |
| `js/app.js` | démarrage, routeur d'écrans, écran accueil, écran fin de manche | A |
| `js/data.js` | chargement de `data/*.json` | A |
| `js/store.js` | localStorage : profils, réglages, progrès | A |
| `js/audio.js` | mégaphone, résolution de la voix, bruitages WebAudio, déblocage iOS | A |
| `js/srs.js` | révision espacée, étoiles par son, paliers | A |
| `js/tirage.js` | composition d'une manche | A |
| `js/game.js` | écran « Je lis » : tuile, ✓/✗, retournement, enchaînement | A |
| `js/rewards.js` | confettis, pluie d'étoiles, fanfare visuelle, écran de fin (contenu) | B |
| `js/ours.js` | l'ours SVG en 5 stades | B |
| `js/carte.js` | écran « carte des sons » | B |
| `js/parent.js` | écran parent : cadenas, réglages, sons actifs, profils, tableau de bord, export/import | C |
| `js/recorder.js` | cabine d'enregistrement, IndexedDB, export zip | C |
| `js/listen.js` | écran « J'écoute » (QCM audio à 3 tuiles) | D |
| `js/apprendre.js`, `css/apprendre.css` | écran « J'apprends » (écoute libre des sons) | après lots |
| `manifest.webmanifest`, `sw.js`, `icons/` | PWA | E (plus tard) |

Chaque lot ne modifie **que ses fichiers**. Un besoin dans un fichier d'un
autre lot → le noter dans le rapport final, ne pas l'éditer.

---

## 2. Conventions générales

- ES modules natifs, `import { X } from './x.js'`. Pas de bundler, pas de
  dépendance externe, pas de CDN. Le jeu doit marcher hors ligne.
- Un module exporte **un objet nommé** (ex. `export const Store = {...}`)
  avec exactement les fonctions listées ici (il peut en avoir d'autres).
- Français partout : noms de fonctions, commentaires, textes.
- Cible : iPad Safari (tactile, paysage et portrait), Mac Safari/Chrome.
  Zones tactiles ≥ 64 px. Pas de `alert()` / `confirm()` / `prompt()`.
- Tout écran est une fonction `monter(conteneur, params)` qui remplit
  `conteneur` (un `<section>` vide) et renvoie éventuellement une fonction
  de nettoyage (`demonter`). L'écran ne touche pas au reste du DOM, sauf
  les overlays prévus (`#confettis`).
- Aucun texte négatif ni chronomètre visible pour l'enfant.
- Les ids de sons et de syllabes sont ASCII (`ccedil-a`, `l-eacute`). Le
  texte à afficher est `syllabe.texte` / `son.affiche`.

### Données (`data/`, produites par `tools/`, ne pas éditer à la main)

```js
// sons.json (79)
{ id: "ch", type: "consonne"|"voyelle", affiche: "ch", palier: 3, ordre: 15, page: 9 }
// syllabes.json (1 104)
{ id: "ch-ou", consonne: "ch", voyelle: "ou", texte: "chou", palier: 3, tts?: "…" }
// audio_extra.json : sons isolés « son-<id> » et phrases « phrase-<cle> »
```

Audio disponible dans `audio/tts/` : `<syllabeId>.m4a`, `son-<sonId>.m4a`
(pas de `son-h`, h muet), `phrase-bravo`, `phrase-presque`, `phrase-super`,
`phrase-parfait`, `phrase-ecoute`, `phrase-quelle-tuile`, `phrase-a-toi`.

### Écriture

Classe CSS `.script` (Andika) ou `.cursif` (EcritureA) sur l'élément qui
affiche la syllabe. `Store.reglages().ecriture` vaut `"alterne"`,
`"script"` ou `"cursif"`. En mode alterné, la tuile d'index pair est en
script, impair en cursif.

### Tuile (composant partagé, défini dans `style.css` par le lot A)

```html
<div class="tuile [script|cursif] [retournee]" style="--couleur: …">
  <div class="tuile-face avant">chou</div>
  <div class="tuile-face arriere">chou</div>
</div>
```
Le retournement se fait en ajoutant `retournee` (rotation Y 3D, 600 ms). La
face arrière porte l'autre écriture. Les lots B, C, D réutilisent cette
structure et ces classes telles quelles.

### Couleurs (tokens dans `style.css`, `:root`)

`--fond`, `--encre`, `--carte`, `--accent`, `--ok` (vert), `--presque`
(orange doux, jamais rouge vif), et la palette de profils
`--p-vert --p-rose --p-bleu --p-jaune --p-violet --p-orange --p-turquoise
--p-corail`. Les deux profils créés au premier lancement sont `vert` et `rose`
(valeurs stockées : le nom sans préfixe, ex. `"vert"`).

---

## 3. `Store` (`js/store.js`) — lot A

Clé localStorage `syllabaire.v1`. Schéma :

```js
{
  version: 1,
  profils: [ { id: "p1", prenom: "Enfant 1", couleur: "vert", voix: "auto", cree: "2026-09-27" } ],
  profilActif: "p1" | null,
  reglages: {
    ecriture: "alterne" | "script" | "cursif",
    tuilesParManche: 10,                 // 5, 10, 15 ou 20
    sonsDesactives: [ "gn", "w" ],       // ids de sons fermés par le parent
    paliersForces: [ 3 ],                // paliers ouverts d'office par le parent
  },
  progres: {
    "p1": {
      points: 0,            // total cumulé (alimente l'ours)
      manches: 0,           // nombre de manches jouées (horloge de la révision espacée)
      boites: { "ch-ou": { boite: 0, prochaine: 12, vues: 3, reussites: 2 } },
      sons:   { "ch": { ok: 5, ko: 1 } },
      historique: [ { date: "2026-09-27T18:02:00", mode: "lis"|"ecoute", score: 8, total: 10 } ],
    }
  }
}
```

`voix` d'un profil : `"auto"` (papa si dispo, sinon maman, sinon synthèse),
`"papa"`, `"maman"`, `"tts"`.

API :
```js
Store.charger()                    // lit localStorage (ou crée l'état vide), à appeler au démarrage
Store.etat                         // l'objet ci-dessus, mutable
Store.sauver()                     // écrit localStorage (try/catch, silencieux)
Store.profilActif()                // objet profil ou null
Store.profil(id)
Store.creerProfil({ prenom, couleur }) // renvoie le profil, id "p<n>"
Store.supprimerProfil(id)
Store.reglages()                   // raccourci vers etat.reglages
Store.progres(profilId)            // crée l'entrée vide si absente, la renvoie
Store.exporter()                   // string JSON de tout l'état
Store.importer(json)               // remplace l'état, valide `version`
```

Toute modification passe par une mutation de `Store.etat` puis `Store.sauver()`.

---

## 4. `Data` (`js/data.js`) — lot A

```js
await Data.charger()               // fetch des trois JSON (une fois)
Data.sons, Data.syllabes           // tableaux bruts
Data.sonsParId, Data.syllabesParId // Map
Data.consonnes, Data.voyelles      // sous-listes dans l'ordre du livre
Data.syllabesDuSon(sonId)          // syllabes contenant ce son
```

---

## 5. `Audio` (`js/audio.js`) — lot A

```js
Audio.debloquer()                       // à appeler dans le premier geste utilisateur (iOS)
await Audio.jouerSyllabe(syllabeId)     // voix selon profil actif ; résout à la fin du son
await Audio.jouerSon(sonId)             // son isolé (« son-<id> »), silencieux pour h
await Audio.jouerPhrase(cle)            // "bravo" | "presque" | "super" | "parfait" | "ecoute" | "quelle-tuile" | "a-toi"
Audio.fx(nom)                           // "point" | "rate" | "fanfare" | "flip" | "tap" — synthèse WebAudio, pas de fichier
Audio.precharger([ids])                 // précharge des fichiers pour la manche
Audio.stop()
```

Résolution de la source d'une syllabe ou d'un son (dans cet ordre) :
1. `Recorder.blob(voix, id)` en IndexedDB (voix = préférence du profil, `auto`
   essaie papa puis maman) ;
2. `audio/voix/<voix>/<fichier>` si listé dans `audio/voix/manifest.json`
   (fichier `{ "papa": ["m-a", "ch-ou.webm", …], "maman": [] }`, absent = vide ;
   une entrée sans extension désigne un `.m4a`) ;
3. `audio/tts/<id>.m4a`.

Le lot A importe `Recorder` uniquement pour `Recorder.blob()`.

---

## 6. `Srs` (`js/srs.js`) — lot A

Boîtes de Leitner par syllabe et par profil, voir CLAUDE.md §5. Horloge =
`progres.manches`. Intervalles par boîte : 0 → même manche, 1 → +1 manche,
2 → +3, 3 → +7, 4 → acquise (+20).

```js
Srs.resultat(profilId, syllabeId, ok)   // met à jour boîte, compteurs de la syllabe et des deux sons ; ne sauve pas
Srs.dues(profilId)                      // ids de syllabes dont `prochaine` <= manches, triées par urgence
Srs.niveauSon(profilId, sonId)          // 0 gris, 1 bronze (3 ok), 2 argent (8), 3 or (15)
Srs.paliersOuverts(profilId)            // [1] au début ; palier n+1 ouvert quand 80 % des sons du palier n sont ≥ bronze, ou forcé
Srs.sonsActifs(profilId)                // sons des paliers ouverts, moins reglages.sonsDesactives
```

---

## 7. `Tirage` (`js/tirage.js`) — lot A

```js
Tirage.manche(profilId, n = reglages.tuilesParManche)
// → [ { syllabeId, ecriture: "script"|"cursif" }, … ] de longueur n
```
Règles : dues d'abord (3 max), puis syllabes des sons actifs, pondérées vers
les moins vues, jamais deux fois la même consonne d'affilée, jamais deux
fois la même syllabe. Écriture selon `reglages.ecriture` (alternée : pair
script, impair cursif).

**Défis (28/09/2026)** : après le tirage, `Tirage.ajouterDefis` glisse juste
après une syllabe « bien connue » une voisine qui lui ressemble, marquée
`{ defi: true }` (champ en plus, ignoré par les écrans). Voisines, par
priorité : *pièges* (un son commun, l'autre dans une paire de
`data/confusions.json` : ba/da, bon/bou) puis *série* (même consonne, autre
voyelle : ga/go). Jamais un homophone ni la même graphie. Au plus un défi
pour 5 tuiles ; la manche garde sa longueur `n` (on retire des tuiles
ordinaires en fin de manche, jamais une due, une ancre ou un défi). La règle
« pas deux fois la même consonne » est volontairement levée pour ces paires.
« Bien connue » dépend de `reglages.defis` : `auto` (les deux sons de la
syllabe au moins argent), `toujours`, `jamais`. `Data.voisins(sonId)` donne
les sons confondables d'un son.

```js
Tirage.distracteurs(syllabeId, k = 2)
// → k ids de syllabes proches (même consonne ou même voyelle, sons actifs), pour le mode « J'écoute »
//   quand le défi est permis pour la cible (voir ci-dessus), les voisines-pièges passent en premier (ba → da, pa)
//   JAMAIS un homophone de la cible ni entre eux (ki/qui, sa/ça, sé/sai/set) : comparer avec Tirage.clePhonetique
Tirage.clePhonetique(syllabeId)
// → chaîne : clé de prononciation approximative. Règles : é è ê ai ei et er ez → "E" ; eau au o → "o" ;
//   y i → "i" ; in ain ein → "in" ; an en → "an" ; eu oeu → "eu" ; e final → "e" ; c devant e/i, ç, s → "s" ;
//   c (dur), k, qu → "k" ; g doux, j, ge → "j" ; g dur, gu → "g" ; ph → "f" ; w → "w" ; h → "" ; autres inchangés
Tirage.reinjecter(manche, index, syllabeId, ecriture)
// insère une reprise 3 positions plus loin (ou en fin), dans l'autre écriture, marquée { reprise: true } ;
// renvoie la manche (modifiée sur place). Une syllabe n'est reprise qu'une fois par manche.
```

**Score et reprises (règle commune aux deux modes)** : `total` = nombre de
tuiles tirées au départ (10 par défaut), sans les reprises. Tuile réussie
du premier coup : +1. Tuile ratée : 0, puis reprise plus loin ; **la reprise
réussie rend le point** (+1), une reprise ratée ne donne rien et n'est pas
reprise à nouveau. Le score ne dépasse donc jamais `total`, et un enfant qui
finit par tout lire obtient 10 / 10. La progression affichée (« 3 / 10 »)
compte les tuiles d'origine ; une reprise s'affiche sans faire avancer le
compteur. `Srs.resultat` est appelé à chaque tentative, reprise comprise.

---

## 8. Écrans et routeur (`js/app.js`) — lot A

```js
App.aller(nom, params)   // "accueil" | "jeu" | "ecoute" | "apprendre" | "fin" | "carte" | "parent"
App.ecranActuel
```
`index.html` contient `<main id="ecran"></main>` et `<canvas id="confettis"></canvas>`
(overlay plein écran, `pointer-events: none`). Le routeur vide `#ecran`,
appelle le `monter()` du module concerné, conserve la fonction de nettoyage.

Correspondance : `accueil` → `App` lui-même ; `jeu` → `Game.monter` ;
`ecoute` → `Listen.monter` ; `fin` → `Rewards.monterFin` ; `carte` →
`Carte.monter` ; `apprendre` → `Apprendre.monter` ; `parent` → `Parent.monter`.

Écran d'accueil (lot A) : une grande tuile par profil (prénom, couleur,
ours au stade courant via `Ours.svg`), sous chaque profil trois boutons
« Je lis », « J'écoute » et « J'apprends » (les deux premiers côte à côte, le
troisième en pleine largeur dessous quand la carte est étroite), un bouton discret « carte des sons », un
cadenas en coin qui mène à `parent`. Premier tap = `Audio.debloquer()`.

Écran de fin (lot B, `Rewards.monterFin(conteneur, { score, total, mode, profilId, gains })`) :
score, ours (avec animation s'il a changé de stade), étoiles gagnées
(`gains` = `[ { sonId, niveau } ]` des sons qui ont changé de niveau
pendant la manche), boutons « Encore ! » (relance le même mode) et
« Accueil ».

Paramètres passés par `Game`/`Listen` à `App.aller("fin", …)` :
`{ score, total, mode, profilId, gains }`.

---

## 9. `Rewards`, `Ours`, `Carte` — lot B

```js
Rewards.point(elementTuile)      // petite pluie d'étoiles autour de la tuile + fx "point" (appelle Audio.fx)
Rewards.presque(elementTuile)    // secousse douce, aucune couleur rouge
Rewards.confettis(duree = 2500)  // sur #confettis, plein écran
Rewards.monterFin(conteneur, params)
Ours.stade(points)               // 0..4 selon seuils 0, 30, 100, 250, 500
Ours.svg(stade, couleur)         // string SVG inline (viewBox carré), écharpe de la couleur du profil
Ours.animerCroissance(elementSvgContainer, deStade, aStade)
Carte.monter(conteneur, { profilId })  // grille des 79 sons : gris/bronze/argent/or, paliers verrouillés grisés avec cadenas, tap sur un son = Audio.jouerSon
```

`Apprendre` (`js/apprendre.js`, `css/apprendre.css`, ajouté après les lots) :

```js
Apprendre.monter(conteneur, { profilId })
// écran « J'apprends », hors quiz : les 79 sons en tuiles script + cursive, par palier (paliers fermés
// atténués mais audibles) ; tap = Audio.jouerSon + panneau bas avec le son en grand, un mégaphone et
// jusqu'à 6 syllabes d'exemple (partie du son surlignée, tap = Audio.jouerSyllabe). Pas de score.
```

---

## 10. `Parent`, `Recorder` — lot C

```js
Parent.monter(conteneur)
// cadenas : petit calcul (« 3 + 4 = ? »), 3 essais, puis les onglets :
// Réglages (écriture, tuiles par manche, voix par profil), Sons (79 cases, paliers, fermer/forcer),
// Profils (créer/renommer/couleur/supprimer), Progrès (par profil : manches, score moyen 7 jours,
// sons forts / faibles), Cabine (voir Recorder), Sauvegarde (export/import JSON, export zip des voix),
// À propos (crédits : Chat d'école, Écriture A CC BY-ND, Andika OFL).

Recorder.ouvrir()                               // IndexedDB "syllabaire-audio", store "voix", clé "<voix>/<id>"
await Recorder.blob(voix, id)                   // Blob ou null
await Recorder.lister(voix)                     // ids enregistrés
await Recorder.enregistrer(voix, id, { dureeMax: 3000 })   // MediaRecorder, renvoie le Blob et le sauve
await Recorder.supprimer(voix, id)
await Recorder.exporterZip(voix)                // Blob zip (méthode "store", écrit en JS pur) des fichiers <id>.<ext>
Recorder.monterCabine(conteneur, { voix })      // UI : liste des syllabes + sons + phrases, filtre par palier,
                                                // bouton micro, réécoute, comparaison avec la synthèse, compteur fait/total
// Ajouts livrés avec le lot C (compatibles) : Recorder.arreter(), annuler(), niveau(), liberer() (coupe le micro),
// vider(voix), entrees(), enregistrementEnCours(), dernierRefus, option { dureeMin } de enregistrer().
```
`voix` vaut `"papa"` ou `"maman"`. Les enregistrements sont en
`audio/webm` ou `audio/mp4` selon ce que `MediaRecorder` propose (Safari
donne du mp4). L'export zip garde l'extension réelle.

---

## 11. `Listen` — lot D

```js
Listen.monter(conteneur, { profilId })
```
Déroulé : `Audio.jouerPhrase("quelle-tuile")` une fois au début, puis pour
chaque tuile de `Tirage.manche()` : jouer la syllabe, afficher 3 tuiles
(la bonne + `Tirage.distracteurs`) dans l'écriture du tirage, mélangées,
gros mégaphone pour réécouter. Bonne tuile → `Srs.resultat(ok)`,
`Rewards.point`, retournement de la tuile choisie ; mauvaise → la bonne
clignote doucement, réécoute, `Srs.resultat(ko)`, `Tirage.reinjecter`.
Fin → `App.aller("fin", { score, total, mode: "ecoute", profilId, gains })`.

---

## 12. Tests manuels

Serveur local : `python3 -m http.server 8080 --directory source` depuis la
racine du projet, puis `http://localhost:8080`. Ouvrir la console : aucune
erreur attendue au chargement. Vérifier sur une fenêtre étroite (portrait
iPad, 820 px) et large.
