#!/usr/bin/env python3
"""Build dist/ from extension/ — the same logic .github/workflows/release.yml runs on tag push.

Produces:
  dist/ps-store-enhancer-vX.Y.Z.zip   ready to upload to the Chrome Web Store
  dist/extension/                     the same thing, unpacked, for quick "Load unpacked" testing

Run from the repo root: python scripts/build.py
"""
import json
import shutil
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXT_SRC = ROOT / "extension"
DIST = ROOT / "dist"

EXT_README = """# PS Store Enhancer - Extension v{version}

## Load in Chrome (Developer Mode)

1. Open `chrome://extensions`
2. Enable Developer mode (top right)
3. Click Load unpacked
4. Select this folder
5. Go to store.playstation.com

## Disclaimer

This extension is not affiliated with Sony Interactive Entertainment or PlayStation.
"""


def read_version() -> str:
    manifest = json.loads((EXT_SRC / "manifest.json").read_text(encoding="utf-8"))
    return manifest["version"]


def zip_dir(src_dir: Path, dest_zip: Path, root_name: str) -> int:
    count = 0
    with zipfile.ZipFile(dest_zip, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for path in src_dir.rglob("*"):
            if path.is_file():
                rel = path.relative_to(src_dir)
                zf.write(path, f"{root_name}/{rel.as_posix()}")
                count += 1
    return count


def main() -> int:
    version = read_version()
    zip_name = f"ps-store-enhancer-v{version}.zip"
    zip_path = DIST / zip_name
    unpacked_path = DIST / "extension"

    # Only clear what this script owns -- dist/ may also hold dist/asset-drafts/ from
    # scripts/generate-assets/, which must survive a rebuild.
    DIST.mkdir(parents=True, exist_ok=True)
    for old_zip in DIST.glob("ps-store-enhancer-v*.zip"):
        old_zip.unlink()
    if unpacked_path.exists():
        shutil.rmtree(unpacked_path)

    # Unpacked copy, with a standalone README dropped in.
    shutil.copytree(EXT_SRC, unpacked_path)
    (unpacked_path / "README.md").write_text(EXT_README.format(version=version), encoding="utf-8")

    n = zip_dir(unpacked_path, zip_path, "ps-store-enhancer")
    print(f"{zip_name}: {n} files, {zip_path.stat().st_size} bytes")
    print(f"dist/extension/: unpacked copy for quick Load-unpacked testing")

    # Sanity check: manifest is present and version matches.
    with zipfile.ZipFile(zip_path) as zf:
        names = zf.namelist()
        assert "ps-store-enhancer/manifest.json" in names, "missing manifest.json in zip"
        m = json.loads(zf.read("ps-store-enhancer/manifest.json"))
        assert m["version"] == version, f"zip manifest version {m['version']} != {version}"
    print(f"OK — verified manifest version {version}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
