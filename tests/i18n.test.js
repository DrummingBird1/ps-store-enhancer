const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const EXT = path.join(ROOT, "extension");
const LOCALES = fs.readdirSync(path.join(EXT, "_locales")).filter((d) => fs.statSync(path.join(EXT, "_locales", d)).isDirectory());
const load = (l) => JSON.parse(fs.readFileSync(path.join(EXT, "_locales", l, "messages.json"), "utf8"));
const en = load("en");
const sources = fs
  .readdirSync(EXT)
  .filter((f) => /\.(js|html)$/.test(f))
  .map((f) => [f, fs.readFileSync(path.join(EXT, f), "utf8")]);
const allSource = sources.map(([, s]) => s).join("\n");

const TOKEN = /\$([A-Z][A-Z_]*)\$/g;
const tokensOf = (s) => [...String(s).matchAll(TOKEN)].map((m) => m[1]).sort();

describe("locale files", () => {
  test("there are 16 supported languages including the RTL ones", () => {
    expect(LOCALES.sort()).toEqual(["ar", "de", "en", "es", "fr", "he", "it", "ja", "ko", "nl", "pl", "pt_BR", "ru", "tr", "zh_CN", "zh_TW"]);
  });

  test.each(LOCALES)("%s has exactly the English key set", (l) => {
    const keys = Object.keys(load(l));
    expect(keys.filter((k) => !(k in en))).toEqual([]);
    expect(Object.keys(en).filter((k) => !keys.includes(k))).toEqual([]);
  });

  test.each(LOCALES)("%s keeps every placeholder of the English message", (l) => {
    const d = load(l);
    const bad = [];
    for (const [k, v] of Object.entries(en)) {
      if (JSON.stringify(tokensOf(v.message)) !== JSON.stringify(tokensOf(d[k].message))) bad.push(k);
      const phNames = Object.keys(v.placeholders || {}).sort();
      const phNamesL = Object.keys(d[k].placeholders || {}).sort();
      if (JSON.stringify(phNames) !== JSON.stringify(phNamesL)) bad.push(k + " (placeholders block)");
    }
    expect(bad).toEqual([]);
  });

  test.each(LOCALES)("%s: extName and extDesc fit the Chrome Web Store limits", (l) => {
    const d = load(l);
    expect(d.extName.message).toBe("PS Store Enhancer");
    expect(d.extDesc.message.length).toBeLessThanOrEqual(132);
  });

  test.each(LOCALES)("%s has no empty messages", (l) => {
    const d = load(l);
    expect(Object.entries(d).filter(([, v]) => !String(v.message).trim()).map(([k]) => k)).toEqual([]);
  });
});

describe("i18n keys used by the code", () => {
  const used = new Set();
  for (const [, s] of sources) {
    for (const m of s.matchAll(/\bt\(\s*"([A-Za-z0-9_]+)"/g)) used.add(m[1]);
    for (const m of s.matchAll(/data-i18n(?:-[a-z]+)?="([A-Za-z0-9_]+)"/g)) used.add(m[1]);
    for (const m of s.matchAll(/getMessage\(\s*"([A-Za-z0-9_]+)"/g)) used.add(m[1]);
  }
  // documentation examples and the "tier_" prefix are not real keys
  for (const k of ["keyName", "keyWithPlaceholder", "tier_"]) used.delete(k);
  // keys reached through variables (kept explicit so a typo here fails the test)
  for (const k of ["quick", "moderate", "demanding", "grind"]) used.add("tier_" + k);
  for (const k of ["Down", "Up", "Flat"]) used.add("insightTrend" + k);
  for (const k of ["Insight", "Compare", "Trophies", "Wishlist"]) used.add("tourStep" + k);
  for (const k of ["PriceInsight", "CrossPlatform", "Trophies"]) used.add("card" + k);

  test("every used key exists in English", () => {
    expect([...used].filter((k) => !(k in en)).sort()).toEqual([]);
  });

  test("no English key is left unused", () => {
    const dynamicPrefix = /^(psnErr|psnWait|chl_|tier_)/;
    const unused = Object.keys(en).filter((k) => {
      if (used.has(k) || dynamicPrefix.test(k)) return false;
      if (["extName", "extDesc", "ctxMenuFind", "genericError", "wishlistPriceDropTitle", "wishlistPriceDropBody", "wishlistPercentDropBody", "wishlistDigestTitle", "wishlistDigestBody"].includes(k)) return false;
      return !allSource.includes(`"${k}"`);
    });
    expect(unused).toEqual([]);
  });

  test("the manifest's __MSG_ keys exist", () => {
    const manifest = fs.readFileSync(path.join(EXT, "manifest.json"), "utf8");
    for (const m of manifest.matchAll(/__MSG_([A-Za-z0-9_]+)__/g)) expect(en).toHaveProperty(m[1]);
  });

  test("changelog highlight keys exist in every language", () => {
    const data = require("../extension/changelog-data.js");
    for (const entry of data) {
      expect(entry.keys === undefined || entry.keys.length === entry.highlights.length).toBe(true);
      for (const k of entry.keys || []) for (const l of LOCALES) expect(load(l)).toHaveProperty(k);
    }
  });
});
