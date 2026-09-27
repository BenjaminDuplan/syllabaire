#!/usr/bin/env python3
"""Extrait les 79 cartes du syllabaire (PDF script) vers source/data/sons.json.

Pages 2 à 20 : deux sons consonnes par page (volet gauche, volet droit).
Pages 21 à 41 : deux sons voyelles par page (la dernière n'en a qu'un).
Le palier de déblocage vient de la table PALIERS ci-dessous (voir CLAUDE.md §4).
"""
import json
import sys
from pathlib import Path

from pypdf import PdfReader

RACINE = Path(__file__).resolve().parents[2]
PDF = RACINE / "Ressources" / "Syllabaire-CP-script.pdf"
SORTIE = RACINE / "source" / "data" / "sons.json"

PALIERS = {
    "consonne": {
        1: "l r m s t p",
        2: "d b f v n z",
        3: "c j ch h ç ph g gu ge",
        4: "br cr dr fr gr pr tr vr",
        5: "bl cl fl gl pl k qu",
        6: "gn w",
    },
    "voyelle": {
        1: "a i o u é e",
        2: "y ou è ê",
        3: "oi au eau an en",
        4: "ai ei er ez et on in",
        5: "ain ein oin eu oeu",
        6: "ian ion ien ieu elle enne erre esse ette ill ail eil euil ouil",
    },
}


ASCII = {"é": "eacute", "è": "egrave", "ê": "ecirc", "ç": "ccedil"}


def slug(son):
    """Identifiant ASCII sûr pour les noms de fichiers et les URL (« ç » → « ccedil »)."""
    return "".join(ASCII.get(ch, ch) for ch in son)


def palier_de(type_, son):
    for palier, liste in PALIERS[type_].items():
        if son in liste.split():
            return palier
    raise KeyError(f"{type_} « {son} » sans palier : compléter PALIERS")


def main():
    reader = PdfReader(str(PDF))
    sons = []
    ordre = {"consonne": 0, "voyelle": 0}
    for num, page in enumerate(reader.pages[1:], start=2):
        type_ = "consonne" if num <= 20 else "voyelle"
        tokens = (page.extract_text() or "").split()
        if not 1 <= len(tokens) <= 2:
            sys.exit(f"page {num} : extraction inattendue {tokens!r}")
        for tok in tokens:
            ordre[type_] += 1
            sons.append({
                "id": slug(tok),
                "type": type_,
                "affiche": tok,
                "palier": palier_de(type_, tok),
                "ordre": ordre[type_],
                "page": num,
            })
    SORTIE.parent.mkdir(parents=True, exist_ok=True)
    SORTIE.write_text(json.dumps(sons, ensure_ascii=False, indent=1), encoding="utf-8")
    nc = sum(s["type"] == "consonne" for s in sons)
    nv = len(sons) - nc
    print(f"{nc} consonnes, {nv} voyelles → {SORTIE.relative_to(RACINE)}")


if __name__ == "__main__":
    main()
