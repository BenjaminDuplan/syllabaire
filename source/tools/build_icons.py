#!/usr/bin/env python3
"""Icônes de l'app (PNG 192/512 + apple-touch 180) : une tuile orange arrondie
avec « ma » en Andika. Nécessite Pillow (installé)."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

RACINE = Path(__file__).resolve().parents[2]
FONT = RACINE / "source" / "fonts" / "originaux" / "Andika-Bold.ttf"
OUT = RACINE / "source" / "icons"
OUT.mkdir(exist_ok=True)


def icone(taille, marge, fichier):
    im = Image.new("RGBA", (taille, taille), (255, 248, 236, 255) if marge else (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    m = int(taille * marge)
    d.rounded_rectangle([m, m, taille - m, taille - m], radius=int(taille * 0.22), fill=(255, 159, 67, 255))
    police = ImageFont.truetype(str(FONT), int(taille * 0.5))
    txt = "ma"
    x0, y0, x1, y1 = d.textbbox((0, 0), txt, font=police)
    d.text(((taille - (x1 - x0)) / 2 - x0, (taille - (y1 - y0)) / 2 - y0 - taille * 0.04), txt, font=police, fill="white")
    im.save(OUT / fichier)


icone(192, 0, "icon-192.png")
icone(512, 0, "icon-512.png")
icone(512, 0.12, "icon-512-maskable.png")
icone(180, 0, "apple-touch-icon.png")
print("icônes écrites dans", OUT)
