/**
 * PS Store Enhancer — Pure UI/data helpers (no chrome.* or DOM APIs), unit-tested in Node and
 * shared by the service worker, the content script and the extension pages.
 */
(function (root) {
  "use strict";

  const DAY = 86400000;

  /** Attribute-safe HTML escaping (covers quotes too). */
  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /** Only http(s) URLs survive; anything else becomes "#". */
  function sanitizeUrl(url) {
    if (!url) return "#";
    try {
      const u = new URL(url);
      if (u.protocol === "https:" || u.protocol === "http:") return u.href;
    } catch {
      /* fall through */
    }
    return "#";
  }

  /** PS Store search URL in the same locale as the current page (e.g. /en-il/). */
  function buildStoreSearchUrl(pathname, title) {
    const m = String(pathname || "").match(/^\/([a-z]{2}-[a-z]{2})\//i);
    const locale = m ? m[1] : "en-us";
    return `https://store.playstation.com/${locale}/search/${encodeURIComponent(title)}`;
  }

  /** Format a USD amount in `currency` using `rate` (USD→currency). */
  function formatMoney(usd, currency, rate, locale) {
    const cur = currency || "USD";
    const value = Number(usd) * (rate || 1);
    try {
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: cur,
        maximumFractionDigits: 2
      }).format(value);
    } catch {
      return `${value.toFixed(2)} ${cur}`;
    }
  }

  /* ───────────── price snapshots (real prices recorded by this browser) ───────────── */

  function dayNumber(ts) {
    return Math.floor(ts / DAY);
  }

  /**
   * Record one price per day per game. Returns a NEW store object.
   * store shape: { [key]: { p: [[dayNumber, price], …], u: lastUpdatedDay } }
   */
  function addSnapshot(store, key, price, ts, limits) {
    const { maxPoints = 120, maxGames = 300 } = limits || {};
    const p = Number(price);
    if (!key || !Number.isFinite(p) || p <= 0) return store || {};
    const next = { ...(store || {}) };
    const day = dayNumber(ts);
    const entry = next[key] ? { p: next[key].p.slice(), u: next[key].u } : { p: [], u: day };
    const last = entry.p[entry.p.length - 1];
    if (last && last[0] === day) last[1] = p;
    else entry.p.push([day, p]);
    entry.p = entry.p.slice(-maxPoints);
    entry.u = day;
    next[key] = entry;
    const keys = Object.keys(next);
    if (keys.length > maxGames) {
      keys
        .sort((a, b) => next[a].u - next[b].u)
        .slice(0, keys.length - maxGames)
        .forEach((k) => delete next[k]);
    }
    return next;
  }

  /**
   * Price movement vs ~windowDays ago from recorded points. Needs at least two points on
   * different days; with less history than the window it compares against the oldest point
   * and reports the real span, so the UI can say "vs 9 days ago".
   * @returns {{direction:"up"|"down"|"flat", pct:number, from:number, to:number, spanDays:number}|null}
   */
  function trendFromSnapshots(points, nowTs, windowDays) {
    const win = windowDays || 30;
    if (!Array.isArray(points) || points.length < 2) return null;
    const latest = points[points.length - 1];
    const target = dayNumber(nowTs) - win;
    let ref = null;
    for (const pt of points) {
      if (pt[0] >= latest[0]) continue;
      if (!ref || Math.abs(pt[0] - target) < Math.abs(ref[0] - target)) ref = pt;
    }
    if (!ref || ref[1] <= 0) return null;
    const pct = ((latest[1] - ref[1]) / ref[1]) * 100;
    const direction = Math.abs(pct) < 1 ? "flat" : pct > 0 ? "up" : "down";
    return { direction, pct: Math.round(pct * 10) / 10, from: ref[1], to: latest[1], spanDays: latest[0] - ref[0] };
  }

  /** "At the all-time low" / "Near the all-time low" classification (within 10%). */
  function lowStatus(current, ever) {
    const c = Number(current);
    const e = Number(ever);
    if (!(c > 0) || !(e > 0)) return null;
    if (c <= e * 1.005) return "at";
    if (c <= e * 1.1) return "near";
    return null;
  }

  /* ───────────── wishlist ───────────── */

  /** A wishlist item is "ready to buy" when its last price meets its price OR percent target. */
  function isDealReady(item) {
    if (!item || item.lastCheckedPrice == null) return false;
    if (item.targetPrice != null && item.lastCheckedPrice <= item.targetPrice) return true;
    if (item.targetPercent != null && item.lastSavings != null && item.lastSavings >= item.targetPercent) {
      return true;
    }
    return false;
  }

  /** Sort/filter the options-page wishlist. `mode`: added | name | price | discount. */
  function sortWishlist(list, mode, filterText) {
    const f = String(filterText || "").trim().toLowerCase();
    const items = (list || []).filter((i) => !f || String(i.name || "").toLowerCase().includes(f));
    const num = (v, dflt) => (v == null ? dflt : Number(v));
    const by = {
      added: (a, b) => num(b.addedAt, 0) - num(a.addedAt, 0),
      name: (a, b) => String(a.name || "").localeCompare(String(b.name || "")),
      price: (a, b) => num(a.lastCheckedPrice, Infinity) - num(b.lastCheckedPrice, Infinity),
      discount: (a, b) => num(b.lastSavings, -1) - num(a.lastSavings, -1)
    };
    return items.slice().sort(by[mode] || by.added);
  }

  /* ───────────── trophy / completionist helpers ───────────── */

  /** "100-120" → 110, "100+" → 100, "6-10" → 8, junk → null. */
  function midpointHours(text) {
    const m = String(text || "").match(/(\d+(?:\.\d+)?)\s*(?:-\s*(\d+(?:\.\d+)?))?/);
    if (!m) return null;
    const a = parseFloat(m[1]);
    const b = m[2] != null ? parseFloat(m[2]) : a;
    return (a + b) / 2;
  }

  /** One glance value: 0-100 from difficulty (60%) and time to complete (40%, capped at 120 h). */
  function completionistScore(difficulty, hoursText) {
    const d = Number(difficulty);
    if (!(d >= 1 && d <= 10)) return null;
    const h = midpointHours(hoursText);
    const score = Math.round((d / 10) * 60 + (h == null ? 0 : (Math.min(h, 120) / 120) * 40));
    const tier = score <= 25 ? "quick" : score <= 50 ? "moderate" : score <= 75 ? "demanding" : "grind";
    return { score, tier, hours: h };
  }

  function pricePerHour(price, hoursText) {
    const h = midpointHours(hoursText);
    const p = Number(price);
    if (!(h > 0) || !(p >= 0)) return null;
    return Math.round((p / h) * 100) / 100;
  }

  /**
   * Games the user already owns whose (known) trophy difficulty is within ±1 of `difficulty`.
   * @param {string} selfKey normalized key of the current game (excluded)
   * @param {Object<string,{difficulty:number}>} db trophy DB keyed by title
   * @param {(s:string)=>string} norm title normalizer
   */
  function similarOwned(selfKey, difficulty, ownedNames, db, norm, limit) {
    const index = new Map(Object.entries(db || {}).map(([k, v]) => [norm(k), { key: k, v }]));
    const out = [];
    for (const name of ownedNames || []) {
      const key = norm(name);
      if (key === selfKey) continue;
      const hit = index.get(key);
      if (hit && Math.abs(hit.v.difficulty - difficulty) <= 1) out.push({ name, difficulty: hit.v.difficulty });
      if (out.length >= (limit || 3)) break;
    }
    return out;
  }

  /* ───────────── recurring sale windows (informational, never a prediction) ───────────── */

  const SALE_WINDOWS = [
    { id: "steam-spring", name: "Steam Spring Sale", month: 3, day: 19, length: 7 },
    { id: "ps-days-of-play", name: "PlayStation Days of Play", month: 5, day: 28, length: 14 },
    { id: "steam-summer", name: "Steam Summer Sale", month: 6, day: 26, length: 14 },
    { id: "steam-autumn", name: "Steam Autumn Sale", month: 11, day: 26, length: 7 },
    { id: "ps-black-friday", name: "Black Friday", month: 11, day: 27, length: 5 },
    { id: "steam-winter", name: "Steam Winter Sale", month: 12, day: 19, length: 14 }
  ];

  /**
   * The next occurrence of each usual sale window, soonest first. `daysUntil` is 0 while the
   * usual window is under way. Dates are typical, not announced — callers must say "usually".
   */
  function upcomingSales(now, limit) {
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const rows = SALE_WINDOWS.map((w) => {
      let start = Date.UTC(now.getFullYear(), w.month - 1, w.day);
      if (start + w.length * DAY < today) start = Date.UTC(now.getFullYear() + 1, w.month - 1, w.day);
      const daysUntil = Math.max(0, Math.round((start - today) / DAY));
      return { id: w.id, name: w.name, month: w.month, day: w.day, daysUntil, underway: start <= today };
    });
    rows.sort((a, b) => a.daysUntil - b.daysUntil);
    return rows.slice(0, limit || 2);
  }

  /* ───────────── shareable wishlist link (no backend: the list lives in the URL fragment) ───────────── */

  function b64urlEncode(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function b64urlDecode(s) {
    const pad = "=".repeat((4 - (s.length % 4)) % 4);
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  }

  /** Names + last-seen PC price only — never targets or notes. Max 200 games. */
  function encodeShareList(wishlist) {
    const items = (wishlist || []).slice(0, 200).map((i) => ({
      n: String(i.name || "").slice(0, 120),
      p: i.lastCheckedPrice != null ? Number(i.lastCheckedPrice) : null
    }));
    return b64urlEncode(JSON.stringify({ v: 1, i: items }));
  }

  /** Validating decoder; returns [] for anything malformed. */
  function decodeShareList(fragment) {
    try {
      const data = JSON.parse(b64urlDecode(String(fragment || "").replace(/^#/, "")));
      if (!data || data.v !== 1 || !Array.isArray(data.i)) return [];
      return data.i
        .slice(0, 200)
        .filter((x) => x && typeof x.n === "string" && x.n.trim())
        .map((x) => ({
          name: x.n.slice(0, 120),
          price: typeof x.p === "number" && Number.isFinite(x.p) && x.p >= 0 ? x.p : null
        }));
    } catch {
      return [];
    }
  }

  /* ───────────── PS Store price read from the page ───────────── */

  const LOCALE_CURRENCY = {
    US: "USD", GB: "GBP", IE: "EUR", DE: "EUR", FR: "EUR", ES: "EUR", IT: "EUR", NL: "EUR",
    PT: "EUR", AT: "EUR", BE: "EUR", FI: "EUR", GR: "EUR", IL: "ILS", JP: "JPY", KR: "KRW",
    BR: "BRL", CA: "CAD", AU: "AUD", NZ: "NZD", TR: "TRY", AE: "AED", SA: "SAR", RU: "RUB",
    PL: "PLN", SE: "SEK", NO: "NOK", DK: "DKK", CZ: "CZK", CH: "CHF", IN: "INR", MX: "MXN",
    ZA: "ZAR", HK: "HKD", TW: "TWD"
  };
  const SYMBOL_CURRENCY = { "€": "EUR", "£": "GBP", "₪": "ILS", "¥": "JPY", "₩": "KRW", "₺": "TRY", "₹": "INR", "zł": "PLN", "kr": "SEK" };

  /** Currency implied by a PS Store URL path like "/en-il/…" (null when unknown). */
  function currencyFromStorePath(pathname) {
    const m = String(pathname || "").match(/^\/[a-z]{2}-([a-z]{2})\//i);
    return m ? LOCALE_CURRENCY[m[1].toUpperCase()] || null : null;
  }

  /**
   * Parse a displayed price ("$59.99", "59,99 €", "¥7,990", "R$ 299,90", "Free") into
   * { amount, currency }. Returns null for free / unparseable text. `hint` is a fallback ISO code.
   */
  function parsePsPrice(text, hint) {
    const raw = String(text || "").replace(/ /g, " ").trim();
    const m = raw.match(/(\d[\d.,\s]*\d|\d)/);
    if (!m) return null;
    let num = m[1].replace(/\s/g, "");
    const lastDot = num.lastIndexOf(".");
    const lastComma = num.lastIndexOf(",");
    if (lastDot !== -1 && lastComma !== -1) {
      const dec = lastDot > lastComma ? "." : ",";
      num = dec === "." ? num.replace(/,/g, "") : num.replace(/\./g, "").replace(",", ".");
    } else if (lastComma !== -1 || lastDot !== -1) {
      const sep = lastComma !== -1 ? "," : ".";
      const parts = num.split(sep);
      const tail = parts[parts.length - 1];
      num = parts.length === 2 && tail.length <= 2 ? parts[0] + "." + tail : parts.join("");
    }
    const amount = parseFloat(num);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    let currency = null;
    const iso = raw.match(/\b(USD|EUR|GBP|ILS|JPY|KRW|BRL|CAD|AUD|NZD|TRY|AED|SAR|RUB|PLN|SEK|NOK|DKK|CZK|CHF|INR|MXN|ZAR|HKD|TWD)\b/);
    if (iso) currency = iso[1];
    else if (/R\$/.test(raw)) currency = "BRL";
    else if (/CA\$|C\$/.test(raw)) currency = "CAD";
    else if (/A\$|AU\$/.test(raw)) currency = "AUD";
    else if (/US\$/.test(raw)) currency = "USD";
    else {
      for (const [sym, cur] of Object.entries(SYMBOL_CURRENCY)) {
        if (raw.includes(sym)) { currency = cur; break; }
      }
      if (!currency && raw.includes("$")) currency = hint || "USD";
    }
    currency = currency || hint || null;
    return currency ? { amount, currency } : null;
  }

  const api = {
    escapeHtml,
    sanitizeUrl,
    buildStoreSearchUrl,
    formatMoney,
    dayNumber,
    addSnapshot,
    trendFromSnapshots,
    lowStatus,
    isDealReady,
    sortWishlist,
    midpointHours,
    completionistScore,
    pricePerHour,
    similarOwned,
    upcomingSales,
    SALE_WINDOWS,
    encodeShareList,
    decodeShareList,
    currencyFromStorePath,
    parsePsPrice,
    DAY
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.PSEHelpers = api;
})(typeof self !== "undefined" ? self : typeof globalThis !== "undefined" ? globalThis : this);
