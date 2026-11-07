/**
 * Reading the extension's own stylesheets (extension/*.css and the <style> block of the extension pages) for
 * tests, and WCAG 2 contrast maths on the colours found there. Nothing here knows about a particular page.
 *
 * The parser is small on purpose: it understands rules, declaration lists, comments, strings, url() and
 * parentheses, and it recurses into @media / @supports / @layer / @container, so a rule is found wherever
 * it sits. @keyframes / @font-face / @page stay opaque (their bodies are not selectors).
 */
const fs = require("fs");
const path = require("path");

const EXT = path.join(__dirname, "..", "..", "extension");
const read = (file) => fs.readFileSync(path.join(EXT, file), "utf8");

/** The CSS of a shipped file: a .css file as it is, a page's <style> blocks joined. */
function cssOf(file) {
  const text = read(file);
  if (!/\.html$/i.test(file)) return text;
  return [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join("\n");
}

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** Index of the first `stop` character at depth 0 (outside strings, parentheses and brackets) from `from`; -1 when there is none. */
function findTop(text, stops, from = 0) {
  let depth = 0;
  let quote = null;
  for (let i = from; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (depth === 0 && stops.includes(c)) return i;
  }
  return -1;
}

/** Split on `sep` characters that are outside strings, parentheses and brackets. */
function splitTop(text, sep) {
  const parts = [];
  let start = 0;
  for (let i = findTop(text, sep, 0); i >= 0; i = findTop(text, sep, start)) {
    parts.push(text.slice(start, i));
    start = i + 1;
  }
  parts.push(text.slice(start));
  return parts.map((s) => s.trim()).filter(Boolean);
}

/** Index of the "}" that closes the block whose "{" is at `open`. */
function matchBrace(css, open) {
  let depth = 0;
  let quote = null;
  for (let i = open; i < css.length; i++) {
    const c = css[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return i;
  }
  throw new Error("unbalanced braces in the stylesheet");
}

const CONTAINERS = new Set(["media", "supports", "layer", "container", "document", "scope"]);

/**
 * Every rule of a stylesheet, nested at-rules flattened:
 *   { selectors: [".a", ".b:hover"], body: "color:red", atRules: ["@media (max-width:600px)"] }
 * `atRules` lists the enclosing conditional at-rules, outermost first. An opaque at-rule (@font-face, @keyframes)
 * is returned with `selectors: []` and its own text in `atRule`.
 */
function parseRules(css, atRules = []) {
  css = stripComments(css);
  const rules = [];
  let i = 0;
  while (i < css.length) {
    const stop = findTop(css, "{;", i);
    if (stop < 0) break;
    const prelude = css.slice(i, stop).trim();
    if (css[stop] === ";") {
      i = stop + 1; // @import / @charset
      continue;
    }
    const end = matchBrace(css, stop);
    const inner = css.slice(stop + 1, end);
    if (prelude.startsWith("@")) {
      const name = /^@([\w-]+)/.exec(prelude)[1].toLowerCase();
      if (CONTAINERS.has(name)) rules.push(...parseRules(inner, [...atRules, prelude]));
      else rules.push({ atRule: prelude, selectors: [], body: inner, atRules });
    } else if (prelude) {
      rules.push({ selectors: splitTop(prelude, ","), body: inner, atRules });
    }
    i = end + 1;
  }
  return rules;
}

/** The declarations of a rule body, in source order: [["color", "red"], ["--x", "1px"]]. */
function declarations(body) {
  return splitTop(body, ";")
    .map((d) => {
      const colon = findTop(d, ":");
      if (colon < 0) return null;
      const prop = d.slice(0, colon).trim();
      return [prop.startsWith("--") ? prop : prop.toLowerCase(), d.slice(colon + 1).trim()]; // custom properties are case-sensitive
    })
    .filter(Boolean);
}

/** The value a rule body gives `prop` (the last declaration wins), or null. */
function declaration(body, prop) {
  const all = declarations(body).filter(([p]) => p === prop);
  return all.length ? all[all.length - 1][1].replace(/\s*!important\s*$/i, "") : null;
}

/**
 * What the rules whose selector list contains exactly `selector` declare, merged in source order (last wins) —
 * restricted to the at-rule context `inAt` accepts (default: no at-rule at all).
 */
function declared(rules, selector, inAt = (at) => at.length === 0) {
  const out = {};
  for (const r of rules) {
    if (!r.selectors.includes(selector) || !inAt(r.atRules)) continue;
    for (const [p, v] of declarations(r.body)) out[p] = v.replace(/\s*!important\s*$/i, "");
  }
  return out;
}

/** The same, but a layered cascade: `layers` is [{ selector, at? }] from the base theme to the most specific; `at` is a RegExp for the one enclosing at-rule. */
function layered(rules, layers) {
  const out = {};
  for (const { selector, at } of layers) {
    const inAt = at ? (list) => list.length === 1 && at.test(list[0]) : (list) => list.length === 0;
    const got = declared(rules, selector, inAt);
    if (!Object.keys(got).length) throw new Error(`no declarations for ${selector}${at ? " in " + at : ""}`);
    Object.assign(out, got);
  }
  return out;
}

/* ── colour ── */

const channels = (hex) => {
  let h = hex.replace("#", "");
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
const luminance = ([r, g, b]) => {
  const lin = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
/** WCAG contrast ratio of two opaque colours given as [r, g, b]. */
const ratio = (fg, bg) => {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
};
/** `fg` at `alpha` over the opaque `bg`. */
const over = (fg, alpha, bg) => fg.map((v, i) => Math.round(v * alpha + bg[i] * (1 - alpha)));
const hslToRgb = (h, s, l) => {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255));
};

/**
 * A CSS colour as [r, g, b, a]: #rgb, #rrggbb, rgb()/rgba(), transparent, var(--x[, fallback]) looked up in `vars`
 * (which may itself hold var() chains), and color-mix(in srgb, <colour> <p>%, transparent) — the colour at p% opacity.
 */
function parseColor(value, vars = {}, depth = 0) {
  if (depth > 8) throw new Error("var() chain too deep: " + value);
  const v = String(value).trim();
  let m;
  if ((m = /^var\(\s*(--[\w-]+)\s*(?:,\s*([\s\S]+))?\)$/.exec(v))) {
    if (m[1] in vars) return parseColor(vars[m[1]], vars, depth + 1);
    if (m[2]) return parseColor(m[2], vars, depth + 1);
    throw new Error(`${m[1]} is not defined (${v})`);
  }
  if (/^transparent$/i.test(v)) return [0, 0, 0, 0];
  if (/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(v)) return [...channels(v), 1];
  if ((m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(v))) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]];
  if ((m = /^color-mix\(\s*in srgb\s*,\s*([\s\S]+?)\s+([\d.]+)%\s*,\s*transparent\s*\)$/i.exec(v))) {
    const [r, g, b, a] = parseColor(m[1], vars, depth + 1);
    return [r, g, b, a * (+m[2] / 100)];
  }
  throw new Error("cannot read the colour: " + v);
}

/** A colour (or its string) laid over an opaque backdrop, as an opaque [r, g, b]. */
function flatten(color, backdrop, vars = {}) {
  const [r, g, b, a] = Array.isArray(color) ? color : parseColor(color, vars);
  return over([r, g, b], a, backdrop);
}

/** Every colour stop of the gradients in a value (the stops that are plain colours), as [r, g, b, a]. */
function gradientStops(value, vars = {}) {
  const stops = [];
  for (const g of value.matchAll(/gradient\(/gi)) {
    const open = g.index + g[0].length - 1;
    let depth = 0;
    let end = open;
    for (; end < value.length; end++) {
      if (value[end] === "(") depth++;
      else if (value[end] === ")" && --depth === 0) break;
    }
    for (const part of splitTop(value.slice(open + 1, end), ",")) {
      try {
        stops.push(parseColor(part.replace(/\s+[\d.]+%$/, ""), vars));
      } catch {
        /* an angle, a position or a shape */
      }
    }
  }
  return stops;
}

module.exports = {
  EXT, read, cssOf, parseRules, declarations, declaration, declared, layered, splitTop,
  channels, luminance, ratio, over, hslToRgb, parseColor, flatten, gradientStops
};
