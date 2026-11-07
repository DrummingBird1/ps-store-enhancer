const fs = require("fs");
const path = require("path");
const { createEnv, jsonResponse, hostOf } = require("./support/sw-env");

const ROOT = path.join(__dirname, "..");
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), "utf8");

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("network layer: allow-list", () => {
  test("only allow-listed https hosts are reached; anything else throws before any request", async () => {
    const env = createEnv().loadServiceWorker();
    await expect(self.PSENet.fetch("https://evil.example/x?token=abc")).rejects.toThrow(/not allowed/);
    await expect(self.PSENet.fetch("http://www.cheapshark.com/api/1.0/stores")).rejects.toThrow(/not allowed/);
    await expect(self.PSENet.fetch("not a url")).rejects.toThrow(/invalid URL/);
    expect(env.fetchLog).toEqual([]);
    const log = await self.PSENet.get();
    expect(log).toHaveLength(2); // the two refused hosts are logged, the unparseable URL has nothing to log
    expect(log[0]).toMatchObject({ h: "evil.example", s: -1, ok: false, e: "blocked" });
  });

  test("the host list equals the manifest's host_permissions, and every host is described in the privacy texts", () => {
    const manifest = JSON.parse(read("extension", "manifest.json"));
    const hosts = manifest.host_permissions.map((h) => new URL(h.replace("/*", "/")).hostname).sort();
    const env = createEnv().loadServiceWorker();
    expect(Object.keys(self.PSENet.ALLOWED_HOSTS).sort()).toEqual(hosts);
    const notes = read("assets", "REVIEWER-NOTES.md");
    const policy = read("assets", "docs", "privacy-policy.html");
    const missing = [];
    for (const h of hosts) {
      // CheapShark is documented without the "www." prefix
      const short = h.replace(/^www\./, "");
      if (!notes.includes(short)) missing.push(`REVIEWER-NOTES.md: ${h}`);
      if (!policy.includes(short)) missing.push(`privacy-policy.html: ${h}`);
    }
    expect(missing).toEqual([]);
    expect(env).toBeTruthy();
  });

  test("every permission the manifest declares (required or optional) is explained in the privacy texts", () => {
    const manifest = JSON.parse(read("extension", "manifest.json"));
    const names = [...(manifest.permissions || []), ...(manifest.optional_permissions || [])];
    expect(names).toEqual(expect.arrayContaining(["webRequest", "declarativeNetRequestWithHostAccess"]));
    const docs = {
      "REVIEWER-NOTES.md": read("assets", "REVIEWER-NOTES.md"),
      "privacy-policy.html": read("assets", "docs", "privacy-policy.html"),
      "STORE-LISTING.txt": read("assets", "STORE-LISTING.txt")
    };
    const missing = [];
    for (const name of names) {
      for (const [file, text] of Object.entries(docs)) if (!text.includes(name)) missing.push(`${file}: ${name}`);
    }
    expect(missing).toEqual([]);
  });

  test("no extension script outside net.js calls fetch() on the network directly", () => {
    const offenders = [];
    for (const f of fs.readdirSync(path.join(ROOT, "extension")).filter((n) => n.endsWith(".js"))) {
      if (f === "net.js") continue;
      const src = read("extension", f);
      // local resources (chrome.runtime.getURL) are not network requests
      for (const m of src.matchAll(/(?<![.\w])fetch\(([^)]*)\)/g)) {
        // i18n.js reads its own packaged _locales file through a `url` built from chrome.runtime.getURL
        const local = /getURL/.test(m[1]) || (f === "i18n.js" && m[1] === "url" && src.includes("chrome.runtime.getURL(`_locales/"));
        if (!local) offenders.push(`${f}: fetch(${m[1].slice(0, 40)})`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("network layer: the local request log", () => {
  test("records host and path only: never the query string, headers or body", async () => {
    const env = createEnv().loadServiceWorker();
    env.route((u) => (hostOf(u) === "ca.account.sony.com" ? jsonResponse({ ok: 1 }) : undefined));
    await self.PSENet.fetch("https://ca.account.sony.com/api/authz/v3/oauth/token?code=SECRETCODE&npsso=SECRETNPSSO", {
      method: "POST",
      headers: { Authorization: "Basic SECRETBASIC" },
      body: "refresh_token=SECRETREFRESH"
    });
    await self.PSENet.flush();
    const log = await self.PSENet.get();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ h: "ca.account.sony.com", p: "/api/authz/v3/oauth/token", s: 200, ok: true });
    expect(JSON.stringify(log)).not.toMatch(/SECRET|code=|npsso|Basic/);
    expect(Object.keys(log[0]).sort()).toEqual(["h", "ms", "ok", "p", "s", "t"]);
  });

  test("failed requests are logged with their status or error name, and keep the original response", async () => {
    const env = createEnv().loadServiceWorker();
    env.route((u) => (hostOf(u) === "api.frankfurter.dev" ? jsonResponse({}, 503) : undefined));
    const resp = await self.PSENet.fetch("https://api.frankfurter.dev/v1/latest?base=USD");
    expect(resp.status).toBe(503);
    env.route((u) => {
      if (hostOf(u) === "www.cheapshark.com" && u.includes("/api/1.0/stores")) throw Object.assign(new Error("offline"), { name: "TypeError" });
      return undefined;
    });
    await expect(self.PSENet.fetch("https://www.cheapshark.com/api/1.0/stores")).rejects.toThrow("offline");
    await self.PSENet.flush();
    const log = await self.PSENet.get();
    expect(log.map((e) => [e.h, e.s, e.ok, e.e])).toEqual([
      ["api.frankfurter.dev", 503, false, undefined],
      ["www.cheapshark.com", 0, false, "TypeError"]
    ]);
  });

  test("a request that never answers is aborted after the timeout", async () => {
    jest.useFakeTimers({ doNotFake: ["Date", "nextTick", "setImmediate", "queueMicrotask"] });
    const env = createEnv().loadServiceWorker();
    env.route(
      (u, init) =>
        hostOf(u) === "m.np.playstation.com"
          ? new Promise((_res, rej) => init.signal.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" }))))
          : undefined
    );
    const p = self.PSENet.fetch("https://m.np.playstation.com/api/gamelist/v2/users/me/titles").catch((e) => e);
    await jest.advanceTimersByTimeAsync(20001);
    expect((await p).name).toBe("AbortError");
    jest.useRealTimers();
    await self.PSENet.flush();
    expect((await self.PSENet.get())[0]).toMatchObject({ h: "m.np.playstation.com", e: "AbortError", ok: false });
  });

  test("keeps the newest 200 entries, can be cleared and is erased with the rest of the data", async () => {
    const env = createEnv().loadServiceWorker();
    env.route((u) => (hostOf(u) === "api.frankfurter.dev" ? jsonResponse({}) : undefined));
    for (let i = 0; i < 230; i++) await self.PSENet.fetch(`https://api.frankfurter.dev/v1/latest?n=${i}`);
    await self.PSENet.flush();
    expect(await self.PSENet.get()).toHaveLength(200);
    await self.PSENet.clear();
    expect(await self.PSENet.get()).toEqual([]);
    await self.PSENet.fetch("https://api.frankfurter.dev/v1/latest");
    await env.send({ type: "WIPE_ALL_DATA" });
    expect(env.stores.local).toEqual({ manual_owned: [], psn_owned: [], wishlist: [] });
  });

  test("the existing lookups are logged through the layer (CheapShark, Frankfurter)", async () => {
    const env = createEnv().loadServiceWorker();
    await env.send({ type: "FETCH_CROSS_PLATFORM", gameName: "Elden Ring" });
    await env.send({ type: "GET_RATES", target: "EUR" });
    await self.PSENet.flush();
    const hosts = new Set((await self.PSENet.get()).map((e) => e.h));
    expect(hosts.has("www.cheapshark.com")).toBe(true);
  });
});
