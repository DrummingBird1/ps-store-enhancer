/**
 * PS Store Enhancer — CheapShark data layer (service worker).
 *
 * One lookup per game resolves the EXACT CheapShark game (never a DLC, sequel or soundtrack that
 * merely shares words with the title), then reads that game's own deals, its real all-time-low and
 * its review scores — so cross-platform prices, "lowest ever" and ratings all come from the same
 * verified product and a single cached object.
 */
const CheapShark = (() => {
  "use strict";

  const BASE = "https://www.cheapshark.com/api/1.0";
  const TTL_NOT_FOUND = 3600000; // 1h: a PlayStation exclusive stays "not found", but retry hourly
  const TTL_STORES = 7 * 24 * 3600000;
  const FALLBACK_STORES = {
    1: "Steam", 2: "GamersGate", 3: "GreenManGaming", 7: "GOG", 8: "Origin / EA App",
    11: "Humble Store", 13: "Ubisoft Store", 15: "Fanatical", 21: "WinGameStore",
    23: "GameBillet", 25: "Epic Games Store", 27: "Gamesplanet"
  };
  const inflight = new Map();

  async function api(path) {
    const url = `${BASE}/${path}`;
    let resp;
    try {
      resp = await fetch(url);
    } catch (e) {
      PSEDiag.log("cheapshark", "network-error", { url: PSEDiag.urlInfo(url), message: e && e.message });
      throw e;
    }
    if (!resp.ok) {
      PSEDiag.log("cheapshark", "http-error", { url: PSEDiag.urlInfo(url), status: resp.status });
      throw new Error(`CheapShark ${resp.status}`);
    }
    return resp.json();
  }

  async function storeNames() {
    const cached = await PSECache.get("cs_stores");
    if (cached) return cached;
    try {
      const list = await api("stores");
      const map = {};
      for (const s of list || []) if (s && s.storeID && s.storeName) map[s.storeID] = s.storeName;
      if (Object.keys(map).length) {
        await PSECache.set("cs_stores", map, TTL_STORES);
        return map;
      }
    } catch {
      /* fall back to the static map */
    }
    return FALLBACK_STORES;
  }

  function toNumber(v) {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }

  function buildBundle(gameName, best, listing, detail, ratingDeals, names) {
    const info = (detail && detail.info) || {};
    const byStore = new Map();
    for (const d of (detail && detail.deals) || []) {
      const price = toNumber(d.price);
      if (price == null) continue;
      const store = names[d.storeID] || `Store #${d.storeID}`;
      const prev = byStore.get(store);
      if (!prev || prev.price > price) {
        byStore.set(store, {
          store,
          storeID: String(d.storeID),
          price,
          normalPrice: toNumber(d.retailPrice) ?? price,
          savings: Math.round(toNumber(d.savings) || 0),
          dealLink: `https://www.cheapshark.com/redirect?dealID=${d.dealID}`
        });
      }
    }
    const deals = Array.from(byStore.values()).sort((a, b) => a.price - b.price).slice(0, 5);

    const everRaw = detail && detail.cheapestPriceEver;
    const everPrice = everRaw ? toNumber(everRaw.price) : null;
    const cheapestEver =
      everPrice != null && everPrice > 0
        ? { price: everPrice, date: everRaw.date ? Number(everRaw.date) * 1000 : null }
        : null;

    const rd = Array.isArray(ratingDeals) && ratingDeals.length ? ratingDeals[0] : null;
    const mc = rd ? parseInt(rd.metacriticScore, 10) : 0;
    const steamPct = rd ? parseInt(rd.steamRatingPercent, 10) : 0;
    const steamCount = rd ? parseInt(rd.steamRatingCount, 10) : 0;
    const steamAppID = info.steamAppID || listing.steamAppID || null;
    const ratings = {
      metacritic:
        mc > 0
          ? { score: mc, url: `https://www.metacritic.com/search/${encodeURIComponent(info.title || gameName)}/` }
          : null,
      steam:
        steamPct > 0 && steamCount > 0
          ? {
              percent: steamPct,
              text: rd.steamRatingText || "",
              count: steamCount,
              url: steamAppID ? `https://store.steampowered.com/app/${steamAppID}/` : null
            }
          : null
    };

    const queryEdition = PSEMatch.detectEdition(gameName);
    const listedEdition = PSEMatch.detectEdition(info.title || listing.external);
    return {
      found: true,
      query: gameName,
      title: info.title || listing.external,
      gameID: String(listing.gameID),
      steamAppID: steamAppID ? String(steamAppID) : null,
      thumb: info.thumb || listing.thumb || null,
      matchScore: best.score,
      // Only shown when CheapShark's listing is a different edition than the page being viewed.
      edition: listedEdition && listedEdition !== queryEdition ? listedEdition : null,
      cheapest: deals.length ? deals[0].price : toNumber(listing.cheapest),
      cheapestStore: deals.length ? deals[0].store : null,
      cheapestEver,
      deals,
      ratings
    };
  }

  async function doLookup(gameName, key) {
    const list = await api(`games?title=${encodeURIComponent(gameName)}&limit=10`);
    const best = PSEMatch.pickBestMatch(gameName, list, (g) => g.external);
    if (!best) {
      const miss = { found: false, query: gameName };
      await PSECache.set(key, miss, TTL_NOT_FOUND);
      return miss;
    }
    const listing = best.item;
    const [detail, ratingDeals, names] = await Promise.all([
      api(`games?id=${encodeURIComponent(listing.gameID)}`),
      listing.steamAppID
        ? api(`deals?steamAppID=${encodeURIComponent(listing.steamAppID)}&pageSize=1`).catch(() => [])
        : Promise.resolve([]),
      storeNames()
    ]);
    const bundle = buildBundle(gameName, best, listing, detail, ratingDeals, names);
    await PSECache.set(key, bundle, PSECache.TTL.CROSS_PLATFORM);
    return bundle;
  }

  /**
   * Everything the UI needs about one game.
   * @returns {Promise<object>} { found:false } or { found:true, title, cheapest, cheapestEver, deals, ratings, … }
   */
  async function lookup(gameName) {
    const key = `cs2_${PSEMatch.titleKey(gameName)}`;
    const cached = await PSECache.get(key);
    if (cached) return { ...cached, fromCache: true };
    if (inflight.has(key)) return inflight.get(key);
    const p = doLookup(gameName, key).finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  }

  /** Live-search suggestions: real games only, no soundtracks / maps / upgrades. */
  async function suggestions(query) {
    const q = String(query || "").trim();
    if (q.length < 2) return [];
    const list = await api(`games?title=${encodeURIComponent(q)}&limit=12`);
    const queryIsAddon = PSEMatch.isAddonTitle(q);
    return (list || [])
      .filter((g) => g.external && (queryIsAddon || !PSEMatch.isAddonTitle(g.external)))
      .slice(0, 6)
      .map((g) => ({
        title: g.external,
        thumb: g.thumb || null,
        cheapest: g.cheapest != null ? toNumber(g.cheapest) : null
      }));
  }

  return { lookup, suggestions, api, storeNames, buildBundle };
})();

self.CheapShark = CheapShark;
