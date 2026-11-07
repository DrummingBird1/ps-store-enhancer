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
  const changeListeners = [];
  const area = (store) => ({
    get: async (keys) => {
      const list = Array.isArray(keys) ? keys : typeof keys === "string" ? [keys] : Object.keys(keys || {});
      return Object.fromEntries(list.filter((k) => k in store).map((k) => [k, store[k]]));
    },
    set: async (o) => Object.assign(store, o),
    remove: async (keys) => { for (const k of [].concat(keys)) delete store[k]; }
  });
  w.chrome = {
    storage: { sync: area(sync), local: area(local), onChanged: { addListener: (fn) => changeListeners.push(fn) } },
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
    i18n: {
      getMessage: (k, subs) => (subs && subs.length ? `${k}:${[].concat(subs).join("|")}` : k),
      ...(opts.uiLang ? { getUILanguage: () => opts.uiLang } : {}) // the browser's language (absent: the code falls back to English)
    }
  };
  // data/trophies.json is never served; with `realLocales` the shipped _locales/<lang>/messages.json are (a manually chosen language)
  w.fetch = async (url) => {
    const m = opts.realLocales && /_locales\/([^/]+)\/messages\.json/.exec(String(url));
    if (m) return { ok: true, json: async () => JSON.parse(fs.readFileSync(path.join(ROOT, "extension", "_locales", m[1], "messages.json"), "utf8")) };
    return { ok: false, json: async () => null };
  };
  w.Element.prototype.scrollIntoView = () => {}; // jsdom has no layout: the tour scrolls to its highlighted card
  if (opts.now != null) w.Date.now = () => opts.now; // freeze "today" for the page's own clock reads
  // The operating system's light/dark preference ("Auto" theme): jsdom has no matchMedia, so only when asked for
  const schemeListeners = [];
  let schemeLight = !!opts.prefersLight;
  if (opts.prefersLight !== undefined) {
    w.matchMedia = (q) => ({
      media: q, matches: /light/.test(q) ? schemeLight : !schemeLight,
      addEventListener: (type, fn) => { if (type === "change") schemeListeners.push(fn); }, removeEventListener: () => {}
    });
  }
  const ctx = dom.getInternalVMContext();
  for (const f of SCRIPTS) new vm.Script(source[f], { filename: f }).runInContext(ctx);
  return {
    dom, doc: w.document, win: w, sent, listeners, sync, local,
    of: (type) => sent.filter((m) => m.type === type),
    ask: (msg) => new Promise((resolve) => listeners.forEach((l) => l(msg, {}, resolve))),
    /** What the popup / Settings do: write to sync storage, and the open page hears about it. */
    setSync: (patch) => {
      Object.assign(sync, patch);
      const changes = Object.fromEntries(Object.keys(patch).map((k) => [k, { newValue: patch[k] }]));
      changeListeners.forEach((fn) => fn(changes, "sync"));
    },
    /** The operating system switches between its light and dark appearance. */
    setScheme: (light) => {
      schemeLight = light;
      schemeListeners.forEach((fn) => fn({ matches: light }));
    }
  };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// The page's own calendar day (content.js: local time, not the UTC day the snapshots use), for a clock frozen at `ms`
const localDayOf = (ms) => Math.floor((ms - new Date().getTimezoneOffset() * 60000) / 86400000);
const NOW = Date.parse("2026-11-07T10:00:00Z");

async function until(cond, label, ms = 4000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`timed out waiting for: ${label}`);
}

const dayOf = (iso) => Math.floor(Date.parse(iso) / 86400000);

/* ── what the store does to our blocks, and how the tests tell that they came back ── */
const REVIEW_FOUND = { success: true, data: { found: true, metacritic: { score: 88, url: "https://www.metacritic.com/game/x" }, steam: null } };
const reinjections = (page) => page.of("DIAG_LOG").filter((m) => m.event === "store-removed-injected").length;
/** The store's re-render takes nodes out of its own tree. */
const storeRemoves = (page, selector) => page.doc.querySelectorAll(selector).forEach((el) => el.remove());
/** The card and both buttons are in the document, painted (not disabled). */
const blocksBack = (page) => {
  const d = page.doc;
  const wl = d.querySelector(".pse-wishlist-btn-wrap button");
  const ow = d.querySelector(".pse-owned-btn-wrap button");
  return !!(d.querySelector(".pse-price-insight.pse-card") && wl && !wl.disabled && ow && !ow.disabled);
};
/** Everything is placed and the watcher over it is armed (that happens once every card and button has finished). */
async function settled(page) {
  await until(() => blocksBack(page), "cards and buttons placed");
  await wait(300);
}

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
    expect(reinjections(page)).toBe(3);
    wipe(); // the fourth removal on the same page is left alone: no endless fight with the store
    await wait(1800);
    expect(cards()).toBeNull();
  });

  test("a re-injection rebuilds only the store's blocks: the What's-new banner stays, the tour keeps its step, and neither the review counter nor the price recording repeats", async () => {
    const page = loadPage("gta6-concept-en-us.html", PATH, { local: { pse_tour_pending: true, pse_changelog_unseen: "3.0.0" } });
    await until(() => page.doc.querySelector(".pse-tour") && page.doc.querySelector(".pse-wn-banner") && page.local.pse_rate, "tour, banner and the first view count");
    await settled(page);
    const tourTitle = () => page.doc.querySelector(".pse-tour-title").textContent;
    expect(tourTitle()).toMatch(/1\/2$/);
    page.doc.querySelector(".pse-tour-next").click(); // on to the wishlist step
    expect(tourTitle()).toMatch(/2\/2$/);
    const banner = page.doc.querySelector(".pse-wn-banner");
    const tour = page.doc.querySelector(".pse-tour");
    const oldCard = page.doc.querySelector(".pse-price-insight.pse-card");
    expect(page.local.pse_rate.views).toBe(1);

    storeRemoves(page, ".pse-card, .pse-wishlist-btn-wrap, .pse-owned-btn-wrap, .pse-skeleton"); // what a store re-render takes out
    await until(() => reinjections(page) === 1 && blocksBack(page) && page.doc.querySelector(".pse-price-insight.pse-card") !== oldCard, "blocks built again");
    await wait(500); // anything the pass still had to do (the tour, the nudge, the price) would have happened by now

    expect(page.doc.contains(banner)).toBe(true); // the banner is the same node, not rebuilt and not gone
    expect(page.doc.contains(tour)).toBe(true);
    expect(page.doc.querySelectorAll(".pse-tour")).toHaveLength(1);
    expect(tourTitle()).toMatch(/2\/2$/); // not back at step 1
    expect(page.doc.querySelector(".pse-tour-highlight")).toBe(page.doc.querySelector(".pse-wishlist-btn-wrap")); // on the new button
    expect(page.local.pse_rate.views).toBe(1); // one product-page view is one view
    expect(page.of("RECORD_PS_PRICE")).toHaveLength(1);
    expect(page.local.pse_changelog_unseen).toBe("3.0.0"); // still unseen: the banner was not dismissed by anything
  });

  test.each([
    ["the owned and wishlist buttons", ".pse-owned-btn-wrap, .pse-wishlist-btn-wrap"],
    ["the price-insight card", ".pse-price-insight.pse-card"],
    ["the review badge", ".pse-mc-link"]
  ])("when the store removes only %s, every block is back and none is doubled", async (_label, selector) => {
    const page = loadPage("gta6-concept-en-us.html", PATH, { respond: { FETCH_REVIEW_SCORES: () => REVIEW_FOUND } });
    await until(() => page.doc.querySelector(".pse-mc-link"), "review badge");
    await settled(page);
    storeRemoves(page, selector);
    await until(() => reinjections(page) === 1 && blocksBack(page), "blocks built again");
    await wait(600);
    expect(reinjections(page)).toBe(1);
    for (const sel of [".pse-price-insight.pse-card", ".pse-wishlist-btn-wrap", ".pse-owned-btn-wrap", ".pse-mc-link"]) {
      expect(page.doc.querySelectorAll(sel)).toHaveLength(1);
    }
  });

  test("when the store swaps the container for a new one, the blocks are built again in the new one", async () => {
    const page = loadPage("gta6-concept-en-us.html", PATH);
    await settled(page);
    const host = page.doc.querySelector(".pse-price-insight.pse-card").parentElement;
    expect(host).not.toBe(page.doc.body);
    const fresh = host.cloneNode(true); // the store's new tree: same page, none of our nodes
    fresh.querySelectorAll(".pse-injected").forEach((el) => el.remove());
    host.replaceWith(fresh);
    expect(page.doc.querySelector(".pse-price-insight.pse-card")).toBeNull();
    await until(() => reinjections(page) === 1 && blocksBack(page), "blocks built again");
    for (const sel of [".pse-price-insight.pse-card", ".pse-wishlist-btn-wrap", ".pse-owned-btn-wrap"]) {
      expect(fresh.querySelectorAll(sel)).toHaveLength(1); // in the new container
      expect(page.doc.querySelectorAll(sel)).toHaveLength(1); // and nowhere else
    }
  });

  test("moving the container inside the page loses nothing and changes nothing; replacing an ancestor does", async () => {
    const page = loadPage("gta6-concept-en-us.html", PATH);
    await settled(page);
    const host = page.doc.querySelector(".pse-price-insight.pse-card").parentElement;
    const shell = page.doc.createElement("div");
    host.before(shell);
    shell.append(host); // every block is still in the document
    await wait(700);
    expect(reinjections(page)).toBe(0);
    expect(page.doc.querySelectorAll(".pse-price-insight.pse-card")).toHaveLength(1);

    const fresh = shell.cloneNode(true);
    fresh.querySelectorAll(".pse-injected").forEach((el) => el.remove());
    shell.replaceWith(fresh); // the ancestor goes, with the container and every block in it
    await until(() => reinjections(page) === 1 && blocksBack(page), "blocks built again");
    expect(fresh.querySelectorAll(".pse-price-insight.pse-card")).toHaveLength(1);
    expect(page.doc.querySelectorAll(".pse-price-insight.pse-card")).toHaveLength(1);
  });

  test("the budget of three re-injections is per page: a new product page gets a fresh one", async () => {
    const page = loadPage("gta6-concept-en-us.html", PATH);
    for (let i = 1; i <= 3; i++) {
      await settled(page);
      storeRemoves(page, ".pse-card, .pse-owned-btn-wrap, .pse-wishlist-btn-wrap");
      await until(() => reinjections(page) === i && blocksBack(page), `blocks built again, round ${i}`);
    }
    await settled(page);
    const oldCard = page.doc.querySelector(".pse-price-insight.pse-card");
    page.win.history.pushState({}, "", "/en-us/concept/10000731"); // the store's own navigation to another game
    await until(() => blocksBack(page) && page.doc.querySelector(".pse-price-insight.pse-card") !== oldCard, "the new page's own cards", 8000);
    await settled(page);
    storeRemoves(page, ".pse-card, .pse-owned-btn-wrap, .pse-wishlist-btn-wrap");
    await until(() => reinjections(page) === 4 && blocksBack(page), "blocks built again on the new page");
  });

  test("a re-injection does not make the screen reader read the card's announcement again", async () => {
    const page = loadPage("gta6-concept-en-us.html", PATH);
    await settled(page);
    await wait(300); // the first pass's own announcement is written 50 ms after the card
    expect(page.doc.getElementById("pse-live").textContent).not.toBe("");
    let writes = 0;
    const touchesLive = (n) => n.id === "pse-live" || (n.parentElement && n.parentElement.id === "pse-live");
    new page.win.MutationObserver((records) => {
      writes += records.filter((r) => [r.target, ...r.addedNodes, ...r.removedNodes].some(touchesLive)).length;
    }).observe(page.doc.body, { childList: true, characterData: true, subtree: true });
    storeRemoves(page, ".pse-card, .pse-wishlist-btn-wrap, .pse-owned-btn-wrap");
    await until(() => reinjections(page) === 1 && blocksBack(page), "blocks built again");
    await wait(400);
    expect(writes).toBe(0);
  });

  test("a navigation in the same breath as the store removing the blocks is built once, by the new page's own pass", async () => {
    const page = loadPage("gta6-concept-en-us.html", PATH);
    await settled(page);
    const oldCard = page.doc.querySelector(".pse-price-insight.pse-card");
    storeRemoves(page, ".pse-card, .pse-wishlist-btn-wrap, .pse-owned-btn-wrap");
    page.win.history.pushState({}, "", "/en-us/concept/10000731"); // the store's own navigation, before the watcher's check runs
    await until(() => blocksBack(page) && page.doc.querySelector(".pse-price-insight.pse-card") !== oldCard, "the new page's own cards", 8000);
    await settled(page);
    expect(reinjections(page)).toBe(0); // nobody rebuilt the old page's blocks on the new address
    for (const sel of [".pse-price-insight.pse-card", ".pse-wishlist-btn-wrap", ".pse-owned-btn-wrap"]) {
      expect(page.doc.querySelectorAll(sel)).toHaveLength(1);
    }
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

  /**
   * A Valheim page whose recorded history ends in a sale that has `daysLeft` days to run. The clock is frozen and the days are
   * counted the way the page counts them (the user's local calendar day), so the result does not depend on the hour or the time zone.
   */
  function saleEndingIn(daysLeft, opts = {}) {
    const day = localDayOf(NOW);
    const ends = day + daysLeft;
    const points = [[day - 30, 119], [day - 10, 107.1, 119, 10], [day, 95.2, 119, 20, ends]];
    const stats = {
      count: 3, enough: true, firstDay: day - 30, spanDays: 30, atLow: true,
      low: { price: 95.2, day },
      last: { day, price: 95.2, orig: 119, pct: 20, ends, plus: null },
      trend: { direction: "down", pct: -20, spanDays: 30, from: 119, to: 95.2 }
    };
    return loadPage("valheim-product-en-il.html", PATH, { now: NOW, ...opts, respond: { PS_PRICE_HISTORY: () => ({ ok: true, points, stats }) } });
  }
  const insightText = async (page) => {
    await until(() => page.doc.querySelector(".pse-price-insight.pse-card"), "price insight card");
    return page.doc.querySelector(".pse-price-insight").textContent;
  };

  test("with a real history the card shows the lowest price, the sale, the store's 30-day low and the gap to PC", async () => {
    const page = saleEndingIn(14);
    const text = await insightText(page);
    // ILS 95.20 is about $25.7 at the faked rate, below the fake cheapest PC price of $49.99
    for (const expected of ["psLowest", "psNow", "psAtLow", "psSaleLine:", "psSaleEnds:", "psStoreLow30:", "psGapBelow:", "insightTrendDown:"]) {
      expect(text).toContain(expected);
    }
    expect(text).not.toContain("psGapAbove");
    expect(text).toMatch(/psSaleEnds:[^(]*\(in 14 days\)/); // the countdown next to the date
    expect(text).toContain("₪95.20"); // formatted in the store's own currency (Intl), not converted to USD
    expect(page.of("PS_PRICE_HISTORY")[0].currency).toBe("ILS");
    expect(page.of("GET_RATES").some((m) => m.target === "ILS")).toBe(true); // used for the PS-vs-PC gap
  });

  test.each([
    [14, "in 14 days"],
    [2, "in 2 days"],
    [1, "tomorrow"],
    [0, "today"]
  ])("the sale countdown with %i day(s) left reads '(%s)'", async (daysLeft, words) => {
    const text = await insightText(saleEndingIn(daysLeft));
    expect(text).toMatch(new RegExp(`psSaleEnds:[^(]*\\(${words}\\)`));
  });

  test("a sale that ended yesterday shows neither the date nor a countdown", async () => {
    const text = await insightText(saleEndingIn(-1));
    expect(text).toContain("psSaleLine:"); // the discount itself is still the last recorded price
    expect(text).not.toContain("psSaleEnds");
  });

  test("the countdown and the date are in the language of the sentence: a browser language with no translation gets English, not Swedish", async () => {
    const text = await insightText(saleEndingIn(14, { uiLang: "sv" }));
    expect(text).toMatch(/psSaleEnds:Nov \d+ \(in 14 days\)/); // 'Nov 21 (in 14 days)', not '21 nov. (om 14 dagar)'
    expect(text).not.toMatch(/dagar|nov\./);
  });

  test("in a right-to-left language the card is right-to-left and the countdown is in that language", async () => {
    const page = saleEndingIn(14, { realLocales: true, sync: { userLanguage: "he" } });
    const text = await insightText(page);
    const card = page.doc.querySelector(".pse-price-insight.pse-card");
    expect(card.dir).toBe("rtl");
    expect(card.querySelector(".pse-card-head").getAttribute("aria-expanded")).toBe("true");
    const when = new Intl.RelativeTimeFormat("he", { numeric: "auto" }).format(14, "day");
    expect(text).toContain(`(${when})`);
    expect(text).not.toContain("in 14 days");
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

describe("the theme switch reaches the cards already on the open store tab", () => {
  const PATH = "/en-us/concept/10000730";
  const themed = (page) => [...page.doc.querySelectorAll(".pse-injected[data-pse-theme]")];
  const allThemes = (page, theme) => themed(page).every((el) => el.dataset.pseTheme === theme);

  async function pageWithEverything(opts = {}) {
    const page = loadPage("gta6-concept-en-us.html", PATH, { local: { pse_tour_pending: true, pse_changelog_unseen: "3.0.0" }, ...opts });
    await until(() => page.doc.querySelector(".pse-tour") && page.doc.querySelector(".pse-wn-banner"), "tour and banner");
    await settled(page);
    return page;
  }

  test("Dark / Light / Contrast in the popup re-themes every injected element: cards, buttons, tour and banner", async () => {
    const page = await pageWithEverything({ sync: { theme: "dark" } });
    // the card, both button wrappers, the tour panel and the banner (the review nudge and the live search share the code path)
    expect(themed(page).length).toBeGreaterThanOrEqual(5);
    expect(allThemes(page, "dark")).toBe(true);
    for (const theme of ["light", "contrast", "dark"]) {
      page.setSync({ theme });
      await until(() => allThemes(page, theme), `every element on '${theme}'`);
    }
  });

  test("a setting other than the theme leaves the theme alone", async () => {
    const page = await pageWithEverything({ sync: { theme: "light" } });
    page.setSync({ hideAddons: true });
    await wait(200);
    expect(allThemes(page, "light")).toBe(true);
  });

  test("'Auto' follows the operating system, and keeps following it while the page is open", async () => {
    const page = await pageWithEverything({ sync: { theme: "light" }, prefersLight: false });
    expect(allThemes(page, "light")).toBe(true);
    page.setSync({ theme: "auto" });
    await until(() => allThemes(page, "dark"), "dark with the system in dark mode");
    page.setScheme(true); // the system switches to its light appearance
    await until(() => allThemes(page, "light"), "light after the system switched");
    page.setScheme(false);
    await until(() => allThemes(page, "dark"), "dark after the system switched back");
  });

  test("an element built after the switch has the new theme too", async () => {
    const page = await pageWithEverything({ sync: { theme: "dark" } });
    page.setSync({ theme: "light" });
    await until(() => allThemes(page, "light"), "light");
    storeRemoves(page, ".pse-card, .pse-owned-btn-wrap, .pse-wishlist-btn-wrap");
    await until(() => blocksBack(page) && reinjections(page) === 1, "blocks built again");
    expect(themed(page).length).toBeGreaterThanOrEqual(5);
    expect(allThemes(page, "light")).toBe(true);
  });
});

describe("live search suggestions in a right-to-left language", () => {
  const SUGGESTIONS = { FETCH_SEARCH_SUGGESTIONS: () => ({ success: true, data: [{ title: "Hades", cheapest: 12.5, thumb: "" }] }), GET_WISHLIST: () => ({ list: [] }) };

  async function suggestionsFor(opts) {
    const page = loadPage("gta6-concept-en-us.html", "/en-us/concept/10000730", { respond: SUGGESTIONS, ...opts });
    await until(() => page.listeners.length > 0 && page.doc.querySelector(".pse-injected"), "page ready");
    const input = page.doc.createElement("input");
    input.type = "search";
    page.doc.body.append(input);
    input.value = "hades";
    input.dispatchEvent(new page.win.Event("input", { bubbles: true }));
    await until(() => page.doc.querySelector(".pse-ac-price"), "a suggestion with its price", 6000);
    return page;
  }

  test("the sentence takes the dropdown's direction and only the number is a left-to-right run", async () => {
    const page = await suggestionsFor({ realLocales: true, sync: { userLanguage: "he" } });
    const dropdown = page.doc.querySelector(".pse-ac-dropdown");
    expect(dropdown.dir).toBe("rtl");
    const price = dropdown.querySelector(".pse-ac-price");
    const amount = price.querySelector("bdi");
    expect(amount.getAttribute("dir")).toBe("ltr");
    expect(amount.textContent).toMatch(/12\.50/);
    expect(price.firstChild.nodeType).toBe(3); // the translated words are plain text next to it, not inside the isolate
    expect(price.firstChild.textContent).toMatch(/[֐-׿]/); // Hebrew
    expect(price.textContent).toBe(`${price.firstChild.textContent}${amount.textContent}`);
  });

  test("English is laid out exactly as before: the same words, then the isolated price", async () => {
    const page = await suggestionsFor({});
    const price = page.doc.querySelector(".pse-ac-price");
    expect(price.textContent).toBe("autocompletePcFrom $12.50");
    expect(price.querySelector("bdi").getAttribute("dir")).toBe("ltr");
  });
});
