/**
 * Guards the colour tokens of the "Midnight Glass" look: text colours must keep WCAG AA (4.5:1) on the page
 * background of their theme, and every button the content script injects must be styled with a selector the
 * store's own <button> reset cannot tie with. (The values were measured live on the real store and in the
 * extension pages with a contrast audit; this test keeps them from drifting back.)
 */
const fs = require("fs");
const path = require("path");

const EXT = path.join(__dirname, "..", "extension");
const read = (f) => fs.readFileSync(path.join(EXT, f), "utf8");

const hex = (c) => {
  const m = /^#([0-9a-f]{6})$/i.exec(c.trim());
  if (!m) throw new Error("not a 6-digit hex: " + c);
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
};
const lum = ([r, g, b]) => {
  const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => {
  const [l1, l2] = [lum(hex(a)), lum(hex(b))];
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};
/** The custom properties declared in the first block whose selector starts with `selector`. */
function tokens(css, selector) {
  const start = css.indexOf(selector + " {") >= 0 ? css.indexOf(selector + " {") : css.indexOf(selector + "{");
  if (start < 0) throw new Error("no block for " + selector);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

const THEMES = [
  // [label, file, selector, background token, text tokens]
  ["popup dark", "popup.html", "body", "bg", ["text", "dim", "faint", "accent", "good", "warn", "bad", "pink"]],
  ["popup light", "popup.html", "body.theme-light", "bg", ["text", "dim", "faint", "accent", "good", "warn", "bad", "pink"]],
  ["settings dark", "options.css", "body", "bg", ["text", "dim", "faint", "accent", "good", "warn", "bad", "pink"]],
  ["settings light", "options.css", "body.theme-light", "bg", ["text", "dim", "faint", "accent", "good", "warn", "bad", "pink"]]
];

describe("text colours keep 4.5:1 on their page background", () => {
  test.each(THEMES)("%s", (_label, file, selector, bgToken, textTokens) => {
    const t = tokens(read(file), selector);
    const base = tokens(read(file), "body");
    const bg = t[bgToken] || base[bgToken];
    const low = [];
    for (const k of textTokens) {
      const color = t[k] || base[k];
      const r = ratio(color, bg);
      if (r < 4.5) low.push(`--${k} ${color} on ${bg} = ${r.toFixed(2)}`);
    }
    expect(low).toEqual([]);
  });

  test("injected cards: dark and light text tokens on the card surface of their theme", () => {
    const css = read("styles.css");
    const dark = tokens(css, ":root");
    const light = tokens(css, '.pse-injected[data-pse-theme="light"]');
    const low = [];
    for (const [name, set, surface] of [["dark", dark, dark["pse-bg-card"]], ["light", { ...dark, ...light }, "#ffffff"]]) {
      for (const k of ["pse-text-primary", "pse-text-secondary", "pse-text-muted", "pse-accent-light", "pse-success", "pse-warning", "pse-danger"]) {
        const r = ratio(set[k], surface);
        if (r < 4.5) low.push(`${name} --${k} ${set[k]} on ${surface} = ${r.toFixed(2)}`);
      }
    }
    expect(low).toEqual([]);
  });
});

describe("injected buttons out-rank the store's own button reset", () => {
  test("every rule for an injected <button> class is scoped under .pse-injected (or its card / tour)", () => {
    const css = read("styles.css").replace(/\/\*[\s\S]*?\*\//g, "");
    const selectors = [...css.matchAll(/(?:^|\})\s*([^{}@]+)\{/g)].flatMap((m) => m[1].split(",").map((s) => s.trim()));
    const buttons = /(pse-share-btn|pse-owned-btn(?!-wrap)|pse-wishlist-btn(?!-wrap)|pse-card-head|pse-tour-skip|pse-tour-next|pse-wn-close)/;
    const bare = selectors.filter((s) => buttons.test(s) && !/^\.pse-(injected|card|tour) /.test(s));
    expect(bare).toEqual([]);
  });
});
