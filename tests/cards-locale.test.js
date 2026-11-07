/**
 * PSEi18n.getActiveLang(): the language of the messages that are actually shown. Dates, the sale countdown and the
 * card direction are all derived from it, so a raw browser language we ship no messages for ("sv", "uk") must not leak
 * through (Chrome serves the English messages then).
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const EXT = path.join(__dirname, "..", "extension");
const SOURCE = fs.readFileSync(path.join(EXT, "i18n.js"), "utf8");
const messages = (l) => JSON.parse(fs.readFileSync(path.join(EXT, "_locales", l, "messages.json"), "utf8"));

/** i18n.js running as in a page; `userLanguage` is the extension's own language setting, `browser` what Chrome's UI language is. */
async function start({ userLanguage, browser, loadFails = false }) {
  const ctx = {
    chrome: {
      storage: { sync: { get: async () => (userLanguage ? { userLanguage } : {}) } },
      runtime: { getURL: (p) => p },
      i18n: { getMessage: () => "native", ...(browser === undefined ? {} : { getUILanguage: () => browser }) }
    },
    fetch: async (url) => {
      if (loadFails) return { ok: false, json: async () => null };
      return { ok: true, json: async () => messages(/_locales\/([^/]+)\//.exec(url)[1]) };
    },
    document: { documentElement: {}, querySelectorAll: () => [] },
    console: { ...console, warn: () => {} }
  };
  vm.createContext(ctx);
  vm.runInContext(SOURCE, ctx);
  await vm.runInContext("initI18n()", ctx);
  return vm.runInContext("PSEi18n", ctx);
}

describe("in 'auto': the shipped language closest to the browser's, English when there is none", () => {
  test.each([
    // a shipped language keeps its region: it decides number and date formats (es-419 prices are "USD 1,234.50", es "1234,50 US$")
    ["en-US", "en-US"], ["en-GB", "en-GB"], ["en", "en"], ["he", "he"], ["he-IL", "he-IL"], ["ar-EG", "ar-EG"], ["de-AT", "de-AT"],
    ["fr-CA", "fr-CA"], ["es-419", "es-419"], ["ko", "ko"],
    // languages whose shipped locale is itself regional
    ["pt-BR", "pt_BR"], ["zh-CN", "zh_CN"], ["zh-TW", "zh_TW"]
  ])("browser %s shows messages in %s", async (browser, shown) => {
    expect((await start({ browser })).getActiveLang()).toBe(shown);
  });

  test.each(["sv", "uk", "cs", "id", "vi", "el", "xx-YY", ""])("browser '%s' has no shipped messages: English", async (browser) => {
    expect((await start({ browser })).getActiveLang()).toBe("en");
  });

  test("no browser language at all: English", async () => {
    expect((await start({})).getActiveLang()).toBe("en");
  });
});

describe("a language chosen in Settings", () => {
  test("is the active language whatever the browser speaks", async () => {
    expect((await start({ userLanguage: "he", browser: "en-US" })).getActiveLang()).toBe("he");
    expect((await start({ userLanguage: "ja", browser: "sv" })).getActiveLang()).toBe("ja");
  });

  test("whose file cannot be loaded falls back to Chrome's messages, so the active language is the browser's closest one", async () => {
    expect((await start({ userLanguage: "he", browser: "sv", loadFails: true })).getActiveLang()).toBe("en");
    expect((await start({ userLanguage: "he", browser: "de-DE", loadFails: true })).getActiveLang()).toBe("de-DE");
  });

  test("a language the extension does not have counts as 'auto'", async () => {
    expect((await start({ userLanguage: "sv", browser: "fr-FR" })).getActiveLang()).toBe("fr-FR");
  });
});
