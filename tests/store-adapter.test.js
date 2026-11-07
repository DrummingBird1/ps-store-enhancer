/**
 * The store adapter against saved REAL pages (tests/fixtures/ps-store/*.html, minimized captures of
 * store.playstation.com taken 2026-11-07). These are the regression tests for the four v2.7.1 bugs
 * found on the live store: wrong price read, add-on/DLC filters that matched nothing, hide-owned that
 * hid sequels and kept the owned game, and blank grid slots.
 */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const H = require("../extension/helpers.js");
const PSEMatch = require("../extension/match.js");
const Store = require("../extension/store-adapter.js");

const load = (name) =>
  new JSDOM(fs.readFileSync(path.join(__dirname, "fixtures", "ps-store", name), "utf8")).window.document;

const gta = () => load("gta6-concept-en-us.html");
const valheimUs = () => load("valheim-product-en-us.html");
const valheimIl = () => load("valheim-product-en-il.html");
const search = () => load("search-god-of-war-en-us.html");

const dayOf = (iso) => Math.floor(Date.parse(iso) / 86400000);

describe("product page: title", () => {
  test("uses the data-qa title, not the hidden 'Access Denied' h1 that precedes it", () => {
    for (const doc of [gta(), valheimUs(), valheimIl()]) {
      const t = Store.readTitle(doc);
      expect(t.strategy).toBe("data-qa");
      expect(t.value).not.toMatch(/access denied/i);
    }
    expect(Store.readTitle(gta()).value).toBe("Grand Theft Auto VI: Ultimate Edition");
  });

  test("falls back to main h1, then JSON-LD, when the data-qa name is gone", () => {
    const doc = valheimUs();
    doc.querySelector('[data-qa="mfe-game-title#name"]').removeAttribute("data-qa");
    expect(Store.readTitle(doc)).toEqual({ value: "Valheim", strategy: "h1-class" });
    doc.querySelector("main h1").remove();
    expect(Store.readTitle(doc)).toEqual({ value: "Valheim", strategy: "json-ld" });
  });
});

describe("product page: the page's own price (bug: upsell edition read, $79.99 parsed as 79,991)", () => {
  test("GTA VI Ultimate Edition is $99.99, not the Standard Edition upsell", () => {
    const doc = gta();
    // The trap, as on the live store: the first ctaWithPrice in the DOM is the Standard Edition upsell.
    const trap = doc.querySelector('[data-qa*="ctaWithPrice"]');
    expect(trap.getAttribute("data-qa")).toBe("mfeUpsell#productEdition0#ctaWithPrice");
    expect(H.parsePsPrice(trap.textContent, "USD").amount).toBe(79991);

    const p = Store.readPrice(doc, { hint: "USD", region: "US" });
    expect(p).toMatchObject({ amount: 99.99, currency: "USD", source: "buy-box", mismatch: false });
    expect(p.original).toBeNull();
  });

  test("Valheim (US): the PlayStation Plus 'Game Trial' offer is skipped; sale details are read", () => {
    const p = Store.readPrice(valheimUs(), { hint: "USD", region: "US" });
    expect(p).toMatchObject({
      amount: 23.99, currency: "USD", original: 29.99, pct: 20, lowest30: 29.99, source: "buy-box", mismatch: false
    });
    expect(p.ends).toBe(dayOf("2026-11-21"));
    expect(p.plusAmount).toBeNull();
  });

  test("Valheim (Israel store): ILS prices and a day-first date", () => {
    const p = Store.readPrice(valheimIl(), { hint: "ILS", region: "IL" });
    expect(p).toMatchObject({ amount: 95.2, currency: "ILS", original: 119, pct: 20, lowest30: 119 });
    expect(p.ends).toBe(dayOf("2026-11-21"));
  });

  test("falls back to JSON-LD when the buy box is missing, and flags a disagreement", () => {
    const doc = valheimUs();
    doc.querySelector('[data-qa="mfeCtaMain"]').remove();
    expect(Store.readPrice(doc, { hint: "USD" })).toMatchObject({ amount: 23.99, currency: "USD", source: "json-ld" });

    const doc2 = valheimUs();
    doc2.querySelector('[data-qa="mfeCtaMain#offer1#finalPrice"]').textContent = "$25.99";
    expect(Store.readPrice(doc2, { hint: "USD" })).toMatchObject({ amount: 25.99, mismatch: true, source: "buy-box" });
  });

  test("a PlayStation Plus member price is reported separately and never becomes the page price", () => {
    const doc = valheimUs();
    doc.querySelector('[data-qa="mfeCtaMain#offer0#finalPrice"]').textContent = "$19.99";
    const p = Store.readPrice(doc, { hint: "USD" });
    expect(p).toMatchObject({ amount: 23.99, plusAmount: 19.99 });
  });

  test("JSON-LD left over from the previous game (in-page navigation) is not trusted", () => {
    const doc = valheimUs();
    doc.querySelector('[data-qa="mfeCtaMain"]').remove();
    expect(Store.readPrice(doc, { hint: "USD", title: "Valheim" })).toMatchObject({ amount: 23.99, source: "json-ld" });
    expect(Store.readPrice(doc, { hint: "USD", title: "Some Other Game" })).toBeNull();
  });

  test("an implausible number is never accepted (the 79,991 case)", () => {
    const doc = gta();
    doc.querySelector('[data-qa="mfeCtaMain#offer0#finalPrice"]').textContent = "$79.991";
    doc.querySelector('script[type="application/ld+json"]').remove();
    expect(Store.readPrice(doc, { hint: "USD" })).toBeNull();
  });

  test("buy-box anchor: the cards go after the real buy box, not after an edition upsell", () => {
    const a = Store.findAnchor(gta());
    expect(a.strategy).toBe("buy-box");
    expect(a.el.getAttribute("data-qa")).toBe("mfeCtaMain");
  });
});

describe("parseEndDay", () => {
  test("month-first for the US, day-first elsewhere, and unambiguous dates either way", () => {
    expect(Store.parseEndDay("Offer ends 11/21/2026 09:59 GMT+2", "US")).toBe(dayOf("2026-11-21"));
    expect(Store.parseEndDay("Offer ends 21/11/2026 01:59 GMT+2", "IL")).toBe(dayOf("2026-11-21"));
    expect(Store.parseEndDay("Offer ends 03/04/2026", "US")).toBe(dayOf("2026-03-04"));
    expect(Store.parseEndDay("Offer ends 03/04/2026", "GB")).toBe(dayOf("2026-04-03"));
    expect(Store.parseEndDay("Offer ends 2026-12-01", null)).toBe(dayOf("2026-12-01"));
    expect(Store.parseEndDay("soon", "US")).toBeNull();
    expect(Store.parseEndDay("31/31/2026", "IL")).toBeNull();
  });
});

describe("search page tiles", () => {
  const tiles = () => Store.readTiles(search(), { hint: "USD" });

  test("finds each of the 24 tiles once (the store nests the same data-qa twice)", () => {
    const t = tiles();
    expect(t).toHaveLength(24);
    expect(t[0]).toMatchObject({
      name: "God of War", price: 9.99, currency: "USD", original: 19.99, pct: 50,
      id: "UP9000-CUSA07408_00-00000000GODOFWAR"
    });
    expect(t[1].name).toBe("God of War Ragnarök");
    expect(t[22].id).toBe("10011108");
  });

  test("'Free', 'Included', 'Unavailable' and empty prices are not prices", () => {
    const t = tiles();
    for (const i of [6, 7, 15, 21, 22, 23]) expect(t[i].price).toBeNull();
    expect(t[11].price).toBe(10);
  });

  test("the hide unit is the grid's li, so a hidden tile reflows instead of leaving a blank slot", () => {
    for (const t of tiles()) {
      expect(t.unit.tagName).toBe("LI");
      expect(t.unit.parentElement.className).toContain("psw-grid-list");
    }
  });

  test("tile classification follows the store's own type label, then the name", () => {
    const t = tiles();
    const kinds = t.map((x) => Store.classifyTile(x));
    const addons = kinds.map((k, i) => (k.addon ? i : -1)).filter((i) => i >= 0);
    const dlc = kinds.map((k, i) => (k.dlc ? i : -1)).filter((i) => i >= 0);
    // Add-on (costume), Add-on (comics), Add-On Pack (comics)
    expect(addons).toEqual([19, 20, 21]);
    // Level x3 (Valhalla PS4/PS5, RTK13EP scenario), Digital Deluxe Upgrade, Episode
    expect(dlc).toEqual([7, 8, 11, 13, 16]);
    // A full game that is sold as a "Game Bundle" and editions are never add-ons or DLC
    expect(kinds[15]).toEqual({ addon: false, dlc: false });
    expect(kinds[10]).toEqual({ addon: false, dlc: false });
    expect(kinds[4]).toEqual({ addon: false, dlc: false });
  });

  test("currency / starter pack wording is an add-on even without a store label", () => {
    expect(Store.classifyTile({ name: "5,000 Gold Coins", type: "" }).addon).toBe(true);
    expect(Store.classifyTile({ name: "Starter Pack", type: "" }).addon).toBe(true);
    expect(Store.classifyTile({ name: "Elden Ring", type: "" })).toEqual({ addon: false, dlc: false });
  });

  test("hide add-ons / hide DLC hide what the store labels as such (v2.7.1 hid none / one of them)", () => {
    const t = tiles();
    const hidden = (opts) => t.map((x, i) => (Store.shouldHideTile(x, opts) ? i : -1)).filter((i) => i >= 0);
    expect(hidden({ hideAddons: true })).toEqual([19, 20, 21]);
    expect(hidden({ hideDlc: true })).toEqual([7, 8, 11, 13, 16]);
    expect(hidden({ hideAddons: true, hideDlc: true })).toEqual([7, 8, 11, 13, 16, 19, 20, 21]);
    expect(hidden({})).toEqual([]);
  });

  test("hide owned: owning 'God of War' hides it and its Deluxe Edition, never the sequels", () => {
    const t = tiles();
    const ownedKeys = new Set(["God of War"].map((g) => PSEMatch.baseKey(g)));
    const hidden = t
      .map((x, i) => (Store.shouldHideTile(x, { hideOwned: true, ownedKeys, baseKey: PSEMatch.baseKey }) ? i : -1))
      .filter((i) => i >= 0);
    expect(hidden).toEqual([0, 4]);
  });
});

describe("Check this page (selfCheck)", () => {
  test("product pages: title, price and anchor all work through the primary strategy", () => {
    for (const [doc, p] of [[gta(), "/en-us/concept/10000730"], [valheimIl(), "/en-il/product/EP4837-PPSA28824_00-0VALHEIMBASEGAME"]]) {
      const r = Store.selfCheck(doc, { pathname: p });
      expect(r.page).toBe("product");
      expect(r.checks.map((c) => [c.id, c.status])).toEqual([["title", "ok"], ["price", "ok"], ["anchor", "ok"]]);
      expect(r.ok).toBe(3);
    }
  });

  test("it says plainly which lookup broke and which fell back", () => {
    const doc = valheimUs();
    doc.querySelector('[data-qa="mfeCtaMain"]').remove();
    doc.querySelector('[data-qa="mfe-game-title#name"]').removeAttribute("data-qa");
    const r = Store.selfCheck(doc, { pathname: "/en-us/product/EP4837-PPSA28824_00-0VALHEIMBASEGAME" });
    expect(r.checks.find((c) => c.id === "title")).toMatchObject({ status: "warn", strategy: "h1-class" });
    expect(r.checks.find((c) => c.id === "price")).toMatchObject({ status: "warn", strategy: "json-ld" });
    expect(r.checks.find((c) => c.id === "anchor")).toMatchObject({ status: "warn", strategy: "title-block" });
    expect(r.ok).toBe(0);
  });

  test("listing pages: tiles, names and prices", () => {
    const r = Store.selfCheck(search(), { pathname: "/en-us/search/god%20of%20war" });
    expect(r.page).toBe("listing");
    expect(r.checks).toEqual([
      { id: "tiles", status: "ok", detail: "24" },
      { id: "names", status: "ok", detail: "24/24" },
      // 24 tiles minus 4 "Free", 1 "Included", 1 "Unavailable" and 2 announced titles without a price
      { id: "prices", status: "ok", detail: "16/24" }
    ]);
  });

  test("an empty or redesigned page fails loudly instead of silently doing nothing", () => {
    const empty = new JSDOM("<html><body><main></main></body></html>").window.document;
    expect(Store.selfCheck(empty, { pathname: "/en-us/search/x" }).checks.every((c) => c.status === "fail")).toBe(true);
    expect(Store.selfCheck(empty, { pathname: "/en-us/product/ABC" }).checks.every((c) => c.status === "fail")).toBe(true);
    expect(Store.selfCheck(empty, { pathname: "/en-us/pages/latest" })).toMatchObject({ page: "other", total: 0 });
  });
});
