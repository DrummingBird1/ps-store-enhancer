/**
 * Regression tests for the problems an independent review of the 3.0 change found (each test names the
 * scenario that used to go wrong).
 */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const H = require("../extension/helpers.js");
const Store = require("../extension/store-adapter.js");
const { createEnv, jsonResponse, hostOf } = require("./support/sw-env");

jest.setTimeout(20000);
afterEach(() => jest.restoreAllMocks());

const DAY = 86400000;
const t0 = Date.UTC(2026, 10, 7, 12);
const FIX = path.join(__dirname, "fixtures", "ps-store");
const html = (name) => fs.readFileSync(path.join(FIX, name), "utf8");

describe("same-day writes never erase sale details of the same price", () => {
  test("a search-grid write with fewer fields keeps what the product page stored", () => {
    let s = H.addSnapshot({}, "k", 23.99, t0, undefined, { orig: 29.99, pct: 20, ends: 20800, plus: 19.99 });
    s = H.addSnapshot(s, "k", 23.99, t0 + 3600000, undefined, { orig: 29.99, pct: 20 }); // no ends / plus
    s = H.addSnapshot(s, "k", 23.99, t0 + 7200000); // the daily background refresh: no extras at all
    expect(s.k.p).toEqual([[H.dayNumber(t0), 23.99, 29.99, 20, 20800, 19.99]]);
  });

  test("but a different price the same day replaces the point (the sale details belonged to the old price)", () => {
    let s = H.addSnapshot({}, "k", 23.99, t0, undefined, { orig: 29.99, pct: 20, ends: 20800 });
    s = H.addSnapshot(s, "k", 29.99, t0 + 3600000);
    expect(s.k.p).toEqual([[H.dayNumber(t0), 29.99]]);
  });
});

describe("price plausibility per currency", () => {
  test("premium editions in INR and TRY are real prices; the glued-digit mistakes are still refused", () => {
    expect(H.isPlausiblePrice(7999, "INR")).toBe(true);
    expect(H.isPlausiblePrice(4499, "TRY")).toBe(true);
    expect(H.isPlausiblePrice(79991, "INR")).toBe(false);
    expect(H.isPlausiblePrice(79991, "USD")).toBe(false);
    expect(H.isPlausiblePrice(7999, "EUR")).toBe(false);
  });
});

describe("restoring a backup is never destructive", () => {
  const now = t0;
  const today = H.dayNumber(now);

  test("future days and future 'last updated' values are clamped away", () => {
    const merged = H.mergeSnapshots({}, { pc_x: { p: [[today, 5], [today + 40, 1], [59999, 1]], u: 1e15 } }, { now });
    expect(merged.pc_x.p).toEqual([[today, 5]]);
    expect(merged.pc_x.u).toBeLessThanOrEqual(today + 1);
  });

  test("a backup with 300 fresh-looking junk games cannot push the local history out", () => {
    const local = {};
    for (let i = 0; i < 100; i++) local[`ps_USD_game${i}`] = { p: [[today - 100, 10]], u: today - 100 };
    const junk = {};
    for (let i = 0; i < 300; i++) junk[`pc_junk${i}`] = { p: [[today, 5]], u: 1e15 };
    const merged = H.mergeSnapshots(local, junk, { now });
    for (let i = 0; i < 100; i++) expect(merged[`ps_USD_game${i}`]).toBeDefined();
    expect(Object.keys(merged)).toHaveLength(300); // only the 200 free slots were filled
  });

  test("games that exist locally are still merged when the store is full", () => {
    const local = {};
    for (let i = 0; i < 300; i++) local[`pc_g${i}`] = { p: [[today - 5, 10]], u: today - 5 };
    const merged = H.mergeSnapshots(local, { pc_g7: { p: [[today - 9, 12]], u: today - 9 }, pc_new: { p: [[today, 1]], u: today } }, { now });
    expect(merged.pc_g7.p.map((p) => p[0])).toEqual([today - 9, today - 5]);
    expect(merged.pc_new).toBeUndefined();
  });

  test("the worker merges a backup under the snapshot lock (MERGE_SNAPSHOTS)", async () => {
    const env = createEnv().loadServiceWorker();
    await env.send({ type: "RECORD_PS_PRICE", gameName: "Valheim", amount: 23.99, currency: "USD" });
    const r = await env.send({ type: "MERGE_SNAPSHOTS", snapshots: { ps_USD_valheim: { p: [[20000, 29.99]], u: 20000 }, evil: { p: [[20000, 1]] } } });
    expect(r).toEqual({ ok: true, games: 1 });
    const { points } = await env.send({ type: "PS_PRICE_HISTORY", gameName: "Valheim", currency: "USD" });
    expect(points.map((p) => p[1])).toEqual([29.99, 23.99]);
  });
});

describe("JSON-LD: the page's Product, never another block", () => {
  const org = '<script type="application/ld+json">{"@context":"http://schema.org","@type":"Organization","name":"PlayStation Store"}</script>';
  const product = '<script type="application/ld+json">{"@type":"Product","name":"Valheim","offers":{"@type":"Offer","price":23.99,"priceCurrency":"USD"}}</script>';

  test("an Organization block before the Product does not hide the price (raw HTML and DOM)", () => {
    expect(Store.readJsonLdFromHtml(`<head>${org}${product}</head>`)).toEqual({ name: "Valheim", amount: 23.99, currency: "USD" });
    const doc = new JSDOM(`<head>${org}${product}</head><body></body>`).window.document;
    expect(Store.readJsonLd(doc)).toEqual({ name: "Valheim", amount: 23.99, currency: "USD" });
  });

  test("only an Organization: no price and no title from it", () => {
    expect(Store.readJsonLdFromHtml(`<head>${org}</head>`)).toBeNull();
  });
});

describe("currency is never guessed", () => {
  test("a bare '$' in a store region we cannot map is not read as US dollars", () => {
    expect(H.currencyFromStorePath("/en-zz/search/x")).toBeNull();
    const doc = new JSDOM(html("search-god-of-war-en-us.html")).window.document;
    const withHint = Store.readTiles(doc, { hint: "USD" }).filter((t) => t.price != null).length;
    const withoutHint = Store.readTiles(doc, { hint: null }).filter((t) => t.price != null).length;
    expect(withHint).toBe(16);
    expect(withoutHint).toBe(0);
  });

  test("regions the extension knows now include more of the store's countries", () => {
    expect(H.currencyFromStorePath("/en-sg/product/X")).toBe("SGD");
    expect(H.currencyFromStorePath("/en-hu/product/X")).toBe("HUF");
    expect(H.currencyFromStorePath("/en-sk/product/X")).toBe("EUR");
  });
});

describe("category and collection pages use the same grid with another data-qa prefix", () => {
  test("tiles, labels and hiding work on ems-sdk-grid#productTileN (verified live on /category/… 2026-11-07)", () => {
    const category = html("search-god-of-war-en-us.html").replace(/search#productTile/g, "ems-sdk-grid#productTile");
    const doc = new JSDOM(category).window.document;
    const tiles = Store.readTiles(doc, { hint: "USD" });
    expect(tiles).toHaveLength(24);
    expect(tiles.every((t) => t.unit.tagName === "LI")).toBe(true);
    const hidden = tiles.map((t, i) => (Store.shouldHideTile(t, { hideAddons: true, hideDlc: true }) ? i : -1)).filter((i) => i >= 0);
    expect(hidden).toEqual([7, 8, 11, 13, 16, 19, 20, 21]);
  });
});

describe("the daily wishlist refresh is polite", () => {
  const LIST = (n) =>
    Array.from({ length: n }, (_, i) => ({ name: `Game ${i}`, storeUrl: `https://store.playstation.com/en-us/product/G${i}`, addedAt: i, notified: false }));
  const page = (name, price) =>
    `<head><script type="application/ld+json">${JSON.stringify({ "@type": "Product", name, offers: { price, priceCurrency: "USD" } })}</script></head>`;

  // the real sleeps (150 ms / 400 ms per game) would make these tests slow
  const noSleep = () => jest.spyOn(global, "setTimeout").mockImplementation((fn) => { Promise.resolve().then(fn); return 0; });

  test("at most once a day, even when 'Check now' is clicked repeatedly", async () => {
    noSleep();
    const env = createEnv().loadServiceWorker();
    await env.chrome.storage.local.set({ wishlist: LIST(2) });
    env.route((u) => (hostOf(u) === "store.playstation.com" ? jsonResponse(page(u.endsWith("G0") ? "Game 0" : "Game 1", 20)) : undefined));
    await env.send({ type: "CHECK_WISHLIST_NOW" });
    const first = env.fetchLog.filter((u) => hostOf(u) === "store.playstation.com").length;
    expect(first).toBe(2);
    await env.send({ type: "CHECK_WISHLIST_NOW" });
    expect(env.fetchLog.filter((u) => hostOf(u) === "store.playstation.com").length).toBe(2); // nothing new
    env.advanceDays(21 / 24);
    await env.send({ type: "CHECK_WISHLIST_NOW" });
    expect(env.fetchLog.filter((u) => hostOf(u) === "store.playstation.com").length).toBe(4);
  });

  test("a long wishlist takes turns: 20 pages per run, the next run continues where this one stopped", async () => {
    noSleep();
    const env = createEnv().loadServiceWorker();
    await env.chrome.storage.local.set({ wishlist: LIST(25) });
    env.route((u) => {
      const m = u.match(/product\/G(\d+)$/);
      return m ? jsonResponse(page(`Game ${m[1]}`, 10 + Number(m[1]))) : undefined;
    });
    const visited = () => env.fetchLog.filter((u) => /product\/G\d+$/.test(u)).map((u) => Number(u.match(/G(\d+)$/)[1]));
    await env.send({ type: "CHECK_WISHLIST_NOW" });
    expect(visited()).toEqual(Array.from({ length: 20 }, (_, i) => i));
    env.advanceDays(21 / 24);
    await env.send({ type: "CHECK_WISHLIST_NOW" });
    const second = visited().slice(20);
    expect(second.slice(0, 5)).toEqual([20, 21, 22, 23, 24]); // continues at game 20 …
    expect(second.slice(5)).toEqual(Array.from({ length: 15 }, (_, i) => i)); // … and wraps around
    expect(new Set(visited()).size).toBe(25); // every game was refreshed within two runs
  });

  test("when the store refuses (403), it stops after three requests instead of sending twenty", async () => {
    noSleep();
    const env = createEnv().loadServiceWorker();
    await env.chrome.storage.local.set({ wishlist: LIST(10) });
    env.route((u) => (hostOf(u) === "store.playstation.com" ? jsonResponse({}, 403) : undefined));
    await env.send({ type: "CHECK_WISHLIST_NOW" });
    expect(env.fetchLog.filter((u) => hostOf(u) === "store.playstation.com").length).toBe(3);
  });

  test("a redirect to another host is discarded", async () => {
    noSleep();
    const env = createEnv().loadServiceWorker();
    await env.chrome.storage.local.set({ wishlist: LIST(1) });
    env.route((u) => (hostOf(u) === "store.playstation.com" ? { ...jsonResponse(page("Game 0", 5)), redirected: true, url: "https://evil.example/x" } : undefined));
    await env.send({ type: "CHECK_WISHLIST_NOW" });
    expect(Object.keys(env.stores.local.pse_snapshots || {}).some((k) => k.startsWith("ps_"))).toBe(false);
  });
});

describe("network layer: redirects", () => {
  test("a redirect that ends on a host outside the allow-list is refused and logged", async () => {
    const env = createEnv().loadServiceWorker();
    env.route((u) => (hostOf(u) === "api.frankfurter.dev" ? { ...jsonResponse({}), redirected: true, url: "https://evil.example/steal" } : undefined));
    await expect(self.PSENet.fetch("https://api.frankfurter.dev/v1/latest")).rejects.toThrow(/redirected to a host that is not allowed/);
    expect((await self.PSENet.get())[0]).toMatchObject({ h: "api.frankfurter.dev", e: "blocked-redirect", ok: false });
    env.route((u) => (hostOf(u) === "www.cheapshark.com" ? { ...jsonResponse({}), redirected: true, url: "https://api.frankfurter.dev/x" } : undefined));
    await expect(self.PSENet.fetch("https://www.cheapshark.com/api/1.0/stores")).resolves.toBeTruthy(); // another allowed host is fine
  });

  test("the privacy texts really describe the daily page read, not just mention the host", () => {
    const root = path.join(__dirname, "..");
    const policy = fs.readFileSync(path.join(root, "assets", "docs", "privacy-policy.html"), "utf8");
    const notes = fs.readFileSync(path.join(root, "assets", "REVIEWER-NOTES.md"), "utf8");
    const listing = fs.readFileSync(path.join(root, "assets", "STORE-LISTING.txt"), "utf8");
    expect(policy).toMatch(/store\.playstation\.com\)[\s\S]{0,400}wishlist/i);
    expect(policy).toMatch(/once a day[\s\S]{0,200}saved page of each wishlisted game|saved page of each wishlisted game[\s\S]{0,200}once a day/i);
    expect(notes).toMatch(/`store\.playstation\.com`[^\n]*once a day[^\n]*wishlist/i);
    expect(listing).toMatch(/the PlayStation Store itself \(the saved page of each wishlisted game, once a day\)/);
  });
});

describe("a wishlisted game's saved address", () => {
  test("is stored without query string or fragment, and only when it is a store page", async () => {
    const env = createEnv().loadServiceWorker();
    await env.send({ type: "ADD_WISHLIST", gameName: "Elden Ring", storeUrl: "https://store.playstation.com/en-us/concept/1?emcid=abc&x=y#frag" });
    await env.send({ type: "ADD_WISHLIST", gameName: "Hades II", storeUrl: "https://evil.example/en-us/concept/2?x=1" });
    const list = (await env.send({ type: "GET_WISHLIST" })).list;
    expect(list.find((i) => i.name === "Elden Ring").storeUrl).toBe("https://store.playstation.com/en-us/concept/1");
    expect(list.find((i) => i.name === "Hades II").storeUrl).toBeNull();
  });
});
