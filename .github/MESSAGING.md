# Message API (content script / pages → service worker)

Every request is `chrome.runtime.sendMessage({ type, ...payload })` and is answered by the matching
entry of `HANDLERS` in [`extension/background.js`](../extension/background.js). Handlers that throw
reply `{ success: false, error }` and write a line to the local diagnostics log.

A unit test (`tests/sw.test.js`) fails if a handler is added without being listed here.

## Game data (CheapShark, one cached lookup per game)

| Type | Payload | Response |
|------|---------|----------|
| `FETCH_CROSS_PLATFORM` | `gameName` | `{ success, data: { found: false } }` or `{ success, data: { found: true, title, edition, deals: [{ store, storeID, price, normalPrice, savings, dealLink }] } }` (max 5 deals, cheapest first) |
| `FETCH_REVIEW_SCORES` | `gameName` | `{ success, data: { found, title, metacritic: { score, url } \| null, steam: { percent, text, count, url } \| null } }` |
| `FETCH_PRICE_INSIGHT` | `gameName` | `{ success, data: { found, title, edition, cheapest, cheapestStore, cheapestEver: { price, date } \| null, low: "at" \| "near" \| null, trend: { direction, pct, from, to, spanDays } \| null, points: [[dayNumber, price], …] } }` — `points` are real prices recorded by this browser |
| `FETCH_SEARCH_SUGGESTIONS` | `query` | `{ success, data: [{ title, thumb, cheapest }] }` (games only, max 6) |
| `GET_RATES` | `target` (ISO currency) | `{ ok, base: "USD", rates: { USD: 1, [target]: n }, fromCache }` (Frankfurter, cached 24 h) |

## Trophies / PSN

| Type | Payload | Response |
|------|---------|----------|
| `FETCH_PSN_TROPHY` | `gameName` | `{ success, data: { hasPlatinum, earnedPlatinum, totalTrophies, earnedTrophies, progress, npCommunicationId, npServiceName } }` — only when connected and the game is in the user's trophy list |
| `FETCH_TROPHY_RARITY` | `gameName` | **Experimental** (setting `enableTrophyRarity`, off by default). `{ success, data: { rarestEarned, rarestRemaining, total } }` or `{ success: false, error: "disabled" }` |
| `PSN_AUTHENTICATE` | `npsso` | `{ success, profile }` or `{ success: false, error: <i18n key>, detail? }` (e.g. `psnErrAuthCode`, `psnErrNeedsRedirectAccess`); `detail` is a short technical code such as `authorize/login-redirect` or `token/401-invalid_client`, shown in the UI so a bug report says which step failed |
| `PSN_AUTO_DETECT` | – | `{ found, npsso? }` — reads an existing `npsso` cookie |
| `PSN_FETCH_LIBRARY` | – | `{ success, games, totalCount }` or `{ success: false, error }` (30 s cooldown → `psnWait30`) |
| `PSN_STATUS` | – | `{ connected, tokenValid, profile, libraryCount, gameCount, dlcCount, lastSync, needsSync }` |
| `PSN_DISCONNECT` | – | `{ success }` — removes PSN data only, never the manual list |

## Owned games

| Type | Payload | Response |
|------|---------|----------|
| `GET_MERGED_OWNED` | – | `{ list }` — PSN + manual, de-duplicated by normalized title |
| `ADD_MANUAL_OWNED` / `REMOVE_MANUAL_OWNED` | `gameName` | `{ ok, list }` |
| `IS_GAME_OWNED` | `gameName` | `{ owned }` |

## Wishlist

All writes are serialized, so a running price check never overwrites an edit.

| Type | Payload | Response |
|------|---------|----------|
| `ADD_WISHLIST` | `gameName`, `storeUrl?`, `targetPrice?`, `targetPercent?` | `{ ok, list, currentPrice }` or `{ ok: false, error: "wishlistAlreadyAdded" }` |
| `REMOVE_WISHLIST` | `gameName` | `{ ok, list }` |
| `GET_WISHLIST` | – | `{ list }` |
| `SET_WISHLIST_TARGET` | `gameName` + any of `targetPrice`, `targetPercent`, `note` (≤ 200 chars) | `{ ok, list }` — only keys present in the message change |
| `IS_IN_WISHLIST` | `gameName` | `{ inWishlist }` |
| `CHECK_WISHLIST_NOW` | – | `{ ok }` |
| `RECORD_PS_PRICE` | `gameName`, `amount`, `currency` (ISO) | `{ ok }` — the price shown on the PS Store page, stored as a local snapshot and on the wishlist item |

## Housekeeping

| Type | Payload | Response |
|------|---------|----------|
| `CHANGELOG_SEEN` | – | `{ ok }` |
| `CACHE_STATS` | – | `{ totalEntries, expiredEntries, activeEntries, sizeKB }` |
| `PURGE_CACHE` / `CLEAR_CACHE` | – | `{ ok }` / `{ ok, removed }` |
| `DIAG_GET` | – | `{ entries: [{ t, s, e, d }] }` — last 120 local diagnostic events (secrets are never recorded) |
| `DIAG_CLEAR` | – | `{ ok }` |
| `WIPE_ALL_DATA` | – | `{ ok }` — disconnects PSN and erases everything stored locally (settings in sync storage are kept) |
