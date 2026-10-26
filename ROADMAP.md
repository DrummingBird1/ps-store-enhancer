# Roadmap

> 🇮🇱 מפת הדרכים של הפרויקט (באנגלית). רעיונות והצעות יתקבלו בשמחה ב-[Discussions](https://github.com/DrummingBird1/ps-store-enhancer/discussions) או ב-[Issues](https://github.com/DrummingBird1/ps-store-enhancer/issues).

What has shipped in **PS Store Enhancer**, what is partly done, and what is only an idea. This is a status list, not a commitment: there are no dates, and items can change or be dropped. The detailed history is in the [CHANGELOG](CHANGELOG.md).

## Shipped

**v2.7.1 — PSN connection fix**
- Connecting to PSN follows the documented sign-in flow of the open-source [psn-api](https://github.com/achievements-app/psn-api) project ([#1](https://github.com/DrummingBird1/ps-store-enhancer/issues/1)).
- Connection errors name the failing step, and the local Diagnostics log records Sony's short error name.

**v2.7.0 — Accuracy and trust**
- Exact cross-platform prices: the right game, never a DLC, map or sequel.
- Metacritic and Steam scores from CheapShark; no API key needed.
- Price Insight uses real data only: lowest PC price ever, today's cheapest, and the trend your own browser recorded. Also price per hour of play and hints about usual sale dates.
- Wishlist: "% off" targets, notes, sorting and filtering, weekly digest, read-only share link (nothing is uploaded).
- Product page: collapsible, reorderable and hideable cards, completionist effort score, "similar difficulty" picks, share-this-deal image, first-run tour.
- Search: ✓ / ★ markers for owned and wishlisted games, junk results filtered out, `/` to focus the search box.
- Local Diagnostics log and "Erase all my data".
- High-contrast theme, reduced-motion support, screen-reader announcements, visible keyboard focus.
- Six new languages, 16 in total: Italiano, Polski, Türkçe, Nederlands, 简体中文, 繁體中文.
- Community-editable trophy data in `extension/data/trophies.json`.
- Developer tooling: type check, inline-script guard and nightly API health check in CI, a mock-Chrome test harness, and a documented message API ([`.github/MESSAGING.md`](.github/MESSAGING.md)).

## Partly done

- **PSN connection** — implemented against the reference flow and a strict test double of Sony's servers; more verification with real accounts is welcome (see Diagnostics in Settings when reporting a problem).
- **Per-trophy rarity** — available as an experimental setting.
- **Store of the all-time low** — the lowest PC price ever and its date are shown; which store held it is not.
- **Firefox** — an experimental build target exists in `scripts/build.py`; it has not been tested in a real Firefox profile.
- **Accessibility** — focus and screen-reader support are in; a full tab-order audit is still to do.
- **Translations** — the newest languages have not yet been reviewed by native speakers.

## Planned

- Native-speaker review of translations, and a visual check of right-to-left layouts (Hebrew, Arabic) on the newest features.
- Refresh the PSN access token shortly before it expires instead of only after a 401.
- Edge support (same code base as Chrome).
- Visual regression snapshots for the injected cards.

## Ideas (need a reliable data source first)

- PSN wishlist import.
- PS Plus catalog badge.
- Active bundle detection (needs a bundle feed).
- "Similar games" recommendations (needs genre data).
- Flag discounts that are unusually deep for a title's own history.
- Keep PSN tokens in session storage.
- Opt-in supporters list on the website.

Contributions are welcome: see [CONTRIBUTING](.github/CONTRIBUTING.md).
