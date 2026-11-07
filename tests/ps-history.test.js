const fs = require("fs");
const path = require("path");
const { createEnv, jsonResponse, hostOf } = require("./support/sw-env");

jest.setTimeout(20000);
afterEach(() => jest.restoreAllMocks());

const FIX = path.join(__dirname, "fixtures", "ps-store");
const html = (name) => fs.readFileSync(path.join(FIX, name), "utf8");
const today = () => Math.floor(Date.now() / 86400000);
const point = (env, gameName, amount, extra = {}) =>
  env.send({ type: "RECORD_PS_PRICE", gameName, amount, currency: "USD", ...extra });

describe("PlayStation price history (3.0): recording", () => {
  test("RECORD_PS_PRICE keeps the sale details next to the price, one point per day", async () => {
    const env = createEnv().loadServiceWorker();
    const ends = today() + 6;
    await point(env, "Valheim", 23.99, { orig: 29.99, pct: 20, ends, plus: 19.99 });
    await point(env, "Valheim", 22.99, { orig: 29.99, pct: 23, ends, plus: 19.99 }); // same day: replaced, not appended
    const r = await env.send({ type: "PS_PRICE_HISTORY", gameName: "Valheim", currency: "usd" });
    expect(r.points).toEqual([[today(), 22.99, 29.99, 23, ends, 19.99]]);
    expect(r.stats).toMatchObject({ count: 1, enough: false });
  });

  test("junk sale details are dropped, junk prices rejected (the 79,991 case)", async () => {
    const env = createEnv().loadServiceWorker();
    await point(env, "Valheim", 23.99, { orig: 5, pct: 400, ends: 3, plus: -1 });
    expect((await env.send({ type: "PS_PRICE_HISTORY", gameName: "Valheim", currency: "USD" })).points[0]).toEqual([today(), 23.99]);
    expect(await point(env, "Valheim", 79991)).toEqual({ ok: false });
    expect(await env.send({ type: "PS_PRICE_HISTORY", gameName: "Valheim", currency: "NOPE" })).toEqual({ ok: false });
  });

  test("currencies never mix: the same game in USD and ILS keeps two histories", async () => {
    const env = createEnv().loadServiceWorker();
    await point(env, "Valheim", 29.99);
    await env.send({ type: "RECORD_PS_PRICE", gameName: "Valheim", amount: 119, currency: "ILS" });
    expect((await env.send({ type: "PS_PRICE_HISTORY", gameName: "Valheim", currency: "ILS" })).points[0][1]).toBe(119);
    expect((await env.send({ type: "PS_PRICE_HISTORY", gameName: "Valheim", currency: "USD" })).points[0][1]).toBe(29.99);
  });

  test("grid prices only extend histories that exist or wishlisted games (browsing never pushes tracked games out)", async () => {
    const env = createEnv().loadServiceWorker();
    await point(env, "God of War", 19.99); // looked at before
    await env.send({ type: "ADD_WISHLIST", gameName: "Valheim" }); // wishlisted, no PS history yet
    const items = [
      { gameName: "God of War", amount: 9.99, currency: "USD", orig: 19.99, pct: 50 },
      { gameName: "Valheim", amount: 23.99, currency: "USD" },
      { gameName: "Some Random Game", amount: 5, currency: "USD" },
      { gameName: "Broken", amount: 79991, currency: "USD" }
    ];
    expect(await env.send({ type: "RECORD_PS_PRICES", items })).toEqual({ ok: true, recorded: 2 });
    const snaps = env.stores.local.pse_snapshots;
    expect(Object.keys(snaps).filter((k) => k.startsWith("ps_")).sort()).toEqual(["ps_USD_god-of-war", "ps_USD_valheim"]);
    expect(snaps["ps_USD_god-of-war"].p[0].slice(1)).toEqual([9.99, 19.99, 50]);
    expect(await env.send({ type: "RECORD_PS_PRICES", items: [] })).toEqual({ ok: true, recorded: 0 });
  });
});

describe("PlayStation price history (3.0): statistics", () => {
  test("history needs two different days before it claims a trend", async () => {
    const env = createEnv().loadServiceWorker();
    await point(env, "Valheim", 29.99);
    env.advanceDays(3);
    expect((await env.send({ type: "PS_PRICE_HISTORY", gameName: "Valheim", currency: "USD" })).stats.enough).toBe(false);
    await point(env, "Valheim", 23.99);
    const { stats } = await env.send({ type: "PS_PRICE_HISTORY", gameName: "Valheim", currency: "USD" });
    expect(stats).toMatchObject({ count: 2, enough: true, spanDays: 3, atLow: true });
    expect(stats.low.price).toBe(23.99);
    expect(stats.trend).toMatchObject({ direction: "down", spanDays: 3 });
  });

  test("keeps up to 400 days", async () => {
    const env = createEnv().loadServiceWorker();
    for (let i = 0; i < 410; i++) {
      await point(env, "Valheim", 20 + (i % 7));
      env.advanceDays(1);
    }
    const { points } = await env.send({ type: "PS_PRICE_HISTORY", gameName: "Valheim", currency: "USD" });
    expect(points).toHaveLength(400);
    expect(points[0][0]).toBe(points[399][0] - 399);
  });
});

describe("PlayStation price history (3.0): the daily wishlist refresh", () => {
  const url = "https://store.playstation.com/en-il/product/EP4837-PPSA28824_00-0VALHEIMBASEGAME";
  const noPsPoints = (env) => !Object.keys(env.stores.local.pse_snapshots || {}).some((k) => k.startsWith("ps_"));

  test("reads the saved store page's JSON-LD and records its PS price", async () => {
    const env = createEnv().loadServiceWorker();
    env.route((u) => (u === url ? jsonResponse(html("valheim-product-en-il.html")) : undefined));
    await env.send({ type: "ADD_WISHLIST", gameName: "Valheim", storeUrl: url });
    await env.send({ type: "CHECK_WISHLIST_NOW" });
    const r = await env.send({ type: "PS_PRICE_HISTORY", gameName: "Valheim", currency: "ILS" });
    expect(r.points.map((p) => p[1])).toEqual([95.2]);
    expect((await env.send({ type: "GET_WISHLIST" })).list[0].psPrice).toMatchObject({ amount: 95.2, currency: "ILS" });
    // the request was logged as host + path only
    const log = await self.PSENet.get();
    const entry = log.find((e) => e.h === "store.playstation.com");
    expect(entry).toMatchObject({ p: "/en-il/product/EP4837-PPSA28824_00-0VALHEIMBASEGAME", s: 200, ok: true });
  });

  test("a page that names another game records nothing", async () => {
    const env = createEnv().loadServiceWorker();
    env.route((u) => (u === url ? jsonResponse(html("valheim-product-en-il.html")) : undefined));
    await env.send({ type: "ADD_WISHLIST", gameName: "Elden Ring", storeUrl: url });
    await env.send({ type: "CHECK_WISHLIST_NOW" });
    expect(noPsPoints(env)).toBe(true);
  });

  test("an HTTP error records nothing", async () => {
    const env = createEnv().loadServiceWorker();
    env.route((u) => (u === url ? jsonResponse({}, 503) : undefined));
    await env.send({ type: "ADD_WISHLIST", gameName: "Valheim", storeUrl: url });
    await env.send({ type: "CHECK_WISHLIST_NOW" });
    expect(noPsPoints(env)).toBe(true);
  });

  test("turning price history off in Settings stops the page requests", async () => {
    const env = createEnv().loadServiceWorker();
    env.route((u) => (u === url ? jsonResponse(html("valheim-product-en-il.html")) : undefined));
    await env.chrome.storage.sync.set({ enablePriceHistory: false });
    await env.send({ type: "ADD_WISHLIST", gameName: "Valheim", storeUrl: url });
    await env.send({ type: "CHECK_WISHLIST_NOW" });
    expect(env.fetchLog).not.toContain(url);
  });

  test("a stored URL that is not store.playstation.com is never fetched", async () => {
    const env = createEnv().loadServiceWorker();
    await env.send({ type: "ADD_WISHLIST", gameName: "Valheim", storeUrl: "https://evil.example/en-il/product/X" });
    await env.send({ type: "CHECK_WISHLIST_NOW" });
    expect(env.fetchLog.some((u) => hostOf(u) === "evil.example")).toBe(false);
  });
});

describe("diagnostics from the page", () => {
  test("DIAG_LOG writes content-script events to the local log and is rate-limited", async () => {
    const env = createEnv().loadServiceWorker();
    expect(await env.send({ type: "DIAG_LOG", event: "feature-failed", details: { feature: "trophies", message: "boom" } })).toEqual({ ok: true });
    const first = (await env.send({ type: "DIAG_GET" })).entries[0];
    expect(first).toMatchObject({ s: "content", e: "feature-failed", d: { feature: "trophies" } });
    let refused = 0;
    for (let i = 0; i < 40; i++) if (!(await env.send({ type: "DIAG_LOG", event: "spam" })).ok) refused++;
    expect(refused).toBeGreaterThan(15);
    env.advanceDays((2 * 60000) / 86400000); // two minutes later the budget is back
    expect((await env.send({ type: "DIAG_LOG", event: "later" })).ok).toBe(true);
  });
});
