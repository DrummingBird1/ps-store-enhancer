# GameDeals+ — Manual Test Plan

A pre-release checklist. Run through this before publishing each new version to the Chrome Web Store. Each box should be ticked in a clean Chrome profile with the unpacked extension loaded.

## Setup

1. Open `chrome://extensions`
2. Toggle **Developer mode** on
3. Click **Load unpacked** → select `extension/`
4. Confirm the extension icon appears in the toolbar

---

## Core (no PSN account needed)

### Product page injection

Visit any product page, e.g. https://store.playstation.com/en-us/concept/10000091 (God of War Ragnarök).

- [ ] OpenCritic / Metacritic **score badge** appears next to the game title
- [ ] **Price history card** appears below the title with a sparkline + "Estimated history" tag
- [ ] **Cross-platform comparison** table shows Steam/Epic/GOG prices
- [ ] **Trophy info card** shows platinum/difficulty/hours/playthroughs (use a known game like Elden Ring)
- [ ] **"Mark as owned"** button appears
- [ ] **"⭐ Add to Wishlist"** button appears (v2.3+)
- [ ] All cards animate in smoothly (no layout shift)

### Theme + currency + locale (v2.3+)

- [ ] Open options → set theme to **Light** → reload product page → cards are light
- [ ] Open options → set currency to **EUR** → cross-platform card shows EUR amounts + "EUR (≈USD)" tag
- [ ] Open options → set language to **Hebrew** → injected cards flip RTL; options page text is Hebrew
- [ ] Open options → set language back to **Auto**

### Wishlist flow (v2.3+)

- [ ] Click "⭐ Add to Wishlist" on a product page → button changes to "★ On Wishlist (click to remove)"
- [ ] Open options → Wishlist card → the game appears with target-price input
- [ ] Set a target price below the current price → wait ~24h OR open DevTools console on the background service worker and run `chrome.runtime.sendMessage({type:"CHECK_WISHLIST_NOW"})` → a desktop notification fires
- [ ] Click "★ On Wishlist" again on the product page → button reverts to "Add to Wishlist"

### Right-click context menu (v2.3+)

- [ ] Highlight any text on a PS Store page → right-click → **"Find on GameDeals+ price compare"** appears
- [ ] Click it → new tab opens to CheapShark with the highlighted text as query

### Auto-detect region (v2.3+)

- [ ] Clear extension storage (Options → Cache → Clear all + uninstall/reinstall)
- [ ] Visit https://store.playstation.com/de-de/... (German store) once
- [ ] Open options → PSPrices Region should be **Germany** (DE)

### Search filters

- [ ] Visit https://store.playstation.com/en-us/category/3f772501-f6f8-49b7-abac-874a88ca4897 (Games)
- [ ] Open popup → toggle "Hide Add-ons & Currency" → currency packs disappear
- [ ] Toggle "Hide DLC & Expansions" → DLC items disappear
- [ ] Toggle "Hide games I already own" → previously marked-as-owned games disappear

### Export / import (v2.3+)

- [ ] Mark a few games as owned (via product pages or options)
- [ ] Options → **Export JSON** → file downloads named `gamedeals-plus-backup-YYYY-MM-DD.json`
- [ ] Clear list (delete all manual entries)
- [ ] Options → **Import JSON** → select the just-downloaded file → games reappear in the list

### Popup & navigation

- [ ] Click extension icon → popup opens with 3 filter toggles + PSN status
- [ ] Click "Advanced settings" → options page opens in a new tab
- [ ] Click "What's new" link → changelog page opens

---

## Optional: PSN integration (requires PSN account)

Skip if you don't have a PSN account. **Reviewers should skip this.**

- [ ] Options → PSN card → click **Auto-detect** while signed into PSN in another tab → token found and library syncs
- [ ] After sync, **Mark as owned** filter hides games from the synced library
- [ ] Trophy info on a game from your library shows live progress %
- [ ] Disconnect PSN → manually-added games (✏️) are preserved; PSN-synced games (🔗) are removed

---

## Regression checks

After each version bump, re-test these "previously broken" paths:

- [ ] Hebrew/Arabic users see correctly-aligned RTL cards (was hardcoded RTL for everyone in v2.1)
- [ ] Trophy box does NOT appear for games NOT in TROPHY_DB and without PSN data (was showing fake defaults in v2.1)
- [ ] PSN trophy lookup finds games beyond the first 50 in user's library (was capped at 50 in v2.1)
- [ ] CheapShark errors don't break the page silently — shows "Service temporarily unavailable" notice
- [ ] Avatar URL injection uses DOM API, not innerHTML (was XSS-vulnerable in v2.1)

---

## Release checklist

Once all the above passes:

- [ ] Bump version in `manifest.json`, `popup.html`, `README.md`, `extension/README.md`
- [ ] Run `python build-zips.py` (or push a `v2.x.y` tag if GitHub Actions release workflow is set up)
- [ ] Verify `GameDeals-Plus-Extension.zip` loads cleanly in `chrome://extensions`
- [ ] Update `STORE-LISTING.txt` short description + detailed description if features changed
- [ ] Update `REVIEWER-NOTES.md` if permissions changed
- [ ] Submit to Chrome Web Store
