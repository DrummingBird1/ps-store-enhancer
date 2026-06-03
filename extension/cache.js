/**
 * GameDeals+ for PS Store — Smart Cache Module
 * Wraps chrome.storage.local with TTL support.
 */
const PSECache = (() => {
  "use strict";
  const PREFIX = "pse_cache_";
  const TTL = {
    PRICE_HISTORY: 6 * 3600000,
    CROSS_PLATFORM: 4 * 3600000,
    METACRITIC: 24 * 3600000,
    TROPHY: 7 * 24 * 3600000,
    DEFAULT: 12 * 3600000
  };

  async function get(key) {
    const fk = PREFIX + key;
    try {
      const r = await chrome.storage.local.get(fk);
      const e = r[fk];
      if (!e) return null;
      if (Date.now() - e.ts > e.ttl) { await chrome.storage.local.remove(fk); return null; }
      return e.data;
    } catch { return null; }
  }

  async function set(key, data, ttl = TTL.DEFAULT) {
    try { await chrome.storage.local.set({ [PREFIX + key]: { data, ts: Date.now(), ttl } }); return true; }
    catch { return false; }
  }

  async function remove(key) { try { await chrome.storage.local.remove(PREFIX + key); } catch {} }

  async function purgeExpired() {
    try {
      const all = await chrome.storage.local.get(null);
      const rm = [];
      const now = Date.now();
      for (const [k, e] of Object.entries(all)) {
        if (k.startsWith(PREFIX) && e.ts && e.ttl && now - e.ts > e.ttl) rm.push(k);
      }
      if (rm.length) await chrome.storage.local.remove(rm);
    } catch {}
  }

  async function clearAll() {
    try {
      const all = await chrome.storage.local.get(null);
      const keys = Object.keys(all).filter(k => k.startsWith(PREFIX));
      if (keys.length) await chrome.storage.local.remove(keys);
      return keys.length;
    } catch { return 0; }
  }

  async function getStats() {
    try {
      const all = await chrome.storage.local.get(null);
      let total = 0, expired = 0, size = 0;
      const now = Date.now();
      for (const [k, e] of Object.entries(all)) {
        if (!k.startsWith(PREFIX)) continue;
        total++;
        size += JSON.stringify(e).length * 2;
        if (e.ts && e.ttl && now - e.ts > e.ttl) expired++;
      }
      return { totalEntries: total, expiredEntries: expired, activeEntries: total - expired, sizeKB: Math.round(size / 1024) };
    } catch { return { totalEntries: 0, expiredEntries: 0, activeEntries: 0, sizeKB: 0 }; }
  }

  return { get, set, remove, purgeExpired, clearAll, getStats, TTL };
})();

self.PSECache = PSECache;
