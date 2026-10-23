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
| `store.playstation.com` | Content-script injection (UI enhancements on product pages) |
| `ca.account.sony.com` | Optional PSN OAuth authorization (only when user opts in) |
| `m.np.playstation.com` | Optional PSN library/trophy API (only when user opts in) |
| `cheapshark.com` | Public REST API for cross-platform game prices, the all-time low and Metacritic/Steam ratings (no auth) |
| `api.frankfurter.dev` | Daily currency exchange rates (no auth, public ECB-backed API) |

### Optional permission: `webRequest` (new in v2.7)

Declared under `optional_permissions`, so it is **not granted at install and triggers no install warning**. It is requested at runtime, from the **Connect** button click, when a user connects PSN, because Chrome hides Sony's sign-in redirect from extensions (`fetch(..., {redirect: "manual"})` returns an opaque response). When granted, non-blocking `onHeadersReceived` and `onBeforeRedirect` listeners restricted to `https://ca.account.sony.com/*` read the authorization code from that one redirect (the `Location` header of Sony's response), and are removed again right after. Reviewers do not need to exercise it.

Also new in v2.7: the PSN sign-in now **restores the user's previous `npsso` cookie** after every attempt (it used to leave the pasted token behind).

### Why we added `notifications` and `contextMenus` (new in v2.3)

- **`notifications`** — used solely by the Wishlist feature: when a user adds a game to their wishlist with a target price, a once-daily background alarm checks the cross-platform cheapest price via CheapShark. If it has dropped below the target, a single local desktop notification is fired. No remote push, no analytics, no third-party services.
- **`contextMenus`** — adds a single right-click menu item ("Find on PS Store Enhancer price compare") that only appears on `store.playstation.com` and only when text is selected. Selecting it opens CheapShark with the selected text as a search query.

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
