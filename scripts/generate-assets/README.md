# Asset generators

Python/Pillow scripts that draw the store listing screenshots, promo tiles, the icon, and the
per-version release badges as pixel-precise PNGs — not live captures (this project's tooling
can't load store.playstation.com directly), so they're original mockups built from the
extension's own real CSS classes and color palette in `mockkit.py`.

Run any of them from the **repo root**:

```bash
python scripts/generate-assets/gen_icon.py         # extension icon (512 master -> 128/48/16)
python scripts/generate-assets/gen_screenshots.py  # product page (EN + HE)
python scripts/generate-assets/gen_screenshots2.py # live search suggestions (EN + HE)
python scripts/generate-assets/gen_screenshots3.py # library & wishlist stats (EN + HE)
python scripts/generate-assets/gen_popup.py        # toolbar popup (EN + HE)
python scripts/generate-assets/gen_promo.py        # small tile + marquee tile
python scripts/generate-assets/gen_badges.py        # one badge per released version
```

Needs `Pillow` (`pip install Pillow`) and Windows' bundled Segoe UI / Arial fonts (used for
Latin + Hebrew text — Pillow doesn't do bidi reordering, so Hebrew is converted to visual order
before drawing). `gen_popup.py` uses `mockkit.rtl_visual()`, which runs the real Unicode bidi
algorithm through `python-bidi` (`pip install python-bidi`) and falls back to the rougher
`rtl_fix()` without it; the other generators still call `rtl_fix()`. The popup's wording comes
straight from `extension/_locales`, so it follows the extension instead of drifting from it.

Everything is written to `dist/asset-drafts/` (git-ignored, safe to regenerate anytime) — review
the output, then copy whatever you're keeping into `assets/` (and `extension/icons/` for a new
icon, and `assets/docs/assets/` for anything the website embeds — see `assets/README.md` for why
that's a separate copy). Move whatever you're replacing into `archive/` instead of deleting it.

To add a new screenshot language: copy the pattern in `gen_screenshots.py`'s `L = {...}` dict,
add a translated entry, and drop the output into `assets/screenshots/<lang>/`.

To add a new version's badge: add a row to `gen_badges.py`'s `VERSIONS` list (version, a short
category label describing what actually shipped, and a color).
