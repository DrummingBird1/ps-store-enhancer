/**
 * PS Store Enhancer — Local diagnostics log.
 *
 * A small ring buffer (last 120 events) kept in chrome.storage.local so a failed API call or a
 * failed PSN connection can be diagnosed from the settings page without opening DevTools.
 * Nothing here ever leaves the device: it is only shown (and optionally copied) by the user.
 * Secrets are never recorded — token-like strings and secret-looking keys are redacted, and
 * URLs are reduced to host + path.
 */
const PSEDiag = (() => {
  "use strict";
  const KEY = "pse_diag";
  const MAX = 120;
  const SECRET_KEY = /token|npsso|authorization|cookie|password|secret|code|bearer/i;
  let chain = Promise.resolve();

  function redactString(s) {
    return String(s)
      .replace(/[A-Za-z0-9._~+/=-]{32,}/g, "[redacted]")
      .replace(/(code|npsso|token|access_token|refresh_token)=([^&\s]+)/gi, "$1=[redacted]")
      .slice(0, 300);
  }

  function redact(value, depth = 0) {
    if (value == null) return value;
    if (typeof value === "string") return redactString(value);
    if (typeof value === "number" || typeof value === "boolean") return value;
    if (depth >= 3) return "[…]";
    if (Array.isArray(value)) return value.slice(0, 10).map((v) => redact(v, depth + 1));
    if (typeof value === "object") {
      const out = {};
      for (const [k, v] of Object.entries(value).slice(0, 20)) {
        out[k] = SECRET_KEY.test(k) ? "[redacted]" : redact(v, depth + 1);
      }
      return out;
    }
    return String(value).slice(0, 80);
  }

  /** "https://a.b/c?x=1" → "a.b/c" (never keeps a query string or fragment). */
  function urlInfo(url) {
    try {
      const u = new URL(url);
      return u.host + u.pathname;
    } catch {
      return redactString(url || "");
    }
  }

  /**
   * Append an event. Never throws and never blocks the caller (writes are serialized).
   * @param {string} source e.g. "psn", "cheapshark", "wishlist"
   * @param {string} event  short machine-readable name
   * @param {object} [details]
   */
  function log(source, event, details) {
    const entry = { t: Date.now(), s: String(source), e: String(event), d: redact(details) };
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

  async function get() {
    try {
      const cur = await chrome.storage.local.get(KEY);
      return Array.isArray(cur[KEY]) ? cur[KEY] : [];
    } catch {
      return [];
    }
  }

  async function clear() {
    chain = chain.then(() => chrome.storage.local.remove(KEY)).catch(() => {});
    return chain;
  }

  /** Resolves once every queued write has landed. */
  function flush() {
    return chain;
  }

  function formatEntries(entries) {
    return (entries || [])
      .map((x) => {
        const d = x.d && Object.keys(x.d).length ? " " + JSON.stringify(x.d) : "";
        return `${new Date(x.t).toISOString()} [${x.s}] ${x.e}${d}`;
      })
      .join("\n");
  }

  return { log, get, clear, flush, urlInfo, redact, formatEntries, KEY, MAX };
})();

self.PSEDiag = PSEDiag;
