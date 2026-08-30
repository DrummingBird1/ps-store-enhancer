# Assets

Everything used for the Chrome Web Store listing and social/community posts. All images are
original mockups built from the extension's own real CSS classes and color palette (see
`scripts/generate-assets/`) — not live captures, since this project's tooling can't load
store.playstation.com directly — so they accurately represent the real UI without depending on
Sony's actual page markup or trademarked assets.

## Layout

```
icon.png, store-icon-128.png    Logo (128×128) — identical files, two names for two purposes:
                                 icon.png is referenced from the READMEs, store-icon-128.png is
                                 what the Chrome Web Store dashboard's "Store icon" field expects
badges/                         One small graphic per released version — version number + a
                                 category label (RENAMED/SECURITY/MAJOR/…) + a color, used in
                                 CHANGELOG.md and the GitHub Release body
promo/
  small-tile-440x280.png        Small promo tile (optional, shown in search/category results)
  marquee-tile-1400x560.png     Marquee promo tile (optional, used only if featured)
screenshots/
  en/                           English screenshots (upload these as the default set)
  he/                           Hebrew screenshots (upload under the Hebrew locale in the
                                 dashboard: Store Listing → language dropdown → Hebrew)
STORE-LISTING.txt               Full description + permission justifications, copy-paste ready
REVIEWER-NOTES.md               Notes for the Chrome Web Store review team
```

Each screenshot language folder has the same four shots, same order:

1. `1-product-page.png` (1280×800) — price history, cross-platform prices, trophy info
2. `2-live-search.png` (1280×800) — the live search-suggestions dropdown
3. `3-stats-dashboard.png` (1280×800) — the Library & Wishlist stats card in settings
4. `4-popup.png` (640×400) — the toolbar popup

Chrome Web Store accepts 1280×800 or 640×400 for screenshots (don't mix ratios within one upload
if it complains — these are grouped by size already: 1–3 are 1280×800, 4 is 640×400).

## Why `docs/assets/` has its own copies

`docs/` is the GitHub Pages site, and Pages can only serve files that physically live inside the
`/docs` folder — a relative link out to `../assets/...` 404s on the live site. So the website's
icon, og-image, and four feature screenshots are duplicated into `docs/assets/` on purpose. If
you update one of those images here, copy the update into `docs/assets/` too.

## Regenerating

See `scripts/generate-assets/README.md`. Output lands in `dist/asset-drafts/` (git-ignored) for
review before you copy anything into this folder.

## Adding more screenshot languages

Follow the four-shot template in `scripts/generate-assets/gen_screenshots*.py` and `gen_popup.py`,
and drop the new language's PNGs into a new `screenshots/<lang>/` folder using the same four
filenames.
