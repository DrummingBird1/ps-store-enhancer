/**
 * GameDeals+ for PS Store — i18n Module
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
  let _ready = false;

  const SUPPORTED = ["en","he","ar","es","fr","de","pt_BR","ru","ja","ko"];
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

    // Handle Chrome-style placeholders: $NAME$, $COUNT$ etc.
    const placeholders = _messages[key].placeholders;
    if (placeholders && subs.length > 0) {
      for (const [name, def] of Object.entries(placeholders)) {
        // def.content is like "$1", "$2" etc.
        const idx = parseInt(def.content?.replace("$", ""), 10) - 1;
        if (idx >= 0 && idx < subs.length) {
          const regex = new RegExp("\\$" + name.toUpperCase() + "\\$", "g");
          msg = msg.replace(regex, subs[idx]);
        }
      }
    }

    // Also handle direct $1, $2 style (simpler)
    subs.forEach((sub, i) => {
      msg = msg.replace(new RegExp("\\$" + (i + 1), "g"), sub);
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
    document.documentElement.lang = lang;
  }

  /**
   * Get the currently active language code.
   */
  function getActiveLang() {
    if (_currentLang !== "auto" && SUPPORTED.includes(_currentLang)) {
      return _currentLang;
    }
    try {
      return chrome.i18n.getUILanguage() || "en";
    } catch {
      return "en";
    }
  }

  function isReady() { return _ready; }
  function getCurrentLang() { return _currentLang; }
  function getSupportedLangs() { return [...SUPPORTED]; }

  return { init, getMessage, localizePage, applyDirection, getActiveLang, isReady, getCurrentLang, getSupportedLangs };
})();

// Global shortcuts for convenience
async function initI18n() { return PSEi18n.init(); }
function t(key, ...subs) { return PSEi18n.getMessage(key, ...subs); }
function localizePage() { PSEi18n.localizePage(); }
