"""Bundle a built extension, listing material and real Chromium screenshots.

Run tools/build.py and the browser test with FWC_STORE_SCREENSHOTS_DIR first.
This ZIP is submission material, not the ZIP uploaded as the extension itself.
"""
import json
import struct
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCREENSHOTS = ('options-en.png', 'options-it.png', 'custody-en.png', 'custody-it.png')
DOCUMENTS = ('README.md', 'listing-it.md', 'listing-en.md',
             'permissions-and-privacy.md', 'reviewer-instructions.md')


def check_png(path, dimensions):
    data = path.read_bytes()
    if (data[:8] != b'\x89PNG\r\n\x1a\n' or data[12:16] != b'IHDR'
            or len(data) < 24 or struct.unpack('>II', data[16:24]) != dimensions):
        raise ValueError(f'Invalid PNG dimensions: {path.name}; expected {dimensions}')


def main():
    version = json.loads((ROOT / 'manifest.json').read_text(encoding='utf-8'))['version']
    dist = ROOT / 'dist'
    extension = dist / f'forensic-web-capture-{version}.zip'
    fingerprint = dist / f'code-fingerprint-{version}.txt'
    if not fingerprint.is_file():
        raise FileNotFoundError('Run tools/build.py before building the store bundle')
    with zipfile.ZipFile(extension) as archive:
        if archive.testzip() is not None:
            raise ValueError('Corrupt extension ZIP')
        manifest = json.loads(archive.read('manifest.json'))
        if manifest['version'] != version:
            raise ValueError('Extension ZIP version does not match the source manifest')
        # No stale referral destination/code may enter the uploaded extension.
        for name in archive.namelist():
            if name.endswith(('.js', '.html', '.json')):
                text = archive.read(name).decode('utf-8')
                if 'andreamartin8' in text or 'web.satispay.com/promocode/' in text:
                    raise ValueError(f'Referral found in package: {name}')

    paths = [(extension, f'extension/{extension.name}'),
             (fingerprint, fingerprint.name), (ROOT / 'PRIVACY.md', 'PRIVACY.md')]
    paths += [(ROOT / 'docs' / 'store' / name, name) for name in DOCUMENTS]
    icon = ROOT / 'icons' / 'icon-128.png'
    check_png(icon, (128, 128))
    paths.append((icon, 'images/icon-128.png'))
    for name in SCREENSHOTS:
        image = dist / 'store-screenshots' / name
        check_png(image, (1280, 800))
        paths.append((image, f'images/{name}'))
    out = dist / f'store-submission-{version}.zip'
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as archive:
        for source, name in paths:
            archive.write(source, name)
    print(f'{out.relative_to(ROOT)} ({len(paths)} files, {out.stat().st_size} bytes)')
    print('Upload only the inner extension ZIP as the extension, not this bundle.')


if __name__ == '__main__':
    main()
