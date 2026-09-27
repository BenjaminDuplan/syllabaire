#!/usr/bin/env python3
"""Liste audio complémentaire : sons isolés (consonne ou voyelle seule) et
phrases d'encouragement → source/data/audio_extra.json, au format attendu
par gen_tts.py (`python3 source/tools/gen_tts.py --data source/data/audio_extra.json`).

Une consonne seule se dit « avec un e muet » comme en classe (« beu », « cheu »),
sinon la synthèse épelle la lettre (« bé »).
"""
import json
from pathlib import Path

RACINE = Path(__file__).resolve().parents[2]
DATA = RACINE / "source" / "data"
SONS = json.loads((DATA / "sons.json").read_text(encoding="utf-8"))

TTS_CONSONNE = {"c": "keu", "ç": "seu", "ge": "jeu", "gu": "gueu", "qu": "keu",
                "k": "keu", "ph": "feu", "w": "oueu", "h": None}
TTS_VOYELLE = {"e": "eu", "eau": "o", "er": "é", "ez": "é", "et": "é", "y": "i",
               "oeu": "eu", "ai": "è", "ei": "è", "au": "o"}
PHRASES = {
    "bravo": "Bravo !",
    "presque": "Presque ! On réécoute ?",
    "super": "Super manche !",
    "parfait": "Dix sur dix, champion !",
    "ecoute": "Écoute bien.",
    "quelle-tuile": "Quelle tuile fait ce son ?",
    "a-toi": "À toi de lire !",
}


def main():
    liste = []
    for s in SONS:
        a = s["affiche"]
        if s["type"] == "consonne":
            tts = TTS_CONSONNE.get(a, a + "eu")
            if tts is None:      # h muet : pas de fichier
                continue
        else:
            tts = TTS_VOYELLE.get(a)
        item = {"id": "son-" + s["id"], "texte": a}
        if tts and tts != a:
            item["tts"] = tts
        liste.append(item)
    for cle, texte in PHRASES.items():
        liste.append({"id": "phrase-" + cle, "texte": texte})
    (DATA / "audio_extra.json").write_text(json.dumps(liste, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(liste)} entrées → data/audio_extra.json")


if __name__ == "__main__":
    main()
