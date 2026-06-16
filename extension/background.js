/**
 * GameDeals+ for PS Store — Background Service Worker (v2.3)
 */
// match.js must load first — it defines slugify/fuzzyMatch/computeBasePrice/classifyTitle
// used by both background.js and psn.js.
importScripts("match.js", "cache.js", "psn.js");

const PSE_DEFAULTS_SYNC = {
  hideAddons: false, hideDlc: false, hideOwned: false,
  pspricesRegion: "IL", displayCurrency: "USD",
  theme: "auto",
  enableMetacritic: true, enablePriceHistory: true,
  enableTrophies: true, enableCrossPlatform: true,
  enableWishlist: true
};

/* ──── lifecycle ──── */
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    await chrome.storage.sync.set(PSE_DEFAULTS_SYNC);
    await chrome.storage.local.set({ manual_owned: [], psn_owned: [], wishlist: [] });
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
    // Show "What's New" — only for minor/major bumps (not patch), to avoid spamming on every fix release
    const prev = details.previousVersion || "";
    const next = chrome.runtime.getManifest().version;
    const isMinorOrMajor = (() => {
      const a = prev.split(".").map(Number);
      const b = next.split(".").map(Number);
      return (a[0] || 0) !== (b[0] || 0) || (a[1] || 0) !== (b[1] || 0);
    })();
    if (isMinorOrMajor && prev) {
      chrome.tabs.create({ url: chrome.runtime.getURL("changelog.html") });
    }
  }
  chrome.alarms.create("pse-cache-purge", { periodInMinutes: 360 });
  chrome.alarms.create("pse-psn-sync", { periodInMinutes: 120 });
  chrome.alarms.create("pse-wishlist-check", { periodInMinutes: 24 * 60 });
  // Register right-click context menu (idempotent)
  try {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: "pse-find-on-cheapshark",
        title: chrome.i18n.getMessage("ctxMenuFind") || "Find on GameDeals+",
        contexts: ["selection"],
        documentUrlPatterns: ["https://store.playstation.com/*"]
      });
    });
  } catch (e) { console.warn("[PSE/bg] contextMenu setup failed:", e); }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "pse-cache-purge") PSECache.purgeExpired();
  if (alarm.name === "pse-psn-sync") {
    const s = await PSN.getStatus();
    if (s.connected && s.needsSync) await PSN.fetchLibrary();
  }
  if (alarm.name === "pse-wishlist-check") checkWishlistPrices();
});

/* ──── context menu click ──── */
chrome.contextMenus.onClicked.addListener((info, _tab) => {
  if (info.menuItemId === "pse-find-on-cheapshark" && info.selectionText) {
    const q = info.selectionText.trim().substring(0, 100);
    if (q.length < 2) return;
    chrome.tabs.create({ url: `https://www.cheapshark.com/browse?title=${encodeURIComponent(q)}` });
  }
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
      respond({ success: false, error: err?.message || String(err) });
    });
  return true;
});

const HANDLERS = {
  FETCH_CROSS_PLATFORM: (m) => handleCrossPlatform(m.gameName),
  FETCH_METACRITIC: (m) => handleMetacritic(m.gameName),
  FETCH_PRICE_HISTORY: (m) => handlePriceHistory(m.gameName),
  FETCH_PSN_TROPHY: (m) => handlePsnTrophy(m.gameName),
  GET_MERGED_OWNED: () => PSN.getMergedOwned().then(list => ({ list })),
  PURGE_CACHE: () => PSECache.purgeExpired().then(() => ({ ok: true })),
  CLEAR_CACHE: () => PSECache.clearAll().then(n => ({ ok: true, removed: n })),
  CACHE_STATS: () => PSECache.getStats(),
  PSN_AUTHENTICATE: (m) => PSN.authenticate(m.npsso),
  PSN_AUTO_DETECT: () => PSN.tryAutoDetectNpsso(),
  PSN_FETCH_LIBRARY: () => PSN.fetchLibrary(),
  PSN_STATUS: () => PSN.getStatus(),
  PSN_DISCONNECT: () => PSN.disconnect(),
  // Fix #9: add/remove manual owned games
  ADD_MANUAL_OWNED: async (m) => {
    const d = await chrome.storage.local.get(["manual_owned"]);
    const list = d.manual_owned || [];
    const name = (m.gameName || "").trim();
    if (!name) return { ok: false };
    if (!list.some(g => g.toLowerCase() === name.toLowerCase())) {
      list.push(name);
      list.sort((a, b) => a.localeCompare(b));
      await chrome.storage.local.set({ manual_owned: list });
    }
    return { ok: true, list };
  },
  REMOVE_MANUAL_OWNED: async (m) => {
    const d = await chrome.storage.local.get(["manual_owned"]);
    const list = (d.manual_owned || []).filter(g => g.toLowerCase() !== (m.gameName || "").toLowerCase());
    await chrome.storage.local.set({ manual_owned: list });
    return { ok: true, list };
  },
  IS_GAME_OWNED: async (m) => {
    const merged = await PSN.getMergedOwned();
    const name = (m.gameName || "").toLowerCase().trim();
    return { owned: merged.some(g => g.toLowerCase().trim() === name) };
  },

  /* ──── Wishlist ──── */
  ADD_WISHLIST: async (m) => {
    const d = await chrome.storage.local.get(["wishlist"]);
    const list = d.wishlist || [];
    const name = (m.gameName || "").trim();
    if (!name) return { ok: false };
    if (list.some(g => g.name.toLowerCase() === name.toLowerCase())) {
      return { ok: false, error: "wishlistAlreadyAdded", list };
    }
    let currentPrice = null;
    try {
      const r = await fetch(`https://www.cheapshark.com/api/1.0/games?title=${encodeURIComponent(name)}&limit=1`);
      if (r.ok) {
        const g = await r.json();
        if (g?.length && fuzzyMatch(name, g[0].external)) currentPrice = parseFloat(g[0].cheapest) || null;
      }
    } catch {}
    list.push({
      name,
      storeUrl: m.storeUrl || null,
      addedAt: Date.now(),
      targetPrice: m.targetPrice != null ? Number(m.targetPrice) : null,
      lastCheckedPrice: currentPrice,
      lastCheckedAt: Date.now(),
      notified: false
    });
    await chrome.storage.local.set({ wishlist: list });
    return { ok: true, list, currentPrice };
  },
  REMOVE_WISHLIST: async (m) => {
    const d = await chrome.storage.local.get(["wishlist"]);
    const list = (d.wishlist || []).filter(g => g.name.toLowerCase() !== (m.gameName || "").toLowerCase());
    await chrome.storage.local.set({ wishlist: list });
    return { ok: true, list };
  },
  GET_WISHLIST: async () => {
    const d = await chrome.storage.local.get(["wishlist"]);
    return { list: d.wishlist || [] };
  },
  SET_WISHLIST_TARGET: async (m) => {
    const d = await chrome.storage.local.get(["wishlist"]);
    const list = d.wishlist || [];
    const idx = list.findIndex(g => g.name.toLowerCase() === (m.gameName || "").toLowerCase());
    if (idx === -1) return { ok: false };
    list[idx].targetPrice = m.targetPrice != null ? Number(m.targetPrice) : null;
    list[idx].notified = false;
    await chrome.storage.local.set({ wishlist: list });
    return { ok: true, list };
  },
  IS_IN_WISHLIST: async (m) => {
    const d = await chrome.storage.local.get(["wishlist"]);
    const name = (m.gameName || "").toLowerCase().trim();
    return { inWishlist: (d.wishlist || []).some(g => g.name.toLowerCase().trim() === name) };
  },
  CHECK_WISHLIST_NOW: async () => { await checkWishlistPrices(); return { ok: true }; },

  /* ──── Currency conversion (Frankfurter) ──── */
  GET_RATES: async (m) => {
    const target = (m.target || "USD").toUpperCase();
    if (target === "USD") return { ok: true, base: "USD", rates: { USD: 1 }, fromCache: false };
    return getExchangeRates(target);
  }
};

/* ──── Wishlist price checker ──── */
async function checkWishlistPrices() {
  const d = await chrome.storage.local.get(["wishlist"]);
  const list = d.wishlist || [];
  if (!list.length) return;

  const updated = [];
  for (const item of list) {
    try {
      const r = await fetch(`https://www.cheapshark.com/api/1.0/games?title=${encodeURIComponent(item.name)}&limit=1`);
      if (!r.ok) { updated.push(item); continue; }
      const games = await r.json();
      const newPrice = (games?.length && fuzzyMatch(item.name, games[0].external))
        ? (parseFloat(games[0].cheapest) || null)
        : null;
      if (newPrice == null) { updated.push(item); continue; }

      const prevPrice = item.lastCheckedPrice;
      if (item.targetPrice != null && newPrice <= item.targetPrice && !item.notified) {
        const oldShow = (prevPrice != null && prevPrice > newPrice) ? prevPrice : item.targetPrice;
        try {
          await chrome.notifications.create(`pse-wl-${slugify(item.name)}-${Date.now()}`, {
            type: "basic",
            iconUrl: chrome.runtime.getURL("icons/icon128.png"),
            title: chrome.i18n.getMessage("wishlistPriceDropTitle") || "Price drop alert!",
            message: (chrome.i18n.getMessage("wishlistPriceDropBody", [item.name, `$${newPrice.toFixed(2)}`, `$${oldShow.toFixed(2)}`]) || `${item.name} is now $${newPrice.toFixed(2)}`).substring(0, 200)
          });
          item.notified = true;
        } catch (e) { console.warn("[PSE] notification failed:", e); }
      } else if (item.targetPrice != null && newPrice > item.targetPrice) {
        item.notified = false; // re-arm
      }
      item.lastCheckedPrice = newPrice;
      item.lastCheckedAt = Date.now();
    } catch (e) {
      console.warn(`[PSE] wishlist check failed for ${item.name}:`, e);
    }
    updated.push(item);
  }
  await chrome.storage.local.set({ wishlist: updated });
}

/* ──── Currency conversion via Frankfurter ──── */
async function getExchangeRates(target) {
  const ck = `fx_USD_${target}`;
  const cached = await PSECache.get(ck);
  if (cached) return { ok: true, base: "USD", rates: cached, fromCache: true };
  try {
    const resp = await fetch(`https://api.frankfurter.dev/v1/latest?base=USD&symbols=${target}`);
    if (!resp.ok) throw new Error(`Frankfurter ${resp.status}`);
    const data = await resp.json();
    if (!data.rates || data.rates[target] == null) throw new Error("Missing rate");
    const rates = { USD: 1, [target]: data.rates[target] };
    await PSECache.set(ck, rates, 24 * 3600000); // 24h TTL
    return { ok: true, base: "USD", rates, fromCache: false };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/* ──── Fix #12: PSN Trophy data ──── */
async function handlePsnTrophy(gameName) {
  if (!gameName) return { success: false };
  const ck = `psn_trophy_${slugify(gameName)}`;
  const cached = await PSECache.get(ck);
  if (cached) return { success: true, data: cached, fromCache: true };

  const data = await PSN.fetchTrophyInfo(gameName);
  if (data) {
    await PSECache.set(ck, data, PSECache.TTL.TROPHY);
    return { success: true, data, fromCache: false };
  }
  return { success: false };
}

/* ──── CheapShark: cross-platform prices ──── */
async function handleCrossPlatform(gameName) {
  if (!gameName) return { success: false, error: "No game name" };
  const ck = `xplatform_${slugify(gameName)}`;
  const cached = await PSECache.get(ck);
  if (cached) return { success: true, data: cached, fromCache: true };

  try {
    const url = `https://www.cheapshark.com/api/1.0/deals?title=${encodeURIComponent(gameName)}&limit=10&sortBy=Price`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`CheapShark ${resp.status}`);
    const deals = await resp.json();

    const storeNames = {
      "1":"Steam","2":"GamersGate","3":"GreenManGaming","7":"GOG",
      "8":"Origin / EA App","11":"Humble Store","13":"Ubisoft Store",
      "15":"Fanatical","21":"WinGameStore","25":"Epic Games Store"
    };

    const storeMap = new Map();
    for (const deal of deals) {
      if (!fuzzyMatch(gameName, deal.title)) continue;
      const store = storeNames[deal.storeID] || `Store #${deal.storeID}`;
      const price = parseFloat(deal.salePrice);
      const normalPrice = parseFloat(deal.normalPrice);
      const savings = Math.round(parseFloat(deal.savings || 0));
      if (!storeMap.has(store) || storeMap.get(store).price > price) {
        storeMap.set(store, {
          store, price, normalPrice, savings,
          dealLink: `https://www.cheapshark.com/redirect?dealID=${deal.dealID}`
        });
      }
    }
    const results = Array.from(storeMap.values()).sort((a,b) => a.price - b.price).slice(0, 5);
    await PSECache.set(ck, results, PSECache.TTL.CROSS_PLATFORM);
    return { success: true, data: results, fromCache: false };
  } catch (err) { return { success: false, error: err.message }; }
}

/* ──── OpenCritic ──── */
async function handleMetacritic(gameName) {
  if (!gameName) return { success: false };
  const ck = `metacritic_${slugify(gameName)}`;
  const cached = await PSECache.get(ck);
  if (cached) return { success: true, data: cached, fromCache: true };

  try {
    const sr = await fetch(`https://api.opencritic.com/api/game/search?criteria=${encodeURIComponent(gameName)}`, { headers: { Accept: "application/json" } });
    if (!sr.ok) throw new Error(`OC search ${sr.status}`);
    const results = await sr.json();
    if (!results?.length) return { success: false, error: "Not found" };

    const best = results.find(r => fuzzyMatch(gameName, r.name)) || results[0];
    const gr = await fetch(`https://api.opencritic.com/api/game/${best.id}`, { headers: { Accept: "application/json" } });
    if (!gr.ok) throw new Error(`OC game ${gr.status}`);
    const g = await gr.json();

    const result = {
      score: Math.round(g.topCriticScore || g.averageScore || 0),
      percentRecommended: Math.round(g.percentRecommended || 0),
      name: g.name, tier: g.tier || "Unknown",
      numReviews: g.numReviews || 0, source: "OpenCritic",
      url: `https://opencritic.com/game/${best.id}/${slugify(best.name)}`
    };
    await PSECache.set(ck, result, PSECache.TTL.METACRITIC);
    return { success: true, data: result, fromCache: false };
  } catch (err) { return { success: false, error: err.message }; }
}

/* ──── Price history ──── */
async function handlePriceHistory(gameName) {
  if (!gameName) return { success: false };
  const ck = `pricehistory_${slugify(gameName)}`;
  const cached = await PSECache.get(ck);
  if (cached) return { success: true, data: cached, fromCache: true };

  try {
    const sr = await fetch(`https://www.cheapshark.com/api/1.0/games?title=${encodeURIComponent(gameName)}&limit=1`);
    let priceData;
    if (sr.ok) {
      const games = await sr.json();
      if (games?.length && fuzzyMatch(gameName, games[0].external)) {
        const cheapest = parseFloat(games[0].cheapest) || 0;
        const base = computeBasePrice(cheapest);
        priceData = generatePricePoints(cheapest, base, gameName);
        priceData.cheapestEver = cheapest;
        // The chart is always synthesized from a single data point — be honest about it
        priceData.source = "estimated";
      }
    }
    if (!priceData) {
      priceData = generatePricePoints(29.99, 59.99, gameName);
      priceData.cheapestEver = priceData.points.reduce((m, p) => Math.min(m, p.price), Infinity);
      priceData.source = "estimated";
    }
    await PSECache.set(ck, priceData, PSECache.TTL.PRICE_HISTORY);
    return { success: true, data: priceData, fromCache: false };
  } catch (err) { return { success: false, error: err.message }; }
}

// computeBasePrice now lives in match.js (shared with Jest tests).

function generatePricePoints(cheapest, basePrice, gameName = "") {
  const points = [];
  const now = Date.now();
  const mo = 30 * 86400000;
  let seed = 0;
  for (let c = 0; c < gameName.length; c++) seed = ((seed << 5) - seed + gameName.charCodeAt(c)) | 0;
  seed = Math.abs(seed) || 42;
  if (basePrice <= cheapest) basePrice = cheapest * 1.5 || 59.99;

  // Use a neutral month locale; UI consumers can reformat if needed.
  const monthLocale = (typeof navigator !== "undefined" && navigator.language) || "en-US";

  for (let i = 11; i >= 0; i--) {
    const r = Math.abs(Math.sin(seed + i * 3.7));
    const price = Math.max(cheapest, Math.round((basePrice - r * (basePrice - cheapest)) * 100) / 100);
    const date = new Date(now - i * mo);
    points.push({ month: date.toLocaleString(monthLocale, { month: "short", year: "2-digit" }), price, timestamp: date.getTime() });
  }
  return { points, basePrice, cheapestEver: cheapest };
}

/* slugify and fuzzyMatch now live in match.js (shared with Jest tests). */
