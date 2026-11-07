/**
 * Runs one of the extension's own pages (popup.html, options.html, welcome.html) in jsdom with its REAL scripts, in the
 * order the page lists them, against a recording fake of the `chrome.*` APIs the pages use. Nothing is mocked from the
 * extension itself: i18n.js, diag.js, net.js, helpers.js, popup.js, options.js and welcome.js are the shipped files.
 *
 * `chrome.i18n.getMessage` answers with the key (the page keeps its English markup text); with `userLanguage: "en"` in
 * `sync`, the shipped _locales/en/messages.json is served instead and t() gives the real English message.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { JSDOM } = require("jsdom");
const { EXT, read } = require("./css");

const open = [];
/** Close every page opened so far (stops timers and observers); call it from afterEach. */
const closePages = () => {
  while (open.length) open.pop().window.close();
};

/**
 * @param {string} file  the page, e.g. "popup.html"
 * @param {object} [opts]
 * @param {object} [opts.sync] / [opts.local]  initial contents of chrome.storage.sync / .local
 * @param {object} [opts.respond]  runtime message type -> (message) => response
 * @param {boolean} [opts.prefersLight]  the system's colour scheme; omit and the page has no matchMedia
 * @param {boolean} [opts.clipboardFails]  navigator.clipboard.writeText rejects
 * @param {(window) => void} [opts.beforeScripts]  runs once the fakes are in place and before the first script
 */
function loadExtensionPage(file, opts = {}) {
  const html = read(file);
  const dom = new JSDOM(html, { url: `chrome-extension://testextensionid/${file}`, runScripts: "outside-only", pretendToBeVisual: true });
  open.push(dom);
  const w = dom.window;
  const manifest = JSON.parse(read("manifest.json"));
  const calls = { syncSet: [], localSet: [], sent: [], tabs: [], openOptions: 0, clipboard: [] };
  const sync = { ...(opts.sync || {}) };
  const local = { ...(opts.local || {}) };
  const area = (store, log) => ({
    get: async (keys) => {
      const list = Array.isArray(keys) ? keys : typeof keys === "string" ? [keys] : Object.keys(keys || store);
      return Object.fromEntries(list.filter((k) => k in store).map((k) => [k, store[k]]));
    },
    set: async (o) => {
      log.push(o);
      Object.assign(store, o);
    },
    remove: async (keys) => {
      for (const k of [].concat(keys)) delete store[k];
    }
  });
  w.chrome = {
    storage: { sync: area(sync, calls.syncSet), local: area(local, calls.localSet), onChanged: { addListener() {} } },
    runtime: {
      id: "testextensionid",
      getURL: (p) => `chrome-extension://testextensionid/${p}`,
      getManifest: () => manifest,
      openOptionsPage: () => {
        calls.openOptions++;
      },
      sendMessage: async (msg) => {
        calls.sent.push(msg);
        const fn = (opts.respond || {})[msg.type];
        return fn ? fn(msg) : undefined;
      },
      onMessage: { addListener() {} }
    },
    tabs: {
      create: async (o) => {
        calls.tabs.push(o);
      },
      query: async () => [],
      sendMessage: async () => undefined
    },
    permissions: { contains: async () => false, request: async () => false },
    i18n: { getMessage: (k) => k, getUILanguage: () => "en" }
  };
  // the shipped locale files, for a page whose language is chosen manually
  w.fetch = async (url) => {
    const m = /_locales\/([^/]+)\/messages\.json/.exec(String(url));
    if (!m) return { ok: false, json: async () => null };
    return { ok: true, json: async () => JSON.parse(fs.readFileSync(path.join(EXT, "_locales", m[1], "messages.json"), "utf8")) };
  };
  Object.defineProperty(w.navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: async (text) => {
        if (opts.clipboardFails) throw new Error("denied");
        calls.clipboard.push(text);
      }
    }
  });
  if (opts.prefersLight !== undefined) {
    w.matchMedia = (q) => ({ media: q, matches: /light/.test(q) ? opts.prefersLight : !opts.prefersLight, addEventListener() {}, removeEventListener() {} });
  }
  if (opts.beforeScripts) opts.beforeScripts(w);

  const ctx = dom.getInternalVMContext();
  const scripts = [...html.matchAll(/<script\s+src="([^"]+)"/g)].map((m) => m[1]);
  for (const src of scripts) new vm.Script(read(src), { filename: src }).runInContext(ctx);
  return { dom, win: w, doc: w.document, $: (id) => w.document.getElementById(id), calls, sync, local, scripts };
}

/** Resolves once `cond()` is true (the page's async start-up has reached the point under test); rejects with `label` after `ms`. */
async function until(cond, label, ms = 4000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("timed out waiting for " + label);
}

module.exports = { loadExtensionPage, closePages, until };
