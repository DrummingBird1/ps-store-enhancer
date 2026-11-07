/**
 * PS Store Enhancer — Background Service Worker
 *
 * Message API reference: .github/MESSAGING.md (a unit test keeps it in sync with HANDLERS below).
 */
// Load order matters: match/helpers/cache/diag first (pure or storage-only), then the modules
// that use them.
// (Chrome service worker. A Firefox-style event page lists the same files in its manifest instead.)
if (typeof importScripts === "function") {
  importScripts("match.js", "helpers.js", "store-adapter.js", "cache.js", "diag.js", "net.js", "cheapshark.js", "psn.js");
}

// webRequest listeners only work for the worker's own requests when they exist from the moment the
// worker starts, so this runs at the top level (it does nothing until the optional permission is granted).
PSN.installRedirectObserver();
PSN.installNoOriginRule();

const PSE_DEFAULTS_SYNC = {
  hideAddons: false, hideDlc: false, hideOwned: false,
  pspricesRegion: "IL", displayCurrency: "USD",
  theme: "auto",
  enableMetacritic: true, enablePriceHistory: true,
  enableTrophies: true, enableCrossPlatform: true,
  enableWishlist: true, enableSearchAutocomplete: true,
  enableSearchShortcut: true, enableTrophyRarity: false,
  digestMode: "instant", cardsCollapsed: false,
  cardOrder: ["priceInsight", "crossPlatform", "trophies"], cardsHidden: []
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ──── Serialized storage writers (read-modify-write must not interleave) ──── */
function makeLock() {
  let tail = Promise.resolve();
  return (fn) => {
    const run = tail.then(fn, fn);
    tail = run.catch(() => {});
    return run;
  };
}
const withWishlistLock = makeLock();
const withSnapshotLock = makeLock();

/* ──── Action icon badge ────
 * Precedence: wishlist deals ready to buy (green count) > unseen changelog (red dot) > clear.
 * Recomputed after anything that could change either signal. */
async function updateBadge() {
  try {
    const d = await chrome.storage.local.get(["wishlist", "pse_changelog_unseen"]);
    const readyCount = (d.wishlist || []).filter((i) => PSEHelpers.isDealReady(i)).length;
    if (readyCount > 0) {
      chrome.action.setBadgeText({ text: readyCount > 99 ? "99+" : String(readyCount) });
      chrome.action.setBadgeBackgroundColor({ color: "#6dc849" });
    } else if (d.pse_changelog_unseen) {
      chrome.action.setBadgeText({ text: "●" });
      chrome.action.setBadgeBackgroundColor({ color: "#ff4040" });
    } else {
      chrome.action.setBadgeText({ text: "" });
    }
  } catch {}
}

chrome.runtime.onStartup.addListener(() => updateBadge());

/* ──── lifecycle ──── */
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    await chrome.storage.sync.set(PSE_DEFAULTS_SYNC);
    await chrome.storage.local.set({ manual_owned: [], psn_owned: [], wishlist: [], pse_tour_pending: true });
    chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") });
  } else if (details.reason === "update") {
    // Backfill any missing defaults without overwriting existing values
    const current = await chrome.storage.sync.get(Object.keys(PSE_DEFAULTS_SYNC));
    const missing = {};
    for (const [k, v] of Object.entries(PSE_DEFAULTS_SYNC)) {
      if (current[k] === undefined) missing[k] = v;
    }
    if (Object.keys(missing).length) await chrome.storage.sync.set(missing);
    // Ensure wishlist storage exists
    const loc = await chrome.storage.local.get(["wishlist"]);
    if (!loc.wishlist) await chrome.storage.local.set({ wishlist: [] });
    // Mark the new version's changelog as unseen on EVERY update (patch included) so it
    // surfaces quietly in the popup / on-store banner; only minor/major bumps also force-open
    // the full changelog tab, to avoid spamming users on every small fix release.
    const prev = details.previousVersion || "";
    const next = chrome.runtime.getManifest().version;
    if (prev && prev !== next) {
      await chrome.storage.local.set({ pse_changelog_unseen: next });
    }
    const isMinorOrMajor = (() => {
      const a = prev.split(".").map(Number);
      const b = next.split(".").map(Number);
      return (a[0] || 0) !== (b[0] || 0) || (a[1] || 0) !== (b[1] || 0);
    })();
    if (isMinorOrMajor && prev) {
      chrome.tabs.create({ url: chrome.runtime.getURL("changelog.html") });
    }
  }
  updateBadge();
  chrome.alarms.create("pse-cache-purge", { periodInMinutes: 360 });
  chrome.alarms.create("pse-psn-sync", { periodInMinutes: 120 });
  chrome.alarms.create("pse-wishlist-check", { periodInMinutes: 24 * 60 });
  chrome.alarms.create("pse-wishlist-digest", { periodInMinutes: 7 * 24 * 60 });
  // Register right-click context menu (idempotent)
  try {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: "pse-find-on-cheapshark",
        title: chrome.i18n.getMessage("ctxMenuFind") || "Find on PS Store Enhancer",
        contexts: ["selection"],
        documentUrlPatterns: ["https://store.playstation.com/*"]
      });
    });
  } catch (e) { console.warn("[PSE/bg] contextMenu setup failed:", e); }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "pse-cache-purge") await PSECache.purgeExpired();
  if (alarm.name === "pse-psn-sync") {
    const s = await PSN.getStatus();
    if (s.connected && s.needsSync) await PSN.fetchLibrary();
  }
  if (alarm.name === "pse-wishlist-check") await checkWishlistPrices();
  if (alarm.name === "pse-wishlist-digest") await sendWishlistDigest();
});

/* ──── context menu click ──── */
chrome.contextMenus.onClicked.addListener((info, _tab) => {
  if (info.menuItemId === "pse-find-on-cheapshark" && info.selectionText) {
    const q = info.selectionText.trim().substring(0, 100);
    if (q.length < 2) return;
    chrome.tabs.create({ url: `https://www.cheapshark.com/browse?title=${encodeURIComponent(q)}` });
  }
});

/* ──── wishlist notification click → open the game's store page ──── */
// notification-id → store URL map lives in storage.session (survives SW restarts,
// cleared when the browser closes).
async function rememberNotifTarget(notifId, url) {
  if (!url) return;
  try {
    const d = await chrome.storage.session.get(["notif_targets"]);
    const map = d.notif_targets || {};
    map[notifId] = url;
    await chrome.storage.session.set({ notif_targets: map });
  } catch {}
}

function isSafeStoreUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === "store.playstation.com";
  } catch { return false; }
}

chrome.notifications.onClicked.addListener(async (notifId) => {
  if (!notifId.startsWith("pse-wl-")) return;
  try {
    const d = await chrome.storage.session.get(["notif_targets"]);
    const map = d.notif_targets || {};
    const url = map[notifId];
    if (url && isSafeStoreUrl(url)) {
      chrome.tabs.create({ url });
    }
    delete map[notifId];
    await chrome.storage.session.set({ notif_targets: map });
  } catch {}
  chrome.notifications.clear(notifId);
});

/* ──── message router ──── */
chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  if (!msg?.type) return false;
  const handler = HANDLERS[msg.type];
  if (!handler) return false;
  Promise.resolve()
    .then(() => handler(msg))
    .then(respond)
    .catch((err) => {
      console.error(`[PSE/bg] handler "${msg.type}" failed:`, err);
      PSEDiag.log("router", "handler-failed", { type: msg.type, message: err?.message });
      respond({ success: false, error: err?.message || String(err) });
    });
  return true;
});

/** Look a game up on CheapShark and record today's real price for the local price trend. */
async function bundleFor(gameName) {
  const b = await CheapShark.lookup(gameName);
  if (b.found && b.cheapest != null) {
    recordSnapshot(`pc_${PSEMatch.titleKey(gameName)}`, b.cheapest).catch(() => {});
  }
  return b;
}

function recordSnapshot(key, price, extra) {
  return withSnapshotLock(async () => {
    const d = await chrome.storage.local.get(["pse_snapshots"]);
    const next = PSEHelpers.addSnapshot(d.pse_snapshots || {}, key, price, Date.now(), undefined, extra);
    await chrome.storage.local.set({ pse_snapshots: next });
  });
}

async function readSnapshots(key) {
  const d = await chrome.storage.local.get(["pse_snapshots"]);
  return (d.pse_snapshots && d.pse_snapshots[key] && d.pse_snapshots[key].p) || [];
}

/** A PS Store price reported by the page, or undefined when it isn't a sane { amount, currency }. */
function validPsPrice(p) {
  const amount = Number(p && p.amount);
  const currency = String((p && p.currency) || "").toUpperCase();
  if (!(amount > 0) || !/^[A-Z]{3}$/.test(currency) || !PSEHelpers.isPlausiblePrice(amount, currency)) return undefined;
  return { amount, currency, seenAt: Date.now() };
}

/** A game's store page address without query string or fragment, or null when it is not a store.playstation.com page. */
function cleanStoreUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || u.hostname !== "store.playstation.com") return null;
    return `https://store.playstation.com${u.pathname}`;
  } catch {
    return null;
  }
}

const HANDLERS = {
  FETCH_CROSS_PLATFORM: async (m) => {
    if (!m.gameName) return { success: false, error: "No game name" };
    const b = await bundleFor(m.gameName);
    if (!b.found) return { success: true, data: { found: false } };
    return { success: true, fromCache: !!b.fromCache, data: { found: true, title: b.title, edition: b.edition, deals: b.deals } };
  },
  FETCH_REVIEW_SCORES: async (m) => {
    if (!m.gameName) return { success: false };
    const b = await bundleFor(m.gameName);
    if (!b.found) return { success: true, data: { found: false } };
    return { success: true, fromCache: !!b.fromCache, data: { found: true, title: b.title, ...b.ratings } };
  },
  FETCH_PRICE_INSIGHT: async (m) => {
    if (!m.gameName) return { success: false };
    const b = await bundleFor(m.gameName);
    if (!b.found) return { success: true, data: { found: false } };
    const key = `pc_${PSEMatch.titleKey(m.gameName)}`;
    await withSnapshotLock(async () => {}); // let the snapshot write from bundleFor land first
    const points = await readSnapshots(key);
    return {
      success: true,
      fromCache: !!b.fromCache,
      data: {
        found: true,
        title: b.title,
        edition: b.edition,
        cheapest: b.cheapest,
        cheapestStore: b.cheapestStore,
        cheapestEver: b.cheapestEver,
        low: PSEHelpers.lowStatus(b.cheapest, b.cheapestEver && b.cheapestEver.price),
        trend: PSEHelpers.trendFromSnapshots(points, Date.now(), 30),
        points
      }
    };
  },
  FETCH_PSN_TROPHY: (m) => handlePsnTrophy(m.gameName),
  FETCH_TROPHY_RARITY: (m) => handleTrophyRarity(m.gameName),
  FETCH_SEARCH_SUGGESTIONS: (m) => handleSearchSuggestions(m.query),
  CHANGELOG_SEEN: async () => {
    await chrome.storage.local.remove("pse_changelog_unseen");
    updateBadge();
    return { ok: true };
  },
  GET_MERGED_OWNED: () => PSN.getMergedOwned().then((list) => ({ list })),
  PURGE_CACHE: () => PSECache.purgeExpired().then(() => ({ ok: true })),
  CLEAR_CACHE: () => PSECache.clearAll().then((n) => ({ ok: true, removed: n })),
  CACHE_STATS: () => PSECache.getStats(),
  PSN_AUTHENTICATE: (m) => PSN.authenticate(m.npsso),
  PSN_AUTO_DETECT: () => PSN.tryAutoDetectNpsso(),
  PSN_FETCH_LIBRARY: () => PSN.fetchLibrary(),
  PSN_STATUS: () => PSN.getStatus(),
  PSN_DISCONNECT: () => PSN.disconnect(),
  ADD_MANUAL_OWNED: async (m) => {
    const d = await chrome.storage.local.get(["manual_owned"]);
    const list = d.manual_owned || [];
    const name = (m.gameName || "").trim();
    if (!name) return { ok: false };
    if (!list.some((g) => PSEMatch.sameGame(g, name))) {
      list.push(name);
      list.sort((a, b) => a.localeCompare(b));
      await chrome.storage.local.set({ manual_owned: list });
    }
    return { ok: true, list };
  },
  REMOVE_MANUAL_OWNED: async (m) => {
    const d = await chrome.storage.local.get(["manual_owned"]);
    const list = (d.manual_owned || []).filter((g) => !PSEMatch.sameGame(g, m.gameName || ""));
    await chrome.storage.local.set({ manual_owned: list });
    return { ok: true, list };
  },
  IS_GAME_OWNED: async (m) => {
    const merged = await PSN.getMergedOwned();
    return { owned: merged.some((g) => PSEMatch.sameGame(g, m.gameName || "")) };
  },

  /* ──── Wishlist ──── */
  ADD_WISHLIST: (m) =>
    withWishlistLock(async () => {
      const name = (m.gameName || "").trim();
      if (!name) return { ok: false };
      const d = await chrome.storage.local.get(["wishlist"]);
      const list = d.wishlist || [];
      if (list.some((g) => PSEMatch.sameGame(g.name, name))) {
        return { ok: false, error: "wishlistAlreadyAdded", list };
      }
      let current = null;
      try {
        const b = await bundleFor(name);
        if (b.found) current = { price: b.cheapest, savings: b.deals[0] ? b.deals[0].savings : null, store: b.cheapestStore };
      } catch {}
      list.push({
        name,
        storeUrl: cleanStoreUrl(m.storeUrl),
        addedAt: Date.now(),
        targetPrice: m.targetPrice != null ? Number(m.targetPrice) : null,
        targetPercent: m.targetPercent != null ? Number(m.targetPercent) : null,
        note: "",
        psPrice: validPsPrice(m.psPrice),
        lastCheckedPrice: current ? current.price : null,
        lastSavings: current ? current.savings : null,
        lastCheapestStore: current ? current.store : null,
        lastCheckedAt: Date.now(),
        notified: false
      });
      await chrome.storage.local.set({ wishlist: list });
      updateBadge();
      return { ok: true, list, currentPrice: current ? current.price : null };
    }),
  REMOVE_WISHLIST: (m) =>
    withWishlistLock(async () => {
      const d = await chrome.storage.local.get(["wishlist"]);
      const list = (d.wishlist || []).filter((g) => !PSEMatch.sameGame(g.name, m.gameName || ""));
      await chrome.storage.local.set({ wishlist: list });
      updateBadge();
      return { ok: true, list };
    }),
  GET_WISHLIST: async () => {
    const d = await chrome.storage.local.get(["wishlist"]);
    return { list: d.wishlist || [] };
  },
  SET_WISHLIST_TARGET: (m) =>
    withWishlistLock(async () => {
      const d = await chrome.storage.local.get(["wishlist"]);
      const list = d.wishlist || [];
      const item = list.find((g) => PSEMatch.sameGame(g.name, m.gameName || ""));
      if (!item) return { ok: false };
      if ("targetPrice" in m) item.targetPrice = m.targetPrice != null ? Number(m.targetPrice) : null;
      if ("targetPercent" in m) item.targetPercent = m.targetPercent != null ? Number(m.targetPercent) : null;
      if ("note" in m) item.note = String(m.note || "").slice(0, 200);
      item.notified = false;
      item.digestPending = false;
      await chrome.storage.local.set({ wishlist: list });
      updateBadge();
      return { ok: true, list };
    }),
  IS_IN_WISHLIST: async (m) => {
    const d = await chrome.storage.local.get(["wishlist"]);
    return { inWishlist: (d.wishlist || []).some((g) => PSEMatch.sameGame(g.name, m.gameName || "")) };
  },
  CHECK_WISHLIST_NOW: async () => { await checkWishlistPrices(); return { ok: true }; },
  RECORD_PS_PRICE: (m) => handleRecordPsPrice(m),
  RECORD_PS_PRICES: (m) => handleRecordPsPrices(m),
  MERGE_SNAPSHOTS: async (m) => {
    // A backup's recorded prices, validated and merged without ever pushing local games out
    let games = 0;
    await withSnapshotLock(async () => {
      const d = await chrome.storage.local.get(["pse_snapshots"]);
      const next = PSEHelpers.mergeSnapshots(d.pse_snapshots || {}, m.snapshots);
      games = Object.keys(next).length;
      await chrome.storage.local.set({ pse_snapshots: next });
    });
    return { ok: true, games };
  },
  PS_PRICE_HISTORY: async (m) => {
    const currency = String(m.currency || "").toUpperCase();
    if (!m.gameName || !/^[A-Z]{3}$/.test(currency)) return { ok: false };
    await withSnapshotLock(async () => {}); // let a price recorded just now land first
    const points = await readSnapshots(`ps_${currency}_${PSEMatch.titleKey(m.gameName)}`);
    return { ok: true, currency, points, stats: PSEHelpers.psHistoryStats(points, Date.now()) };
  },

  /* ──── Currency conversion (Frankfurter) ──── */
  GET_RATES: async (m) => {
    const target = (m.target || "USD").toUpperCase();
    if (target === "USD") return { ok: true, base: "USD", rates: { USD: 1 }, fromCache: false };
    return getExchangeRates(target);
  },

  /* ──── Diagnostics & privacy ──── */
  DIAG_LOG: async (m) => {
    // From the content script: feature failures and "lookup not found" events. Rate-limited so a
    // broken page cannot flood the log; PSEDiag redacts anything secret-looking.
    if (!allowContentDiag()) return { ok: false };
    await PSEDiag.log("content", String(m.event || "event").slice(0, 40), m.details);
    return { ok: true };
  },
  DIAG_GET: async () => ({ entries: await PSEDiag.get() }),
  DIAG_CLEAR: async () => { await PSEDiag.clear(); return { ok: true }; },
  WIPE_ALL_DATA: async () => {
    await PSN.disconnect();
    await PSEDiag.flush(); // pending log writes must not resurrect data after the clear
    await PSENet.flush();
    await chrome.storage.local.clear();
    try { await chrome.storage.session.clear(); } catch {}
    await chrome.storage.local.set({ manual_owned: [], psn_owned: [], wishlist: [] });
    updateBadge();
    return { ok: true };
  }
};

/* ──── Wishlist price checker ──── */
async function notifyDeal(item, prevPrice) {
  try {
    const notifId = `pse-wl-${PSEMatch.slugify(item.name)}-${Date.now()}`;
    const price = item.lastCheckedPrice;
    const usedPercent = item.targetPercent != null && item.lastSavings != null && item.lastSavings >= item.targetPercent;
    const oldShow = prevPrice != null && prevPrice > price ? prevPrice : item.targetPrice != null ? item.targetPrice : price;
    const message = usedPercent
      ? chrome.i18n.getMessage("wishlistPercentDropBody", [item.name, String(Math.round(item.lastSavings)), `$${price.toFixed(2)}`])
      : chrome.i18n.getMessage("wishlistPriceDropBody", [item.name, `$${price.toFixed(2)}`, `$${oldShow.toFixed(2)}`]);
    await chrome.notifications.create(notifId, {
      type: "basic",
      iconUrl: chrome.runtime.getURL("icons/icon128.png"),
      title: chrome.i18n.getMessage("wishlistPriceDropTitle") || "Price drop alert!",
      message: (message || `${item.name} is now $${price.toFixed(2)}`).substring(0, 200)
    });
    await rememberNotifTarget(notifId, item.storeUrl);
    return true;
  } catch (e) {
    console.warn("[PSE] notification failed:", e);
    return false;
  }
}

async function checkWishlistPrices() {
  const snapshot = (await chrome.storage.local.get(["wishlist"])).wishlist || [];
  if (!snapshot.length) return;

  // 1) Network phase — no storage writes, so edits made meanwhile are never overwritten.
  const found = new Map();
  for (const item of snapshot) {
    try {
      const b = await bundleFor(item.name);
      if (b.found && b.cheapest != null) {
        found.set(PSEMatch.titleKey(item.name), {
          price: b.cheapest,
          savings: b.deals[0] ? b.deals[0].savings : null,
          store: b.cheapestStore
        });
      }
    } catch (e) {
      PSEDiag.log("wishlist", "check-failed", { message: e && e.message });
    }
    await sleep(150);
  }

  // 1b) Once a day, read the saved store page of each wishlisted game and record its PS price.
  await refreshWishlistPsPrices(snapshot);

  // 2) Merge phase — re-read the CURRENT list and apply results by name.
  await withWishlistLock(async () => {
    const list = (await chrome.storage.local.get(["wishlist"])).wishlist || [];
    const mode = (await chrome.storage.sync.get(["digestMode"])).digestMode || "instant";
    for (const item of list) {
      const r = found.get(PSEMatch.titleKey(item.name));
      if (!r) continue;
      const prevPrice = item.lastCheckedPrice;
      item.lastCheckedPrice = r.price;
      item.lastSavings = r.savings;
      item.lastCheapestStore = r.store;
      item.lastCheckedAt = Date.now();
      const ready = PSEHelpers.isDealReady(item);
      if (ready && !item.notified) {
        if (mode === "weekly") {
          item.digestPending = true;
          item.notified = true;
        } else if (await notifyDeal(item, prevPrice)) {
          item.notified = true;
        }
      } else if (!ready) {
        item.notified = false; // re-arm
        item.digestPending = false;
      }
    }
    await chrome.storage.local.set({ wishlist: list });
  });
  updateBadge();
}

/**
 * The wishlist already stores each game's store URL. Fetch that page (no cookies, the region is in the
 * URL) and read the JSON-LD price, at most 20 pages per daily run, 400 ms apart. A page that names a
 * different game (redirect, wrong region) is ignored.
 */
async function refreshWishlistPsPrices(items) {
  try {
    const s = await chrome.storage.sync.get(["enablePriceHistory"]);
    if (s.enablePriceHistory === false) return;
  } catch {
    return;
  }
  // Once a day however often the check runs ("Check now" included); a cursor makes long lists take turns.
  const state = (await chrome.storage.local.get(["pse_ps_refresh"])).pse_ps_refresh || {};
  if (Date.now() - (Number(state.at) || 0) < 20 * 3600000) return;
  const candidates = items.filter((i) => i.storeUrl && isSafeStoreUrl(i.storeUrl));
  if (!candidates.length) return;
  const start = (Number(state.cursor) || 0) % candidates.length;
  const batch = Array.from({ length: Math.min(20, candidates.length) }, (_, k) => candidates[(start + k) % candidates.length]);
  await chrome.storage.local.set({ pse_ps_refresh: { at: Date.now(), cursor: (start + batch.length) % candidates.length } });
  let failures = 0;
  for (const item of batch) {
    await sleep(400); // every request is spaced, whatever happens to the previous one
    if (failures >= 3) break; // the store is refusing us: stop instead of hammering it
    try {
      const resp = await PSENet.fetch(item.storeUrl, { credentials: "omit", redirect: "follow" });
      if (!resp.ok) {
        failures++;
        PSEDiag.log("wishlist", "ps-page-http-error", { status: resp.status });
        continue;
      }
      let host = "";
      try { host = new URL(resp.url || item.storeUrl).hostname; } catch {}
      if (host !== "store.playstation.com") continue;
      failures = 0;
      const ld = PSEStore.readJsonLdFromHtml(await resp.text());
      if (!ld || ld.amount == null) continue;
      if (ld.name && PSEStore.normalizeName(ld.name) !== PSEStore.normalizeName(item.name)) continue;
      await handleRecordPsPrice({ gameName: item.name, amount: ld.amount, currency: ld.currency });
    } catch (e) {
      failures++;
      PSEDiag.log("wishlist", "ps-page-failed", { message: e && e.message });
    }
  }
}

async function sendWishlistDigest() {
  await withWishlistLock(async () => {
    const list = (await chrome.storage.local.get(["wishlist"])).wishlist || [];
    const ready = list.filter((i) => i.digestPending && PSEHelpers.isDealReady(i));
    if (!ready.length) return;
    try {
      const names = ready.slice(0, 3).map((i) => i.name).join(", ");
      await chrome.notifications.create(`pse-wl-digest-${Date.now()}`, {
        type: "basic",
        iconUrl: chrome.runtime.getURL("icons/icon128.png"),
        title: chrome.i18n.getMessage("wishlistDigestTitle") || "Weekly wishlist digest",
        message: (chrome.i18n.getMessage("wishlistDigestBody", [String(ready.length), names]) || `${ready.length}: ${names}`).substring(0, 200)
      });
    } catch (e) { console.warn("[PSE] digest notification failed:", e); }
    for (const i of ready) i.digestPending = false;
    await chrome.storage.local.set({ wishlist: list });
  });
}

/* ──── PS Store price seen on the page (recorded by the content script) ──── */
const diagBudget = { windowStart: 0, used: 0 };
function allowContentDiag() {
  const now = Date.now();
  if (now - diagBudget.windowStart > 60000) {
    diagBudget.windowStart = now;
    diagBudget.used = 0;
  }
  return ++diagBudget.used <= 20;
}

/** The optional sale details of a recorded price, each kept only when it is sane. */
function psExtras(m, amount, currency) {
  const today = PSEHelpers.dayNumber(Date.now());
  const orig = Number(m.orig);
  const pct = Number(m.pct);
  const ends = Number(m.ends);
  const plus = Number(m.plus);
  return {
    orig: orig > amount && PSEHelpers.isPlausiblePrice(orig, currency) ? orig : null,
    pct: pct >= 1 && pct <= 100 ? Math.round(pct) : null,
    ends: Number.isInteger(ends) && ends >= today - 1 && ends <= today + 3 * 365 ? ends : null,
    plus: plus > 0 && PSEHelpers.isPlausiblePrice(plus, currency) ? plus : null
  };
}

/**
 * Prices read from a listing page (search, category). Only games whose history already exists or that
 * are on the wishlist get a point, so browsing search results never pushes the games you track out of
 * the capped store.
 */
async function handleRecordPsPrices(m) {
  const items = Array.isArray(m.items) ? m.items.slice(0, 60) : [];
  if (!items.length) return { ok: true, recorded: 0 };
  const wishlist = (await chrome.storage.local.get(["wishlist"])).wishlist || [];
  const wished = new Set(wishlist.map((g) => PSEMatch.titleKey(g.name)));
  let recorded = 0;
  await withSnapshotLock(async () => {
    const d = await chrome.storage.local.get(["pse_snapshots"]);
    let snaps = d.pse_snapshots || {};
    const ts = Date.now();
    for (const it of items) {
      const amount = Number(it && it.amount);
      const currency = String((it && it.currency) || "").toUpperCase();
      if (!it || !it.gameName || !/^[A-Z]{3}$/.test(currency) || !PSEHelpers.isPlausiblePrice(amount, currency)) continue;
      const tk = PSEMatch.titleKey(it.gameName);
      const key = `ps_${currency}_${tk}`;
      if (!snaps[key] && !wished.has(tk)) continue;
      snaps = PSEHelpers.addSnapshot(snaps, key, amount, ts, undefined, psExtras(it, amount, currency));
      recorded++;
    }
    if (recorded) await chrome.storage.local.set({ pse_snapshots: snaps });
  });
  return { ok: true, recorded };
}

async function handleRecordPsPrice(m) {
  const amount = Number(m.amount);
  const currency = String(m.currency || "").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency) || !PSEHelpers.isPlausiblePrice(amount, currency) || !m.gameName) return { ok: false };
  const key = `ps_${currency}_${PSEMatch.titleKey(m.gameName)}`;
  await recordSnapshot(key, amount, psExtras(m, amount, currency));
  await withWishlistLock(async () => {
    const d = await chrome.storage.local.get(["wishlist"]);
    const list = d.wishlist || [];
    const item = list.find((g) => PSEMatch.sameGame(g.name, m.gameName));
    if (!item) return;
    item.psPrice = { amount, currency, seenAt: Date.now() };
    await chrome.storage.local.set({ wishlist: list });
  });
  return { ok: true };
}

/* ──── Currency conversion via Frankfurter ──── */
async function getExchangeRates(target) {
  const ck = `fx_USD_${target}`;
  const cached = await PSECache.get(ck);
  if (cached) return { ok: true, base: "USD", rates: cached, fromCache: true };
  try {
    const resp = await PSENet.fetch(`https://api.frankfurter.dev/v1/latest?base=USD&symbols=${target}`);
    if (!resp.ok) throw new Error(`Frankfurter ${resp.status}`);
    const data = await resp.json();
    if (!data.rates || data.rates[target] == null) throw new Error("Missing rate");
    const rates = { USD: 1, [target]: data.rates[target] };
    await PSECache.set(ck, rates, 24 * 3600000); // 24h TTL
    return { ok: true, base: "USD", rates, fromCache: false };
  } catch (err) {
    PSEDiag.log("frankfurter", "failed", { message: err && err.message });
    return { ok: false, error: err.message };
  }
}

/* ──── PSN trophy data ──── */
async function handlePsnTrophy(gameName) {
  if (!gameName) return { success: false };
  const ck = `psn_trophy_${PSEMatch.titleKey(gameName)}`;
  const cached = await PSECache.get(ck);
  if (cached) return { success: true, data: cached, fromCache: true };

  const data = await PSN.fetchTrophyInfo(gameName);
  if (data) {
    await PSECache.set(ck, data, PSECache.TTL.TROPHY);
    return { success: true, data, fromCache: false };
  }
  return { success: false };
}

/* Experimental (setting enableTrophyRarity, off by default). */
async function handleTrophyRarity(gameName) {
  const s = await chrome.storage.sync.get(["enableTrophyRarity"]);
  if (!s.enableTrophyRarity) return { success: false, error: "disabled" };
  const trophy = await handlePsnTrophy(gameName);
  if (!trophy.success || !trophy.data.npCommunicationId) return { success: false };
  const ck = `psn_rarity_${trophy.data.npCommunicationId}`;
  const cached = await PSECache.get(ck);
  if (cached) return { success: true, data: cached, fromCache: true };
  const data = await PSN.fetchTrophyRarity(trophy.data.npCommunicationId, trophy.data.npServiceName);
  if (!data) return { success: false };
  await PSECache.set(ck, data, 24 * 3600000);
  return { success: true, data };
}

/* ──── Live search-box suggestions ──── */
async function handleSearchSuggestions(query) {
  const q = (query || "").trim();
  if (q.length < 2) return { success: true, data: [] };
  const ck = `search_suggest_${PSEMatch.titleKey(q)}`;
  const cached = await PSECache.get(ck);
  if (cached) return { success: true, data: cached, fromCache: true };
  try {
    const results = await CheapShark.suggestions(q);
    await PSECache.set(ck, results, PSECache.TTL.SEARCH_SUGGEST);
    return { success: true, data: results, fromCache: false };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
