# Notes for Chrome Web Store Reviewer

Copy/paste the block below into the **"Notes for reviewer"** field in the Chrome Web Store Developer Dashboard (Privacy practices tab → Permissions justification → there's a "Notes" field at the bottom of the page, or under "Account → Notes for review").

---

## How to fully test PS Store Enhancer (formerly GameDeals+)

### Quick test (no account needed — covers ~90% of functionality)

1. Install the extension.
2. Open https://store.playstation.com (any region).
3. Navigate to any game page, e.g. https://store.playstation.com/en-us/concept/10000091 (God of War Ragnarök).
4. Verify on the product page:
   - **Metacritic (PC) and Steam rating badges** appear next to the game title (colored: green/yellow/red) when CheapShark has scores for the game.
   - **Price Insight card** is injected below the title: the lowest PC price ever (with its date) and today's cheapest, both from CheapShark. It contains no estimated or generated data.
   - **Cross-platform comparison** table appears showing Steam/Epic/GOG prices for the exact game (USD, fetched from the CheapShark API, converted to the chosen currency).
   - **Trophy / completionist info** card appears for known titles (difficulty, hours, playthroughs).
   - **"Mark as owned" button** is visible.
5. Open the extension popup → toggle "Hide DLC & Expansions" → reload the page → DLC items in search are hidden.
6. Open the extension options page → verify the settings panel loads in your browser language.

All of the above works **without any account or sign-in**.

### Optional: PSN Library Sync (Advanced — not required for review)

The PSN integration is an **opt-in advanced feature**, clearly labeled "Optional" throughout the UI. **Reviewers do NOT need to test this** to verify the extension works.

If you want to test it, it requires:
1. An active Sony PlayStation Network account.
2. Manually obtaining an NPSSO token by signing in to PSN and visiting `https://ca.account.sony.com/api/v1/ssocookie`.
3. Pasting that 64-character token into the extension's settings.

If you enter an invalid/expired NPSSO, the extension shows a friendly error:
> "Could not connect to PSN. Make sure your NPSSO token is fresh (they expire after ~60 days). All other extension features still work normally."

This error is **expected behavior** when no valid PSN session exists — it is NOT a broken feature.

### Why we use `cookies` permission

We use `chrome.cookies` solely to set the NPSSO token on `ca.account.sony.com` (Sony's own auth endpoint) so that Sony's OAuth code-exchange API can read it. This is the standard authentication method used by Sony's official PlayStation App, because Sony does not expose a public OAuth client for third-party apps. The token never leaves the user's device except to Sony's own endpoints. We do not read or transmit any other cookies.

**App identity (v2.7.1):** Sony offers no client registration for third-party extensions, so the sign-in and token requests are made with the same public OAuth client identifiers that Sony's own PlayStation mobile app uses — the identifiers published by the open-source [psn-api](https://github.com/achievements-app/psn-api) project (MIT). They identify the app, not the user, and no user credential is embedded in the extension. Versions up to 2.7.0 used a wrong client id and could never complete the sign-in; v2.7.1 fixes that.

### Why we use these host permissions

| Host | Use |
|------|-----|
| `store.playstation.com` | Content-script injection (UI enhancements on product pages). Also, once a day, the service worker fetches the saved page URL of each wishlisted game (no cookies, at most 20 pages, `credentials: omit`) and reads the price from its JSON-LD to record it locally. Turned off with the *Price insight* setting. |
| `ca.account.sony.com` | Optional PSN OAuth authorization (only when user opts in) |
| `m.np.playstation.com` | Optional PSN library/trophy API (only when user opts in) |
| `cheapshark.com` | Public REST API for cross-platform game prices, the all-time low and Metacritic/Steam ratings (no auth) |
| `api.frankfurter.dev` | Daily currency exchange rates (no auth, public ECB-backed API) |

### Optional permission: `webRequest` (new in v2.7)

Declared under `optional_permissions`, so it is **not granted at install and triggers no install warning**. It is requested at runtime, from the **Connect** button click, when a user connects PSN, because Chrome hides Sony's sign-in redirect from extensions (`fetch(..., {redirect: "manual"})` returns an opaque response). When granted, non-blocking `onHeadersReceived` and `onBeforeRedirect` listeners restricted to `https://ca.account.sony.com/*` read the authorization code from that one redirect (the `Location` header of Sony's response). Chrome only delivers these events for the service worker's own requests to listeners that exist when the worker starts, so the listeners are attached at start-up (and when the permission is granted); they ignore everything except the extension's own request (`tabId` -1) while a PSN connect is running, keep the code in memory only until the connect ends, and never log it. Reviewers do not need to exercise it.

### Permission: `declarativeNetRequestWithHostAccess` (new in v3.0.0)

Chrome shows no install warning for this permission (it only works on hosts the extension already has access to). It is used for exactly one session rule: remove the `Origin` request header from the extension's own (non-tab) POST requests to `https://ca.account.sony.com/api/authz/v3/oauth/token`. Sony's token endpoint answers 403 to any request that carries the extension's `Origin: chrome-extension://…` header and works without it (this is how Sony's own PlayStation app and the open-source psn-api client call it), and `fetch()` does not let a script omit that header. The rule blocks nothing, redirects nothing and changes no other header or URL. It is only used when a user connects PSN or when the saved sign-in is refreshed.

Also new in v2.7: the PSN sign-in now **restores the user's previous `npsso` cookie** after every attempt (it used to leave the pasted token behind).

### Why we use `storage` and `alarms`

- **`storage`** — everything the extension remembers stays on the device: settings, the owned-games list, the wishlist, cached API answers, locally recorded prices, and the diagnostics and network logs (host and path only). Nothing is synced to a server of ours.
- **`alarms`** — three background timers: the PSN library sync (every 2 hours, only when PSN is connected), expired-cache cleanup (every 6 hours) and the daily wishlist price check. No data leaves the device because of them.

### Why we added `notifications` and `contextMenus` (new in v2.3)

- **`notifications`** — used solely by the Wishlist feature: when a user adds a game to their wishlist with a target price, a once-daily background alarm checks the cross-platform cheapest price via CheapShark. If it has dropped below the target, a single local desktop notification is fired. No remote push, no analytics, no third-party services.
- **`contextMenus`** — adds a single right-click menu item ("Find on PS Store Enhancer price compare") that only appears on `store.playstation.com` and only when text is selected. Selecting it opens CheapShark with the selected text as a search query.

### Bundled font, `web_accessible_resources`, "Report a problem" (v3.0.0)

- **Font.** Rubik (SIL Open Font License 1.1, licence text in `fonts/OFL.txt`) ships inside the package as five
  `woff2` subsets (about 110 KB). The pages load them with `fonts.css`; the cards on store pages load them with
  `fonts-content.css`, which names the files by the extension's own URL and needs `fonts/*.woff2` in
  `web_accessible_resources` for `https://store.playstation.com/*` (the existing entry for `styles.css`,
  `data/trophies.json` and the locale files). No font or other resource is requested from a server.
- **Report a problem.** A button in the popup and in Settings → Diagnostics. On a click it copies the version, the
  browser string and the local diagnostics log (tokens and codes are redacted when written) to the clipboard and
  opens `https://github.com/DrummingBird1/ps-store-enhancer/issues/new?template=bug_report.yml` in a new tab. The
  user pastes the text into the form; nothing from the log is put in the address and nothing is sent by the extension.

### Single purpose

The extension's single purpose is enhancing the PlayStation Store website with price intelligence, review scores, trophy information, and search filters to help users make informed purchasing decisions. (Wishlist alerts, the share link, collapsible cards and the diagnostics log all serve that same purpose; none sends user data anywhere.)

### Compliance summary

- ✅ Manifest V3
- ✅ No remote code execution (no `eval`, no `Function()`, no external script injection)
- ✅ No analytics, no tracking, no user data sent to third parties
- ✅ All user data stored locally via `chrome.storage`
- ✅ Privacy policy hosted at: <YOUR-PRIVACY-POLICY-URL>
- ✅ All declared permissions are actually used in the code
- ✅ Source code available on request

Thank you for reviewing!
