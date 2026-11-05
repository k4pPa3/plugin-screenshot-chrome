"""Syntax and regression checks; requires Node >=20, Python 3 and OpenSSL."""
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parent.parent

def main():
    scripts = sorted(ROOT.glob('*.js')) + sorted((ROOT / 'lib').rglob('*.js')) + sorted((ROOT / 'tests').rglob('*.cjs'))
    for script in scripts:
        subprocess.run(['node', '--check', str(script)], check=True, cwd=ROOT)
    tests = sorted(str(p) for p in (ROOT / 'tests').glob('*.test.cjs'))
    if not tests:
        raise RuntimeError('No regression tests found')
    subprocess.run(['node', '--test', *tests], check=True, cwd=ROOT)

if __name__ == '__main__':
    main()
