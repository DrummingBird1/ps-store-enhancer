# Asset generators

Python/Pillow scripts for the parts of the store listing that are drawn, not captured: the promo
tiles, the icon and the per-version release badges. Three scripts are still **sources of shipped
assets**:

| Script | Writes (into `dist/asset-drafts/`) | Ships as |
|--------|-----------------------------------|----------|
| `gen_promo.py` | `promo/promo-small-440x280.png`, `promo/promo-marquee-1400x560.png` | `assets/promo/small-tile-440x280.png` and `marquee-tile-1400x560.png`; the website's `assets/docs/assets/og-image.png` is a copy of the marquee tile |
| `gen_badges.py` | `badges/vX-Y-Z.png`, one per version | `assets/badges/` |
| `gen_icon.py` | `icons/icon-master-512.png`, `icon128.png`, `icon48.png`, `icon16.png` | `extension/icons/` (and `assets/icon.png`, `assets/store-icon-128.png`) |

Run any of them from the **repo root**:

```bash
python scripts/generate-assets/gen_icon.py         # extension icon (512 master -> 128/48/16)
python scripts/generate-assets/gen_promo.py        # small tile + marquee tile (needs assets/promo/src/card-en.png and popup-en.png: two real captures)
python scripts/generate-assets/gen_badges.py       # one badge per released version
```

Needs `Pillow` (`pip install Pillow`) and Windows' bundled Segoe UI / Arial fonts.
`mockkit.py` is the shared drawing toolkit that `gen_promo.py` and `gen_badges.py` import.

Everything is written to `dist/asset-drafts/` (git-ignored, safe to regenerate anytime) — review
the output, then copy whatever you're keeping into `assets/` (and `extension/icons/` for a new
icon, and `assets/docs/assets/` for anything the website embeds — see `assets/README.md` for why
that's a separate copy). Move whatever you're replacing into `archive/` instead of deleting it.

## The store screenshots are real captures, not generator output

The four screenshots per language in `assets/screenshots/<lang>/` (and the website's copies of the
English set in `assets/docs/assets/screenshot-*.png`) are **real 1280×800 captures** of the extension
running in Chrome on the real PlayStation Store, with sample data. The scripts below are **legacy
mockup tools** from before that: they draw the old, pre-"Midnight Glass" look with `mockkit.py`
(`gen_popup.py` even at 640×400) and write to `dist/asset-drafts/screenshots/`. Kept for reference
only. **Do not use them for the store screenshots**: copying their output into `assets/` would
replace the real captures with outdated drawings.

```bash
python scripts/generate-assets/gen_screenshots.py  # LEGACY mockup: product page (EN + HE)
python scripts/generate-assets/gen_screenshots2.py # LEGACY mockup: live search suggestions (EN + HE)
python scripts/generate-assets/gen_screenshots3.py # LEGACY mockup: library & wishlist stats (EN + HE)
python scripts/generate-assets/gen_popup.py        # LEGACY mockup: toolbar popup (EN + HE, 640×400)
```

(Hebrew in these mockups goes through `mockkit.rtl_visual()` / `rtl_fix()`, because Pillow does no bidi
reordering; `rtl_visual()` needs `python-bidi`.)

### Retaking the real screenshots

1. Load `extension/` unpacked in real Chrome (`chrome://extensions` → Developer mode → Load unpacked)
   and set the extension language in Settings (one language per set). Do not connect a real PSN account.
2. Put sample data in the extension's storage: a wishlist, a few owned games and a short PlayStation
   price history.
3. Open, one by one, a store product page, the store's search box with a query typed in (live search),
   the Settings page and the popup page. Capture each at 1.5× and scale to exactly 1280×800.
4. Hide the store header's signed-in account avatar/menu before capturing.
5. Save them as `assets/screenshots/<lang>/1-product-page.png`, `2-live-search.png`,
   `3-stats-dashboard.png` and `4-popup.png`, and copy the English four over the website's
   `assets/docs/assets/screenshot-product.png`, `-search.png`, `-stats.png` and `-popup.png`.
6. For the promo tiles retake `assets/promo/src/card-en.png` (the Price Insight card on a store page)
   and `popup-en.png` (the popup) the same way, then run `gen_promo.py`.

To add a screenshot language, take the four captures in that language (steps 1 to 5) into a new
`assets/screenshots/<lang>/`.

To add a new version's badge: add a row to `gen_badges.py`'s `VERSIONS` list (version, a short
category label describing what actually shipped, and a color).
