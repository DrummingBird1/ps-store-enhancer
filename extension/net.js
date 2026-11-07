/**
 * PS Store Enhancer — Network layer.
 *
 * Every request the service worker makes goes through PSENet.fetch:
 *  - only hosts on the allow-list below (the same hosts as `host_permissions` in manifest.json; a unit
 *    test fails if one is added to one place and not the other, or not described in the privacy texts);
 *  - a timeout, so a hung server cannot hold a handler forever;
 *  - a local log (last 200 requests) of host + path + status + duration. Never the query string, never a
 *    header or a body — query strings carry game titles and tokens. It is shown in Settings and stays on
 *    this device.
 */
const PSENet = (() => {
  "use strict";
  const KEY = "pse_netlog";
  const MAX = 200;
  const DEFAULT_TIMEOUT_MS = 20000;
  /** host → what the extension uses it for (also shown in Settings). */
  const ALLOWED_HOSTS = {
    "www.cheapshark.com": "prices, scores",
    "api.frankfurter.dev": "exchange rates",
    "ca.account.sony.com": "PSN sign-in (optional)",
    "m.np.playstation.com": "PSN library (optional)",
    "store.playstation.com": "price of wishlisted games"
  };
  let chain = Promise.resolve();

  function record(entry) {
    chain = chain
      .then(async () => {
        const cur = await chrome.storage.local.get(KEY);
        const arr = Array.isArray(cur[KEY]) ? cur[KEY] : [];
        arr.push(entry);
        await chrome.storage.local.set({ [KEY]: arr.slice(-MAX) });
      })
      .catch(() => {});
    return chain;
  }

  /**
   * fetch() for allow-listed https hosts. Resolves exactly like fetch (including `redirect: "manual"`
   * responses); throws before any request when the host is not allowed.
   */
  async function psFetch(url, init) {
    let u;
    try {
      u = new URL(url);
    } catch {
      throw new Error("PSENet: invalid URL");
    }
    if (u.protocol !== "https:" || !Object.hasOwn(ALLOWED_HOSTS, u.hostname)) {
      record({ t: Date.now(), h: u.hostname, p: u.pathname, s: -1, ms: 0, ok: false, e: "blocked" });
      throw new Error(`PSENet: host not allowed (${u.hostname})`);
    }
    const opts = { ...(init || {}) };
    const controller = typeof AbortController === "function" && !opts.signal ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS) : null;
    if (controller) opts.signal = controller.signal;
    const started = Date.now();
    let status = 0;
    let ok = false;
    let error;
    try {
      const resp = await fetch(url, opts);
      status = resp.status;
      ok = resp.ok;
      // A redirect may only lead to another allow-listed host.
      if (resp.redirected && resp.url) {
        let finalHost = "";
        try {
          finalHost = new URL(resp.url).hostname;
        } catch {
          /* unparseable: treated as not allowed */
        }
        if (!Object.hasOwn(ALLOWED_HOSTS, finalHost)) {
          ok = false;
          error = "blocked-redirect";
          throw new Error(`PSENet: redirected to a host that is not allowed (${finalHost || "?"})`);
        }
      }
      return resp;
    } catch (err) {
      error = error || (err && err.name) || "error"; // keep "blocked-redirect" set above
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
      const entry = { t: started, h: u.hostname, p: u.pathname, s: status, ms: Date.now() - started, ok };
      if (error) entry.e = error;
      record(entry);
    }
  }

  async function get() {
    try {
      await chain; // entries from requests that just finished
      const cur = await chrome.storage.local.get(KEY);
      return Array.isArray(cur[KEY]) ? cur[KEY] : [];
    } catch {
      return [];
    }
  }

  function clear() {
    chain = chain.then(() => chrome.storage.local.remove(KEY)).catch(() => {});
    return chain;
  }

  /** Resolves once every queued log write has landed. */
  function flush() {
    return chain;
  }

  function formatEntries(entries) {
    return (entries || [])
      .map((x) => `${new Date(x.t).toISOString()} ${x.s} ${x.h}${x.p} ${x.ms}ms${x.e ? " " + x.e : ""}`)
      .join("\n");
  }

  return { fetch: psFetch, get, clear, flush, formatEntries, ALLOWED_HOSTS, KEY, MAX };
})();

self.PSENet = PSENet;
