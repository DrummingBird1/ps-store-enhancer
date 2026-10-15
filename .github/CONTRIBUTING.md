# Contributing to PS Store Enhancer (formerly GameDeals+, then PS Store Insight)

Thanks for your interest! This project is a Chrome extension (Manifest V3) that enhances the PlayStation Store. Contributions of any kind are welcome — bug reports, feature ideas, translations, code.

## Quick start

```bash
git clone https://github.com/DrummingBird1/ps-store-enhancer.git
cd ps-store-enhancer
pnpm install
pnpm test                 # Jest: matching, helpers, service worker (real API fixtures), i18n, trophy data
pnpm run lint             # ESLint
pnpm run typecheck        # JSDoc type check of match.js / helpers.js
pnpm run check:csp        # MV3 CSP guard
pnpm run hooks:install    # optional: run the fast checks before every commit
```

To load the extension locally:

1. Open `chrome://extensions`
2. Toggle **Developer mode** on
3. Click **Load unpacked** → select the `extension/` folder
4. Visit https://store.playstation.com

## Project layout

```
ps-store-enhancer/
├── extension/              ← The Chrome extension (load this in dev mode — source of truth)
│   ├── manifest.json       Manifest V3
│   ├── background.js       Service worker — message router (see .github/MESSAGING.md), wishlist, alarms
│   ├── cheapshark.js       Exact-game lookup: deals, all-time low, Metacritic/Steam ratings
│   ├── content.js          DOM injection on store.playstation.com
│   ├── content-extras.js   Share-deal image, first-run tour, one-time review prompt
│   ├── psn.js              PSN OAuth + library/trophy API
│   ├── cache.js, diag.js   chrome.storage.local TTL wrapper; local diagnostics log
│   ├── match.js            Pure title matching (normalize / edition-aware / add-on detection)
│   ├── helpers.js          Pure helpers (snapshots, trend, scores, share link, price parsing…)
│   ├── data/trophies.json  Community-maintained trophy / completionist data
│   ├── i18n.js             Multi-language with manual override
│   ├── popup.{html,js}     Toolbar popup (quick filter toggles + PSN status)
│   ├── options.{html,js}   Full settings page
│   ├── welcome.html        First-install onboarding
│   ├── changelog.html      Per-version changelog
│   ├── styles.css          Theme-aware styles for injected cards
│   ├── icons/              16/48/128 PNG icons
│   └── _locales/           Per-language messages.json (16 languages)
├── assets/                 Chrome Web Store + social media materials (see assets/README.md)
│   └── docs/               GitHub Pages site (landing + privacy policy) — deployed via
│                           .github/workflows/pages.yml, self-contained (own assets/ inside)
├── dist/                   Latest build output — git-ignored, made by scripts/build.py
├── archive/                Superseded assets kept for reference, not deleted
├── scripts/                build.py (Chrome; Firefox target is experimental), check-apis.py, check-csp.py, generate-assets/
├── tests/                  Jest suites + fixtures; harness/ = browser harness with mocked chrome.*
├── .github/
│   ├── workflows/          CI (lint+tests on PR) + Release (build + publish on tag)
│   ├── CONTRIBUTING.md     This file
│   ├── TESTING.md          Automated + manual test plan
│   └── MESSAGING.md        The service-worker message API
└── CHANGELOG.md            Full version history
```

## Development guidelines

### Code style
- ESLint + Prettier configs are checked in. `pnpm run lint` and `pnpm run typecheck` must pass.
- Pure logic goes in `extension/match.js` (titles) or `extension/helpers.js` (everything else) so it
  can be unit-tested; anything touching `chrome.*` is tested through `tests/support/sw-env.js`.
- **Never show data the extension doesn't actually have.** Prices, dates and scores come from
  CheapShark, the page itself, or the browser's own recorded history — no estimates, no placeholder
  "typical" values. If there's nothing real to show, show nothing (or an honest "not found" note).
- **A wrong match is worse than no match.** Title comparisons go through `PSEMatch` (never raw
  `includes`/substring): a DLC, sequel or soundtrack must not pass as the base game.

### Adding a new feature
1. Open an issue first to discuss — saves time if it doesn't fit the project's scope (PS Store buying decisions).
2. Bump the version in `extension/manifest.json` (semver).
3. Add the changelog entry (see "Releases" below for the three places).
4. Add Jest tests for any logic you introduce. A new message handler also needs a row in
   [MESSAGING.md](MESSAGING.md) (a test fails otherwise).
5. Run `pnpm test && pnpm run lint && pnpm run typecheck && pnpm run check:csp`.
6. Run through [TESTING.md](TESTING.md) for the relevant sections (the browser harness in
   `tests/harness/` is the quickest way to look at UI changes).
7. Open a PR — CI lints, type-checks, runs the CSP guard, validates locales and runs the tests.

### Adding a new permission to manifest.json
If you need a new Chrome permission (or `host_permissions`):
- Add it to `manifest.json`
- Add a justification in `assets/STORE-LISTING.txt`
- Update `assets/REVIEWER-NOTES.md`
- **Expect a fresh Chrome Web Store review** — new permissions invalidate the previous approval

### Trophy / completionist data
`extension/data/trophies.json` is community-maintained. Add or fix a game by editing that file
(keep keys lower-case and sorted; `difficulty` 1-10, `hours` like `"40-60"` or `"100+"`,
`playthroughs` like `"2"` or `"2-3"`) — `tests/trophies.test.js` checks the format. Say where the
numbers come from in the PR and you'll be credited in [CONTRIBUTORS.md](../CONTRIBUTORS.md).

### Translations
The extension supports 16 languages. To add a new key:
1. Add it to `extension/_locales/en/messages.json` first (with optional `placeholders` block)
2. Add the same key to every other locale (`he`, `ar`, `es`, `fr`, `de`, `it`, `pt_BR`, `nl`, `pl`,
   `tr`, `ru`, `ja`, `ko`, `zh_CN`, `zh_TW`) — placeholder tokens (`$NAME$`) must match English
3. `tests/i18n.test.js` and the CI `validate-locales` step fail if a key is missing, a placeholder
   differs, a key used in the code isn't defined, or a defined key is unused
4. For UI text, use `data-i18n="keyName"` / `data-i18n-placeholder="…"` / `data-i18n-title="…"`
5. For programmatic strings, use `t("keyName", arg1, arg2)`

### To translate the extension to a new language
1. Pick a [Chrome-supported locale code](https://developer.chrome.com/docs/extensions/reference/api/i18n#supported-locales)
2. Copy `extension/_locales/en/` to `extension/_locales/<code>/`
3. Translate every value in `messages.json` (keep the keys identical, keep `placeholders` blocks;
   `extDesc` must stay ≤ 132 characters — a test checks it)
4. Add the code to `SUPPORTED` in `extension/i18n.js` and to the expected list in `tests/i18n.test.js`
5. Add to `RTL_LANGS` if applicable
6. Add an `<option value="<code>">…</option>` in `extension/options.html`'s language picker

## Releases

GitHub Actions builds and publishes a release whenever a `v*` tag is pushed:

```bash
git tag v2.6.0
git push origin v2.6.0
```

The workflow (`.github/workflows/release.yml`) builds `dist/ps-store-enhancer-vX.Y.Z.zip` from
`extension/` (same logic as `scripts/build.py`, run it locally to preview) — the Chrome build, which
Edge accepts unchanged (see `assets/EDGE-LISTING.md`). The Firefox target
(`python scripts/build.py --target firefox`) is experimental and untested, so it is **not** part of
releases. The workflow creates a GitHub
Release with:
- **Title** using the current product name (`PS Store Enhancer vX.Y.Z`) — pulled from
  `extension/_locales/en/messages.json`'s `extName` key at build time, so it can't go stale on a
  future rename the way earlier releases did (title kept saying "GameDeals+ for PS Store" for
  three renames before anyone noticed, because it was hardcoded).
- **Body** with that version's actual release badge image and its *full* changelog text (pulled
  from `CHANGELOG.md`, not just a link to it) — a release page is often the first thing someone
  sees, and "click through to read what changed" is worse than just showing it.
- **One zip** — `ps-store-enhancer-vX.Y.Z.zip`, the extension only. There used to be a second
  "full project" zip; nobody asked for it, cloning the repo already does that job, and it doubled
  the release page's clutter for no benefit — removed.

Before tagging: bump the version in `extension/manifest.json` **and** `package.json`, update both
version strings in `extension/popup.html` (header *and* footer — easy to miss one), the version
badges in `README.md`/`README.he.md`, add the release's badge
(`python scripts/generate-assets/gen_badges.py`, copy it to `assets/badges/`), and add the release's
section to `CHANGELOG.md` + `extension/changelog.html` + `extension/changelog-data.js` (all three,
kept in sync by hand; the popup's highlights come from `chl_*` keys in every locale).

### External APIs
The extension depends on CheapShark and Frankfurter. `python scripts/check-apis.py` (also run nightly
by `.github/workflows/api-health.yml`, which opens an issue on failure) checks they still answer in
the shape the code expects — run it before a release too.

## Reporting bugs

Use the [issue template](https://github.com/DrummingBird1/ps-store-enhancer/issues/new/choose). Always include:

- Chrome version
- Extension version (from the popup footer)
- PS Store region/URL where the bug occurred
- DevTools console output if relevant
- Steps to reproduce

## Code of conduct

Be kind, be patient, assume good intent. This is a hobby project.
