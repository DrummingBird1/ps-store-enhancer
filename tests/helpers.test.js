const H = require("../extension/helpers.js");

const DAY = H.DAY;

describe("escapeHtml / sanitizeUrl / buildStoreSearchUrl", () => {
  test("escapeHtml covers all five dangerous characters", () => {
    expect(H.escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe(
      "&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;"
    );
    expect(H.escapeHtml(null)).toBe("");
  });
  test("sanitizeUrl keeps only http(s)", () => {
    expect(H.sanitizeUrl("https://a.b/c?d=1")).toBe("https://a.b/c?d=1");
    expect(H.sanitizeUrl("javascript:alert(1)")).toBe("#");
    expect(H.sanitizeUrl("data:text/html,x")).toBe("#");
    expect(H.sanitizeUrl("")).toBe("#");
    expect(H.sanitizeUrl("not a url")).toBe("#");
  });
  test("buildStoreSearchUrl keeps the page's store locale", () => {
    expect(H.buildStoreSearchUrl("/en-il/concept/1", "Hades II")).toBe(
      "https://store.playstation.com/en-il/search/Hades%20II"
    );
    expect(H.buildStoreSearchUrl("/", "a&b")).toBe("https://store.playstation.com/en-us/search/a%26b");
  });
});

describe("formatMoney", () => {
  test("converts with the rate and formats in the currency", () => {
    expect(H.formatMoney(10, "USD", 1, "en-US")).toBe("$10.00");
    expect(H.formatMoney(10, "ILS", 3, "en-US")).toContain("30.00");
  });
  test("falls back for an invalid currency code", () => {
    expect(H.formatMoney(10, "???", 2, "en-US")).toBe("20.00 ???");
  });
});

describe("price snapshots", () => {
  test("records one price per day and keeps the latest of the day", () => {
    let s = H.addSnapshot({}, "g", 50, 100 * DAY);
    s = H.addSnapshot(s, "g", 45, 100 * DAY + 3600000);
    s = H.addSnapshot(s, "g", 40, 101 * DAY);
    expect(s.g.p).toEqual([[100, 45], [101, 40]]);
  });
  test("does not mutate the previous store", () => {
    const a = H.addSnapshot({}, "g", 50, 100 * DAY);
    const b = H.addSnapshot(a, "g", 40, 101 * DAY);
    expect(a.g.p).toEqual([[100, 50]]);
    expect(b.g.p.length).toBe(2);
  });
  test("ignores invalid prices and keys", () => {
    expect(H.addSnapshot({}, "g", 0, DAY)).toEqual({});
    expect(H.addSnapshot({}, "g", NaN, DAY)).toEqual({});
    expect(H.addSnapshot({}, "", 5, DAY)).toEqual({});
  });
  test("caps points per game and games overall (dropping the stalest)", () => {
    let s = {};
    for (let d = 0; d < 10; d++) s = H.addSnapshot(s, "g", 10 + d, d * DAY, { maxPoints: 4 });
    expect(s.g.p.length).toBe(4);
    expect(s.g.p[0][0]).toBe(6);
    let t = {};
    t = H.addSnapshot(t, "old", 5, 1 * DAY, { maxGames: 2 });
    t = H.addSnapshot(t, "mid", 5, 2 * DAY, { maxGames: 2 });
    t = H.addSnapshot(t, "new", 5, 3 * DAY, { maxGames: 2 });
    expect(Object.keys(t).sort()).toEqual(["mid", "new"]);
  });
});

describe("trendFromSnapshots / lowStatus", () => {
  test("down 20% vs ~30 days ago", () => {
    const pts = [[100, 50], [110, 45], [120, 40]];
    const t = H.trendFromSnapshots(pts, 125 * DAY, 30);
    expect(t).toEqual({ direction: "down", pct: -20, from: 50, to: 40, spanDays: 20 });
  });
  test("up, flat and not-enough-data", () => {
    expect(H.trendFromSnapshots([[100, 40], [130, 50]], 130 * DAY).direction).toBe("up");
    expect(H.trendFromSnapshots([[100, 50], [130, 50.2]], 130 * DAY).direction).toBe("flat");
    expect(H.trendFromSnapshots([[100, 50]], 130 * DAY)).toBeNull();
    expect(H.trendFromSnapshots(null, 130 * DAY)).toBeNull();
  });
  test("lowStatus classifies against the all-time low", () => {
    expect(H.lowStatus(29.95, 29.95)).toBe("at");
    expect(H.lowStatus(32, 29.95)).toBe("near");
    expect(H.lowStatus(40, 29.95)).toBeNull();
    expect(H.lowStatus(null, 29.95)).toBeNull();
  });
});

describe("wishlist helpers", () => {
  test("isDealReady honours price and percent targets", () => {
    expect(H.isDealReady({ lastCheckedPrice: 10, targetPrice: 12 })).toBe(true);
    expect(H.isDealReady({ lastCheckedPrice: 13, targetPrice: 12 })).toBe(false);
    expect(H.isDealReady({ lastCheckedPrice: 13, targetPercent: 30, lastSavings: 35 })).toBe(true);
    expect(H.isDealReady({ lastCheckedPrice: 13, targetPercent: 30, lastSavings: 20 })).toBe(false);
    expect(H.isDealReady({ lastCheckedPrice: null, targetPrice: 12 })).toBe(false);
    expect(H.isDealReady(null)).toBe(false);
    expect(H.isDealReady({ lastCheckedPrice: 5 })).toBe(false);
  });
  test("sortWishlist sorts and filters", () => {
    const list = [
      { name: "Beta", addedAt: 2, lastCheckedPrice: 30, lastSavings: 10 },
      { name: "Alpha", addedAt: 1, lastCheckedPrice: 50, lastSavings: 60 },
      { name: "Gamma", addedAt: 3, lastCheckedPrice: null, lastSavings: null }
    ];
    expect(H.sortWishlist(list, "name").map((i) => i.name)).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(H.sortWishlist(list, "added").map((i) => i.name)).toEqual(["Gamma", "Beta", "Alpha"]);
    expect(H.sortWishlist(list, "price").map((i) => i.name)).toEqual(["Beta", "Alpha", "Gamma"]);
    expect(H.sortWishlist(list, "discount").map((i) => i.name)).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(H.sortWishlist(list, "name", "ta").map((i) => i.name)).toEqual(["Beta"]);
  });
});

describe("completionist helpers", () => {
  test("midpointHours", () => {
    expect(H.midpointHours("100-120")).toBe(110);
    expect(H.midpointHours("100+")).toBe(100);
    expect(H.midpointHours("6-10")).toBe(8);
    expect(H.midpointHours("")).toBeNull();
    expect(H.midpointHours(null)).toBeNull();
  });
  test("completionistScore tiers", () => {
    expect(H.completionistScore(3, "15-20")).toMatchObject({ score: 24, tier: "quick" });
    expect(H.completionistScore(5, "30-40")).toMatchObject({ tier: "moderate" });
    expect(H.completionistScore(7, "100-120")).toMatchObject({ score: 79, tier: "grind" });
    expect(H.completionistScore(null, "10")).toBeNull();
    expect(H.completionistScore(11, "10")).toBeNull();
    expect(H.completionistScore(4, null).score).toBe(24);
  });
  test("pricePerHour", () => {
    expect(H.pricePerHour(60, "100-120")).toBe(0.55);
    expect(H.pricePerHour(20, "10")).toBe(2);
    expect(H.pricePerHour(20, null)).toBeNull();
  });
  test("similarOwned finds owned games of near difficulty, excluding itself", () => {
    const db = { "elden ring": { difficulty: 7 }, hades: { difficulty: 4 }, stray: { difficulty: 3 }, sifu: { difficulty: 9 } };
    const norm = (s) => String(s).toLowerCase();
    const out = H.similarOwned("hades", 4, ["Stray", "Hades", "Elden Ring", "Unknown Game"], db, norm, 3);
    expect(out).toEqual([{ name: "Stray", difficulty: 3 }]);
    expect(H.similarOwned("x", 8, ["Sifu", "Elden Ring"], db, norm, 3).map((o) => o.name)).toEqual(["Elden Ring", "Sifu"].sort((a, b) => ["Sifu", "Elden Ring"].indexOf(a) - ["Sifu", "Elden Ring"].indexOf(b)));
  });
});

describe("upcomingSales", () => {
  test("lists the next usual windows soonest first", () => {
    const rows = H.upcomingSales(new Date(2026, 9, 15), 2);
    expect(rows.map((r) => r.id)).toEqual(["steam-autumn", "ps-black-friday"]);
    expect(rows[0].daysUntil).toBe(42);
    expect(rows[0].underway).toBe(false);
  });
  test("reports a window as underway during its usual dates and rolls to next year after", () => {
    const rows = H.upcomingSales(new Date(2026, 5, 30), 6);
    const summer = rows.find((r) => r.id === "steam-summer");
    expect(summer).toMatchObject({ daysUntil: 0, underway: true });
    const after = H.upcomingSales(new Date(2026, 11, 31), 6).find((r) => r.id === "steam-spring");
    expect(after.daysUntil).toBeGreaterThan(60);
  });
});

describe("shareable wishlist link", () => {
  test("round-trips unicode names and prices, dropping targets and notes", () => {
    const frag = H.encodeShareList([
      { name: "Elden Ring", lastCheckedPrice: 52.89, targetPrice: 10, note: "secret" },
      { name: "משחק עברי \u{1F3AE}", lastCheckedPrice: null }
    ]);
    expect(frag).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(atob(frag.replace(/-/g, "+").replace(/_/g, "/"))).not.toContain("secret");
    expect(H.decodeShareList(frag)).toEqual([
      { name: "Elden Ring", price: 52.89 },
      { name: "משחק עברי \u{1F3AE}", price: null }
    ]);
    expect(H.decodeShareList("#" + frag).length).toBe(2);
  });
  test("caps at 200 games and sanitizes malformed input", () => {
    const many = Array.from({ length: 250 }, (_, i) => ({ name: "G" + i, lastCheckedPrice: 1 }));
    expect(H.decodeShareList(H.encodeShareList(many)).length).toBe(200);
    expect(H.decodeShareList("%%%not-base64%%%")).toEqual([]);
    expect(H.decodeShareList("")).toEqual([]);
    const evil = Buffer.from(JSON.stringify({ v: 1, i: [{ n: "<img src=x onerror=1>", p: "free" }, { n: 5 }, null] })).toString("base64url");
    expect(H.decodeShareList(evil)).toEqual([{ name: "<img src=x onerror=1>", price: null }]);
  });
});

describe("PS Store price parsing", () => {
  test("currency symbols and separators", () => {
    expect(H.parsePsPrice("$59.99", "USD")).toEqual({ amount: 59.99, currency: "USD" });
    expect(H.parsePsPrice("59,99 €")).toEqual({ amount: 59.99, currency: "EUR" });
    expect(H.parsePsPrice("¥7,990")).toEqual({ amount: 7990, currency: "JPY" });
    expect(H.parsePsPrice("R$ 299,90")).toEqual({ amount: 299.9, currency: "BRL" });
    expect(H.parsePsPrice("₪249.90")).toEqual({ amount: 249.9, currency: "ILS" });
    expect(H.parsePsPrice("CA$79.99")).toEqual({ amount: 79.99, currency: "CAD" });
    expect(H.parsePsPrice("$1,299.00", "USD")).toEqual({ amount: 1299, currency: "USD" });
    expect(H.parsePsPrice("1.299,00 TL", "TRY")).toEqual({ amount: 1299, currency: "TRY" });
    expect(H.parsePsPrice("7,990", "JPY")).toEqual({ amount: 7990, currency: "JPY" });
    expect(H.parsePsPrice("249,90", "ILS")).toEqual({ amount: 249.9, currency: "ILS" });
  });
  test("free / included / junk is not a price", () => {
    expect(H.parsePsPrice("Free")).toBeNull();
    expect(H.parsePsPrice("Included")).toBeNull();
    expect(H.parsePsPrice("")).toBeNull();
    expect(H.parsePsPrice(null)).toBeNull();
    expect(H.parsePsPrice("59.99")).toBeNull(); // no currency and no hint
  });
  test("currencyFromStorePath", () => {
    expect(H.currencyFromStorePath("/en-us/concept/1")).toBe("USD");
    expect(H.currencyFromStorePath("/en-il/concept/1")).toBe("ILS");
    expect(H.currencyFromStorePath("/de-de/product/X")).toBe("EUR");
    expect(H.currencyFromStorePath("/xx-zz/")).toBeNull();
  });
});
