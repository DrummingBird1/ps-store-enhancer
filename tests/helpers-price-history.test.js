const H = require("../extension/helpers.js");

const DAY = 86400000;
const t0 = Date.UTC(2026, 10, 7, 12);

describe("addSnapshot with sale details (3.0)", () => {
  test("points stay [day, price] when there is nothing else, and grow only by what is present", () => {
    let s = H.addSnapshot({}, "ps_USD_x", 10, t0);
    expect(s.ps_USD_x.p).toEqual([[H.dayNumber(t0), 10]]);
    s = H.addSnapshot(s, "ps_USD_x", 8, t0 + DAY, undefined, { orig: 10, pct: 20 });
    expect(s.ps_USD_x.p[1]).toEqual([H.dayNumber(t0) + 1, 8, 10, 20]);
    s = H.addSnapshot(s, "ps_USD_x", 8, t0 + 2 * DAY, undefined, { orig: null, pct: null, ends: 20500, plus: 7 });
    expect(s.ps_USD_x.p[2].slice(1)).toEqual([8, null, null, 20500, 7]);
  });

  test("does not mutate the previous store (the points were copied)", () => {
    const a = H.addSnapshot({}, "k", 10, t0);
    const before = JSON.stringify(a);
    H.addSnapshot(a, "k", 9, t0, undefined, { orig: 12 });
    expect(JSON.stringify(a)).toBe(before);
  });

  test("keeps 400 points by default (it was 120) and still honours explicit limits", () => {
    let s = {};
    for (let i = 0; i < 450; i++) s = H.addSnapshot(s, "k", 10 + (i % 5), t0 + i * DAY);
    expect(s.k.p).toHaveLength(400);
    expect(s.k.p[0][0]).toBe(H.dayNumber(t0) + 50);
    expect(H.addSnapshot(s, "k", 9, t0 + 451 * DAY, { maxPoints: 10 }).k.p).toHaveLength(10);
  });

  test("junk extras are ignored, old two-field points keep working with the trend maths", () => {
    const s = H.addSnapshot({}, "k", 10, t0, undefined, { orig: "abc", pct: -5, ends: 0, plus: NaN });
    expect(s.k.p[0]).toEqual([H.dayNumber(t0), 10]);
    expect(H.trendFromSnapshots([[100, 10], [110, 8, 10, 20]], 110 * DAY, 30)).toMatchObject({ direction: "down", pct: -20 });
  });
});

describe("psHistoryStats", () => {
  test("null without points; 'enough' only from two different days", () => {
    expect(H.psHistoryStats([], t0)).toBeNull();
    expect(H.psHistoryStats([[100, 10]], 100 * DAY)).toMatchObject({ count: 1, enough: false, atLow: true });
    expect(H.psHistoryStats([[100, 10], [101, 12]], 101 * DAY)).toMatchObject({ enough: true, atLow: false });
  });

  test("lowest, latest sale details, span and trend", () => {
    const pts = [[100, 30], [110, 20, 30, 33, 120], [120, 25, 30, 17, null, 22], [130, 20, 30, 33]];
    const s = H.psHistoryStats(pts, 130 * DAY);
    expect(s.low).toEqual({ price: 20, day: 110 });
    expect(s.last).toEqual({ day: 130, price: 20, orig: 30, pct: 33, ends: null, plus: null });
    expect(s).toMatchObject({ count: 4, firstDay: 100, spanDays: 30, atLow: true });
    expect(s.trend).toMatchObject({ direction: "down", spanDays: 30 });
  });
});

describe("isPlausiblePrice", () => {
  test("rejects the mis-parsed 79,991 and other absurd amounts, accepts real ones", () => {
    expect(H.isPlausiblePrice(79991, "USD")).toBe(false);
    expect(H.isPlausiblePrice(99.99, "USD")).toBe(true);
    expect(H.isPlausiblePrice(0, "USD")).toBe(false);
    expect(H.isPlausiblePrice(-3, "USD")).toBe(false);
    expect(H.isPlausiblePrice(NaN, "USD")).toBe(false);
    expect(H.isPlausiblePrice(7990, "JPY")).toBe(true); // high-unit currencies
    expect(H.isPlausiblePrice(129000, "KRW")).toBe(true);
    expect(H.isPlausiblePrice(7990, "EUR")).toBe(false);
  });
});

describe("mergeSnapshots (restoring a backup)", () => {
  const local = { "ps_USD_x": { p: [[20000, 10], [20001, 9]], u: 20001 } };

  test("union of days; the local point wins on a shared day", () => {
    const merged = H.mergeSnapshots(local, { "ps_USD_x": { p: [[19999, 12], [20001, 99, 12, 25], [20002, 8]], u: 20002 } });
    expect(merged.ps_USD_x.p).toEqual([[19999, 12], [20000, 10], [20001, 9], [20002, 8]]);
    expect(merged.ps_USD_x.u).toBe(20002);
  });

  test("adds games that were not there, never mutates the input", () => {
    const before = JSON.stringify(local);
    const merged = H.mergeSnapshots(local, { "pc_halo": { p: [[20000, 5]], u: 20000 }, "ps_ILS_halo": { p: [[20000, 59.9]], u: 20000 } });
    expect(Object.keys(merged).sort()).toEqual(["pc_halo", "ps_ILS_halo", "ps_USD_x"]);
    expect(JSON.stringify(local)).toBe(before);
  });

  test("a backup is not trusted: bad keys, bad points and wrong shapes are skipped", () => {
    const evil = {
      "__proto__": { p: [[20000, 5]], u: 1 },
      "constructor": { p: [[20000, 5]], u: 1 },
      "ps_usd_lower": { p: [[20000, 5]], u: 1 },
      "ps_USD_": { p: [[20000, 5]], u: 1 },
      ["pc_" + "x".repeat(300)]: { p: [[20000, 5]], u: 1 },
      "pc_notarray": { p: "nope", u: 1 },
      "pc_junk": { p: [[1, 5], [20000, -5], [20000, "x"], ["a", 1], null, [99999999, 3]], u: 1 },
      "pc_good": { p: [[20000, 5, 7, 30, 20100, 4], [20000.5, 3]], u: 5 }
    };
    const merged = H.mergeSnapshots({}, evil);
    expect(Object.keys(merged)).toEqual(["pc_good"]);
    expect(merged.pc_good.p).toEqual([[20000, 5, 7, 30, 20100, 4]]);
    expect(H.mergeSnapshots({ a: 1 }, null)).toEqual({ a: 1 });
    expect(H.mergeSnapshots({}, "x")).toEqual({});
  });

  test("respects the per-game and total caps", () => {
    const many = {};
    for (let i = 0; i < 350; i++) many[`pc_game${i}`] = { p: [[20000, 5]], u: 20000 + i };
    const merged = H.mergeSnapshots({}, many);
    expect(Object.keys(merged)).toHaveLength(300);
    expect(merged.pc_game0).toBeUndefined(); // the least recently updated ones go first
    expect(merged.pc_game349).toBeDefined();
    const long = { pc_long: { p: Array.from({ length: 900 }, (_, i) => [19000 + i, 5]), u: 19899 } };
    expect(H.mergeSnapshots({}, long).pc_long.p).toHaveLength(400);
  });
});
