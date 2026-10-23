const fs = require("fs");
const path = require("path");
const { createEnv, fixture, jsonResponse } = require("./support/sw-env");

const SONY = "https://ca.account.sony.com";
const GOOD = "GOOD" + "x".repeat(56); // test-only token, accepted by the fake Sony below
const BAD = "BAD" + "y".repeat(57);

afterEach(() => jest.restoreAllMocks());

function redirect(location) {
  return {
    ok: false, status: 302, type: "basic", url: "",
    headers: { get: (k) => (String(k).toLowerCase() === "location" ? location : null) },
    json: async () => ({}), clone() { return this; }, text: async () => ""
  };
}

/** Fake Sony: GOOD* tokens authenticate, everything else bounces to the login page. */
function fakeSony(env, opts = {}) {
  const titles = [];
  for (let i = 0; i < 130; i++) titles.push({ titleId: "T" + i, name: i === 0 ? "Hades" : `Filler ${i}`, category: "ps4_game" });
  titles.push({ titleId: "A", name: "Netflix", category: "ps4_nongame" });
  const state = { gamelistCalls: 0, refreshCalls: 0, tokenCalls: 0 };
  env.route((url, init = {}) => {
    const u = new URL(url);
    if (u.hostname === "ca.account.sony.com") {
      if (u.pathname.endsWith("/authorize")) {
        if (opts.opaque) {
          return { ok: false, status: 0, type: "opaqueredirect", url: "", headers: { get: () => null }, json: async () => ({}), clone() { return this; }, text: async () => "" };
        }
        const c = env.getCookie(SONY, "npsso");
        if (c && c.value.startsWith("GOOD")) return redirect("com.scee.psxandroid.scecompcall://redirect?code=v3.TESTCODE");
        return redirect("https://my.account.sony.com/sonyacct/signin/");
      }
      if (u.pathname.endsWith("/token")) {
        state.tokenCalls++;
        const body = String(init.body || "");
        if (body.includes("grant_type=authorization_code") && body.includes("v3.TESTCODE")) {
          return jsonResponse({ access_token: "acc-1", refresh_token: "ref-1", expires_in: 3600 });
        }
        if (body.includes("grant_type=refresh_token")) {
          state.refreshCalls++;
          return jsonResponse({ access_token: "acc-" + (state.refreshCalls + 1), refresh_token: "ref-1", expires_in: 3600 });
        }
        return jsonResponse({ error: "invalid_grant" }, 400);
      }
    }
    if (u.hostname === "m.np.playstation.com") {
      const auth = (init.headers && init.headers.Authorization) || "";
      if (opts.rejectAll401) return jsonResponse({}, 401);
      if (u.pathname.includes("/gamelist/")) {
        state.gamelistCalls++;
        if (opts.first401 && state.gamelistCalls === 1) return jsonResponse({}, 401);
        if (!/^Bearer acc-/.test(auth)) return jsonResponse({}, 401);
        const off = Number(u.searchParams.get("offset") || 0);
        const lim = Number(u.searchParams.get("limit") || 100);
        return jsonResponse({ totalItemCount: titles.length, titles: titles.slice(off, off + lim) });
      }
      if (u.pathname.includes("/userProfile/")) return jsonResponse({ onlineId: "Tester", accountId: "1", avatars: [] });
      if (u.pathname.endsWith("/trophyTitles")) {
        return jsonResponse({
          totalItemCount: 3,
          trophyTitles: [
            { trophyTitleName: "Hades II", npCommunicationId: "NPWR2", npServiceName: "trophy2", progress: 10, earnedTrophies: { bronze: 1 }, definedTrophies: { bronze: 10, platinum: 1 } },
            { trophyTitleName: "ELDEN RING NIGHTREIGN", npCommunicationId: "NPWR3", progress: 5, earnedTrophies: {}, definedTrophies: { bronze: 5 } },
            { trophyTitleName: "Hades", npCommunicationId: "NPWR1", npServiceName: "trophy2", progress: 55, earnedTrophies: { bronze: 5, silver: 1 }, definedTrophies: { bronze: 10, silver: 2, platinum: 1 } }
          ]
        });
      }
      if (u.pathname.includes("/npCommunicationIds/") && u.pathname.includes("/users/me/")) {
        return jsonResponse({ trophies: [
          { trophyId: 0, earned: true, trophyEarnedRate: "80.0", trophyType: "bronze" },
          { trophyId: 1, earned: true, trophyEarnedRate: "12.5", trophyType: "silver" },
          { trophyId: 2, earned: false, trophyEarnedRate: "0.7", trophyType: "platinum" },
          { trophyId: 3, earned: false, trophyEarnedRate: "40", trophyType: "bronze" }
        ] });
      }
      if (u.pathname.includes("/npCommunicationIds/")) {
        return jsonResponse({ trophies: [{ trophyId: 2, trophyName: "Escaped" }, { trophyId: 1, trophyName: "Rare One" }] });
      }
    }
    return undefined;
  });
  return state;
}

describe("CheapShark lookup (real API fixtures)", () => {
  test("Elden Ring resolves to the real game, with its own deals, all-time low and ratings", async () => {
    const env = createEnv().loadServiceWorker();
    const b = await self.CheapShark.lookup("Elden Ring");
    expect(b.found).toBe(true);
    expect(b.title).toBe("ELDEN RING");
    expect(b.matchScore).toBe(3);
    expect(b.deals.length).toBeGreaterThan(0);
    expect(b.deals.length).toBeLessThanOrEqual(5);
    expect(b.deals.map((d) => d.price)).toEqual([...b.deals.map((d) => d.price)].sort((a, c) => a - c));
    expect(b.deals.every((d) => d.dealLink.startsWith("https://www.cheapshark.com/redirect?dealID="))).toBe(true);
    expect(b.cheapestEver).toEqual({ price: 29.95, date: 1751353695000 });
    expect(b.ratings.metacritic.score).toBe(94);
    expect(b.ratings.steam).toMatchObject({ percent: 94, count: 436673 });
    expect(b.cheapest).toBe(b.deals[0].price);
    // store names come from CheapShark's own /stores list
    expect(b.deals.map((d) => d.store)).toContain("GameBillet");
    // nothing from the Nightreign DLC leaks in: one games?id= call for the verified game only
    expect(env.fetchLog.filter((u) => u.includes("games?id=")).length).toBe(1);
  });

  test("results are cached; a second lookup makes no network calls", async () => {
    const env = createEnv().loadServiceWorker();
    await self.CheapShark.lookup("Elden Ring");
    const before = env.fetchLog.length;
    const again = await self.CheapShark.lookup("ELDEN RING™");
    expect(again.fromCache).toBe(true);
    expect(env.fetchLog.length).toBe(before);
  });

  test("a PlayStation exclusive is reported as not found (and not retried for an hour)", async () => {
    const env = createEnv().loadServiceWorker();
    const miss = await self.CheapShark.lookup("Astro Bot");
    expect(miss.found).toBe(false);
    const n = env.fetchLog.length;
    await self.CheapShark.lookup("Astro Bot");
    expect(env.fetchLog.length).toBe(n);
  });

  test("a request for an edition matches the edition listing, not the base game", async () => {
    createEnv().loadServiceWorker();
    const list = fixture("cs-games-elden-ring.json");
    const best = self.PSEMatch.pickBestMatch("Elden Ring Shadow of the Erdtree", list, (g) => g.external);
    expect(best.item.external).toBe("ELDEN RING Shadow of the Erdtree");
    const deluxe = self.PSEMatch.pickBestMatch("Elden Ring Deluxe Edition", list, (g) => g.external);
    expect(deluxe.item.external).toBe("ELDEN RING Deluxe Edition");
  });

  test("HTTP errors surface and are written to the local diagnostics log", async () => {
    const env = createEnv().loadServiceWorker();
    env.route((url) => (url.includes("games?title=") ? jsonResponse({ error: "boom" }, 503) : undefined));
    await expect(self.CheapShark.lookup("Elden Ring")).rejects.toThrow("CheapShark 503");
    const entries = await self.PSEDiag.get();
    expect(entries.some((e) => e.s === "cheapshark" && e.e === "http-error" && e.d.status === 503)).toBe(true);
  });

  test("suggestions drop soundtracks and other non-game items", async () => {
    createEnv().loadServiceWorker();
    const s = await self.CheapShark.suggestions("hades");
    const titles = s.map((x) => x.title);
    expect(titles).toContain("Hades II");
    expect(titles).not.toContain("Grimshade Soundtrack");
    expect(s.length).toBeLessThanOrEqual(6);
  });
});

describe("message handlers: scores, cross-platform, price insight", () => {
  test("FETCH_CROSS_PLATFORM / FETCH_REVIEW_SCORES / FETCH_PRICE_INSIGHT", async () => {
    const env = createEnv().loadServiceWorker();
    const cp = await env.send({ type: "FETCH_CROSS_PLATFORM", gameName: "Elden Ring" });
    expect(cp.success).toBe(true);
    expect(cp.data.found).toBe(true);
    expect(cp.data.deals.length).toBeGreaterThan(0);

    const rs = await env.send({ type: "FETCH_REVIEW_SCORES", gameName: "Elden Ring" });
    expect(rs.data.metacritic.score).toBe(94);

    const pi = await env.send({ type: "FETCH_PRICE_INSIGHT", gameName: "Elden Ring" });
    expect(pi.data.found).toBe(true);
    expect(pi.data.cheapestEver.price).toBe(29.95);
    expect(pi.data.low).toBeNull(); // current price is well above the all-time low
    expect(pi.data.trend).toBeNull(); // only one real data point so far
    expect(pi.data.points.length).toBe(1);

    const none = await env.send({ type: "FETCH_PRICE_INSIGHT", gameName: "Astro Bot" });
    expect(none).toEqual({ success: true, data: { found: false } });
  });

  test("a real trend appears once prices were recorded on different days", async () => {
    const env = createEnv().loadServiceWorker();
    await env.send({ type: "FETCH_PRICE_INSIGHT", gameName: "Elden Ring" });
    // pretend 10 days ago the price was higher
    const snaps = env.stores.local.pse_snapshots;
    const key = Object.keys(snaps)[0];
    const today = snaps[key].p[0][0];
    snaps[key].p.unshift([today - 10, 70]);
    await env.chrome.storage.local.set({ pse_snapshots: snaps });
    const pi = await env.send({ type: "FETCH_PRICE_INSIGHT", gameName: "Elden Ring" });
    expect(pi.data.trend.direction).toBe("down");
    expect(pi.data.trend.spanDays).toBe(10);
    expect(pi.data.points.length).toBe(2);
  });
});

describe("owned list uses normalized titles", () => {
  test("curly vs straight apostrophes, TM and editions all count as the same game", async () => {
    const env = createEnv().loadServiceWorker();
    await env.chrome.storage.local.set({ manual_owned: ["Marvel's Spider-Man 2"], psn_owned: ["Cyberpunk 2077: Ultimate Edition"] });
    expect((await env.send({ type: "IS_GAME_OWNED", gameName: "Marvel’s Spider-Man 2™" })).owned).toBe(true);
    expect((await env.send({ type: "IS_GAME_OWNED", gameName: "Cyberpunk 2077" })).owned).toBe(true);
    expect((await env.send({ type: "IS_GAME_OWNED", gameName: "Hades" })).owned).toBe(false);
    const merged = await env.send({ type: "GET_MERGED_OWNED" });
    expect(merged.list.length).toBe(2);
    const add = await env.send({ type: "ADD_MANUAL_OWNED", gameName: "MARVELS SPIDER-MAN 2" });
    expect(add.list.length).toBe(1);
  });
});

describe("wishlist", () => {
  test("add (duplicates detected by normalized title), targets, note, remove", async () => {
    const env = createEnv().loadServiceWorker();
    const a = await env.send({ type: "ADD_WISHLIST", gameName: "Elden Ring", storeUrl: "https://store.playstation.com/en-us/concept/1", targetPrice: 40 });
    expect(a.ok).toBe(true);
    expect(a.currentPrice).toBeGreaterThan(0);
    const dup = await env.send({ type: "ADD_WISHLIST", gameName: "ELDEN RING™" });
    expect(dup).toMatchObject({ ok: false, error: "wishlistAlreadyAdded" });

    const t = await env.send({ type: "SET_WISHLIST_TARGET", gameName: "Elden Ring", targetPercent: 25, note: "x".repeat(500) });
    const item = t.list[0];
    expect(item.targetPercent).toBe(25);
    expect(item.targetPrice).toBe(40); // untouched: only keys present in the message change
    expect(item.note.length).toBe(200);
    expect((await env.send({ type: "IS_IN_WISHLIST", gameName: "elden ring" })).inWishlist).toBe(true);
    await env.send({ type: "REMOVE_WISHLIST", gameName: "Elden Ring" });
    expect((await env.send({ type: "GET_WISHLIST" })).list).toEqual([]);
  });

  test("price target hit → exactly one notification, badge count, re-arms when price rises", async () => {
    const env = createEnv().loadServiceWorker();
    await env.send({ type: "ADD_WISHLIST", gameName: "Elden Ring", storeUrl: "https://store.playstation.com/en-us/concept/1", targetPrice: 999 });
    await env.send({ type: "CHECK_WISHLIST_NOW" });
    expect(env.calls.notifications.length).toBe(1);
    expect(env.calls.notifications[0].message).toContain("wishlistPriceDropBody");
    expect(env.calls.badge.at(-1)).toBe("1");
    await env.send({ type: "CHECK_WISHLIST_NOW" });
    expect(env.calls.notifications.length).toBe(1); // not re-notified
    await env.send({ type: "SET_WISHLIST_TARGET", gameName: "Elden Ring", targetPrice: 1 });
    await env.send({ type: "CHECK_WISHLIST_NOW" });
    expect(env.calls.badge.at(-1)).toBe("");
  });

  test("percent target uses CheapShark's savings %", async () => {
    const env = createEnv().loadServiceWorker();
    await env.send({ type: "ADD_WISHLIST", gameName: "Elden Ring", targetPercent: 1 });
    await env.send({ type: "CHECK_WISHLIST_NOW" });
    expect(env.calls.notifications[0].message).toContain("wishlistPercentDropBody");
  });

  test("weekly digest mode batches alerts into one notification", async () => {
    const env = createEnv().loadServiceWorker();
    const hades2 = fixture("cs-games-hades.json").find((g) => g.external === "Hades II");
    env.route((url) =>
      url.includes(`games?id=${hades2.gameID}`)
        ? jsonResponse({
            info: { title: "Hades II", steamAppID: hades2.steamAppID },
            cheapestPriceEver: { price: "20.00", date: 1700000000 },
            deals: [{ storeID: "1", dealID: "x", price: "25.00", retailPrice: "30.00", savings: "16.6" }]
          })
        : undefined
    );
    await env.chrome.storage.sync.set({ digestMode: "weekly" });
    await env.send({ type: "ADD_WISHLIST", gameName: "Elden Ring", targetPrice: 999 });
    await env.send({ type: "ADD_WISHLIST", gameName: "Hades II", targetPrice: 999 });
    await env.send({ type: "CHECK_WISHLIST_NOW" });
    expect(env.calls.notifications.length).toBe(0);
    await env.fireAlarm("pse-wishlist-digest");
    expect(env.calls.notifications.length).toBe(1);
    expect(env.calls.notifications[0].message).toContain("wishlistDigestBody:2|");
    await env.fireAlarm("pse-wishlist-digest");
    expect(env.calls.notifications.length).toBe(1); // flags cleared
  });

  test("edits made while a price check is running are not overwritten", async () => {
    const env = createEnv().loadServiceWorker();
    await env.send({ type: "ADD_WISHLIST", gameName: "Elden Ring", targetPrice: 5 });
    let edited = false;
    env.route(async (url) => {
      // the first network call of the check triggers a concurrent user edit
      if (!edited && url.includes("games?title=")) {
        edited = true;
        await env.send({ type: "ADD_WISHLIST", gameName: "Hades II", targetPrice: 5 });
        await env.send({ type: "SET_WISHLIST_TARGET", gameName: "Elden Ring", note: "keep me" });
      }
      return undefined;
    });
    // bypass the cache so the check really hits the network
    await env.send({ type: "CLEAR_CACHE" });
    await env.send({ type: "CHECK_WISHLIST_NOW" });
    const list = (await env.send({ type: "GET_WISHLIST" })).list;
    expect(list.map((i) => i.name).sort()).toEqual(["Elden Ring", "Hades II"]);
    expect(list.find((i) => i.name === "Elden Ring").note).toBe("keep me");
  });

  test("ADD_WISHLIST keeps the PS Store price shown on the page (and ignores junk)", async () => {
    const env = createEnv().loadServiceWorker();
    await env.send({ type: "ADD_WISHLIST", gameName: "Elden Ring", psPrice: { amount: 249.9, currency: "ils" } });
    await env.send({ type: "ADD_WISHLIST", gameName: "Hades II", psPrice: { amount: -5, currency: "ILS" } });
    const list = (await env.send({ type: "GET_WISHLIST" })).list;
    expect(list.find((i) => i.name === "Elden Ring").psPrice).toMatchObject({ amount: 249.9, currency: "ILS" });
    expect(list.find((i) => i.name === "Hades II")).not.toHaveProperty("psPrice");
  });

  test("RECORD_PS_PRICE stores the price seen on the page against the wishlist item", async () => {
    const env = createEnv().loadServiceWorker();
    await env.send({ type: "ADD_WISHLIST", gameName: "Elden Ring" });
    expect(await env.send({ type: "RECORD_PS_PRICE", gameName: "Elden Ring", amount: 249.9, currency: "ILS" })).toEqual({ ok: true });
    const item = (await env.send({ type: "GET_WISHLIST" })).list[0];
    expect(item.psPrice).toMatchObject({ amount: 249.9, currency: "ILS" });
    expect(await env.send({ type: "RECORD_PS_PRICE", gameName: "Elden Ring", amount: -1, currency: "ILS" })).toEqual({ ok: false });
    expect(await env.send({ type: "RECORD_PS_PRICE", gameName: "Elden Ring", amount: 5, currency: "ILSX" })).toEqual({ ok: false });
  });
});

describe("PSN", () => {
  test("connect: cookie jar is restored, tokens stored, profile fetched", async () => {
    const env = createEnv().loadServiceWorker();
    fakeSony(env);
    env.setCookie(SONY, "npsso", "REAL-USER-COOKIE");
    const r = await env.send({ type: "PSN_AUTHENTICATE", npsso: GOOD });
    expect(r.success).toBe(true);
    expect(r.profile.onlineId).toBe("Tester");
    expect(env.getCookie(SONY, "npsso").value).toBe("REAL-USER-COOKIE"); // user's own cookie survived
    expect(env.stores.local.psn_access_token).toBe("acc-1");
  });

  test("a rejected token never leaves the bad cookie behind (and keeps the real one)", async () => {
    const env = createEnv().loadServiceWorker();
    fakeSony(env);
    env.setCookie(SONY, "npsso", "REAL-USER-COOKIE");
    const r = await env.send({ type: "PSN_AUTHENTICATE", npsso: BAD });
    expect(r).toEqual({ success: false, error: "psnErrAuthCode", detail: "authorize/login-redirect" });
    expect(env.getCookie(SONY, "npsso").value).toBe("REAL-USER-COOKIE");
  });

  test("with no previous cookie, ours is removed after the attempt", async () => {
    const env = createEnv().loadServiceWorker();
    fakeSony(env);
    await env.send({ type: "PSN_AUTHENTICATE", npsso: BAD });
    expect(env.getCookie(SONY, "npsso")).toBeNull();
    expect(env.calls.cookiesRemoved).toContain("npsso");
  });

  test("input validation happens before any network call", async () => {
    const env = createEnv().loadServiceWorker();
    fakeSony(env);
    expect(await env.send({ type: "PSN_AUTHENTICATE", npsso: "short" })).toEqual({ success: false, error: "psnErrTokenShort" });
    expect(await env.send({ type: "PSN_AUTHENTICATE", npsso: "a".repeat(50) + "!!!" })).toEqual({ success: false, error: "psnErrInvalidFormat" });
    expect(env.fetchLog.length).toBe(0);
  });

  test("opaque redirect without webRequest → asks for the optional permission", async () => {
    const env = createEnv().loadServiceWorker();
    fakeSony(env, { opaque: true });
    expect(await env.send({ type: "PSN_AUTHENTICATE", npsso: GOOD })).toEqual({
      success: false, error: "psnErrNeedsRedirectAccess", detail: "authorize/opaque-redirect"
    });
    const entries = await self.PSEDiag.get();
    expect(entries.some((e) => e.e === "authorize-response" && e.d.type === "opaqueredirect")).toBe(true);
  });

  test("opaque redirect + webRequest permission → code observed from the redirect", async () => {
    const env = createEnv();
    env.enableWebRequest();
    env.loadServiceWorker();
    fakeSony(env, { opaque: true });
    env.route(async (url) => {
      if (url.includes("/authorize")) {
        env.fireWebRequest("onBeforeRedirect", { redirectUrl: "com.scee.psxandroid.scecompcall://redirect?code=v3.TESTCODE" });
      }
      return undefined;
    });
    const r = await env.send({ type: "PSN_AUTHENTICATE", npsso: GOOD });
    expect(r.success).toBe(true);
    expect(env.webRequestListeners.length).toBe(0); // listeners removed again
  });

  test("opaque redirect + webRequest permission → code read from the 302 response headers", async () => {
    const env = createEnv();
    env.enableWebRequest();
    env.loadServiceWorker();
    fakeSony(env, { opaque: true });
    env.route(async (url) => {
      if (url.includes("/authorize")) {
        env.fireWebRequest("onHeadersReceived", {
          responseHeaders: [{ name: "Content-Type", value: "text/html" }, { name: "Location", value: "com.scee.psxandroid.scecompcall://redirect/?code=v3.TESTCODE&cid=1" }]
        });
      }
      return undefined;
    });
    expect((await env.send({ type: "PSN_AUTHENTICATE", npsso: GOOD })).success).toBe(true);
    expect(env.webRequestListeners.length).toBe(0);
  });

  test("permission granted but Chrome still hides the redirect → says so instead of a vague failure", async () => {
    const env = createEnv();
    env.enableWebRequest();
    env.loadServiceWorker();
    fakeSony(env, { opaque: true });
    expect(await env.send({ type: "PSN_AUTHENTICATE", npsso: GOOD })).toEqual({
      success: false, error: "psnErrAuthCode", detail: "authorize/redirect-not-observed"
    });
    expect(env.webRequestListeners.length).toBe(0);
  });

  test("Sony rejecting the request at the authorize step reports its error code (never a token)", async () => {
    const env = createEnv().loadServiceWorker();
    fakeSony(env);
    env.route((url) => (url.includes("/authorize") ? jsonResponse({ error: "invalid_client" }, 400) : undefined));
    expect(await env.send({ type: "PSN_AUTHENTICATE", npsso: GOOD })).toEqual({
      success: false, error: "psnErrAuthCode", detail: "authorize/http-400-invalid_client"
    });
    const log = await self.PSEDiag.get();
    expect(log.find((e) => e.e === "authorize-response").d).toMatchObject({ status: 400 });
    expect(log.find((e) => e.e === "auth-failed").d).toMatchObject({ step: "authorize", reason: "http-400-invalid_client" });
  });

  test("a failed token exchange reports the HTTP status and Sony's error code", async () => {
    const env = createEnv().loadServiceWorker();
    fakeSony(env);
    env.route((url) => (url.includes("/oauth/token") ? jsonResponse({ error: "invalid_client", error_description: "Bad client credentials" }, 401) : undefined));
    expect(await env.send({ type: "PSN_AUTHENTICATE", npsso: GOOD })).toEqual({
      success: false, error: "psnErrAccessToken", detail: "token/401-invalid_client"
    });
    expect(env.getCookie(SONY, "npsso")).toBeNull(); // still cleaned up
  });

  test("library sync paginates, classifies and reports status; manual list survives disconnect", async () => {
    const env = createEnv().loadServiceWorker();
    const sony = fakeSony(env);
    await env.send({ type: "ADD_MANUAL_OWNED", gameName: "Manual Game" });
    await env.send({ type: "PSN_AUTHENTICATE", npsso: GOOD });
    const lib = await env.send({ type: "PSN_FETCH_LIBRARY" });
    expect(lib.success).toBe(true);
    expect(sony.gamelistCalls).toBe(2);
    // Only the category values Sony documents for this endpoint — never the undocumented "*_nongame" ones
    const listUrls = env.fetchLog.filter((u) => u.includes("/gamelist/"));
    expect(listUrls.length).toBe(2);
    for (const u of listUrls) expect(new URL(u).searchParams.get("categories")).toBe("ps4_game,ps5_native_game,pspc_game");
    const st = await env.send({ type: "PSN_STATUS" });
    expect(st).toMatchObject({ connected: true, gameCount: 130, libraryCount: 131 });
    expect((await env.send({ type: "GET_MERGED_OWNED" })).list).toContain("Hades");
    await env.send({ type: "PSN_DISCONNECT" });
    expect((await env.send({ type: "GET_MERGED_OWNED" })).list).toEqual(["Manual Game"]);
  });

  test("a 401 is retried once after a token refresh", async () => {
    const env = createEnv().loadServiceWorker();
    const sony = fakeSony(env, { first401: true });
    await env.send({ type: "PSN_AUTHENTICATE", npsso: GOOD });
    const lib = await env.send({ type: "PSN_FETCH_LIBRARY" });
    expect(lib.success).toBe(true);
    expect(sony.refreshCalls).toBe(1);
  });

  test("persistent 401 → psnErrAuthExpired (no infinite retry)", async () => {
    const env = createEnv().loadServiceWorker();
    fakeSony(env);
    await env.send({ type: "PSN_AUTHENTICATE", npsso: GOOD });
    env.route((url) => (url.includes("m.np.playstation.com") ? jsonResponse({}, 401) : undefined));
    const lib = await env.send({ type: "PSN_FETCH_LIBRARY" });
    expect(lib).toEqual({ success: false, error: "psnErrAuthExpired" });
  });

  test("sync cooldown", async () => {
    const env = createEnv().loadServiceWorker();
    fakeSony(env);
    await env.send({ type: "PSN_AUTHENTICATE", npsso: GOOD });
    await env.send({ type: "PSN_FETCH_LIBRARY" });
    expect(await env.send({ type: "PSN_FETCH_LIBRARY" })).toEqual({ success: false, error: "psnWait30" });
  });

  test("trophy lookup picks 'Hades', never 'Hades II' or a spin-off", async () => {
    const env = createEnv().loadServiceWorker();
    fakeSony(env);
    await env.send({ type: "PSN_AUTHENTICATE", npsso: GOOD });
    const r = await env.send({ type: "FETCH_PSN_TROPHY", gameName: "Hades" });
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({ progress: 55, npCommunicationId: "NPWR1", hasPlatinum: true });
    expect((await env.send({ type: "FETCH_PSN_TROPHY", gameName: "Elden Ring" })).success).toBe(false);
  });

  test("experimental trophy rarity is off by default and works when enabled", async () => {
    const env = createEnv().loadServiceWorker();
    fakeSony(env);
    await env.send({ type: "PSN_AUTHENTICATE", npsso: GOOD });
    expect(await env.send({ type: "FETCH_TROPHY_RARITY", gameName: "Hades" })).toEqual({ success: false, error: "disabled" });
    await env.chrome.storage.sync.set({ enableTrophyRarity: true });
    const r = await env.send({ type: "FETCH_TROPHY_RARITY", gameName: "Hades" });
    expect(r.success).toBe(true);
    expect(r.data.rarestRemaining).toMatchObject({ rate: 0.7, name: "Escaped" });
    expect(r.data.rarestEarned).toMatchObject({ rate: 12.5, name: "Rare One" });
  });
});

describe("diagnostics log", () => {
  test("never records secrets and keeps only the newest 120 entries", async () => {
    const env = createEnv().loadServiceWorker();
    await self.PSEDiag.log("psn", "x", {
      access_token: "abcdefghijklmnopqrstuvwxyz0123456789ABCDEF",
      note: "token abcdefghijklmnopqrstuvwxyz0123456789ABCDEF end",
      url: self.PSEDiag.urlInfo("https://ca.account.sony.com/api/x?code=v3.SECRETSECRETSECRETSECRETSECRET1234")
    });
    const first = (await self.PSEDiag.get())[0];
    expect(JSON.stringify(first)).not.toContain("abcdefghijklmnopqrstuvwxyz");
    expect(JSON.stringify(first)).not.toContain("SECRET");
    expect(first.d.url).toBe("ca.account.sony.com/api/x");
    for (let i = 0; i < 150; i++) self.PSEDiag.log("t", "e" + i, {});
    await self.PSEDiag.log("t", "last", {});
    const all = (await env.send({ type: "DIAG_GET" })).entries;
    expect(all.length).toBe(120);
    expect(all.at(-1).e).toBe("last");
    await env.send({ type: "DIAG_CLEAR" });
    expect((await env.send({ type: "DIAG_GET" })).entries).toEqual([]);
  });
});

describe("privacy: erase everything", () => {
  test("WIPE_ALL_DATA removes PSN credentials, wishlist, owned list, caches and snapshots", async () => {
    const env = createEnv().loadServiceWorker();
    fakeSony(env);
    await env.send({ type: "PSN_AUTHENTICATE", npsso: GOOD });
    await env.send({ type: "ADD_WISHLIST", gameName: "Elden Ring" });
    await env.send({ type: "ADD_MANUAL_OWNED", gameName: "Something" });
    await self.PSEDiag.log("t", "e", {});
    expect(await env.send({ type: "WIPE_ALL_DATA" })).toEqual({ ok: true });
    expect(env.stores.local).toEqual({ manual_owned: [], psn_owned: [], wishlist: [] });
    expect(env.calls.badge.at(-1)).toBe("");
  });
});

describe("lifecycle", () => {
  test("fresh install seeds defaults and opens the welcome page; update marks the changelog unseen", async () => {
    const env = createEnv().loadServiceWorker();
    await env.fireInstalled({ reason: "install" });
    expect(env.stores.sync.enableMetacritic).toBe(true);
    expect(env.stores.sync.digestMode).toBe("instant");
    expect(env.stores.local.pse_tour_pending).toBe(true);
    expect(env.calls.tabs).toEqual(["chrome-extension://test/welcome.html"]);
    expect(env.calls.alarms).toEqual(expect.arrayContaining(["pse-cache-purge", "pse-psn-sync", "pse-wishlist-check", "pse-wishlist-digest"]));

    await env.fireInstalled({ reason: "update", previousVersion: "2.6.0" });
    expect(env.stores.local.pse_changelog_unseen).toBe("9.9.9");
    expect(env.calls.tabs).toContain("chrome-extension://test/changelog.html");
    expect(env.calls.badge.at(-1)).toBe("●");
  });
});

describe("messaging docs stay in sync with the handlers", () => {
  test(".github/MESSAGING.md documents every handler in background.js", () => {
    const root = path.join(__dirname, "..");
    const src = fs.readFileSync(path.join(root, "extension", "background.js"), "utf8");
    const block = src.slice(src.indexOf("const HANDLERS = {"), src.indexOf("/* ──── Wishlist price checker"));
    const names = [...block.matchAll(/^ {2}([A-Z][A-Z_]+):/gm)].map((m) => m[1]);
    expect(names.length).toBeGreaterThan(20);
    const doc = fs.readFileSync(path.join(root, ".github", "MESSAGING.md"), "utf8");
    const missing = names.filter((n) => !doc.includes("`" + n + "`"));
    expect(missing).toEqual([]);
  });
});
