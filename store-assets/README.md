# Store assets

Everything needed for the Chrome Web Store listing. All images are original mockups built from
the extension's own real CSS classes and color palette — not live captures (this project's
tooling can't load store.playstation.com directly) — so they accurately represent the real UI
without depending on Sony's actual page markup or trademarked assets.

## Layout

```
store-icon-128.png              Store listing icon (128×128)
promo/
  small-tile-440x280.png        Small promo tile (optional, shown in search/category results)
  marquee-tile-1400x560.png     Marquee promo tile (optional, used only if featured)
screenshots/
  en/                           English screenshots (upload these as the default set)
  he/                           Hebrew screenshots (upload under the Hebrew locale in the
                                 dashboard: Store Listing → language dropdown → Hebrew)
```

Each language folder has the same four shots, same order:

1. `1-product-page.png` (1280×800) — price history, cross-platform prices, trophy info
2. `2-live-search.png` (1280×800) — the live search-suggestions dropdown
3. `3-stats-dashboard.png` (1280×800) — the Library & Wishlist stats card in settings
4. `4-popup.png` (640×400) — the toolbar popup

Chrome Web Store accepts 1280×800 or 640×400 for screenshots (don't mix ratios within one
upload if it complains — these are grouped by size already: 1–3 are 1280×800, 4 is 640×400).

## Adding more languages

Follow the same four-shot template (`gen_screenshots.py`, `gen_screenshots2.py`,
`gen_screenshots3.py`, `gen_popup.py` in the session that produced these — not checked into
this repo, ask for them to be regenerated) and drop the new language's PNGs into a new
`screenshots/<lang>/` folder using the same four filenames.

## Regenerating / editing

The mockups use a small shared Pillow toolkit (2× supersampling, hand-drawn vector icons — no
emoji glyph dependencies, which avoids the missing-glyph boxes visible in this project's very
first screenshot batch). Colors are pulled directly from `extension/styles.css` and
`docs/index.html` so any palette change there should be mirrored here.
