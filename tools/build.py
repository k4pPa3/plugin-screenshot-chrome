"""Crea dist/forensic-web-capture-<versione>.zip con i soli file dell'estensione.

Uso: python tools/build.py               crea pacchetto e impronta del codice
     python tools/build.py --fingerprint  stampa solo l'impronta del codice
"""
import hashlib
import base64
import json
import re
import shutil
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
    "verify.html",
    "verify.js",
    "ui.css",
]
DIRS = ["lib", "icons", "_locales"]


def build_update_page(package: Path, version: str) -> Path:
    """Aggiornamento autonomo per il passaggio dalle versioni che scaricano solo ZIP."""
    data = package.read_bytes()
    update = {"version": version, "size": len(data), "digest": hashlib.sha256(data).hexdigest()}
    scripts = ["lib/i18n.js", "lib/locales/en.js", "lib/locales/it.js", "lib/locales/fr.js",
               "lib/locales/es.js", "lib/common.js", "lib/zip.js", "lib/updates.js", "lib/updateinstall.js"]
    script = "\n".join((ROOT / name).read_text(encoding="utf-8") for name in scripts)
    script += "\nconst bundledUpdate = " + json.dumps(update) + ";\n"
    script += (ROOT / "tools" / "update_page.js").read_text(encoding="utf-8")
    if "</script" in script.lower():
        raise ValueError("Unexpected closing script tag in updater source")
    digest = base64.b64encode(hashlib.sha256(script.encode()).digest()).decode()
    page = (ROOT / "tools" / "update_template.html").read_text(encoding="utf-8")
    for key, value in {"SCRIPT_HASH": digest, "STYLE": (ROOT / "ui.css").read_text(encoding="utf-8"),
                       "PACKAGE": base64.b64encode(data).decode(), "SCRIPT": script}.items():
        page = page.replace(f"@@{key}@@", value)
    out = package.parent / f"forensic-web-capture-update-{version}.html"
    out.write_text(page, encoding="utf-8", newline="\n")
    return out


def code_fingerprint() -> str:
    """Stessa impronta calcolata dall'estensione (lib/integrity.js, codeFingerprint)."""
    source = (ROOT / "lib" / "integrity.js").read_text(encoding="utf-8")
    block = re.search(r"EXTENSION_CODE_FILES = \[(.*?)\];", source, re.S).group(1)
    names = re.findall(r'"([^"]+)"', block)
    listing = "".join(f"{hashlib.sha256((ROOT / n).read_bytes()).hexdigest()}  {n}\n" for n in names)
    return hashlib.sha256(listing.encode()).hexdigest()


def main() -> int:
    if "--fingerprint" in sys.argv:
        print(code_fingerprint())
        return 0
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    version = manifest["version"]

    paths = [ROOT / f for f in FILES]
    for d in DIRS:
        paths += sorted(p for p in (ROOT / d).rglob("*") if p.is_file())

    missing = [str(p.relative_to(ROOT)) for p in paths if not p.exists()]
    if missing:
        print("File mancanti:", ", ".join(missing), file=sys.stderr)
        return 1

    out = ROOT / "dist" / f"forensic-web-capture-{version}.zip"
    out.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for p in paths:
            z.write(p, p.relative_to(ROOT).as_posix())

    # Copia estratta, pronta per "Carica estensione non pacchettizzata".
    unpacked = out.with_suffix("")
    allowed = ROOT.resolve() / "dist"
    if out.parent.resolve() != allowed or unpacked.resolve().parent != allowed or unpacked.is_symlink():
        raise ValueError("Build target must stay inside the workspace dist directory")
    if unpacked.exists():
        shutil.rmtree(unpacked)
    for p in paths:
        dest = unpacked / p.relative_to(ROOT)
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(p, dest)

    print(f"{out.relative_to(ROOT).as_posix()} ({len(paths)} file, {out.stat().st_size} byte)")
    print(f"{unpacked.relative_to(ROOT).as_posix()}/ (cartella da caricare)")
    fingerprint = code_fingerprint()
    (out.parent / f"code-fingerprint-{version}.txt").write_text(
        f"Forensic Web Capture {version}\ncode fingerprint (SHA-256): {fingerprint}\n", encoding="utf-8")
    print(f"impronta del codice: {fingerprint}")
    updater = build_update_page(out, version)
    print(f"{updater.relative_to(ROOT).as_posix()} (aggiornamento con sostituzione dei file)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
