# PS Store Enhancer — Test Plan

Three layers, cheapest first. Only the last one needs a real Chrome (and, for PSN, a real account).

## 1. Automated (run before every commit — CI runs the same)

```bash
pnpm install              # once
pnpm run lint
pnpm run typecheck        # JSDoc type check of match.js / helpers.js
pnpm test                 # Jest: title matching, helpers, service worker + real CheapShark fixtures, i18n
python scripts/check-csp.py    # no inline scripts / handlers / eval in extension pages
python scripts/check-apis.py   # live: CheapShark + Frankfurter still answer in the shape the code expects
```

Optional: `git config core.hooksPath .githooks` runs lint + typecheck + CSP guard + tests on every commit.

## 2. Browser harness (UI without installing the extension)

`python tests/harness/server.py` serves the real extension pages, the real service-worker code and the
real `content.js` against a mocked `chrome.*` (Sony is faked, CheapShark answers from the captured
fixtures). See [`tests/harness/README.md`](../tests/harness/README.md). Good for looking at a UI change
in seconds; it does **not** replace layer 3.

## 3. Manual pass in real Chrome (before publishing a version)

### Setup

1. Open `chrome://extensions` → toggle **Developer mode** on
2. **Load unpacked** → select `extension/` (or `dist/extension/` after `python scripts/build.py`)
3. Confirm the icon appears in the toolbar; a first install opens the welcome page and the first
   product page you visit runs the short tour

### Product page (no PSN account needed)

Visit a few product pages, e.g. https://store.playstation.com/en-us/concept/10000091.

- [ ] **Review badges** next to the title: Metacritic (PC) and Steam %, both linking out; nothing is
      shown (rather than a wrong score) when CheapShark has no rating
- [ ] **Price Insight** card: *lowest PC price ever* with a date, *cheapest now*, an "at / near the
      all-time low" chip when applicable — and **no estimated/invented chart**. A sparkline only
      appears after the browser has recorded ≥ 4 real prices over ≥ 7 days
- [ ] **Cross-platform** card lists prices for **that exact game**. Regression cases (these once
      showed a DLC/map): *Elden Ring* must not list "Nightreign"; *Cyberpunk 2077* must not list
      "Phantom Liberty" or a map. A PlayStation exclusive (e.g. *Astro Bot*) shows the "no PC price"
      note instead of an empty card
- [ ] An edition mismatch (a game whose CheapShark listing is "Deluxe"/"Ultimate") shows the 🎁 note
- [ ] **Trophy card** (Elden Ring): platinum, difficulty, time, playthroughs, completionist effort
      tier, price per hour; with PSN connected also your progress and "similar difficulty" picks
- [ ] Cards can be collapsed (state remembered), and reordered/hidden in Settings → Product page cards
- [ ] **Share this deal as an image** downloads a PNG with the title, prices and the footer
- [ ] **Mark as owned** and **Add to Wishlist** buttons appear and toggle
- [ ] A usual-sale hint ("Steam … Sale usually starts around …") only appears within ~90 days of one
- [ ] First-run tour: 4 steps, skippable, never shown again after finishing or skipping
- [ ] Review prompt appears once after 12+ product-page views over 7+ days, and never again after
      either button
- [ ] Reduced motion: with the OS setting on, cards appear without animation
- [ ] Keyboard only: every button/link/toggle shows a visible focus ring; screen reader announces
      cards as they load

### Theme, currency, language

- [ ] Light / Dark / **High contrast** themes apply to the options page, popup, changelog and the
      injected cards
- [ ] Currency **EUR** → cross-platform shows EUR amounts + the "EUR (≈USD)" tag; first visit to a
      store region sets the matching currency once (and never overrides a manual choice)
- [ ] Language **Hebrew/Arabic** → cards and pages flip RTL; **Chinese/Turkish/Polish/Italian/Dutch**
      render without raw keys; country and currency names are localized; prices/dates use the
      extension language, not the browser's

### Wishlist

- [ ] Add a game → options show it with **price / % off** target, a note field, the PC price and the
      PS Store price seen on the page
- [ ] Sort and filter work; **Check prices now** updates prices; a target hit fires exactly one
      notification (clicking it opens the game's store page) and re-arms when the price rises
- [ ] **Weekly digest** mode sends no instant notification, then one summary
- [ ] **Copy share link** → opening it shows a read-only list; targets and notes are not in the link
- [ ] Stats card: owned / wishlisted / value / deals ready; the toolbar badge counts ready deals
- [ ] Export → Import round-trips (also a pre-rename backup: `"GameDeals+ for PS Store"`)

### Search and filters

- [ ] Typing 2+ characters in the store search box shows "PS Store Enhancer live results" with
      thumbnail, PC price, **✓ / ★** for owned / wishlisted games, and no soundtracks or maps
- [ ] Arrow keys / Enter / Escape work; payment and other non-search inputs never trigger it
- [ ] `/` focuses the search box (but never while typing in a field); toggle it off in Settings
- [ ] Popup filters: Hide add-ons, Hide DLC, Hide owned — including games whose title differs only
      by an apostrophe style (`Marvel’s` vs `Marvel's`) or ™

### Popup, privacy and diagnostics

- [ ] Popup: filters, PSN status with "synced … ago" and a refresh button, What's-new card (localized),
      **Erase all my data** (asks for confirmation, then PSN is disconnected and lists are empty)
- [ ] Settings → **Diagnostics** shows recent events, **Copy** works, **Clear log** empties it, and
      nothing in it looks like a token or password
- [ ] Right-click selected text on the store → "Find on PS Store Enhancer price compare"

### "What's new" surfacing

- [ ] After an update the popup shows a dismissible card and the store shows a dismissible banner;
      dismissing either clears the toolbar badge

---

## PSN integration (needs a real PSN account — the one thing automation cannot cover)

The connect flow has only ever been tested against a faked Sony in the harness and unit tests, so a
real-account pass is the most valuable manual check. **Never paste a real token into an issue, chat
or commit** — the Diagnostics log is safe to share, the token is not.

- [ ] Settings → PSN → **Auto-detect** while signed in to PSN in another tab (or paste the NPSSO)
- [ ] **Connect** asks for the optional `webRequest` permission in the same click (accept it); if the
      connection still fails, the message ends in a step code such as `[authorize/redirect-not-observed]`
      or `[token/401-invalid_client]` — copy Settings → Diagnostics and send it. Note which path worked
      (`authorize-response` shows `opaqueredirect` when Chrome hides the redirect; `webrequest-listener`
      shows the permission was active). *v2.7.1 corrected the app identity and token authentication,
      which had made every earlier attempt fail; this is its first real-account check.*
- [ ] Your own Sony session in Chrome is unaffected afterwards (still signed in at account.sony.com)
- [ ] Library syncs; games you own are hidden by *Hide owned*; the popup shows "synced … ago"
- [ ] Trophy progress shows on a game from your library; with *Trophy rarity (experimental)* on, the
      rarest remaining trophy is shown (if not, Diagnostics has `rarity-*` lines to send)
- [ ] Disconnect → manually added games (✏️) stay, PSN games (🔗) go

---

## Regression checks (things that were once broken)

- [ ] RTL cards for Hebrew/Arabic only (was hardcoded RTL for everyone in v2.1)
- [ ] No trophy box for games with neither a database entry nor PSN data (was fake defaults)
- [ ] PSN trophy lookup finds games beyond the first 50 in the library; "Hades" never picks "Hades II"
- [ ] A CheapShark failure shows the "Service temporarily unavailable" notice, not a silent gap
- [ ] No `innerHTML` with unescaped data (avatar URL, titles, wishlist names, notes)
- [ ] No fabricated data anywhere: every price, date and score on a card can be traced to CheapShark,
      the page itself, or the browser's own recorded history

---

## Release checklist

- [ ] All of layer 1 passes; layer 3 done on a clean Chrome profile
- [ ] Bump version in `extension/manifest.json` **and** `package.json`
- [ ] Update both version strings in `extension/popup.html` (header *and* footer)
- [ ] Update the version badges in `README.md` and `README.he.md`
- [ ] Add the release's section to `CHANGELOG.md` (with its badge from
      `python scripts/generate-assets/gen_badges.py`), `extension/changelog.html` and
      `extension/changelog-data.js` (+ the `chl_*` keys in every locale) — kept in sync by hand
- [ ] `python scripts/build.py` and load `dist/extension/` unpacked to smoke-test
- [ ] `git tag vX.Y.Z && git push origin vX.Y.Z` — the release workflow builds
      `dist/ps-store-enhancer-vX.Y.Z.zip` and publishes the GitHub Release automatically
- [ ] Update `assets/STORE-LISTING.txt` if the description or feature list changed
- [ ] Update `assets/REVIEWER-NOTES.md` if permissions changed (a new `optional_permissions` entry
      is documented there)
- [ ] Submit to the Chrome Web Store (and Edge Add-ons — see `assets/EDGE-LISTING.md`)
- [ ] Move the shipped items to **✅ Shipped** on the Trello roadmap board
