#!/usr/local/bin/python3
"""
gen_tts.py — synthèse vocale des syllabes (macOS, hors ligne, bibliothèque standard).

Lit `source/data/syllabes.json` (liste d'objets `{id, texte, [tts]}`) et
produit `source/audio/tts/<id>.m4a` (AAC mono, lisible par Safari iOS) pour
chaque entrée dont le fichier manque. Le champ optionnel `tts` remplace
`texte` pour la prononciation (ex. "gueu" pour la carte "gue").

Stratégie retenue (mesures du 27/09/2026, voir HANDOFF.md) :
  - texte BRUT, sans point final : avec Audrey, « ma. » est lu en deux
    syllabes (0,53 s contre 0,32 s pour « ma »), « bra. » s'allonge aussi ;
  - la notation phonétique [[inpt PHON]] n'est PAS honorée par Audrey
    (ni par Fred sur macOS 26) : le texte de la balise est lu à voix haute ;
  - [[slnc N]] fonctionne (mesuré : N − 100 ms environ, rien en deçà de
    100) : un silence d'attaque évite qu'iOS coupe le début du fichier ;
  - e muet final : « pe » 0,06 s, « le » 0,16 s, « gue » 0,16 s → voyelle
    avalée ; écrire « peu », « leu », « gueu » dans le champ `tts` ;
  - `-r` n'a qu'un effet marginal sur une syllabe isolée avec Audrey
    (+6 % à 150 mots/min), on le garde pour le confort.

Usage :
  python3 source/tools/gen_tts.py                 # génère les fichiers manquants
  python3 source/tools/gen_tts.py --force         # tout regénérer
  python3 source/tools/gen_tts.py --only m-a,ch-ou
  python3 source/tools/gen_tts.py --voice Thomas --rate 140
  python3 source/tools/gen_tts.py --say-test "gueu"   # joue le texte, sans fichier
"""

import argparse
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

SOURCE_DIR = Path(__file__).resolve().parents[1]          # .../source
DEFAULT_DATA = SOURCE_DIR / "data" / "syllabes.json"
DEFAULT_OUT = SOURCE_DIR / "audio" / "tts"
DEFAULT_VOICE = "Audrey"
FALLBACK_VOICE = "Thomas"
DEFAULT_RATE = 150            # mots/min, un peu lent pour un enfant de 6 ans
DEFAULT_PAD_MS = 250          # [[slnc N]] d'attaque ; Audrey absorbe ~100 ms, 250 → ~150 ms réels (0 = aucun)
DEFAULT_BITRATE = 64000       # AAC ; Audrey sort en 22 050 Hz mono, c'est large
SUSPECT_SECONDS = 0.60        # au-delà, la syllabe a probablement été épelée
SUSPECT_MIN_SECONDS = 0.20    # en deçà, la voyelle a probablement été avalée

ID_RE = re.compile(r"^[^/\\\s]+$")   # tout sauf séparateurs de chemin et blancs
ASCII_RE = re.compile(r"^[A-Za-z0-9._-]+$")


def die(msg: str, code: int = 1) -> None:
    print(f"ERREUR : {msg}", file=sys.stderr)
    sys.exit(code)


def installed_voices() -> set[str]:
    """Noms des voix connues de `say` (« Audrey (Premium) » → « Audrey »)."""
    out = subprocess.run(["say", "-v", "?"], capture_output=True, text=True).stdout
    names = set()
    for line in out.splitlines():
        m = re.match(r"^(\S+)", line)
        if m:
            names.add(m.group(1))
    return names


def pick_voice(wanted: str) -> str:
    voices = installed_voices()
    if wanted in voices:
        return wanted
    if FALLBACK_VOICE in voices:
        print(f"Voix « {wanted} » absente, repli sur « {FALLBACK_VOICE} ».")
        return FALLBACK_VOICE
    die(f"ni « {wanted} » ni « {FALLBACK_VOICE} » ne sont installées (voir `say -v ?`).")


def spoken_text(text: str, pad_ms: int) -> str:
    """Texte brut, sans ponctuation finale ; silence d'attaque optionnel."""
    text = text.strip()
    if pad_ms > 0:
        return f"[[slnc {pad_ms}]]{text}"
    return text


def duration_seconds(path: Path) -> float | None:
    out = subprocess.run(["afinfo", str(path)], capture_output=True, text=True).stdout
    m = re.search(r"estimated duration:\s*([0-9.]+)", out)
    return float(m.group(1)) if m else None


def synthesize(text: str, voice: str, rate: int, pad_ms: int, bitrate: int,
               target: Path, tmpdir: Path) -> float | None:
    """Génère target (.m4a) et renvoie sa durée en secondes."""
    aiff = tmpdir / (target.stem + ".aiff")
    cmd = ["say", "-v", voice, "-r", str(rate), "-o", str(aiff), spoken_text(text, pad_ms)]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0 or not aiff.exists():
        die(f"say a échoué pour « {text} » : {r.stderr.strip()}")
    r = subprocess.run(
        ["afconvert", "-f", "m4af", "-d", "aac", "-b", str(bitrate), str(aiff), str(target)],
        capture_output=True, text=True,
    )
    if r.returncode != 0 or not target.exists():
        die(f"afconvert a échoué pour « {text} » : {r.stderr.strip()}")
    aiff.unlink(missing_ok=True)
    return duration_seconds(target)


def load_entries(data_path: Path) -> list[dict]:
    if not data_path.exists():
        die(f"fichier de données introuvable : {data_path}")
    with data_path.open(encoding="utf-8") as f:
        data = json.load(f)
    if isinstance(data, dict) and "syllabes" in data:
        data = data["syllabes"]
    if not isinstance(data, list):
        die("syllabes.json doit contenir une liste d'objets {id, texte, [tts]}")
    entries = []
    for i, e in enumerate(data):
        if not isinstance(e, dict) or "id" not in e or "texte" not in e:
            die(f"entrée n° {i} invalide (il faut au moins `id` et `texte`) : {e!r}")
        sid = str(e["id"])
        if not ID_RE.match(sid) or sid.startswith("."):
            die(f"id non utilisable comme nom de fichier : {sid!r}")
        if not ASCII_RE.match(sid):
            print(f"Attention : id « {sid} » non ASCII → nom de fichier avec accent ou cédille "
                  f"(risque NFC/NFD et encodage d'URL) ; préférer un id ASCII.")
        entries.append(e)
    return entries


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--data", type=Path, default=DEFAULT_DATA, help=f"JSON d'entrée (défaut : {DEFAULT_DATA})")
    p.add_argument("--out", type=Path, default=DEFAULT_OUT, help=f"dossier de sortie (défaut : {DEFAULT_OUT})")
    p.add_argument("--voice", default=DEFAULT_VOICE, help=f"voix `say` (défaut : {DEFAULT_VOICE}, repli {FALLBACK_VOICE})")
    p.add_argument("--rate", type=int, default=DEFAULT_RATE, help=f"débit en mots/min (défaut : {DEFAULT_RATE})")
    p.add_argument("--pad-ms", type=int, default=DEFAULT_PAD_MS, help=f"silence d'attaque en ms (défaut : {DEFAULT_PAD_MS})")
    p.add_argument("--bitrate", type=int, default=DEFAULT_BITRATE, help=f"débit AAC en bit/s (défaut : {DEFAULT_BITRATE})")
    p.add_argument("--force", action="store_true", help="regénérer même si le .m4a existe")
    p.add_argument("--only", help="ids à traiter, séparés par des virgules (ex. m-a,ch-ou)")
    p.add_argument("--dry-run", action="store_true", help="afficher ce qui serait fait, sans rien écrire")
    p.add_argument("--say-test", metavar="TEXTE", help="joue TEXTE à voix haute avec la voix choisie, sans créer de fichier")
    args = p.parse_args()

    for tool in ("say", "afconvert", "afinfo"):
        if shutil.which(tool) is None:
            die(f"outil macOS manquant : {tool}")
    voice = pick_voice(args.voice)

    if args.say_test is not None:
        text = args.say_test.strip()          # brut, sans silence d'attaque : ce qu'on écoute
        print(f"say -v {voice} -r {args.rate} {json.dumps(text, ensure_ascii=False)}")
        subprocess.run(["say", "-v", voice, "-r", str(args.rate), text], check=False)
        return

    entries = load_entries(args.data)
    if args.only:
        wanted = {s.strip() for s in args.only.split(",") if s.strip()}
        unknown = wanted - {str(e["id"]) for e in entries}
        if unknown:
            die(f"ids inconnus dans {args.data.name} : {', '.join(sorted(unknown))}")
        entries = [e for e in entries if str(e["id"]) in wanted]

    if not args.dry_run:
        args.out.mkdir(parents=True, exist_ok=True)

    done = skipped = 0
    suspects: list[tuple[str, str, float]] = []
    with tempfile.TemporaryDirectory(prefix="gen_tts_") as tmp:
        tmpdir = Path(tmp)
        for e in entries:
            sid = str(e["id"])
            text = str(e.get("tts") or e["texte"]).strip()
            target = args.out / f"{sid}.m4a"
            if target.exists() and not args.force:
                skipped += 1
                continue
            note = f" (tts : « {text} »)" if e.get("tts") else ""
            if args.dry_run:
                print(f"[dry-run] {sid:12s} « {e['texte']} »{note} → {target.name}")
                continue
            secs = synthesize(text, voice, args.rate, args.pad_ms, args.bitrate, target, tmpdir)
            done += 1
            flag = ""
            spoken = None if secs is None else secs - max(0, args.pad_ms - 100) / 1000  # hors silence d'attaque
            if spoken is not None and (spoken > SUSPECT_SECONDS or spoken < SUSPECT_MIN_SECONDS):
                flag = "   <-- à écouter"
                suspects.append((sid, text, secs))
            print(f"{sid:12s} « {e['texte']} »{note} → {target.name}  {secs:.2f} s{flag}"
                  if secs is not None else f"{sid:12s} « {text} » → {target.name}")

    print(f"\n{done} fichier(s) généré(s), {skipped} déjà présent(s), voix {voice}, "
          f"{args.rate} mots/min, sortie : {args.out}")
    if suspects:
        print("\nDurées atypiques (épellation ou voyelle avalée probable) — à vérifier à l'oreille,"
              "\npuis corriger avec un champ `tts` dans syllabes.json :")
        for sid, text, secs in suspects:
            print(f"  {sid:12s} « {text} »  {secs:.2f} s   →  say -v {voice} \"{text}\"")


if __name__ == "__main__":
    main()
