#!/usr/bin/env python3
"""Génère source/sw.js : service worker qui met en cache tout le jeu (code,
données, polices, audio de synthèse) pour jouer hors ligne sur l'iPad.

À relancer après chaque modification de fichiers dans source/ (la version du
cache est une empreinte du contenu, donc le SW se met à jour tout seul).
"""
import hashlib
from pathlib import Path

RACINE = Path(__file__).resolve().parents[2]
SRC = RACINE / "source"
EXCLUS_DOSSIERS = {"tools", "fonts/originaux", "audio/voix"}
EXCLUS_FICHIERS = {"sw.js", "ARCHITECTURE.md", ".DS_Store"}
EXT = {".html", ".css", ".js", ".json", ".webmanifest", ".woff2", ".png", ".m4a", ".svg"}


def fichiers():
    for p in sorted(SRC.rglob("*")):
        if not p.is_file() or p.suffix not in EXT:
            continue
        rel = p.relative_to(SRC).as_posix()
        if rel in EXCLUS_FICHIERS or any(rel.startswith(d + "/") for d in EXCLUS_DOSSIERS):
            continue
        yield rel, p


def main():
    liste, h = [], hashlib.sha1()
    for rel, p in fichiers():
        liste.append(rel)
        h.update(rel.encode()); h.update(p.read_bytes())
    version = h.hexdigest()[:10]
    # audio/voix/manifest.json reste en réseau d'abord (peut changer sans redéploiement du code)
    js = f"""// Généré par tools/build_sw.py — ne pas éditer à la main.
const VERSION = 'syllabaire-{version}';
const FICHIERS = {liste!r};

self.addEventListener('install', (e) => {{
  e.waitUntil((async () => {{
    const cache = await caches.open(VERSION);
    // Par paquets pour ne pas saturer iOS
    for (let i = 0; i < FICHIERS.length; i += 50) {{
      await Promise.all(FICHIERS.slice(i, i + 50).map((f) => cache.add(new Request(f, {{ cache: 'reload' }})).catch(() => null)));
    }}
    await self.skipWaiting();
  }})());
}});

self.addEventListener('activate', (e) => {{
  e.waitUntil((async () => {{
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  }})());
}});

self.addEventListener('fetch', (e) => {{
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  e.respondWith((async () => {{
    const cache = await caches.open(VERSION);
    const enCache = await cache.match(e.request, {{ ignoreSearch: true }});
    if (enCache) return enCache;
    try {{
      const rep = await fetch(e.request);
      if (rep.ok && url.pathname.includes('/audio/voix/')) cache.put(e.request, rep.clone());
      return rep;
    }} catch (err) {{
      return enCache || Response.error();
    }}
  }})());
}});
"""
    (SRC / "sw.js").write_text(js, encoding="utf-8")
    total = sum(p.stat().st_size for _, p in fichiers())
    print(f"sw.js : {len(liste)} fichiers, {total / 1e6:.1f} Mo, version {version}")


if __name__ == "__main__":
    main()
