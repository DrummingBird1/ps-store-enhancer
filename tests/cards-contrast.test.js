/**
 * Guards for the injected cards' own stylesheet and badge colours, read straight from the shipped files:
 *  - every badge text reaches WCAG 4.5:1 (difficulty, completionist tier, store monograms, the trophy progress label);
 *  - the hovered "remove" state of an active owned / wishlist button keeps its solid underlay (it sits on the store's dark page);
 *  - the card chevron points down when open and to where the content flows from when closed, in LTR and RTL;
 *  - text that contains translated words is never forced left-to-right (only numbers are isolated).
 */
const fs = require("fs");
const path = require("path");

const EXT = path.join(__dirname, "..", "extension");
const css = fs.readFileSync(path.join(EXT, "styles.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const js = fs.readFileSync(path.join(EXT, "content.js"), "utf8");

/* ── WCAG 2 contrast (shared with theme-contrast.test.js) ── */
const { channels, ratio, over, hslToRgb } = require("./support/css");

/* ── reading the stylesheet ── */
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** The declaration block of the rule whose selector is exactly `selector`. */
const ruleBody = (selector) => {
  const m = new RegExp(`(?:^|[}\\n])\\s*${esc(selector)}\\s*\\{([^}]*)\\}`).exec(css);
  if (!m) throw new Error(`no rule for ${selector}`);
  return m[1];
};
const declaration = (body, prop) => {
  const all = [...body.matchAll(new RegExp(`(?:^|[;\\s{])${esc(prop)}\\s*:\\s*([^;]+)`, "g"))];
  return all.length ? all[all.length - 1][1].trim() : null;
};
/** The custom properties a theme block defines (":root" is the dark theme). */
const tokens = (selector) => Object.fromEntries([...ruleBody(selector).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
const THEMES = {
  dark: tokens(":root"),
  light: { ...tokens(":root"), ...tokens('.pse-injected[data-pse-theme="light"]') },
  contrast: { ...tokens(":root"), ...tokens('.pse-injected[data-pse-theme="contrast"]') }
};
const solid = (theme, value) => {
  const v = /^var\((--[\w-]+)\)$/.exec(value) ? THEMES[theme][/^var\((--[\w-]+)\)$/.exec(value)[1]] : value;
  expect(v).toMatch(/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i); // an opaque colour: the contrast does not depend on what is behind it
  return channels(v);
};

describe("badge text reaches 4.5:1", () => {
  const BADGE_COLORS = Object.fromEntries([...js.match(/const BADGE_COLORS = \{([^}]*)\}/)[1].matchAll(/(\w+):\s*"(#[0-9a-f]{6})"/gi)].map((m) => [m[1], m[2]]));
  const NO_DATA = /difficulty == null \? "(#[0-9a-f]{6})"/i.exec(js)[1];

  test("difficulty badge: dark ink on the green, yellow and red of BADGE_COLORS and on the grey used when there is no data", () => {
    expect(Object.keys(BADGE_COLORS).sort()).toEqual(["green", "red", "yellow"]);
    const ink = channels(declaration(ruleBody(".pse-diff-badge"), "color"));
    for (const [name, bg] of [...Object.entries(BADGE_COLORS), ["no data", NO_DATA]]) {
      expect([name, ratio(ink, channels(bg)) >= 4.5]).toEqual([name, true]);
    }
  });

  test.each(["quick", "moderate", "demanding", "grind"])("completionist tier '%s': its own text colour on its own background", (tier) => {
    const body = ruleBody(`.pse-tier-${tier}`);
    const fg = channels(declaration(body, "color"));
    const bg = channels(declaration(body, "background"));
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  test("store monograms: white on every listed store colour and on the worst colour the fallback can produce", () => {
    const white = [255, 255, 255];
    const stores = [...js.match(/const STORE_COLORS = \{([\s\S]*?)\};/)[1].matchAll(/"([^"]+)":\s*"(#[0-9a-f]{6})"/gi)];
    expect(stores.length).toBeGreaterThanOrEqual(8);
    for (const [, name, hex] of stores) expect([name, ratio(white, channels(hex)) >= 4.5]).toEqual([name, true]);
    const [, sat, light] = /hsl\(\$\{[\s\S]*?\}\s+(\d+)%\s+(\d+)%\)/.exec(js).map(Number);
    let worst = Infinity;
    for (let hue = 0; hue < 360; hue++) worst = Math.min(worst, ratio(white, hslToRgb(hue, sat, light)));
    expect(worst).toBeGreaterThanOrEqual(4.5);
    expect(declaration(ruleBody(".pse-xp-badge"), "color")).toBe("#fff");
  });

  test.each(["dark", "light", "contrast"])("trophy progress label sits on a solid chip, readable in the %s theme", (theme) => {
    const body = ruleBody(".pse-trophy-progress-text");
    const fg = solid(theme, declaration(body, "color"));
    const bg = solid(theme, declaration(body, "background"));
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("the hovered 'click to remove' state of an active owned / wishlist button", () => {
  const hoverRules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter(([, sel, body]) => /:hover/.test(sel) && /-btn\b/.test(sel) && /(?:^|[;\s])background\s*:/.test(body));

  test("every hover background on a standalone button keeps the --pse-solid underlay (the shorthand alone replaces it)", () => {
    expect(hoverRules.length).toBeGreaterThanOrEqual(4);
    for (const [, sel, body] of hoverRules) expect([sel.trim(), declaration(body, "background")]).toEqual([sel.trim(), expect.stringContaining("var(--pse-solid)")]);
  });

  test.each([
    [".pse-injected .pse-owned-btn.pse-owned-active:hover"],
    [".pse-injected .pse-wishlist-btn.pse-wishlist-active:hover"]
  ])("%s: danger text is readable on the underlay in the light and the contrast theme", (selector) => {
    const body = ruleBody(selector);
    expect(declaration(body, "background")).toMatch(/var\(--pse-danger-soft\).*var\(--pse-solid\)/);
    expect(declaration(body, "color")).toBe("var(--pse-danger)");
    // light: a white pill with a 10% tint of the danger colour; contrast: a black pill, no tint
    const light = THEMES.light;
    const tint = /rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/.exec(light["--pse-danger-soft"]);
    const pill = over(tint.slice(1, 4).map(Number), Number(tint[4]), channels(light["--pse-solid"]));
    expect(ratio(channels(light["--pse-danger"]), pill)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(channels(THEMES.contrast["--pse-danger"]), channels(THEMES.contrast["--pse-solid"]))).toBeGreaterThanOrEqual(4.5);
  });
});

describe("right-to-left", () => {
  /** Where the chevron's corner points: it is the bottom-right corner of its box (right + bottom borders), turned by `deg`. */
  const pointing = (deg) => ({ 0: "right", 90: "down", 180: "left", 270: "up" })[(((45 + deg) % 360) + 360) % 360];
  const rotation = (selector) => Number(/rotate\((-?\d+)deg\)/.exec(declaration(ruleBody(selector), "transform"))[1]);
  const closedTurn = (selector) => Number(/(-?\d+)deg/.exec(declaration(ruleBody(selector), "--pse-chev-closed"))[1]);

  test("the chevron is drawn with physical borders, so it is the same shape in both directions", () => {
    const body = ruleBody(".pse-card-chevron");
    expect(declaration(body, "border-right")).toBeTruthy();
    expect(declaration(body, "border-bottom")).toBeTruthy();
    expect(body).not.toMatch(/border-inline|border-left/);
  });

  test("open: down; closed: right in LTR and left in RTL", () => {
    expect(pointing(rotation(".pse-card-chevron"))).toBe("down");
    // closed: one rule turns the chevron by the card's own --pse-chev-closed, which the RTL card sets differently
    expect(declaration(ruleBody('.pse-card .pse-card-head[aria-expanded="false"] .pse-card-chevron'), "transform")).toBe("rotate(var(--pse-chev-closed))");
    expect(pointing(closedTurn(".pse-card"))).toBe("right");
    expect(pointing(closedTurn('.pse-card[dir="rtl"]'))).toBe("left");
  });

  test.each([".pse-ac-price", ".pse-xp-note"])("%s is not forced left-to-right: it holds translated words, and only numbers are isolated", (selector) => {
    expect(declaration(ruleBody(selector), "direction")).toBeNull();
  });
});
