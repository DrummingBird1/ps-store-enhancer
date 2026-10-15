/* Test harness only: a minimal in-memory `chrome` API so the real extension pages, the real
   background.js handlers and the real content.js can run in a normal browser tab.
   State persists in localStorage (per origin), so pages share it like real extension storage. */
(() => {
  const P = "__chromemock__";
  const syncGet = (url) => {
    try {
      const x = new XMLHttpRequest();
      x.open("GET", url, false);
      x.send();
      return x.status === 200 ? JSON.parse(x.responseText) : null;
    } catch { return null; }
  };

  const changeListeners = [];
  const area = (name) => {
    const key = P + name;
    const read = () => { try { return JSON.parse(localStorage.getItem(key) || "{}"); } catch { return {}; } };
    const write = (o) => localStorage.setItem(key, JSON.stringify(o));
    const fire = (changes) => { if (Object.keys(changes).length) changeListeners.forEach((l) => { try { l(changes, name); } catch (e) { console.error(e); } }); };
    return {
      async get(keys) {
        const all = read();
        if (keys == null) return structuredClone(all);
        if (typeof keys === "string") keys = [keys];
        const out = {};
        if (Array.isArray(keys)) { for (const k of keys) if (k in all) out[k] = structuredClone(all[k]); return out; }
        for (const [k, d] of Object.entries(keys)) out[k] = k in all ? structuredClone(all[k]) : d;
        return out;
      },
      async set(items) {
        const all = read(); const ch = {};
        for (const [k, v] of Object.entries(items)) { ch[k] = { oldValue: all[k], newValue: v }; all[k] = JSON.parse(JSON.stringify(v ?? null)); }
        write(all); fire(ch);
      },
      async remove(keys) {
        const all = read(); const ch = {};
        for (const k of [].concat(keys)) if (k in all) { ch[k] = { oldValue: all[k] }; delete all[k]; }
        write(all); fire(ch);
      },
      async clear() { write({}); }
    };
  };

  const manifest = syncGet("/manifest.json") || { version: "0.0.0" };
  const uiLang = localStorage.getItem("__ui_lang") || "en";
  const enMsgs = syncGet("/_locales/en/messages.json") || {};
  const msgs = uiLang === "en" ? enMsgs : (syncGet(`/_locales/${uiLang}/messages.json`) || enMsgs);

  const listeners = { message: [], installed: [], startup: [], alarm: [], ctxClick: [], notifClick: [] };
  const L = (arr) => ({ addListener: (fn) => arr.push(fn) });

  const log = (window.__log = { messages: [], tabs: [], notifications: [], badge: [], alarms: [], cookies: {}, ctx: [] });
  const perms = new Set();

  window.chrome = {
    storage: { sync: area("sync"), local: area("local"), session: area("session"), onChanged: { addListener: (fn) => changeListeners.push(fn) } },
    runtime: {
      id: "harness-extension-id",
      getURL: (p) => location.origin + "/" + String(p).replace(/^\//, ""),
      getManifest: () => manifest,
      openOptionsPage: () => { log.tabs.push("options.html"); window.open("/options.html", "_blank"); },
      sendMessage: (msg) => new Promise((resolve) => {
        log.messages.push(msg && msg.type);
        let done = false, async = false;
        const respond = (r) => { if (!done) { done = true; resolve(r); } };
        for (const l of listeners.message) { if (l(msg, { id: "harness" }, respond) === true) async = true; }
        if (!async && !done) resolve(undefined);
      }),
      onMessage: L(listeners.message), onInstalled: L(listeners.installed), onStartup: L(listeners.startup)
    },
    i18n: {
      getUILanguage: () => uiLang,
      getMessage: (key, subs) => {
        const m = msgs[key] || enMsgs[key];
        if (!m) return "";
        let s = m.message;
        const arr = subs == null ? [] : [].concat(subs);
        for (const [name, def] of Object.entries(m.placeholders || {})) {
          const idx = parseInt(String(def.content).replace("$", ""), 10) - 1;
          s = s.replace(new RegExp("\\$" + name + "\\$", "gi"), arr[idx] ?? "");
        }
        return s;
      }
    },
    tabs: { create: (o) => { log.tabs.push(o.url); return Promise.resolve({ id: log.tabs.length }); } },
    cookies: {
      get: async ({ url, name }) => log.cookies[url + "|" + name] || null,
      set: async (d) => { log.cookies[d.url + "|" + d.name] = { name: d.name, value: d.value, domain: d.domain }; return d; },
      remove: async ({ url, name }) => { delete log.cookies[url + "|" + name]; }
    },
    permissions: { request: async ({ permissions }) => { permissions.forEach((p) => perms.add(p)); return true; } },
    alarms: { create: (n) => { log.alarms.push(n); }, onAlarm: L(listeners.alarm) },
    contextMenus: { removeAll: (cb) => cb && cb(), create: (o) => { log.ctx.push(o.id); }, onClicked: L(listeners.ctxClick) },
    notifications: {
      create: async (id, o) => { log.notifications.push({ id, title: o.title, message: o.message }); return id; },
      clear: () => {}, onClicked: L(listeners.notifClick)
    },
    action: {
      setBadgeText: ({ text }) => log.badge.push(text),
      setBadgeBackgroundColor: () => {}
    }
  };

  window.__h = {
    install: (reason = "install", previousVersion) => Promise.all(listeners.installed.map((l) => l({ reason, previousVersion }))),
    setLang: (l) => { localStorage.setItem("__ui_lang", l); },
    resetAll: () => { Object.keys(localStorage).filter((k) => k.startsWith(P)).forEach((k) => localStorage.removeItem(k)); }
  };
})();
