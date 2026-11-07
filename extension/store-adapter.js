/**
 * PS Store Enhancer — Store adapter.
 *
 * The one file that knows what store.playstation.com pages look like. Every lookup tries several
 * strategies, says which one worked, and never reads the editions/upsell blocks by accident.
 * The content script renders; this file only reads (and classifies) the page. It takes the
 * document as a parameter so Jest can run it against saved real pages (tests/fixtures/ps-store).
 *
 * Verified against real pages on 2026-11-07 (see tests/fixtures/ps-store/*.html for the captures):
 *  - product page: the page's own price is `mfeCtaMain#offerN#finalPrice`; offer0 can be a PlayStation Plus
 *    offer ("Game Trial") with no price; other editions live in `mfeUpsell#productEditionN#ctaWithPrice`
 *  - JSON-LD Product `offers.price` / `priceCurrency` is the page's own price, in the store's ISO currency
 *  - listing tiles: `ul.psw-grid-list > li > div[data-qa=search#productTileN]`, text in `#product-name`,
 *    the store's own type label in `#product-type`, price in `#price#display-price`
 */
(function (root) {
  "use strict";

  const H = root.PSEHelpers || (typeof require === "function" ? require("./helpers.js") : null);
  const DAY = 86400000;

  const text = (el) => (el && el.textContent ? el.textContent.replace(/\s+/g, " ").trim() : "");
  const byQa = (doc, qa) => doc.querySelector(`[data-qa="${qa}"]`);
  const inUpsell = (el) => !!(el && el.closest && el.closest('[data-qa^="mfeUpsell"]'));

  /* ───────────── page type ───────────── */

  const isProductPath = (path) => /\/(concept|product)\/[A-Z0-9_-]+/i.test(String(path || ""));
  const isListingPath = (path) => /\/(search|category|deals|collection)/i.test(String(path || ""));
  const regionFromPath = (path) => {
    const m = String(path || "").match(/^\/[a-z]{2}-([a-z]{2})\//i);
    return m ? m[1].toUpperCase() : null;
  };

  /* ───────────── JSON-LD ───────────── */

  /** Every JSON-LD node with a name or a usable price in one JSON-LD text: { name, amount, currency, type }. */
  function ldCandidates(textValue) {
    let j;
    try {
      j = JSON.parse(textValue);
    } catch {
      return [];
    }
    const out = [];
    for (const n of Array.isArray(j) ? j : [j]) {
      if (!n || typeof n !== "object") continue;
      let amount = null;
      let currency = null;
      for (const o of [].concat(n.offers || [])) {
        const price = Number(o && o.price);
        const cur = String((o && o.priceCurrency) || "");
        if (price > 0 && /^[A-Z]{3}$/.test(cur) && H.isPlausiblePrice(price, cur)) {
          amount = price;
          currency = cur;
          break;
        }
      }
      if (amount != null || n.name) out.push({ name: n.name ? String(n.name) : null, amount, currency, type: String(n["@type"] || "") });
    }
    return out;
  }

  /** The page's own Product: the first node with a usable price, else the first Product; never an Organization. */
  function pickLd(candidates) {
    const hit = candidates.find((c) => c.amount != null) || candidates.find((c) => /Product/.test(c.type));
    return hit ? { name: hit.name, amount: hit.amount, currency: hit.currency } : null;
  }

  /** The page's own Product from JSON-LD: { name, amount, currency } (amount/currency may be null). */
  function readJsonLd(doc) {
    const all = [];
    for (const s of doc.querySelectorAll('script[type="application/ld+json"]')) all.push(...ldCandidates(s.textContent));
    return pickLd(all);
  }

  /** The same from raw page HTML (the service worker has no DOM): used to refresh wishlisted games' PS prices. */
  function readJsonLdFromHtml(html) {
    const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    const all = [];
    let m;
    while ((m = re.exec(String(html || "")))) all.push(...ldCandidates(m[1]));
    return pickLd(all);
  }

  /* ───────────── title ───────────── */

  const normalizeName = (s) => String(s || "").replace(/[™®©]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

  function cleanTitle(el) {
    const clone = el.cloneNode(true);
    clone.querySelectorAll(".pse-injected").forEach((n) => n.remove());
    return clone.textContent.replace(/[™®©]/g, "").replace(/\s+/g, " ").trim();
  }

  /** The game title on a product page: { value, strategy } or null. */
  function readTitle(doc) {
    const strategies = [
      ["data-qa", () => byQa(doc, "mfe-game-title#name")],
      ["h1-class", () => doc.querySelector('h1[class*="psw-t-title"]')],
      ["main-h1", () => doc.querySelector("main h1")]
    ];
    for (const [strategy, find] of strategies) {
      const el = find();
      const value = el ? cleanTitle(el) : "";
      if (value) return { value, strategy };
    }
    const ld = readJsonLd(doc);
    if (ld && ld.name) return { value: ld.name.replace(/[™®©]/g, "").trim(), strategy: "json-ld" };
    return null;
  }

  /* ───────────── price ───────────── */

  /** Parse a displayed price, or null when it isn't one ("Game Trial", "Free", "Included"). */
  function parsePrice(textValue, hint) {
    const p = H.parsePsPrice(textValue, hint);
    if (!p || !H.isPlausiblePrice(p.amount, p.currency)) return null;
    // A bare "$" in a store region we cannot map to a currency is ambiguous: do not guess US dollars.
    if (!hint && p.currency === "USD" && !/US\$|USD/.test(String(textValue))) return null;
    return p;
  }

  /**
   * Sale end text ("Offer ends 11/21/2026 09:59 GMT+2", "... 21/11/2026 ...") → UTC day number.
   * Numeric dates are ambiguous below 13, so the store's country decides (US/CA/PH write month first).
   */
  function parseEndDay(textValue, region) {
    const m = String(textValue || "").match(/(\d{1,4})[./-](\d{1,2})[./-](\d{1,4})/);
    if (!m) return null;
    let y;
    let mo;
    let d;
    if (m[1].length === 4) {
      y = +m[1];
      mo = +m[2];
      d = +m[3];
    } else if (m[3].length === 4) {
      y = +m[3];
      const a = +m[1];
      const b = +m[2];
      const monthFirst = a > 12 ? false : b > 12 ? true : ["US", "CA", "PH"].includes(region);
      mo = monthFirst ? a : b;
      d = monthFirst ? b : a;
    } else {
      return null;
    }
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 2000) return null;
    return Math.floor(Date.UTC(y, mo - 1, d) / DAY);
  }

  function readOfferAt(doc, prefix, i, hint) {
    const base = `${prefix}#offer${i}`;
    const fin = byQa(doc, `${base}#finalPrice`);
    if (!fin && !byQa(doc, base)) return null;
    const label = text(fin);
    const original = byQa(doc, `${base}#originalPrice`);
    const badge = text(byQa(doc, `${base}#discountBadge#text`));
    const low = text(byQa(doc, `${base}#lowestRecentPrice`));
    const pct = (badge.match(/(\d{1,3})\s*%/) || [])[1];
    return {
      index: i,
      label,
      price: parsePrice(label, hint),
      original: original ? parsePrice(text(original), hint) : null,
      pct: pct ? Number(pct) : null,
      endsText: text(byQa(doc, `${base}#discountDescriptor`)),
      lowest30: low ? parsePrice(low.split(":").slice(1).join(":") || low, hint) : null,
      plus: !!doc.querySelector(`[data-qa^="${base}#serviceIcon"]`)
    };
  }

  /** Every offer of the main buy box, in page order (the editions list is NOT part of it). */
  function readOffers(doc, hint) {
    const out = [];
    for (let i = 0; i < 6; i++) {
      const o = readOfferAt(doc, "mfeCtaMain", i, hint);
      if (o) out.push(o);
    }
    return out;
  }

  /** Last-resort selectors of the pre-2026 layout; never inside an editions/upsell block. */
  const LEGACY_PRICE_SELECTORS = [
    '[data-qa="mfeCtaMain#offer0#ctaWithPrice"]',
    '[class*="CTAPrice"]',
    '[class*="cta-container"]'
  ];

  /**
   * What the page itself costs. Strategies, in order: the main buy box offers (first offer that has
   * a price and is not a PlayStation Plus offer), old-layout selectors, JSON-LD. When the buy box and
   * JSON-LD disagree the visible price wins and `mismatch` is set.
   * @returns {{amount:number,currency:string,original:number|null,pct:number|null,ends:number|null,
   *   endsText:string,lowest30:number|null,plusAmount:number|null,source:string,mismatch:boolean}|null}
   */
  function readPrice(doc, opts) {
    const o = opts || {};
    const hint = o.hint || null;
    const region = o.region || null;
    let ld = readJsonLd(doc);
    // After an in-page navigation the previous game's JSON-LD can still be in the document: only
    // trust it when it names the same game as the page title we were given.
    if (ld && ld.name && o.title && normalizeName(ld.name) !== normalizeName(o.title)) ld = null;
    const offers = readOffers(doc, hint);
    const main = offers.find((x) => x.price && !x.plus) || null;
    const plusOffer = offers.find((x) => x.price && x.plus) || null;

    let amount = null;
    let currency = null;
    let source = null;
    if (main) {
      amount = main.price.amount;
      currency = main.price.currency;
      source = "buy-box";
    } else {
      for (const sel of LEGACY_PRICE_SELECTORS) {
        const el = [...doc.querySelectorAll(sel)].find((e) => !inUpsell(e));
        const p = el && parsePrice(text(el), hint);
        if (p) {
          amount = p.amount;
          currency = p.currency;
          source = "legacy";
          break;
        }
      }
    }
    if (amount == null && ld && ld.amount != null) {
      amount = ld.amount;
      currency = ld.currency;
      source = "json-ld";
    }
    if (amount == null) return null;

    const mismatch = !!(ld && ld.amount != null && source !== "json-ld" && Math.abs(ld.amount - amount) > 0.005);
    if (ld && ld.currency && source !== "json-ld" && !mismatch) currency = ld.currency;

    const original = main && main.original && main.original.amount > amount ? main.original.amount : null;
    const pct = main && main.pct ? main.pct : original ? Math.round((1 - amount / original) * 100) : null;
    return {
      amount,
      currency,
      original,
      pct,
      ends: main ? parseEndDay(main.endsText, region) : null,
      endsText: main ? main.endsText : "",
      lowest30: main && main.lowest30 ? main.lowest30.amount : null,
      plusAmount: plusOffer ? plusOffer.price.amount : null,
      source,
      mismatch
    };
  }

  /* ───────────── where the cards go ───────────── */

  /** The element our cards are inserted after: the buy box, else the title block. */
  function findAnchor(doc) {
    const strategies = [
      ["buy-box", () => byQa(doc, "mfeCtaMain")],
      ["legacy-cta", () => [...doc.querySelectorAll('[class*="cta-container"]')].find((e) => !inUpsell(e))],
      ["title-block", () => byQa(doc, "mfe-game-title")],
      ["h1", () => doc.querySelector("main h1")]
    ];
    for (const [strategy, find] of strategies) {
      const el = find();
      if (el && el.parentElement) return { el, strategy };
    }
    return null;
  }

  /* ───────────── listing tiles (search, category, collections, strands) ───────────── */

  const TILE_QA = /#productTile\d+$/;

  /** Tile elements on a listing page, outermost per tile (the store nests the same data-qa twice). */
  function readTiles(doc, opts) {
    const hint = (opts && opts.hint) || null;
    const seen = new Set();
    const tiles = [];
    for (const nameEl of doc.querySelectorAll('[data-qa$="#product-name"]')) {
      let tile = null;
      for (let n = nameEl; n && n.getAttribute; n = n.parentElement) {
        if (TILE_QA.test(n.getAttribute("data-qa") || "")) tile = n; // keep climbing: outermost wins
      }
      if (!tile || seen.has(tile)) continue;
      seen.add(tile);
      const q = (suffix) => tile.querySelector(`[data-qa$="${suffix}"]`);
      const display = text(q("#price#display-price"));
      const strike = text(q("#price#price-strikethrough"));
      const badge = text(q("#discount-badge#text"));
      const link = tile.querySelector('a[href*="/product/"], a[href*="/concept/"]');
      const href = link ? link.getAttribute("href") || "" : "";
      const price = parsePrice(display, hint);
      const original = strike ? parsePrice(strike, hint) : null;
      const pct = (badge.match(/(\d{1,3})\s*%/) || [])[1];
      tiles.push({
        el: tile,
        unit: tile.closest("li") || tile,
        name: text(nameEl),
        type: text(q("#product-type")),
        href,
        id: (href.match(/\/(?:product|concept)\/([^/?#]+)/) || [])[1] || null,
        displayPrice: display,
        price: price ? price.amount : null,
        currency: price ? price.currency : null,
        original: original && price && original.amount > price.amount ? original.amount : null,
        pct: pct ? Number(pct) : null
      });
    }
    return tiles;
  }

  // The store's own label first, then the wording of the name. Matching is done on the clean name and
  // label, never on a tile's concatenated textContent ("…PS4Add-On Pack$6.99" has no word boundaries).
  const ADDON_LABELS = /^(add-?on(?: pack)?|virtual currency|avatar|theme)$/i;
  const DLC_LABELS = /^(level|episode|season pass|expansion|dlc)$/i;
  const MICRO_NAME = [
    /\bcurrency\b/i, /\bcoins?\b/i, /\btokens?\b/i, /\bcredits?\b/i, /\bpoints?\s*pack/i, /\bv[\s-]?bucks\b/i,
    /\bgold\s*(bars?|pack)/i, /\bstarter\s*pack\b/i, /\bboost(er)?\s*pack\b/i,
    /\b\d+[\s,.]?\d*\s*(coins?|tokens?|credits?|gems?|gold|points)\b/i, /מטבעות/, /אסימונים/
  ];
  const DLC_NAME = [
    /\bdlc\b/i, /\bexpansions?\b/i, /\bseason\s*pass\b/i, /\bupgrade\b/i, /\bcharacter\s*pass\b/i,
    /\bbattle\s*pass\b/i, /\b(?:story|map|content)\s*pack\b/i, /תוסף/, /חבילת/
  ];

  /**
   * What a listing tile is, for the "hide add-ons" and "hide DLC" filters.
   * addon: store label Add-on / Add-On Pack / Virtual Currency, or currency/starter/booster wording.
   * dlc: store label Level / Episode / Season Pass, or DLC / expansion / season pass / upgrade wording.
   * A "Game Bundle" (a full game) is neither.
   */
  function classifyTile(tile) {
    const type = String((tile && tile.type) || "").trim();
    const name = String((tile && tile.name) || "");
    return {
      addon: ADDON_LABELS.test(type) || MICRO_NAME.some((re) => re.test(name)),
      dlc: DLC_LABELS.test(type) || DLC_NAME.some((re) => re.test(name))
    };
  }

  /**
   * Why a listing tile should be hidden under the current filters, or null to keep it.
   * `ownedKeys` is a Set of `baseKey(name)` values; a tile is owned when its own title has the same key
   * (so owning "God of War" hides "God of War" and its Deluxe Edition, never "God of War Ragnarök").
   */
  function shouldHideTile(tile, opts) {
    const o = opts || {};
    const kind = classifyTile(tile);
    if (o.hideAddons && kind.addon) return "addon";
    if (o.hideDlc && kind.dlc) return "dlc";
    if (o.hideOwned && o.ownedKeys && o.ownedKeys.size && o.baseKey && tile.name) {
      if (o.ownedKeys.has(o.baseKey(tile.name))) return "owned";
    }
    return null;
  }

  /* ───────────── "Check this page" ───────────── */

  /**
   * Run every lookup the extension relies on against this page and say which strategy answered.
   * Each check: { id, status: "ok"|"warn"|"fail", strategy?, detail? }.
   */
  function selfCheck(doc, loc) {
    const path = (loc && loc.pathname) || "";
    const hint = H.currencyFromStorePath(path);
    const region = regionFromPath(path);
    const checks = [];
    let page = "other";
    if (isProductPath(path)) {
      page = "product";
      const title = readTitle(doc);
      checks.push({
        id: "title",
        status: title ? (title.strategy === "data-qa" ? "ok" : "warn") : "fail",
        strategy: title && title.strategy,
        detail: title ? title.value : ""
      });
      const price = readPrice(doc, { hint, region });
      const priceStatus = !price ? "fail" : price.mismatch || price.source !== "buy-box" ? "warn" : "ok";
      checks.push({
        id: "price",
        status: priceStatus,
        strategy: price && price.source,
        detail: price ? `${price.amount} ${price.currency}${price.mismatch ? " (differs from JSON-LD)" : ""}` : ""
      });
      const anchor = findAnchor(doc);
      checks.push({
        id: "anchor",
        status: anchor ? (anchor.strategy === "buy-box" ? "ok" : "warn") : "fail",
        strategy: anchor && anchor.strategy
      });
    } else if (isListingPath(path)) {
      page = "listing";
      const tiles = readTiles(doc, { hint });
      checks.push({ id: "tiles", status: tiles.length ? "ok" : "fail", detail: String(tiles.length) });
      const named = tiles.filter((t) => t.name).length;
      checks.push({
        id: "names",
        status: tiles.length && named === tiles.length ? "ok" : named ? "warn" : "fail",
        detail: `${named}/${tiles.length}`
      });
      const priced = tiles.filter((t) => t.price != null).length;
      checks.push({
        id: "prices",
        status: priced ? "ok" : tiles.length ? "warn" : "fail",
        detail: `${priced}/${tiles.length}`
      });
    }
    return { page, path, checks, ok: checks.filter((c) => c.status === "ok").length, total: checks.length };
  }

  const api = {
    isProductPath,
    isListingPath,
    regionFromPath,
    readJsonLd,
    readJsonLdFromHtml,
    normalizeName,
    readTitle,
    readPrice,
    readOffers,
    parseEndDay,
    findAnchor,
    readTiles,
    classifyTile,
    shouldHideTile,
    selfCheck
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.PSEStore = api;
})(typeof self !== "undefined" ? self : typeof globalThis !== "undefined" ? globalThis : this);
