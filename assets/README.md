# Assets

Everything used for the Chrome Web Store listing and social/community posts. The four screenshots per
language (and the website's copies) are real captures of the extension running in Chrome on the real
PlayStation Store (taken from the "Midnight Glass" build, scaled to 1280×800; the wishlist and the price
history in them are sample data). The promo tiles are composed by `scripts/generate-assets/gen_promo.py` around
two more real captures kept in `promo/src/`; the icon and the version badges are drawn by the other scripts in
`scripts/generate-assets/`, from the extension's own colour palette.

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
  src/card-en.png, popup-en.png Real captures (the Price Insight card on a store page, the popup)
                                 that gen_promo.py places in the two tiles — retake them when the UI
                                 changes, then regenerate the tiles
screenshots/
  en/                           English screenshots (upload these as the default set)
  he/                           Hebrew screenshots (upload under the Hebrew locale in the
                                 dashboard: Store Listing → language dropdown → Hebrew)
docs/                           The GitHub Pages website — self-contained, see below
STORE-LISTING.txt               English description + permission justifications, copy-paste ready
store-listing/                  The detailed description in all 16 languages, one .txt per language
REVIEWER-NOTES.md               Notes for the Chrome Web Store review team
```

Each screenshot language folder has the same four shots, same order:

1. `1-product-page.png` (1280×800) — a product page with the review-score badges next to the title and the Price
   Insight card below the buy box (lowest price seen, the sale and its countdown, the store's 30-day low, the gap
   to the cheapest PC price, the price chart)
2. `2-live-search.png` (1280×800) — the live search-suggestions dropdown
3. `3-stats-dashboard.png` (1280×800) — the Library & Wishlist stats card in settings
4. `4-popup.png` (1280×800) — the toolbar popup on the extension's own backdrop

Chrome Web Store accepts 1280×800 or 640×400 for screenshots; all eight here are 1280×800.

To retake them: load `extension/` unpacked in Chrome (the `chrome-devtools` tooling can do it), set the
language in Settings, sample data in storage (a wishlist, a few owned games and a short PlayStation price
history), open a store product page / the search box / Settings / the popup page, capture at 1.5× and
scale to 1280×800. Hide the signed-in account avatar/menu before capturing, and do not connect a real PSN
account. The steps are in `scripts/generate-assets/README.md`.

## Why `docs/assets/` has its own copies of a few images

`docs/` (the website, deployed by `.github/workflows/pages.yml`) is kept self-contained — its
icon, og-image, and four feature screenshots live in `docs/assets/` rather than reaching up into
the folders above. That's a deliberate simplicity choice, not a hard constraint (the Pages deploy
uploads `assets/docs/` as its own artifact, so it could reference sibling folders): keeping the
site's asset set small and separate means a change to the store-listing screenshots doesn't
silently change what the website shows, and vice versa. If you update one of those images here,
copy the update into `docs/assets/` too.

## Regenerating

Only the promo tiles (`gen_promo.py`, from `promo/src/`), the version badges (`gen_badges.py`) and the icon
(`gen_icon.py`) are generated: see `scripts/generate-assets/README.md`. Output lands in `dist/asset-drafts/`
(git-ignored) for review before you copy anything into this folder.

The screenshots are **not** generated. `gen_screenshots*.py` and `gen_popup.py` are legacy mockup tools (old
look, the popup at 640×400); running them and copying their output here would replace the real captures with
outdated drawings. Retake the screenshots as described above.

## Adding more screenshot languages

Take the four captures in the new language the way "To retake them" describes (set the language in
Settings first), and save them in a new `screenshots/<lang>/` folder using the same four filenames.
