/**
 * Test environment for the service-worker code: a small in-memory `chrome.*`, a routable `fetch`
 * stub and a loader that evaluates the real extension files in service-worker order.
 */
const fs = require("fs");
const path = require("path");

const EXT = path.join(__dirname, "..", "..", "extension");
const FIX = path.join(__dirname, "..", "fixtures");

const fixture = (name) => JSON.parse(fs.readFileSync(path.join(FIX, name), "utf8"));
const clone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));

function jsonResponse(data, status = 200, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    type: "basic",
    url: "",
    headers: { get: (k) => headers[String(k).toLowerCase()] ?? null },
    json: async () => clone(data),
    clone() { return this; },
    text: async () => (typeof data === "string" ? data : JSON.stringify(data))
  };
}

/** Real CheapShark responses captured from the live API (see tests/fixtures). */
function cheapSharkRoute(url) {
  const u = new URL(url);
  if (u.hostname !== "www.cheapshark.com") return undefined;
  const p = u.pathname.replace("/api/1.0/", "");
  const q = u.searchParams;
  if (p === "stores") return jsonResponse(fixture("cs-stores.json"));
  if (p === "games" && q.get("title")) {
    const t = q.get("title").toLowerCase();
    if (t.startsWith("elden ring")) return jsonResponse(fixture("cs-games-elden-ring.json"));
    if (t.startsWith("cyberpunk")) return jsonResponse(fixture("cs-games-cyberpunk.json"));
    if (t.startsWith("astro bot")) return jsonResponse(fixture("cs-games-astro-bot.json"));
    if (t.startsWith("hades")) return jsonResponse(fixture("cs-games-hades.json"));
    return jsonResponse([]);
  }
  if (p === "games" && q.get("id") === "236717") return jsonResponse(fixture("cs-game-236717.json"));
  if (p === "deals" && q.get("steamAppID") === "1245620") return jsonResponse(fixture("cs-deals-steam-1245620.json"));
  return jsonResponse({ error: "no fixture" }, 404);
}

function createEnv() {
  jest.resetModules();
  const stores = { local: {}, sync: {}, session: {} };
  const changeListeners = [];

  const area = (name) => ({
    async get(keys) {
      const all = stores[name];
      if (keys == null) return clone(all);
      const list = typeof keys === "string" ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
      const out = {};
      for (const k of list) {
        if (k in all) out[k] = clone(all[k]);
        else if (keys && typeof keys === "object" && !Array.isArray(keys)) out[k] = keys[k];
      }
      return out;
    },
    async set(items) {
      for (const [k, v] of Object.entries(items)) stores[name][k] = clone(v);
      changeListeners.forEach((l) => l({}, name));
    },
    async remove(keys) {
      for (const k of [].concat(keys)) delete stores[name][k];
    },
    async clear() {
      for (const k of Object.keys(stores[name])) delete stores[name][k];
    }
  });

  const ev = { message: null, installed: null, alarm: null, ctx: null, notif: null };
  const calls = { notifications: [], badge: [], alarms: [], tabs: [], cookiesSet: [], cookiesRemoved: [] };
  const cookies = new Map();
  const webRequestListeners = [];

  const chrome = {
    storage: { local: area("local"), sync: area("sync"), session: area("session"), onChanged: { addListener: (fn) => changeListeners.push(fn) } },
    runtime: {
      getURL: (p) => `chrome-extension://test/${p}`,
      getManifest: () => ({ version: "9.9.9" }),
      onMessage: { addListener: (fn) => (ev.message = fn) },
      onInstalled: { addListener: (fn) => (ev.installed = fn) },
      onStartup: { addListener: () => {} }
    },
    alarms: { create: (n) => calls.alarms.push(n), onAlarm: { addListener: (fn) => (ev.alarm = fn) } },
    contextMenus: { removeAll: (cb) => cb && cb(), create: () => {}, onClicked: { addListener: () => {} } },
    notifications: {
      create: async (id, o) => { calls.notifications.push({ id, ...o }); return id; },
      clear: () => {},
      onClicked: { addListener: (fn) => (ev.notif = fn) }
    },
    action: { setBadgeText: ({ text }) => calls.badge.push(text), setBadgeBackgroundColor: () => {} },
    tabs: { create: (o) => calls.tabs.push(o.url) },
    i18n: { getMessage: (k, subs) => `${k}:${[].concat(subs || []).join("|")}` },
    cookies: {
      get: async ({ url, name }) => cookies.get(`${url}|${name}`) || null,
      set: async (d) => {
        calls.cookiesSet.push({ ...d, value: "[value]" });
        cookies.set(`${d.url}|${d.name}`, { name: d.name, value: d.value, path: d.path, secure: d.secure, httpOnly: d.httpOnly, hostOnly: !d.domain, domain: d.domain, sameSite: d.sameSite });
        return d;
      },
      remove: async ({ url, name }) => { calls.cookiesRemoved.push(name); cookies.delete(`${url}|${name}`); }
    }
  };

  let now = Date.UTC(2026, 9, 15, 12, 0, 0);
  jest.spyOn(Date, "now").mockImplementation(() => now);

  const env = {
    chrome, stores, calls, cookies, webRequestListeners,
    setNow: (t) => { now = t; },
    advanceDays: (d) => { now += d * 86400000; },
    fetchLog: [],
    routes: [],
    /** Register a fetch route: fn(url, init) → response | undefined (first match wins). */
    route(fn) { env.routes.unshift(fn); },
    enableWebRequest() {
      const event = (name) => ({
        addListener: (fn) => { fn.__event = name; webRequestListeners.push(fn); },
        removeListener: (fn) => { const i = webRequestListeners.indexOf(fn); if (i >= 0) webRequestListeners.splice(i, 1); }
      });
      chrome.webRequest = { onBeforeRedirect: event("onBeforeRedirect"), onHeadersReceived: event("onHeadersReceived") };
    },
    /** Deliver a webRequest event to the listeners registered for it. */
    fireWebRequest(name, details) {
      webRequestListeners.filter((l) => l.__event === name).forEach((l) => l(details));
    },
    setCookie(url, name, value) { cookies.set(`${url}|${name}`, { name, value, path: "/", secure: true, httpOnly: true, hostOnly: true }); },
    getCookie(url, name) { return cookies.get(`${url}|${name}`) || null; },
    send(msg) {
      return new Promise((resolve) => {
        const ret = ev.message(msg, {}, resolve);
        if (ret !== true) resolve(undefined);
      });
    },
    fireAlarm(name) { return ev.alarm({ name }); },
    fireInstalled(details) { return ev.installed(details); },
    fireNotifClick(id) { return ev.notif(id); },
    /** Evaluate the real extension files in service-worker order. */
    loadServiceWorker() {
      global.self = global;
      global.chrome = chrome;
      global.importScripts = () => {};
      global.fetch = jest.fn(async (url, init) => {
        env.fetchLog.push(String(url));
        for (const r of env.routes) {
          const res = await r(String(url), init);
          if (res !== undefined) return res;
        }
        const cs = cheapSharkRoute(String(url));
        if (cs) return cs;
        return jsonResponse({ error: `unrouted ${url}` }, 599);
      });
      for (const f of ["match.js", "helpers.js", "cache.js", "diag.js", "cheapshark.js", "psn.js", "background.js"]) {
        require(path.join(EXT, f));
      }
      return env;
    }
  };
  return env;
}

module.exports = { createEnv, fixture, jsonResponse, EXT };
