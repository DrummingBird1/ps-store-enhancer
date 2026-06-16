# Contributing to GameDeals+ for PS Store

Thanks for your interest! This project is a Chrome extension (Manifest V3) that enhances the PlayStation Store. Contributions of any kind are welcome — bug reports, feature ideas, translations, code.

## Quick start

```bash
git clone https://github.com/DrummingBird1/gamedeals-plus.git
cd gamedeals-plus
npm install
npm test          # Jest unit tests
npm run lint      # ESLint
npm run format    # Prettier
```

To load the extension locally:

1. Open `chrome://extensions`
2. Toggle **Developer mode** on
3. Click **Load unpacked** → select the `extension/` folder
4. Visit https://store.playstation.com

## Project layout

```
gamedeals-plus/
├── extension/              ← The Chrome extension (load this in dev mode)
│   ├── manifest.json       Manifest V3
│   ├── background.js       Service worker — API proxy, PSN sync, wishlist, alarms
│   ├── content.js          DOM injection on store.playstation.com
│   ├── psn.js              PSN OAuth + library/trophy API
│   ├── cache.js            chrome.storage.local TTL wrapper
│   ├── match.js            Pure helpers (slugify/fuzzyMatch/computeBasePrice/classifyTitle)
│   ├── i18n.js             Multi-language with manual override
│   ├── popup.{html,js}     Toolbar popup (quick filter toggles + PSN status)
│   ├── options.{html,js}   Full settings page
│   ├── welcome.html        First-install onboarding
│   ├── changelog.html      Per-version changelog
│   ├── styles.css          Theme-aware styles for injected cards
│   ├── icons/              16/48/128 PNG icons
│   └── _locales/           Per-language messages.json (10 languages)
├── docs/                   GitHub Pages site (landing + privacy policy)
├── store-assets/           Chrome Web Store listing materials
├── tests/                  Jest tests
├── .github/workflows/      CI (lint+tests on PR) + Release (build zips on tag)
└── TESTING.md              Manual browser test checklist
```

## Development guidelines

### Code style
- ESLint + Prettier configs are checked in. `npm run lint` must pass.
- Pure helper functions go in `extension/match.js` so they can be unit-tested.

### Adding a new feature
1. Open an issue first to discuss — saves time if it doesn't fit the project's scope (PS Store buying decisions).
2. Bump the version in `extension/manifest.json` (semver).
3. Add a changelog entry in `extension/changelog.html`.
4. Add Jest tests for any pure logic you introduce.
5. Run `npm test && npm run lint`.
6. Run through [TESTING.md](TESTING.md) for the relevant sections.
7. Open a PR — the CI workflow will syntax-check JS, validate locales, and run tests.

### Adding a new permission to manifest.json
If you need a new Chrome permission (or `host_permissions`):
- Add it to `manifest.json`
- Add a justification in `store-assets/STORE-LISTING.txt`
- Update `store-assets/REVIEWER-NOTES.md`
- **Expect a fresh Chrome Web Store review** — new permissions invalidate the previous approval

### Translations
The extension supports 10 languages. To add a new key:
1. Add it to `extension/_locales/en/messages.json` first (with optional `placeholders` block)
2. Add the same key to every other locale (`he`, `ar`, `es`, `fr`, `de`, `pt_BR`, `ru`, `ja`, `ko`)
3. The CI workflow's `validate-locales` step will fail if any key is missing
4. For UI text, use `data-i18n="keyName"` / `data-i18n-placeholder="…"` / `data-i18n-title="…"`
5. For programmatic strings, use `t("keyName", arg1, arg2)`

### To translate the extension to a new language
1. Pick a [Chrome-supported locale code](https://developer.chrome.com/docs/extensions/reference/api/i18n#supported-locales)
2. Copy `extension/_locales/en/` to `extension/_locales/<code>/`
3. Translate every value in `messages.json` (keep the keys identical, keep `placeholders` blocks)
4. Add the code to `SUPPORTED` in `extension/i18n.js`
5. Add to `RTL_LANGS` if applicable
6. Add an `<option value="<code>">…</option>` in `extension/options.html`'s language picker

## Releases

GitHub Actions builds and publishes a release whenever a `v*` tag is pushed:

```bash
git tag v2.3.2
git push origin v2.3.2
```

The workflow runs `python build-zips.py` (logic embedded in `.github/workflows/release.yml`) and uploads both zips to the GitHub Release.

## Reporting bugs

Use the [issue template](https://github.com/DrummingBird1/gamedeals-plus/issues/new/choose). Always include:

- Chrome version
- Extension version (from the popup footer)
- PS Store region/URL where the bug occurred
- DevTools console output if relevant
- Steps to reproduce

## Code of conduct

Be kind, be patient, assume good intent. This is a hobby project.
