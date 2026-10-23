# PS Store Enhancer

Chrome extension (Manifest V3, 16 languages) that adds lowest-ever prices and cross-platform comparison to the PlayStation Store. Formerly GameDeals+ and PS Store Insight; the repository is `ps-store-enhancer`.

## Layout

- `extension/`: the shippable extension. Translations are `extension/_locales/<lang>/messages.json`; English is the reference set.
- `scripts/build.py` builds `dist/` (git-ignored). `tests/` holds the Jest suites. `CHANGELOG.md` records user-visible changes.
- `.github/workflows`: `ci.yml` (lint + tests on pull requests), `release.yml` (build and publish on a tag), `pages.yml` (landing page), `api-health.yml`.

## Commands

- `npm install`
- `npm test` (Jest), `npm run lint`, `npm run format:check`, `npm run validate-locales`
- `python scripts/build.py` builds the store zip into `dist/`

## Rules

- User-visible strings go through `_locales`: add the key to every locale, then run `npm run validate-locales`.
- Do not commit `dist/`, `.env` files, store credentials or API keys.
- Changes go through a branch and a pull request; do not push to `main` and do not force-push. CI must pass.
- Do not tag a release or publish to a store without the owner's approval.
