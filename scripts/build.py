#!/usr/bin/env python3
"""Build dist/ from extension/ — the same logic .github/workflows/release.yml runs on tag push.

Produces (default target: chrome):
  dist/ps-store-enhancer-vX.Y.Z.zip   ready to upload to the Chrome Web Store (also fine for Edge)
  dist/extension/                     the same thing, unpacked, for quick "Load unpacked" testing

EXPERIMENTAL second target:  python scripts/build.py --target firefox
  dist/ps-store-enhancer-firefox-vX.Y.Z.zip and dist/firefox/ — the same code with a Firefox-style
  manifest (event-page background, gecko id). It has NOT been tested in Firefox and is not published;
  see .github/CONTRIBUTING.md before relying on it.

Run from the repo root: python scripts/build.py
"""
import argparse
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


BACKGROUND_SCRIPTS = ["match.js", "helpers.js", "cache.js", "diag.js", "cheapshark.js", "psn.js", "background.js"]


def firefox_manifest(manifest: dict) -> dict:
    """Same extension, Firefox flavoured: event-page background + a gecko id. No code changes."""
    m = json.loads(json.dumps(manifest))
    m["background"] = {"scripts": BACKGROUND_SCRIPTS}
    m["browser_specific_settings"] = {
        "gecko": {"id": "ps-store-enhancer@drummingbird1.github.io", "strict_min_version": "128.0"}
    }
    return m


def build_firefox() -> int:
    version = read_version()
    zip_name = f"ps-store-enhancer-firefox-v{version}.zip"
    zip_path = DIST / zip_name
    unpacked_path = DIST / "firefox"

    DIST.mkdir(parents=True, exist_ok=True)
    for old_zip in DIST.glob("ps-store-enhancer-firefox-v*.zip"):
        old_zip.unlink()
    if unpacked_path.exists():
        shutil.rmtree(unpacked_path)
    shutil.copytree(EXT_SRC, unpacked_path)
    manifest = json.loads((EXT_SRC / "manifest.json").read_text(encoding="utf-8"))
    (unpacked_path / "manifest.json").write_text(
        json.dumps(firefox_manifest(manifest), indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    (unpacked_path / "types.d.ts").unlink(missing_ok=True)

    n = zip_dir(unpacked_path, zip_path, "ps-store-enhancer-firefox")
    print(f"{zip_name}: {n} files, {zip_path.stat().st_size} bytes")
    with zipfile.ZipFile(zip_path) as zf:
        m = json.loads(zf.read("ps-store-enhancer-firefox/manifest.json"))
        assert "service_worker" not in m["background"], "firefox manifest still has a service worker"
        assert m["background"]["scripts"][-1] == "background.js"
        assert m["version"] == version
    print("EXPERIMENTAL: this build has not been tested in Firefox and is not published.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Build dist/ from extension/")
    parser.add_argument("--target", choices=["chrome", "firefox"], default="chrome")
    args = parser.parse_args()
    if args.target == "firefox":
        return build_firefox()

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
    (unpacked_path / "types.d.ts").unlink(missing_ok=True)  # dev-only ambient types

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
