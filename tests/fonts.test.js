/**
 * The bundled Rubik font: the two stylesheets that declare it, the files they name, the manifest entries that let the
 * store page load them, and the promise that nothing the extension ships asks a server for a script, stylesheet or font.
 *  - fonts.css is for the extension's own pages (relative URLs); fonts-content.css is for the cards on store pages
 *    (a content script needs the full extension URL), and is the same declarations with another prefix;
 *  - every file a rule names exists, and no font file is shipped without a rule;
 *  - the manifest injects fonts-content.css into the store and makes the .woff2 files reachable from it.
 */
const fs = require("fs");
const path = require("path");
const { EXT, read, parseRules, declarations, declaration } = require("./support/css");

const FONT_DIR = path.join(EXT, "fonts");
const shipped = fs.readdirSync(FONT_DIR).filter((f) => f.endsWith(".woff2")).sort();
const manifest = JSON.parse(read("manifest.json"));

/** The @font-face rules of a stylesheet: { family, file, prefix, range, weight }. */
function fontFaces(file) {
  return parseRules(read(file))
    .filter((r) => r.atRule === "@font-face")
    .map((r) => {
      const src = declaration(r.body, "src");
      const m = /^url\(([^)]*?)([^/)]+\.woff2)\)\s*format\("woff2"\)$/.exec(src);
      return {
        family: (declaration(r.body, "font-family") || "").replace(/["']/g, ""),
        prefix: m && m[1],
        file: m && m[2],
        range: declaration(r.body, "unicode-range"),
        weight: declaration(r.body, "font-weight"),
        display: declaration(r.body, "font-display"),
        text: declarations(r.body).map(([p, v]) => `${p}:${v}`).join(";")
      };
    });
}
const own = fontFaces("fonts.css");
const content = fontFaces("fonts-content.css");

describe("fonts.css (the extension's own pages)", () => {
  test("every rule is Rubik, a variable weight, swapped in, with a unicode-range of its own", () => {
    expect(own.length).toBeGreaterThanOrEqual(5);
    for (const f of own) {
      expect(f.family).toBe("Rubik");
      expect(f.weight).toBe("300 900");
      expect(f.display).toBe("swap");
      expect(f.range).toMatch(/^U\+/);
    }
    expect(new Set(own.map((f) => f.range)).size).toBe(own.length);
  });

  test("names each file by a path inside the extension, and every one exists", () => {
    for (const f of own) {
      expect([f.file, f.prefix]).toEqual([f.file, "fonts/"]);
      expect([f.file, fs.existsSync(path.join(FONT_DIR, f.file))]).toEqual([f.file, true]);
    }
  });

  test("no font file is shipped without a rule that uses it (and the licence travels with them)", () => {
    expect(shipped).toEqual(own.map((f) => f.file).sort());
    expect(fs.existsSync(path.join(FONT_DIR, "OFL.txt"))).toBe(true);
    expect(read("fonts.css")).toContain("OFL");
  });
});

describe("fonts-content.css (the cards on store pages)", () => {
  test("declares exactly the same faces as fonts.css, only the URL prefix differs", () => {
    const EXT_URL = "chrome-extension://__MSG_@@extension_id__/";
    for (const f of content) expect(f.prefix).toBe(EXT_URL + "fonts/");
    const withoutPrefix = (f) => f.text.replace(EXT_URL, "");
    expect(content.map(withoutPrefix)).toEqual(own.map(withoutPrefix));
  });

  test("names only the extension's own scheme, which the Firefox build rewrites", () => {
    const urls = [...read("fonts-content.css").matchAll(/url\(([^)]*)\)/g)].map((m) => m[1]);
    expect(urls.length).toBe(own.length);
    expect(urls.filter((u) => !u.startsWith("chrome-extension://__MSG_@@extension_id__/"))).toEqual([]);
    const build = fs.readFileSync(path.join(__dirname, "..", "scripts", "build.py"), "utf8");
    expect(build).toContain("fonts-content.css");
    expect(build).toContain('"chrome-extension://", "moz-extension://"');
  });
});

describe("manifest", () => {
  const globToRegExp = (glob) => new RegExp("^" + glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*") + "$");

  test("the store page may load every font file (web_accessible_resources)", () => {
    const entry = manifest.web_accessible_resources.find((e) => e.matches.includes("https://store.playstation.com/*") && e.resources.some((r) => /^fonts\//.test(r)));
    expect(entry).toBeDefined();
    for (const file of shipped) expect([file, entry.resources.some((r) => globToRegExp(r).test(`fonts/${file}`))]).toEqual([file, true]);
    expect(entry.matches).toEqual(["https://store.playstation.com/*"]); // and nobody else
  });

  test("fonts-content.css is injected into the store with the content script, before styles.css", () => {
    const css = manifest.content_scripts[0].css;
    expect(css).toContain("fonts-content.css");
    expect(css.indexOf("fonts-content.css")).toBeLessThan(css.indexOf("styles.css"));
    for (const f of css) expect([f, fs.existsSync(path.join(EXT, f))]).toEqual([f, true]);
  });

  test("the card stylesheet asks for Rubik first", () => {
    const rule = parseRules(read("styles.css")).find((r) => r.selectors.includes(":root"));
    expect(declaration(rule.body, "--pse-font")).toMatch(/^"Rubik"/);
  });
});

describe("the extension's pages", () => {
  const pages = fs.readdirSync(EXT).filter((f) => f.endsWith(".html"));

  test.each(["popup.html", "options.html", "welcome.html", "changelog.html"])("%s loads fonts.css", (page) => {
    expect(read(page)).toMatch(/<link rel="stylesheet" href="fonts\.css">/);
  });

  test("no page or stylesheet requests a script, stylesheet or font from a server", () => {
    const remote = /^(?:https?:)?\/\//i;
    const found = [];
    for (const page of pages) {
      const html = read(page);
      for (const m of html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="([^"]+)"/gi)) if (remote.test(m[1])) found.push(`${page}: ${m[1]}`);
    }
    for (const file of [...pages, ...fs.readdirSync(EXT).filter((f) => f.endsWith(".css"))]) {
      const text = read(file);
      for (const m of text.matchAll(/@import\s+(?:url\()?["']?([^"')\s;]+)/gi)) found.push(`${file}: @import ${m[1]}`);
      for (const m of text.matchAll(/url\(\s*["']?(https?:[^"')\s]+)/gi)) found.push(`${file}: url(${m[1]})`);
    }
    expect(found).toEqual([]);
  });
});
