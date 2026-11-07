# Assets

Everything used for the Chrome Web Store listing and social/community posts. The four screenshots per
language (and the website's copies) are real captures of the extension running in Chrome on the real
PlayStation Store (taken from the "Midnight Glass" build, scaled to 1280×800; the wishlist and the price
history in them are sample data). The promo tiles, the icon and the version badges are still drawn by the
scripts in `scripts/generate-assets/`, from the extension's own colour palette.

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
docs/                           The GitHub Pages website — self-contained, see below
STORE-LISTING.txt               English description + permission justifications, copy-paste ready
store-listing/                  The detailed description in all 16 languages, one .txt per language
REVIEWER-NOTES.md               Notes for the Chrome Web Store review team
```

Each screenshot language folder has the same four shots, same order:

1. `1-product-page.png` (1280×800) — price history, cross-platform prices, trophy info
2. `2-live-search.png` (1280×800) — the live search-suggestions dropdown
3. `3-stats-dashboard.png` (1280×800) — the Library & Wishlist stats card in settings
4. `4-popup.png` (1280×800) — the toolbar popup on the extension's own backdrop

Chrome Web Store accepts 1280×800 or 640×400 for screenshots; all eight here are 1280×800.

To retake them: load `extension/` unpacked in Chrome (the `chrome-devtools` tooling can do it), set the
language in Settings, sample data in storage (a wishlist, a few owned games and a short PlayStation price
history), open a store product page / the search box / Settings / the popup page, capture at 1.5× and
scale to 1280×800. Hide the signed-in account menu before capturing.

## Why `docs/assets/` has its own copies of a few images

`docs/` (the website, deployed by `.github/workflows/pages.yml`) is kept self-contained — its
icon, og-image, and four feature screenshots live in `docs/assets/` rather than reaching up into
the folders above. That's a deliberate simplicity choice, not a hard constraint (the Pages deploy
uploads `assets/docs/` as its own artifact, so it could reference sibling folders): keeping the
site's asset set small and separate means a change to the store-listing screenshots doesn't
silently change what the website shows, and vice versa. If you update one of those images here,
copy the update into `docs/assets/` too.

## Regenerating

See `scripts/generate-assets/README.md`. Output lands in `dist/asset-drafts/` (git-ignored) for
review before you copy anything into this folder.

## Adding more screenshot languages

Follow the four-shot template in `scripts/generate-assets/gen_screenshots*.py` and `gen_popup.py`,
and drop the new language's PNGs into a new `screenshots/<lang>/` folder using the same four
filenames.
