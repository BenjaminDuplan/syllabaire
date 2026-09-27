#!/usr/bin/env python3
"""Détecte les syllabes que la synthèse épelle (« ba » lu « bé-a ») ou lit à
l'anglaise (« ran », « pen »).

Critère mesuré le 27/09/2026 avec Audrey : une syllabe lue correctement dure
pareil avec un « h » final muet (« bah »), une syllabe épelée dure nettement
plus (≥ 0,07 s d'écart, car « b-a » fait deux syllabes). On compare donc
chaque texte brut à sa variante « texte + h » et on propose cette variante
comme champ `tts` quand l'écart dépasse SEUIL.

Sortie : source/data/tts_suspects.json {texte: {"brut": d, "h": d}}, à
reporter dans TTS_MESURE de build_syllabes.py (le script l'affiche prêt à coller).
"""
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

RACINE = Path(__file__).resolve().parents[2]
DATA = RACINE / "source" / "data"
SEUIL = 0.05
VOIX = "Audrey"


def duree(txt, tmp):
    subprocess.run(["say", "-v", VOIX, "-o", tmp, txt], check=True, timeout=60)
    out = subprocess.run(["afinfo", tmp], capture_output=True, text=True).stdout
    return float(re.search(r"estimated duration: ([\d.]+)", out).group(1))


def main():
    syllabes = json.loads((DATA / "syllabes.json").read_text(encoding="utf-8"))
    only = set(sys.argv[1].split(",")) if len(sys.argv) > 1 else None
    suspects = {}
    with tempfile.TemporaryDirectory() as d:
        tmp = f"{d}/v.aiff"
        for i, s in enumerate(syllabes):
            if only and s["id"] not in only:
                continue
            texte = s.get("tts", s["texte"])
            if texte.endswith(("h", "t", "d", "g", "c")):
                continue
            # Nasale finale : « ran », « pen » sont lus à l'anglaise ; un t muet
            # (« rant ») force la lecture française. Même durée = déjà français.
            if re.search(r"(an|en|on|in|un)$", texte):
                b, t = duree(texte, tmp), duree(texte + "t", tmp)
                if abs(b - t) > SEUIL:
                    suspects[texte] = {"brut": round(b, 3), "t": round(t, 3), "tts": texte + "t"}
                    print(f"{s['id']:12} « {texte} » {b:.2f} s ≠ « {texte}t » {t:.2f} s   ANGLAIS", flush=True)
                continue
            b, h = duree(texte, tmp), duree(texte + "h", tmp)
            if b - h > SEUIL:
                suspects[texte] = {"brut": round(b, 3), "h": round(h, 3), "tts": texte + "h"}
                print(f"{s['id']:12} « {texte} » {b:.2f} s → « {texte}h » {h:.2f} s   ÉPELÉ", flush=True)
            if i % 100 == 0:
                print(f"... {i}/{len(syllabes)}", file=sys.stderr, flush=True)
    (DATA / "tts_suspects.json").write_text(json.dumps(suspects, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\n{len(suspects)} syllabes épelées. À coller dans TTS_MESURE :")
    print(json.dumps({t: v["tts"] for t, v in suspects.items()}, ensure_ascii=False, indent=4))


if __name__ == "__main__":
    main()
