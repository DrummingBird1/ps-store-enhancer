/* Test harness only. Stands in for Sony's PSN hosts so a locally generated TEST token can be
   exercised end to end without ever contacting Sony, and answers CheapShark from the real
   responses captured in tests/fixtures (deterministic, works offline). Frankfurter is stubbed
   too. Switch CheapShark to the live API with:  localStorage.__net = "real"  */
(() => {
  const realFetch = window.fetch.bind(window);
  const net = (window.__net = []);
  const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
  const fixture = async (name) => (await realFetch(`/__f/${name}`)).json();
  const GOOD_PREFIX = "HARNESSTEST";

  const titles = [];
  const named = [
    ["Elden Ring", "ps5_native_game"], ["God of War Ragnarök", "ps5_native_game"], ["Hades II", "ps5_native_game"],
    ["Astro Bot", "ps5_native_game"], ["Stray", "ps4_game"], ["Returnal", "ps5_native_game"],
    ["Elden Ring Shadow of the Erdtree", "ps5_native_nongame"], ["God of War Ragnarök Valhalla", "ps5_native_nongame"],
    ["Cyberpunk 2077 Season Pass", "ps4_nongame"], ["Netflix", "ps4_nongame"],
    ['Escape <b>Test</b> & "Quotes" Edition', "ps4_game"]
  ];
  for (const [name, category] of named) titles.push({ titleId: "CUSA" + titles.length, name, category, imageUrl: null });
  for (let i = 1; i <= 120; i++) titles.push({ titleId: "CUSB" + i, name: "Filler Game " + String(i).padStart(3, "0"), category: "ps4_game", imageUrl: null });

  async function cheapShark(u) {
    const p = u.pathname.replace("/api/1.0/", "");
    const q = u.searchParams;
    if (p === "stores") return json(await fixture("cs-stores.json"));
    if (p === "games" && q.get("title")) {
      const t = q.get("title").toLowerCase();
      if (t.startsWith("elden ring")) return json(await fixture("cs-games-elden-ring.json"));
      if (t.startsWith("cyberpunk")) return json(await fixture("cs-games-cyberpunk.json"));
      if (t.startsWith("astro bot")) return json(await fixture("cs-games-astro-bot.json"));
      if (t.startsWith("hades")) return json(await fixture("cs-games-hades.json"));
      return json([]);
    }
    if (p === "games" && q.get("id") === "236717") return json(await fixture("cs-game-236717.json"));
    if (p === "deals" && q.get("steamAppID") === "1245620") return json(await fixture("cs-deals-steam-1245620.json"));
    return json({ error: "no fixture" }, 404);
  }

  window.fetch = async (input, init = {}) => {
    const u = new URL(typeof input === "string" ? input : input.url, location.href);
    net.push({ method: init.method || "GET", host: u.hostname, path: u.pathname, redirect: init.redirect || null });

    if (u.hostname === "www.cheapshark.com" && localStorage.__net !== "real") return cheapShark(u);
    if (u.hostname === "api.frankfurter.dev") return json({ base: "USD", rates: { ILS: 3.07, EUR: 0.86 } });

    if (u.hostname === "ca.account.sony.com") {
      if (u.pathname.endsWith("/authorize")) {
        const c = window.__log.cookies["https://ca.account.sony.com|npsso"];
        if (c && c.value.startsWith(GOOD_PREFIX)) {
          return new Response(null, { status: 302, headers: { location: "com.scee.psxandroid.scecompcall://redirect?code=v3.HARNESSCODE" } });
        }
        return new Response(null, { status: 302, headers: { location: "https://my.account.sony.com/sonyacct/signin/" } });
      }
      if (u.pathname.endsWith("/token")) {
        const body = String(init.body || "");
        if (body.includes("grant_type=authorization_code") && body.includes("code=v3.HARNESSCODE")) {
          return json({ access_token: "harness-access", refresh_token: "harness-refresh", expires_in: 3600 });
        }
        if (body.includes("grant_type=refresh_token") && body.includes("harness-refresh")) {
          return json({ access_token: "harness-access-2", refresh_token: "harness-refresh", expires_in: 3600 });
        }
        return json({ error: "invalid_grant" }, 400);
      }
    }
    if (u.hostname === "m.np.playstation.com") {
      const auth = (init.headers && (init.headers.Authorization || init.headers.authorization)) || "";
      if (!/^Bearer harness-/.test(auth)) return json({ error: "unauthorized" }, 401);
      if (u.pathname.includes("/userProfile/")) {
        return json({ onlineId: "HarnessUser", accountId: "1234567890", avatars: [{ url: location.origin + "/icons/icon48.png" }] });
      }
      if (u.pathname.includes("/gamelist/")) {
        const off = Number(u.searchParams.get("offset") || 0), lim = Number(u.searchParams.get("limit") || 100);
        return json({ totalItemCount: titles.length, titles: titles.slice(off, off + lim) });
      }
      if (u.pathname.endsWith("/trophyTitles")) {
        return json({
          totalItemCount: 2,
          trophyTitles: [
            { trophyTitleName: "Elden Ring", npCommunicationId: "NPWR1", npServiceName: "trophy2", progress: 42, earnedTrophies: { bronze: 10, silver: 3, gold: 1, platinum: 0 }, definedTrophies: { bronze: 30, silver: 12, gold: 5, platinum: 1 } },
            { trophyTitleName: "Astro Bot", npCommunicationId: "NPWR2", npServiceName: "trophy2", progress: 100, earnedTrophies: { bronze: 40, silver: 10, gold: 3, platinum: 1 }, definedTrophies: { bronze: 40, silver: 10, gold: 3, platinum: 1 } }
          ]
        });
      }
      if (u.pathname.includes("/npCommunicationIds/") && u.pathname.includes("/users/me/")) {
        return json({ trophies: [{ trophyId: 0, earned: true, trophyEarnedRate: "70.0" }, { trophyId: 1, earned: false, trophyEarnedRate: "0.9" }] });
      }
      if (u.pathname.includes("/npCommunicationIds/")) {
        return json({ trophies: [{ trophyId: 1, trophyName: "Elden Lord" }] });
      }
    }
    return realFetch(input, init);
  };
})();
