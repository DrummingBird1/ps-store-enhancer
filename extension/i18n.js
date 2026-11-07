/**
 * PS Store Enhancer — i18n Module
 * ================================
 * Supports two modes:
 *   "auto" → uses chrome.i18n.getMessage() (browser language)
 *   manual → loads _locales/{lang}/messages.json and translates from it
 *
 * Usage:
 *   await initI18n();          // call once on startup
 *   t("keyName")               // get translated string
 *   t("keyWithPlaceholder", "value")  // with substitution
 *   localizePage();            // scan DOM for data-i18n attributes
 */

const PSEi18n = (() => {
  let _messages = null;   // loaded translations (null = use native)
  let _useNative = true;  // true = chrome.i18n, false = custom
  let _currentLang = "auto";
  let _shownLang = null;  // the chosen language, once its messages are really loaded (null = Chrome picks the messages)
  let _ready = false;

  const SUPPORTED = ["en","he","ar","es","fr","de","it","pt_BR","nl","pl","tr","ru","ja","ko","zh_CN","zh_TW"];
  const RTL_LANGS = ["he","ar"];

  /**
   * Initialize i18n. Must be called (and awaited) before using t().
   */
  async function init() {
    try {
      const result = await chrome.storage.sync.get(["userLanguage"]);
      _currentLang = result.userLanguage || "auto";
    } catch {
      _currentLang = "auto";
    }

    if (_currentLang === "auto" || !SUPPORTED.includes(_currentLang)) {
      _useNative = true;
      _messages = null;
    } else {
      // Load the selected locale's messages.json
      try {
        const url = chrome.runtime.getURL(`_locales/${_currentLang}/messages.json`);
        const resp = await fetch(url);
        if (resp.ok) {
          _messages = await resp.json();
          _useNative = false;
        } else {
          console.warn(`[PSE i18n] Failed to load ${_currentLang}, falling back to native`);
          _useNative = true;
        }
      } catch (e) {
        console.warn("[PSE i18n] Locale load error:", e);
        _useNative = true;
      }
    }

    _shownLang = !_useNative && SUPPORTED.includes(_currentLang) ? _currentLang : null;
    _ready = true;
  }

  /**
   * Get a translated string.
   * @param {string} key — message key from messages.json
   * @param {...string} subs — substitution values for $1, $2 etc.
   */
  function getMessage(key, ...subs) {
    if (_useNative) {
      try {
        const msg = chrome.i18n.getMessage(key, subs);
        return msg || key;
      } catch {
        return key;
      }
    }

    // Custom locale mode
    if (!_messages || !_messages[key]) return key;

    let msg = _messages[key].message || key;

    // Chrome-style placeholders ($NAME$ -> the "$n" it points at) and direct $1, $2 tokens, replaced in ONE
    // pass over the message: values that contain "$" (a price such as "$29.99") are never scanned again,
    // so "$2" inside "$29.99" cannot be mistaken for the second argument.
    const byName = {};
    for (const [name, def] of Object.entries(_messages[key].placeholders || {})) {
      const idx = parseInt(String(def && def.content).replace("$", ""), 10) - 1;
      if (idx >= 0) byName[name.toUpperCase()] = idx;
    }
    msg = msg.replace(/\$([A-Za-z_][A-Za-z0-9_]*)\$|\$([1-9])/g, (token, name, num) => {
      const idx = name ? byName[name.toUpperCase()] : Number(num) - 1;
      return idx != null && idx < subs.length ? String(subs[idx]) : token;
    });

    return msg;
  }

  /**
   * Scan DOM and translate elements with data-i18n attributes.
   */
  function localizePage() {
    document.querySelectorAll("[data-i18n]").forEach(el => {
      const key = el.getAttribute("data-i18n");
      const msg = getMessage(key);
      if (msg && msg !== key) el.textContent = msg;
    });

    document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
      const key = el.getAttribute("data-i18n-placeholder");
      const msg = getMessage(key);
      if (msg && msg !== key) el.placeholder = msg;
    });

    document.querySelectorAll("[data-i18n-title]").forEach(el => {
      const key = el.getAttribute("data-i18n-title");
      const msg = getMessage(key);
      if (msg && msg !== key) el.title = msg;
    });

    document.querySelectorAll("[data-i18n-aria]").forEach(el => {
      const key = el.getAttribute("data-i18n-aria");
      const msg = getMessage(key);
      if (msg && msg !== key) el.setAttribute("aria-label", msg);
    });

    // Set document direction
    applyDirection();
  }

  /**
   * Set RTL/LTR based on active language.
   */
  function applyDirection() {
    const lang = getActiveLang();
    const isRtl = RTL_LANGS.some(rl => lang.startsWith(rl));
    document.documentElement.dir = isRtl ? "rtl" : "ltr";
    document.documentElement.lang = lang.replace("_", "-");
  }

  /**
   * The shipped locale Chrome serves messages from for a browser UI language ("en-US" -> "en",
   * "pt-BR" -> "pt_BR", "he-IL" -> "he"); a language we do not ship ("sv", "uk") gets the English
   * fallback messages, so it resolves to "en".
   */
  function resolveSupported(raw) {
    const code = String(raw || "").replace(/-/g, "_").toLowerCase();
    const base = code.split("_")[0];
    return SUPPORTED.find((s) => s.toLowerCase() === code) || SUPPORTED.find((s) => s.toLowerCase() === base) || "en";
  }

  /**
   * Get the language of the messages actually shown: the chosen language (when its file loaded), or
   * the supported language closest to the browser's (never a raw browser language we have no messages
   * for, because dates, countdowns and directions must match the sentence they sit in).
   */
  function getActiveLang() {
    if (_shownLang) return _shownLang;
    try {
      const raw = String(chrome.i18n.getUILanguage() || "");
      const shipped = resolveSupported(raw);
      const base = raw.replace(/-/g, "_").toLowerCase().split("_")[0];
      // a language we ship nothing for ("sv", "uk", "") is shown in English
      if (shipped === "en" && base !== "en") return "en";
      // keep the region of a shipped language ("es-419", "en-GB", "de-AT"): it decides number and date formats
      return shipped.includes("_") ? shipped : raw;
    } catch {
      return "en";
    }
  }

  function isReady() { return _ready; }
  function getCurrentLang() { return _currentLang; }
  function getSupportedLangs() { return [...SUPPORTED]; }

  return { init, getMessage, localizePage, applyDirection, getActiveLang, isReady, getCurrentLang, getSupportedLangs };
})();

// Global shortcuts for convenience (used by content.js, popup.js, options.js, welcome.html, changelog.html)
/* eslint-disable no-unused-vars */
async function initI18n() { return PSEi18n.init(); }
function t(key, ...subs) { return PSEi18n.getMessage(key, ...subs); }
function localizePage() { PSEi18n.localizePage(); }
/* eslint-enable no-unused-vars */
