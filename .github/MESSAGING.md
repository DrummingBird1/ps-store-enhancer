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
| `RECORD_PS_PRICE` | `gameName`, `amount`, `currency` (ISO), optional `orig`, `pct`, `ends` (UTC day number), `plus` | `{ ok }` — the price shown on the PS Store page (and its sale details), stored as a local snapshot and on the wishlist item |
| `RECORD_PS_PRICES` | `items: [{ gameName, amount, currency, orig?, pct? }]` (max 60) | `{ ok, recorded }` — prices read from a search/category grid; only games whose history already exists or that are on the wishlist get a point |
| `MERGE_SNAPSHOTS` | `snapshots` (the `pse_snapshots` object of a backup) | `{ ok, games }` — validates the backup's recorded prices (shape, no future days) and merges them; games already stored are merged, games only in the backup fill free slots, nothing local is evicted |
| `PS_PRICE_HISTORY` | `gameName`, `currency` (ISO) | `{ ok, currency, points, stats }` — recorded PS prices for that game and currency; `stats` is `PSEHelpers.psHistoryStats` (`enough` is false below two days) |

## Housekeeping

| Type | Payload | Response |
|------|---------|----------|
| `CHANGELOG_SEEN` | – | `{ ok }` |
| `CACHE_STATS` | – | `{ totalEntries, expiredEntries, activeEntries, sizeKB }` |
| `PURGE_CACHE` / `CLEAR_CACHE` | – | `{ ok }` / `{ ok, removed }` |
| `DIAG_GET` | – | `{ entries: [{ t, s, e, d }] }` — last 120 local diagnostic events (secrets are never recorded) |
| `DIAG_LOG` | `event`, optional `details` | `{ ok }` — a content-script event (feature failed, price not found, "Check this page" result) appended to the local diagnostics log; at most 20 per minute, secrets redacted |
| `DIAG_CLEAR` | – | `{ ok }` |
| `WIPE_ALL_DATA` | – | `{ ok }` — disconnects PSN and erases everything stored locally (settings in sync storage are kept) |

## Messages to the content script

Sent with `chrome.tabs.sendMessage` (not handled by the service worker, so not in `HANDLERS`).

| Type | Payload | Response |
|------|---------|----------|
| `PSE_CHECK_PAGE` | – | `{ ok, result }` — `result` is `PSEStore.selfCheck`: `{ page: "product"\|"listing"\|"other", checks: [{ id, status: "ok"\|"warn"\|"fail", strategy?, detail? }], ok, total }` plus `features: [{ feature, ok, error }]` (features switched off on this page after an error). Used by the popup's **Check this page** button. |
