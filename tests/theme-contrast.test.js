/**
 * Guards the colour tokens of the "Midnight Glass" look, read straight from the shipped files:
 *  - every text token keeps WCAG AA (4.5:1) on the page background and on the panels of its theme, for the popup,
 *    Settings, the changelog, the welcome page and the cards injected into the store, in dark, light and high contrast
 *    (wherever the page has that theme);
 *  - the Ko-fi pill (tinted background, accent text) keeps 4.5:1, also hovered;
 *  - the on/off switch keeps 3:1 between its parts;
 *  - every button the content script injects is styled with a selector the store's own <button> reset cannot tie with.
 * (The values were measured live on the real store and in the extension pages with a contrast audit; this test keeps
 * them from drifting back. The badge, tier and trophy-label colours of the cards are in cards-contrast.test.js.)
 */
const { read, cssOf, parseRules, declared, layered, splitTop, ratio, flatten, parseColor, gradientStops } = require("./support/css");

const BLACK = [0, 0, 0];
const MIN_TEXT = 4.5;
const MIN_PARTS = 3;
const fmt = (n) => n.toFixed(2);

/** The opaque surfaces a token paints (a plain colour or a gradient's stops) when laid over `backdrop`. */
function surfaces(value, backdrop, vars) {
  const colors = /gradient\(/i.test(value) ? gradientStops(value, vars) : [parseColor(value, vars)];
  return colors.map((c) => flatten(c, backdrop));
}

/* ── the pages: where each theme's tokens live ── */
const bodyThemes = () => ({
  dark: [{ selector: "body" }],
  light: [{ selector: "body" }, { selector: "body.theme-light" }],
  contrast: [{ selector: "body" }, { selector: "body.theme-contrast" }]
});
const PAGES = {
  popup: { file: "popup.html", themes: bodyThemes(), text: ["--text", "--dim", "--faint", "--accent", "--good", "--warn", "--bad", "--pink"] },
  settings: { file: "options.css", themes: bodyThemes(), text: ["--text", "--dim", "--faint", "--accent", "--good", "--warn", "--bad", "--pink"] },
  changelog: { file: "changelog.html", themes: bodyThemes(), text: ["--text", "--dim", "--faint", "--accent"] },
  welcome: {
    // dark by default, light when the system asks for it (no high-contrast variant of its own)
    file: "welcome.html",
    themes: { dark: [{ selector: ":root" }], light: [{ selector: ":root" }, { selector: ":root", at: /prefers-color-scheme:\s*light/ }] },
    text: ["--text", "--dim", "--faint", "--accent", "--pink"]
  }
};
const parsed = {};
const rulesOf = (page) => (parsed[page] = parsed[page] || parseRules(cssOf(PAGES[page].file)));
/** The custom properties of a page in one theme (the base theme's, then the theme's own on top). */
const pageVars = (page, theme) => layered(rulesOf(page), PAGES[page].themes[theme]);
const ROWS = Object.entries(PAGES).flatMap(([page, p]) => Object.keys(p.themes).map((theme) => [`${page} ${theme}`, page, theme]));

describe("text colours keep 4.5:1 on their page", () => {
  test.each(ROWS)("%s: on the page background and on the panels it sits on", (_label, page, theme) => {
    const vars = pageVars(page, theme);
    const bg = flatten(vars["--bg"], BLACK);
    const onBg = [["the page", bg]];
    const onPanel = vars["--panel"] ? surfaces(vars["--panel"], bg, vars).map((s) => ["a panel", s]) : [];
    const onPanel2 = vars["--panel2"] ? surfaces(vars["--panel2"], bg, vars).map((s) => ["a raised panel", s]) : [];
    const low = [];
    for (const token of PAGES[page].text) {
      // the raised panel (switch tracks, the theme switch, code chips) only carries the body text colours
      const where = [...onBg, ...onPanel, ...(["--text", "--dim"].includes(token) ? onPanel2 : [])];
      for (const [name, surface] of where) {
        const r = ratio(flatten(vars[token], surface, vars), surface);
        if (r < MIN_TEXT) low.push(`${token} ${vars[token]} on ${name} rgb(${surface}) = ${fmt(r)}`);
      }
    }
    expect(low).toEqual([]);
  });

  test.each(ROWS.filter(([, page]) => ["popup", "settings"].includes(page)))("%s: coloured text on its own tint (chips, messages, notices)", (_label, page, theme) => {
    const vars = pageVars(page, theme);
    const bg = flatten(vars["--bg"], BLACK);
    const low = [];
    for (const name of ["accent", "good", "warn", "bad"]) {
      if (!vars[`--${name}-soft`]) continue;
      const panels = vars["--panel"] ? surfaces(vars["--panel"], bg, vars) : [];
      for (const under of [bg, ...panels]) {
        const tint = flatten(vars[`--${name}-soft`], under, vars);
        const r = ratio(flatten(vars[`--${name}`], tint, vars), tint);
        if (r < MIN_TEXT) low.push(`--${name} on --${name}-soft over rgb(${under}) = ${fmt(r)}`);
      }
    }
    expect(low).toEqual([]);
  });
});

describe("injected cards: text tokens on the card surface of their theme", () => {
  const rules = parseRules(read("styles.css"));
  const ROOT = [{ selector: ":root" }];
  const THEMES = {
    dark: ROOT,
    light: [...ROOT, { selector: '.pse-injected[data-pse-theme="light"]' }],
    contrast: [...ROOT, { selector: '.pse-injected[data-pse-theme="contrast"]' }]
  };
  const TOKENS = ["--pse-text-primary", "--pse-text-secondary", "--pse-text-muted", "--pse-accent-light", "--pse-success", "--pse-warning", "--pse-danger"];

  test.each(Object.keys(THEMES))("%s", (theme) => {
    const vars = layered(rules, THEMES[theme]);
    // The solid surface (dropdowns, banners, the tour) comes from the theme's own token. The cards themselves paint the
    // glass: its last layer is a translucent colour, shown here over the darkest backdrop the store page can have.
    const glassBase = flatten(splitTop(vars["--pse-glass"], ",").pop(), BLACK, vars);
    const surfacesOfTheme = [
      ["--pse-bg-card", flatten(vars["--pse-bg-card"], BLACK)],
      ["the glass layer over black", glassBase]
    ];
    const low = [];
    for (const token of TOKENS) {
      for (const [name, surface] of surfacesOfTheme) {
        const r = ratio(flatten(vars[token], surface, vars), surface);
        if (r < MIN_TEXT) low.push(`${token} ${vars[token]} on ${name} rgb(${surface}) = ${fmt(r)}`);
      }
    }
    expect(low).toEqual([]);
  });

  test("the light theme really changes the surface (the check above is not reading the dark value)", () => {
    const light = layered(rules, THEMES.light);
    const dark = layered(rules, THEMES.dark);
    expect(light["--pse-bg-card"]).not.toBe(dark["--pse-bg-card"]);
    const surface = flatten(light["--pse-bg-card"], BLACK);
    expect(ratio(flatten(light["--pse-text-primary"], surface, light), surface)).toBeGreaterThan(MIN_TEXT);
  });
});

describe("the Ko-fi pill keeps 4.5:1, also when hovered", () => {
  // [page, base selector of the pill]
  const PILLS = [["popup", ".support-link"], ["welcome", ".support"], ["settings", ".btn-support"]];
  const ROWS_PILLS = PILLS.flatMap(([page, selector]) => Object.keys(PAGES[page].themes).map((theme) => [`${page} ${theme}`, page, theme, selector]));

  test.each(ROWS_PILLS)("%s", (_label, page, theme, selector) => {
    const vars = pageVars(page, theme);
    const rules = rulesOf(page);
    const bg = flatten(vars["--bg"], BLACK);
    // the pill sits on the page; on Settings it sits on a card, which is a translucent gradient over the page
    const under = [bg, ...(vars["--card-bg"] ? surfaces(vars["--card-bg"], bg, vars) : [])];
    // a rule of the page for the pill in this theme (the popup's high-contrast override) wins over the token-based ones
    const themed = declared(rules, `body.theme-${theme} ${selector}`);
    const base = declared(rules, selector);
    const states = { rest: { ...base, ...themed }, hover: { ...base, ...declared(rules, `${selector}:hover`), ...themed } };
    const low = [];
    for (const [state, d] of Object.entries(states)) {
      expect([state, typeof d.color, typeof d.background]).toEqual([state, "string", "string"]);
      for (const surface of under) {
        const tint = flatten(d.background, surface, vars);
        const r = ratio(flatten(d.color, tint, vars), tint);
        if (r < MIN_TEXT) low.push(`${state}: ${d.color} on ${d.background} over rgb(${surface}) = ${fmt(r)}`);
      }
    }
    expect(low).toEqual([]);
  });
});

describe("the on/off switch keeps 3:1 between its parts", () => {
  test.each(["popup", "settings"].flatMap((page) => ["dark", "light"].map((theme) => [`${page} ${theme}`, page, theme])))("%s", (_label, page, theme) => {
    const vars = pageVars(page, theme);
    const rules = rulesOf(page);
    const bg = flatten(vars["--bg"], BLACK);
    const panel = surfaces(vars["--panel"], bg, vars)[0]; // the row the switch sits in
    const prefix = theme === "light" ? "body.theme-light " : "";
    const d = (sel) => declared(rules, sel);
    const light = theme === "light";
    // track: --panel2 over the row; on: the accent. knob: white, or the faint grey on light (an off switch is an outlined pill).
    const trackOff = flatten(d(".sl").background, panel, vars);
    const trackOn = flatten(d(".sw input:checked+.sl").background, panel, vars);
    const knobOff = flatten(light ? d(`${prefix}.sl::before`).background : d(".sl::before").background, trackOff, vars);
    const knobOn = flatten(light ? d(`${prefix}.sw input:checked+.sl::before`).background : d(".sl::before").background, trackOn, vars);
    const low = [];
    const check = (what, a, b) => {
      const r = ratio(a, b);
      if (r < MIN_PARTS) low.push(`${what} = ${fmt(r)}`);
    };
    check("knob against the track when off", knobOff, trackOff);
    check("knob against the track when on", knobOn, trackOn);
    if (light) {
      // the ring that draws the off switch's edge: an inset box-shadow in --faint
      const ring = /inset 0 0 0 [\d.]+px (var\(--[\w-]+\))/.exec(d(`${prefix}.sl`)["box-shadow"]);
      expect(ring).not.toBeNull();
      check("the off switch's outline against its row", flatten(ring[1], panel, vars), panel);
      check("the on switch against its row", trackOn, panel);
    }
    expect(low).toEqual([]);
  });
});

/* ── the store's own <button> reset ── */

/** The `pse-…` classes the content scripts give to a <button> they create (createElement("button") + className, or <button class="…"> markup). */
function injectedButtonClasses() {
  const found = new Set();
  const add = (list) => list.split(/\s+/).filter((c) => /^pse-/.test(c)).forEach((c) => found.add(c));
  for (const file of ["content.js", "content-extras.js"]) {
    const src = read(file);
    for (const m of src.matchAll(/<button\b[^>]*?\bclass="([^"]*)"/g)) add(m[1]);
    const created = /(?:const|let|var)\s+(\w+)\s*=\s*document\.createElement\(\s*["']button["']\s*\)(?:(?!createElement)[\s\S]){0,400}?\b\1\.className\s*=\s*["']([^"']+)["']/g;
    for (const m of src.matchAll(created)) add(m[2]);
  }
  return [...found].sort();
}

/**
 * Selectors (in every rule, however deeply nested in @media / @supports) that name one of the button `classes` as a
 * class of their own without sitting under .pse-injected / .pse-card / .pse-tour: those would tie with the store's rules.
 */
function unscopedButtonSelectors(css, classes) {
  const named = new RegExp(`\\.(?:${classes.map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?![\\w-])`);
  const root = /\.pse-(?:injected|card|tour)(?![\w-])/;
  return parseRules(css)
    .flatMap((r) => r.selectors)
    .filter((s) => {
      if (!named.test(s)) return false;
      const [head, ...rest] = splitTop(s.replace(/\s+/g, " "), " "); // the first compound selector, then what follows a descendant combinator
      return !(root.test(head) && rest.some((part) => named.test(part)));
    });
}

describe("injected buttons out-rank the store's own button reset", () => {
  const classes = injectedButtonClasses();

  test("the button classes are found in the content scripts (both the createElement and the markup forms)", () => {
    expect(classes).toEqual(expect.arrayContaining(["pse-card-head", "pse-share-btn", "pse-owned-btn", "pse-wishlist-btn", "pse-wn-close", "pse-tour-skip", "pse-tour-next"]));
  });

  test("every rule for an injected <button> class is scoped under .pse-injected (or its card / tour), at any depth", () => {
    expect(unscopedButtonSelectors(read("styles.css"), classes)).toEqual([]);
  });

  describe("the check itself", () => {
    const KNOWN = ["pse-share-btn", "pse-wn-close", "pse-fresh", "pse-owned-btn"];
    test.each([
      ["a lone rule in an @media block", "@media (max-width:300px){.pse-share-btn{padding:0;border:0;color:#fff}}", [".pse-share-btn"]],
      ["a lone rule in an @supports block", "@supports (display:grid){.pse-wn-close{padding:0}}", [".pse-wn-close"]],
      ["the second rule of a block", "@media print{.x{a:b}.pse-share-btn{padding:0}}", [".pse-share-btn"]],
      ["a rule nested two blocks deep", "@media screen{@supports (display:grid){.pse-wn-close{padding:0}}}", [".pse-wn-close"]],
      ["an element plus a class", "button.pse-fresh{padding:0}", ["button.pse-fresh"]],
      ["a rule at the top of the file", ".pse-share-btn:hover{color:red}", [".pse-share-btn:hover"]],
      ["one bare selector of a list", ".pse-injected .pse-share-btn, .pse-share-btn:hover{color:red}", [".pse-share-btn:hover"]],
      ["the class as the root of the selector", ".pse-share-btn .pse-injected{color:red}", [".pse-share-btn .pse-injected"]]
    ])("finds %s", (_what, css, expected) => {
      expect(unscopedButtonSelectors(css, KNOWN)).toEqual(expected);
    });

    test.each([
      ["a scoped rule", ".pse-injected .pse-fresh{padding:0}"],
      ["a scoped rule in an @media block", "@media (max-width:300px){.pse-injected .pse-share-btn{padding:0}}"],
      ["a card with an attribute before the descendant", '.pse-card[dir="rtl"] .pse-share-btn{padding:0}'],
      ["a scoped rule written over several lines", ".pse-injected\n    .pse-share-btn,\n  .pse-card .pse-owned-btn{padding:0}"],
      ["the wrapper of a button", ".pse-owned-btn-wrap{margin:0}"],
      ["keyframes", "@keyframes pse-x{from{opacity:0}to{opacity:1}}"],
      ["an unrelated rule", ".pse-badge{color:red}"]
    ])("leaves %s alone", (_what, css) => {
      expect(unscopedButtonSelectors(css, KNOWN)).toEqual([]);
    });
  });
});
