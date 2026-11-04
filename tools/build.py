"""Crea dist/full-page-screenshot-<versione>.zip con i soli file dell'estensione.

Uso: python tools/build.py
"""
import json
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FILES = [
    "manifest.json",
    "background.js",
    "popup.html",
    "popup.js",
    "options.html",
    "options.js",
    "ui.css",
]
DIRS = ["lib", "icons", "_locales"]


def main() -> int:
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    version = manifest["version"]

    paths = [ROOT / f for f in FILES]
    for d in DIRS:
        paths += sorted(p for p in (ROOT / d).rglob("*") if p.is_file())

    missing = [str(p.relative_to(ROOT)) for p in paths if not p.exists()]
    if missing:
        print("File mancanti:", ", ".join(missing), file=sys.stderr)
        return 1

    out = ROOT / "dist" / f"full-page-screenshot-{version}.zip"
    out.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for p in paths:
            z.write(p, p.relative_to(ROOT).as_posix())

    print(f"{out.relative_to(ROOT).as_posix()} ({len(paths)} file, {out.stat().st_size} byte)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
