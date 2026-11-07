/**
 * The REAL content script (content.js + store-adapter.js + the other content files, in manifest order)
 * running in jsdom against saved REAL store pages (tests/fixtures/ps-store). `chrome.runtime.sendMessage`
 * is answered by a recording fake, so these tests pin down what the page code asks the worker to store and
 * what it does to the DOM. They are the end-to-end regression tests for the four v2.7.1 bugs.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");
const SCRIPTS = ["i18n.js", "cache.js", "match.js", "helpers.js", "store-adapter.js", "content-extras.js", "content.js"];
const fixtureHtml = (name) => fs.readFileSync(path.join(__dirname, "fixtures", "ps-store", name), "utf8");
const source = Object.fromEntries(SCRIPTS.map((f) => [f, fs.readFileSync(path.join(ROOT, "extension", f), "utf8")]));

jest.setTimeout(20000);
const open = [];
afterEach(() => {
  while (open.length) open.pop().window.close(); // stops the page's timers and observers
});

/** Load a fixture as a store page and run the content script in it. */
function loadPage(fixture, pathname, opts = {}) {
  const dom = new JSDOM(fixtureHtml(fixture), { url: `https://store.playstation.com${pathname}`, runScripts: "outside-only", pretendToBeVisual: true });
  open.push(dom);
  const w = dom.window;
  const sent = [];
  const listeners = [];
  const respond = {
    FETCH_PRICE_INSIGHT: () => ({ success: true, data: { found: true, title: "x", cheapest: 49.99, cheapestStore: "Steam", cheapestEver: { price: 39.99, date: 1700000000000 }, low: "near", trend: null, points: [] } }),
    FETCH_CROSS_PLATFORM: () => ({ success: true, data: { found: false } }),
    FETCH_REVIEW_SCORES: () => ({ success: true, data: { found: false } }),
    FETCH_PSN_TROPHY: () => ({ success: false }),
    IS_GAME_OWNED: () => ({ owned: false }),
    IS_IN_WISHLIST: () => ({ inWishlist: false }),
    GET_RATES: () => ({ ok: true, rates: { USD: 1, ILS: 3.7 } }),
    PS_PRICE_HISTORY: () => ({ ok: true, points: [], stats: null }),
    GET_MERGED_OWNED: () => ({ list: [] }),
    RECORD_PS_PRICE: () => ({ ok: true }),
    RECORD_PS_PRICES: () => ({ ok: true, recorded: 0 }),
    DIAG_LOG: () => ({ ok: true }),
    ...(opts.respond || {})
  };
  const sync = { ...(opts.sync || {}) };
  const local = { ...(opts.local || {}) };
  const area = (store) => ({
    get: async (keys) => {
      const list = Array.isArray(keys) ? keys : typeof keys === "string" ? [keys] : Object.keys(keys || {});
      return Object.fromEntries(list.filter((k) => k in store).map((k) => [k, store[k]]));
    },
    set: async (o) => Object.assign(store, o),
    remove: async () => {}
  });
  w.chrome = {
    storage: { sync: area(sync), local: area(local), onChanged: { addListener: () => {} } },
    runtime: {
      id: "testextensionid",
      getURL: (p) => `chrome-extension://test/${p}`,
      sendMessage: async (msg) => {
        sent.push(msg);
        const fn = respond[msg.type];
        return fn ? fn(msg) : undefined;
      },
      onMessage: { addListener: (fn) => listeners.push(fn) }
    },
    i18n: { getMessage: (k, subs) => (subs && subs.length ? `${k}:${[].concat(subs).join("|")}` : k) }
  };
  w.fetch = async () => ({ ok: false, json: async () => null }); // data/trophies.json
  const ctx = dom.getInternalVMContext();
  for (const f of SCRIPTS) new vm.Script(source[f], { filename: f }).runInContext(ctx);
  return {
    dom, doc: w.document, sent, listeners,
    of: (type) => sent.filter((m) => m.type === type),
    ask: (msg) => new Promise((resolve) => listeners.forEach((l) => l(msg, {}, resolve)))
  };
}

async function until(cond, label, ms = 4000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`timed out waiting for: ${label}`);
}

const dayOf = (iso) => Math.floor(Date.parse(iso) / 86400000);

describe("product page: GTA VI (an edition upsell sits above the real price in the DOM)", () => {
  const PATH = "/en-us/concept/10000730";

  test("records the page's own price, $99.99, not the Standard Edition upsell ($79.99, parsed as 79,991 in v2.7.1)", async () => {
    const page = loadPage("gta6-concept-en-us.html", PATH);
    await until(() => page.of("RECORD_PS_PRICE").length, "RECORD_PS_PRICE");
    expect(page.of("RECORD_PS_PRICE")[0]).toMatchObject({ gameName: "Grand Theft Auto VI: Ultimate Edition", amount: 99.99, currency: "USD" });
    expect(page.of("RECORD_PS_PRICE")).toHaveLength(1);
  });

  test("the cards go right after the buy box and never inside the editions list", async () => {
    const page = loadPage("gta6-concept-en-us.html", PATH);
    await until(() => page.doc.querySelector(".pse-injected"), "first injected element");
    const buyBox = page.doc.querySelector('[data-qa="mfeCtaMain"]');
    expect(buyBox.nextElementSibling.classList.contains("pse-injected")).toBe(true);
    expect(page.doc.querySelector('[data-qa^="mfeUpsell"] .pse-injected')).toBeNull();
  });

  test("when the store re-renders its tree and removes the cards, they are put back, three times at most", async () => {
    const page = loadPage("gta6-concept-en-us.html", PATH);
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const cards = () => page.doc.querySelector(".pse-price-insight.pse-card");
    const wipe = () => page.doc.querySelectorAll(".pse-injected").forEach((el) => el.remove());
    await until(cards, "price insight card");
    await wait(700); // the watcher is attached once every card and button has been placed
    const restored = [];
    for (let i = 0; i < 3; i++) {
      wipe();
      await until(cards, `cards back after removal ${i + 1}`);
      restored.push(true);
      await wait(700);
    }
    expect(restored).toHaveLength(3);
    expect(page.of("DIAG_LOG").filter((m) => m.event === "store-removed-injected")).toHaveLength(3);
    wipe(); // the fourth removal on the same page is left alone: no endless fight with the store
    await wait(1800);
    expect(cards()).toBeNull();
  });

  test("with fewer than two recorded days the card says there is not enough PlayStation history", async () => {
    const page = loadPage("gta6-concept-en-us.html", PATH, {
      respond: { PS_PRICE_HISTORY: () => ({ ok: true, points: [[20400, 99.99]], stats: { count: 1, enough: false } }) }
    });
    await until(() => page.doc.querySelector(".pse-price-insight.pse-card"), "price insight card");
    const text = page.doc.querySelector(".pse-price-insight").textContent;
    expect(text).toContain("psNotEnough");
    expect(text).toContain("psHistLabel");
    expect(page.of("PS_PRICE_HISTORY")[0]).toMatchObject({ gameName: "Grand Theft Auto VI: Ultimate Edition", currency: "USD" });
  });

  test("Check this page: title, price and anchor all answer through their primary strategy", async () => {
    const page = loadPage("gta6-concept-en-us.html", PATH);
    await until(() => page.listeners.length > 0, "message listener");
    const r = await page.ask({ type: "PSE_CHECK_PAGE" });
    expect(r.ok).toBe(true);
    expect(r.result.checks.map((c) => [c.id, c.status])).toEqual([["title", "ok"], ["price", "ok"], ["anchor", "ok"]]);
  });
});

describe("product page: Valheim on the Israeli store (PlayStation Plus trial first, then the real price)", () => {
  const PATH = "/en-il/product/EP4837-PPSA28824_00-0VALHEIMBASEGAME";

  test("records ILS 95.20 with the sale details, skipping the 'Game Trial' offer", async () => {
    const page = loadPage("valheim-product-en-il.html", PATH);
    await until(() => page.of("RECORD_PS_PRICE").length, "RECORD_PS_PRICE");
    expect(page.of("RECORD_PS_PRICE")[0]).toMatchObject({
      gameName: "Valheim", amount: 95.2, currency: "ILS", orig: 119, pct: 20, ends: dayOf("2026-11-21")
    });
  });

  test("with a real history the card shows the lowest price, the sale, the store's 30-day low and the gap to PC", async () => {
    const day = dayOf("2026-11-07");
    const points = [[day - 30, 119], [day - 10, 107.1, 119, 10], [day, 95.2, 119, 20, dayOf("2026-11-21")]];
    const stats = {
      count: 3, enough: true, firstDay: day - 30, spanDays: 30, atLow: true,
      low: { price: 95.2, day },
      last: { day, price: 95.2, orig: 119, pct: 20, ends: dayOf("2026-11-21"), plus: null },
      trend: { direction: "down", pct: -20, spanDays: 30, from: 119, to: 95.2 }
    };
    const page = loadPage("valheim-product-en-il.html", PATH, { respond: { PS_PRICE_HISTORY: () => ({ ok: true, points, stats }) } });
    await until(() => page.doc.querySelector(".pse-price-insight.pse-card"), "price insight card");
    const text = page.doc.querySelector(".pse-price-insight").textContent;
    // ILS 95.20 is about $25.7 at the faked rate, below the fake cheapest PC price of $49.99
    for (const expected of ["psLowest", "psNow", "psAtLow", "psSaleLine:", "psSaleEnds:", "psStoreLow30:", "psGapBelow:", "insightTrendDown:"]) {
      expect(text).toContain(expected);
    }
    expect(text).not.toContain("psGapAbove");
    expect(text).toContain("₪95.20"); // formatted in the store's own currency (Intl), not converted to USD
    expect(page.of("PS_PRICE_HISTORY")[0].currency).toBe("ILS");
    expect(page.of("GET_RATES").some((m) => m.target === "ILS")).toBe(true); // used for the PS-vs-PC gap
  });

  test("feature isolation: a card that throws is switched off alone, logged, and its skeleton removed", async () => {
    const page = loadPage("valheim-product-en-il.html", PATH, {
      // malformed answer: `stats.low` is missing, so rendering the PlayStation part throws
      respond: { PS_PRICE_HISTORY: () => ({ ok: true, points: [[1, 1], [2, 2]], stats: { enough: true, count: 2 } }) }
    });
    await until(() => page.of("DIAG_LOG").some((m) => m.event === "feature-failed"), "feature-failed log");
    expect(page.of("DIAG_LOG").find((m) => m.event === "feature-failed").details).toMatchObject({ feature: "priceInsight", region: "IL" });
    await until(() => page.doc.querySelector(".pse-owned-btn-wrap"), "owned button still rendered");
    expect(page.doc.querySelector(".pse-skeleton.pse-price-insight")).toBeNull();
    const r = await page.ask({ type: "PSE_CHECK_PAGE" });
    expect(r.result.features).toEqual(expect.arrayContaining([{ feature: "priceInsight", ok: false, error: expect.any(String) }]));
  });
});

describe("search page: the filters on the real grid", () => {
  const PATH = "/en-us/search/god%20of%20war";
  const hiddenIndexes = (page) =>
    [...page.doc.querySelectorAll("ul.psw-grid-list > li")].map((li, i) => (li.classList.contains("pse-hidden-addon") ? i : -1)).filter((i) => i >= 0);

  test("nothing is hidden while the filters are off", async () => {
    const page = loadPage("search-god-of-war-en-us.html", PATH);
    await until(() => page.of("RECORD_PS_PRICES").length, "grid price recording");
    expect(hiddenIndexes(page)).toEqual([]);
  });

  test("hide add-ons and DLC hides the store-labelled ones: whole grid cells, so the grid reflows", async () => {
    const page = loadPage("search-god-of-war-en-us.html", PATH, { sync: { hideAddons: true, hideDlc: true } });
    await until(() => hiddenIndexes(page).length, "hidden tiles");
    expect(hiddenIndexes(page)).toEqual([7, 8, 11, 13, 16, 19, 20, 21]);
    const li = page.doc.querySelectorAll("ul.psw-grid-list > li")[19];
    expect(li.classList.contains("pse-hidden-addon")).toBe(true);
    expect(li.querySelector(".pse-hidden-addon")).toBeNull(); // the class is on the cell, not on a tile inside it
  });

  test("hide owned: owning 'God of War' hides it and its Deluxe Edition, and keeps the sequels (v2.7.1 did the opposite)", async () => {
    const page = loadPage("search-god-of-war-en-us.html", PATH, {
      sync: { hideOwned: true },
      respond: { GET_MERGED_OWNED: () => ({ list: ["God of War"] }) }
    });
    await until(() => hiddenIndexes(page).length, "hidden tiles");
    expect(hiddenIndexes(page)).toEqual([0, 4]);
  });

  test("prices of game tiles (not add-ons, DLC, free or unavailable ones) are sent for recording", async () => {
    const page = loadPage("search-god-of-war-en-us.html", PATH);
    await until(() => page.of("RECORD_PS_PRICES").length, "grid price recording");
    const items = page.of("RECORD_PS_PRICES").flatMap((m) => m.items);
    const names = items.map((i) => i.gameName);
    expect(names).toContain("God of War");
    expect(names).toContain("God of War Ragnarök");
    for (const never of ["God of War - Digital Comic Book Bundle", "LittleBigPlanet™ 3 God of War™ Kratos Costume", "God of War Ragnarök: Valhalla PS4", "God of War Laufey™ Digital Deluxe Upgrade"]) {
      expect(names).not.toContain(never);
    }
    expect(items.find((i) => i.gameName === "God of War")).toEqual({ gameName: "God of War", amount: 9.99, currency: "USD", orig: 19.99, pct: 50 });
    expect(items.every((i) => i.amount > 0)).toBe(true);
  });

  test("Check this page on a listing: tiles, names and prices", async () => {
    const page = loadPage("search-god-of-war-en-us.html", PATH);
    await until(() => page.listeners.length > 0, "message listener");
    const r = await page.ask({ type: "PSE_CHECK_PAGE" });
    expect(r.result.checks.map((c) => [c.id, c.status, c.detail])).toEqual([["tiles", "ok", "24"], ["names", "ok", "24/24"], ["prices", "ok", "16/24"]]);
  });
});
