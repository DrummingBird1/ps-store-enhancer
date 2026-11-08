/**
 * The website: everything in assets/docs, which .github/workflows/pages.yml deploys as is to
 * https://drummingbird1.github.io/ps-store-enhancer/ ("Midnight Glass": site.css, three pages, the bundled Rubik).
 *
 * Every guard is a function of one page (or of site.css) that returns a list of problems, so each one is tried twice:
 * on the real files (no problems) and on an in-memory copy broken in the one way the guard exists for (a problem,
 * named). Nothing in assets/docs is ever written. Run the suite against a scratch copy of the site with
 * SITE_DOCS_DIR=<folder> to watch a real file fail.
 *
 *  - links: every local href / src / srcset / url() / fetch() / <use> points at a file that exists inside assets/docs
 *    (spelled exactly: GitHub Pages is case-sensitive, Windows is not), every #anchor has its target, also across pages;
 *  - nothing is loaded from another origin (scripts, stylesheets, images, frames, @import, url(), preconnect, fetch);
 *  - the <head>: title, description, Open Graph, viewport, theme-color; the document: ids, one h1, landmarks, skip link,
 *    headings, accessible names, images (alt, width and height that match the file, lazy below the fold);
 *  - both themes keep 4.5:1 for text (3:1 for large headlines and icons) on every surface text can sit on, measured from the
 *    custom properties of site.css, and the rules of site.css and of every page <style> block are checked pair by pair;
 *  - site.css keeps its focus ring, reduced-motion and forced-colors handling; the bundled fonts and licence are there;
 *  - the install section says "Coming soon" exactly as long as there is no Chrome Web Store link, and every element marked
 *    data-store-pending goes with it;
 *  - site.js, supporters.js and the wishlist page's skip-link script really run (jsdom) on the pages that load them;
 *  - the privacy policy says what it said before the restyle.
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { JSDOM, VirtualConsole } = require("jsdom");
const { parseRules, declarations, declaration, declared, layered, ratio, flatten, parseColor, gradientStops } = require("./support/css");

/* ── the site as files ── */
const REPO = path.join(__dirname, "..");
const DOCS = process.env.SITE_DOCS_DIR ? path.resolve(process.env.SITE_DOCS_DIR) : path.join(REPO, "assets", "docs");
const EXT_FONTS = path.join(REPO, "extension", "fonts");
const SITE = "https://drummingbird1.github.io/ps-store-enhancer/";
const OG_IMAGE = SITE + "assets/og-image.png";
/** The commit whose privacy policy is the wording to keep (main before the Midnight Glass restyle). */
const POLICY_BASELINE = "19cb08a5b9c80582676fbbf11454e3d7989efe31";

const readDocs = (rel) => fs.readFileSync(path.join(DOCS, rel), "utf8");
const listDocs = (ext) => fs.readdirSync(DOCS).filter((f) => f.toLowerCase().endsWith(ext)).sort();
const parse = (html) => new JSDOM(html).window.document;
const serialize = (doc) => "<!DOCTYPE html>\n" + doc.documentElement.outerHTML;
const text = (el) => el.textContent.replace(/\s+/g, " ").trim();

const PAGES = listDocs(".html").map((file) => ({ file, doc: parse(readDocs(file)) }));
const PAGE_ROWS = PAGES.map((p) => [p.file, p]);
const CSS_ROWS = listDocs(".css").map((f) => [f]);
const JS_ROWS = listDocs(".js").map((f) => [f]);
const pageOf = (file) => PAGES.find((p) => p.file === file);

/** An in-memory copy of a page with `edit(doc)` applied. */
function variant(page, edit) {
  const doc = parse(serialize(page.doc));
  edit(doc);
  return { file: page.file, doc };
}
/** The element a self-test breaks; a missing one means the page changed and the self-test must follow. */
function pick(doc, selector) {
  const el = doc.querySelector(selector);
  if (!el) throw new Error(`the self-test needs "${selector}" in the page and it is gone: update the test`);
  return el;
}
/** Passes when some problem matches `re`; on failure Jest prints the whole list. */
const flagged = (problems, re) => expect(problems).toContainEqual(expect.stringMatching(re));

/* ── links ── */
const decode = (s) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/** What a URL is, as the browser would treat it on a page served from /ps-store-enhancer/. */
function classify(url) {
  const u = url.trim();
  if (u === "") return { kind: "empty" };
  if (/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(u)) return { kind: "remote" };
  if (/^javascript:/i.test(u)) return { kind: "script" };
  if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return { kind: "inline" }; // data:, mailto:, tel:
  if (u.startsWith("#")) return { kind: "anchor", id: decode(u.slice(1)) };
  if (u.startsWith("/")) return { kind: "root" };
  const m = /^([^?#]*)(?:\?[^#]*)?(?:#(.*))?$/.exec(u);
  return { kind: "local", path: decode(m[1]), fragment: m[2] === undefined ? undefined : decode(m[2]) };
}
/** The path of a relative URL, from the folder `dir` of assets/docs (null when it leaves assets/docs). */
function resolveLocal(dir, urlPath) {
  let rel = path.posix.normalize(path.posix.join(dir, urlPath));
  if (rel === ".." || rel.startsWith("../")) return null;
  if (rel === "." || urlPath.endsWith("/")) rel = path.posix.join(rel === "." ? "" : rel, "index.html");
  return rel;
}
/** Exists under exactly this spelling (every segment is compared against the folder listing). */
function existsExact(rel) {
  let dir = DOCS;
  for (const part of rel.split("/").filter(Boolean)) {
    let names;
    try {
      names = fs.readdirSync(dir);
    } catch {
      return false;
    }
    if (!names.includes(part)) return false;
    dir = path.join(dir, part);
  }
  return true;
}
const idsOf = (doc) => new Set([...doc.querySelectorAll("[id], a[name]")].map((el) => el.getAttribute("id") || el.getAttribute("name")));
const idsOfFile = (rel) => idsOf((pageOf(rel) || { doc: parse(readDocs(rel)) }).doc);

/** The URLs written in a stylesheet: url(...) and @import. */
function cssUrls(css) {
  const code = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const urls = new Set();
  for (const m of code.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s"']+))\s*\)/gi)) urls.add(m[1] ?? m[2] ?? m[3]);
  for (const m of code.matchAll(/@import\s+(?:url\(\s*)?(?:"([^"]*)"|'([^']*)'|([^)\s;"']+))/gi)) urls.add(m[1] ?? m[2] ?? m[3]);
  return [...urls];
}
const LOADING_REL = /\b(?:stylesheet|preload|modulepreload|prefetch|prerender|preconnect|dns-prefetch|icon|shortcut|apple-touch-icon(?:-precomposed)?|manifest|mask-icon)\b/i;

/** Every URL a page names: { kind: "nav" (a link the visitor may follow) | "load" (the browser fetches it), url, via }. */
function refsOfDoc(doc) {
  const refs = [];
  const push = (el, attr, kind, url = el.getAttribute(attr)) => {
    if (url !== null && url !== undefined) refs.push({ kind, url: url.trim(), via: `<${el.localName} ${attr}="${url}">` });
  };
  doc.querySelectorAll("a[href], area[href]").forEach((el) => push(el, "href", "nav"));
  doc.querySelectorAll("link[href]").forEach((el) => push(el, "href", LOADING_REL.test(el.getAttribute("rel") || "") ? "load" : "nav"));
  doc.querySelectorAll("base[href]").forEach((el) => push(el, "href", "load"));
  const LOADERS = [["script[src]", "src"], ["img[src]", "src"], ["source[src]", "src"], ["iframe[src]", "src"], ["frame[src]", "src"], ["embed[src]", "src"],
    ["track[src]", "src"], ["audio[src]", "src"], ["video[src]", "src"], ["video[poster]", "poster"], ["input[src]", "src"], ["object[data]", "data"], ["form[action]", "action"]];
  for (const [selector, attr] of LOADERS) doc.querySelectorAll(selector).forEach((el) => push(el, attr, "load"));
  doc.querySelectorAll("use").forEach((el) => {
    push(el, "href", "load");
    push(el, "xlink:href", "load");
  });
  doc.querySelectorAll("img[srcset], source[srcset]").forEach((el) => {
    for (const candidate of el.getAttribute("srcset").split(",")) {
      const url = candidate.trim().split(/\s+/)[0];
      if (url) push(el, "srcset", "load", url);
    }
  });
  doc.querySelectorAll("style").forEach((el) => cssUrls(el.textContent).forEach((url) => refs.push({ kind: "load", url, via: `<style> url(${url})` })));
  doc.querySelectorAll("[style]").forEach((el) => cssUrls(el.getAttribute("style")).forEach((url) => refs.push({ kind: "load", url, via: `<${el.localName} style> url(${url})` })));
  return refs;
}

/** Local references that lead nowhere. `ids` is the page's id set (null for a stylesheet), `dir` the folder the URLs are relative to. */
function linkProblems(label, ids, refs, dir = "") {
  const problems = [];
  for (const { via, url } of refs) {
    const c = classify(url);
    const bad = (why) => problems.push(`${label}: ${via} ${why}`);
    if (c.kind === "empty") bad("is empty");
    else if (c.kind === "script") bad("is a javascript: URL");
    else if (c.kind === "root") bad("starts with / but the site is served from /ps-store-enhancer/: use a relative URL");
    else if (c.kind === "anchor") {
      if (ids && c.id !== "" && c.id.toLowerCase() !== "top" && !ids.has(c.id)) bad(`points at #${c.id}, but nothing on the page has that id`);
    } else if (c.kind === "local" && c.path !== "") {
      const rel = resolveLocal(dir, c.path);
      if (rel === null) bad("points outside assets/docs, which is all that gets deployed");
      else if (!existsExact(rel)) bad(`points at ${rel}, which is not in assets/docs${fs.existsSync(path.join(DOCS, rel)) ? " under that exact spelling (GitHub Pages is case-sensitive)" : ""}`);
      else if (c.fragment && /\.html$/i.test(rel) && !idsOfFile(rel).has(c.fragment)) bad(`points at ${rel}#${c.fragment}, but ${rel} has no element with that id`);
    }
  }
  return problems;
}
const pageLinkProblems = ({ file, doc }) => linkProblems(file, idsOf(doc), refsOfDoc(doc));
const cssLinkProblems = (label, css) => linkProblems(label, null, cssUrls(css).map((url) => ({ url, via: `url(${url})` })));

/** Strip comments from a script, keeping the :// of URLs and quoted // intact. */
const jsCode = (js) => js.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const JS_REMOTE = [
  [/\b(?:fetch|importScripts|import)\s*\([^)]*?["'`](?:https?:|wss?:)?\/\/\S/, "requests a URL on another origin"],
  [/\.(?:src|srcset|poster|action|data)\s*=\s*["'`](?:https?:)?\/\/\S/, "assigns a URL on another origin to a loading attribute"],
  [/\b(?:sendBeacon|WebSocket|EventSource)\b/, "opens a channel (sendBeacon, WebSocket or EventSource) the privacy policy does not mention"]
];
const jsRemoteProblems = (label, js) => JS_REMOTE.filter(([re]) => re.test(jsCode(js))).map(([, why]) => `${label}: the script ${why}`);
/** A fetch() of a relative URL must ask for a file that exists (relative to the page, which is the folder of assets/docs). */
function jsFetchProblems(label, js) {
  return [...jsCode(js).matchAll(/\bfetch\s*\(\s*["']([^"']+)["']/g)].flatMap((m) => linkProblems(label, null, [{ url: m[1], via: `fetch("${m[1]}")` }]));
}

/* ── another origin ── */
function remoteProblems({ file, doc }) {
  const problems = [];
  for (const { kind, url, via } of refsOfDoc(doc)) if (kind === "load" && classify(url).kind === "remote") problems.push(`${file}: ${via} loads from another origin`);
  doc.querySelectorAll("[ping]").forEach((el) => problems.push(`${file}: <${el.localName} ping> reports clicks to another address`));
  doc.querySelectorAll("script:not([src])").forEach((s) => problems.push(...jsRemoteProblems(`${file} (inline script)`, s.textContent)));
  return problems;
}
const cssRemoteProblems = (label, css) => cssUrls(css).filter((url) => classify(url).kind === "remote").map((url) => `${label}: url/@import ${url} loads from another origin`);

/* ── the <head> ── */
function metaProblems({ file, doc }, themes = THEMES) {
  const problems = [];
  const bad = (m) => problems.push(`${file}: ${m}`);
  const meta = (selector) => {
    const el = doc.querySelector(`meta[${selector}]`);
    return el ? (el.getAttribute("content") || "").trim() : null;
  };
  if (!doc.title.trim()) bad("has no <title>");
  const charset = doc.querySelector("meta[charset]");
  if (!charset || !/^utf-8$/i.test(charset.getAttribute("charset"))) bad('has no <meta charset="utf-8">');
  const lang = doc.documentElement.getAttribute("lang");
  if (!lang || !/^en(?:-|$)/i.test(lang)) bad(`<html lang> is ${JSON.stringify(lang)}, the site is in English`);
  const viewport = meta('name="viewport"');
  if (viewport === null || !/width\s*=\s*device-width/.test(viewport) || !/initial-scale\s*=\s*1(?:\.0*)?(?:[,\s]|$)/.test(viewport)) bad(`has no responsive viewport (has ${JSON.stringify(viewport)})`);
  else {
    const max = /maximum-scale\s*=\s*([\d.]+)/i.exec(viewport);
    if (/user-scalable\s*=\s*(?:no|0)/i.test(viewport) || (max && parseFloat(max[1]) < 2)) bad(`the viewport forbids zooming (${JSON.stringify(viewport)})`);
  }
  const scheme = meta('name="color-scheme"');
  if (scheme === null || !/dark/.test(scheme) || !/light/.test(scheme)) bad('has no <meta name="color-scheme" content="dark light">');
  for (const name of ["dark", "light"]) {
    const el = [...doc.querySelectorAll('meta[name="theme-color"]')].find((m) => (m.getAttribute("media") || "").includes(`prefers-color-scheme: ${name}`));
    if (!el) bad(`has no theme-color for the ${name} scheme (<meta name="theme-color" media="(prefers-color-scheme: ${name})">)`);
    else if ((el.getAttribute("content") || "").toLowerCase() !== themes[name]["--bg"].toLowerCase()) bad(`theme-color (${name}) is ${el.getAttribute("content")} but the page background of the ${name} theme is ${themes[name]["--bg"]}`);
  }
  // A page that asks search engines to skip it (the shared-wishlist viewer) has nothing to describe.
  if (/noindex/i.test(meta('name="robots"') || "")) return problems;
  const description = meta('name="description"');
  if (description === null || description.length < 50) bad(`has no meta description of at least 50 characters (has ${JSON.stringify(description)})`);
  if (!(meta('property="og:title"') || "").length) bad("has no og:title");
  if ((meta('property="og:description"') || "").length < 30) bad("has no og:description of at least 30 characters");
  if (meta('property="og:type"') === null) bad("has no og:type");
  const image = meta('property="og:image"');
  if (image === null) bad("has no og:image");
  else if (image !== OG_IMAGE) bad(`og:image is ${image}, it must stay ${OG_IMAGE}`);
  else if (!existsExact("assets/og-image.png")) bad(`og:image points at assets/og-image.png, which is not in assets/docs`);
  const url = meta('property="og:url"');
  const wanted = SITE + (file === "index.html" ? "" : file);
  if (url !== null && url !== wanted && !(file === "index.html" && url === SITE + "index.html")) bad(`og:url is ${url}, this page is ${wanted}`);
  return problems;
}

/* ── the document ── */
const RTL = /^(?:he|ar|fa|ur|yi)(?:-|$)/i;
const nameOf = (el) => {
  const label = el.getAttribute("aria-label") || (el.getAttribute("aria-labelledby") ? "labelled" : "");
  return label || [...el.querySelectorAll("img[alt]")].map((i) => i.getAttribute("alt")).join("") + text(el);
};

function structureProblems({ file, doc }) {
  const problems = [];
  const bad = (m) => problems.push(`${file}: ${m}`);
  const count = (selector) => doc.querySelectorAll(selector).length;

  // ids
  const seen = new Map();
  doc.querySelectorAll("[id]").forEach((el) => {
    const id = el.getAttribute("id");
    if (/\s/.test(id) || id === "") bad(`has an id that is empty or has a space: ${JSON.stringify(id)}`);
    seen.set(id, (seen.get(id) || 0) + 1);
  });
  for (const [id, n] of seen) if (n > 1) bad(`has ${n} elements with id="${id}"`);
  const ids = idsOf(doc);
  for (const attr of ["aria-labelledby", "aria-describedby", "aria-controls"]) {
    doc.querySelectorAll(`[${attr}]`).forEach((el) => {
      for (const id of el.getAttribute(attr).split(/\s+/)) if (id && !ids.has(id)) bad(`<${el.localName} ${attr}="${id}"> points at an id the page does not have`);
    });
  }
  doc.querySelectorAll("label[for]").forEach((el) => !ids.has(el.getAttribute("for")) && bad(`<label for="${el.getAttribute("for")}"> points at an id the page does not have`));

  // landmarks
  if (count("h1") !== 1) bad(`has ${count("h1")} <h1> (it needs exactly one)`);
  if (count("main") !== 1) bad(`has ${count("main")} <main> (it needs exactly one)`);
  if (count("body > header") !== 1) bad(`has ${count("body > header")} top-level <header> (the site bar: it needs exactly one)`);
  if (count("body > footer") !== 1) bad(`has ${count("body > footer")} top-level <footer> (it needs exactly one)`);
  if (!count("body > header nav")) bad("has no <nav> in the header");
  doc.querySelectorAll("nav").forEach((el) => !el.getAttribute("aria-label") && !el.getAttribute("aria-labelledby") && bad("has a <nav> without an aria-label"));
  doc.querySelectorAll("section").forEach((el) => {
    if (!el.querySelector("h1, h2, h3, h4, h5, h6") && !el.getAttribute("aria-label")) bad(`has a <section${el.id ? ` id="${el.id}"` : ""}> without a heading`);
  });

  // headings never skip a level on the way down
  let previous = 0;
  doc.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((h) => {
    const level = Number(h.localName[1]);
    if (level > previous + 1) bad(`jumps from ${previous ? "h" + previous : "the top"} to <h${level}> ("${text(h).slice(0, 40)}")`);
    previous = level;
  });

  // skip link: first link of the page, to <main>, which can take focus
  const first = doc.body.querySelector("a[href]");
  if (!first || !first.classList.contains("skip-link") || first.getAttribute("href") !== "#main") bad('the first link of the page is not the skip link (<a class="skip-link" href="#main">)');
  const main = doc.querySelector("main");
  if (!main || main.id !== "main" || main.getAttribute("tabindex") !== "-1") bad('<main> is not id="main" tabindex="-1", so the skip link cannot land on it');

  // the shared stylesheet is what makes the page look like the site
  if (!doc.querySelector('link[rel="stylesheet"][href="site.css"]')) bad('does not link site.css (<link rel="stylesheet" href="site.css">)');

  // names
  doc.querySelectorAll("a[href], button, summary").forEach((el) => {
    if (!nameOf(el)) bad(`has a <${el.localName}${el.getAttribute("href") ? ` href="${el.getAttribute("href")}"` : ""}> with no text or aria-label`);
  });
  doc.querySelectorAll("svg").forEach((svg) => {
    const hidden = svg.getAttribute("aria-hidden") === "true";
    const named = svg.getAttribute("role") === "img" && (svg.getAttribute("aria-label") || svg.querySelector("title"));
    if (!hidden && !named) bad("has an <svg> that is neither aria-hidden=\"true\" nor role=\"img\" with a name");
  });
  doc.querySelectorAll("a[target='_blank']").forEach((a) => {
    if (!/\bnoopener\b/.test(a.getAttribute("rel") || "")) bad(`<a href="${a.getAttribute("href")}" target="_blank"> has no rel="noopener"`);
  });
  doc.querySelectorAll("[lang]").forEach((el) => {
    const lang = el.getAttribute("lang");
    if (!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(lang)) bad(`has lang="${lang}", which is not a language tag`);
    else if (RTL.test(lang) && el !== doc.documentElement && el.getAttribute("dir") !== "rtl") bad(`lang="${lang}" is right-to-left but has no dir="rtl"`);
  });

  // scripts that look an element up by id need it on the page
  const sourceOf = (s) => {
    const src = s.getAttribute("src");
    if (src === null) return s.textContent;
    return classify(src).kind === "local" && existsExact(src) ? readDocs(src) : "";
  };
  for (const s of doc.querySelectorAll("script")) {
    const name = s.getAttribute("src") || "an inline script";
    const source = sourceOf(s);
    for (const m of jsCode(source).matchAll(/getElementById\(\s*["']([\w-]+)["']\s*\)/g)) if (!ids.has(m[1])) bad(`${name} looks up #${m[1]}, which the page does not have`);
  }
  return problems;
}

/** The size of a PNG, read from its header. */
function pngSize(buffer) {
  if (buffer.length < 24 || buffer.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}
function imageProblems({ file, doc }) {
  const problems = [];
  doc.querySelectorAll("img").forEach((img) => {
    const src = img.getAttribute("src") || "";
    const name = `<img src="${src}">`;
    const bad = (m) => problems.push(`${file}: ${name} ${m}`);
    const alt = img.getAttribute("alt");
    if (alt === null) bad("has no alt attribute (use alt=\"\" for a decorative picture)");
    else if (alt !== "" && /\.(?:png|jpe?g|gif|webp|svg)$/i.test(alt.trim())) bad(`has a file name for its alt text ("${alt}")`);
    else if (alt === "" && img.closest("main")) bad("is content (inside <main>) but has an empty alt");
    const width = img.getAttribute("width");
    const height = img.getAttribute("height");
    if (!/^[1-9]\d*$/.test(width || "") || !/^[1-9]\d*$/.test(height || "")) bad(`has no integer width and height (${width}x${height}), so the page jumps when it loads`);
    else if (classify(src).kind === "local" && existsExact(src) && /\.png$/i.test(src)) {
      const size = pngSize(fs.readFileSync(path.join(DOCS, src)));
      if (size && Math.abs(size.width / size.height - width / height) > 0.01 * (size.width / size.height)) bad(`is ${width}x${height} but the file is ${size.width}x${size.height}: a different shape`);
    }
    // the logo in the bar and the hero are above the fold; everything else loads when it scrolls near
    if (!img.closest("header, .hero") && img.getAttribute("loading") !== "lazy") bad('is below the fold but is not loading="lazy"');
  });
  return problems;
}

/** What every page shares: the same section links and the same footer links as the home page. */
function chromeProblems({ file, doc }, home = pageOf("index.html")) {
  const links = (d, selector) => [...d.querySelectorAll(selector)].map((a) => `${text(a)} -> ${a.getAttribute("href").replace(/^index\.html(?=#)/, "")}`);
  const problems = [];
  for (const [what, selector] of [["the section links", ".site-header .nav-menu a"], ["the Install button", ".site-header .btn"], ["the footer links", ".site-footer a"]]) {
    const mine = links(doc, selector);
    const theirs = links(home.doc, selector);
    if (JSON.stringify(mine) !== JSON.stringify(theirs)) problems.push(`${file}: ${what} differ from the home page's: ${JSON.stringify(mine)} against ${JSON.stringify(theirs)}`);
  }
  return problems;
}

/* ── colour: the tokens of site.css, in both themes ── */
const MIN_TEXT = 4.5;
const MIN_LARGE = 3; // large headlines
const MIN_UI = 3; // icons, focus ring
const BLACK = [0, 0, 0];
const TEXT_TOKENS = ["--text", "--dim", "--faint", "--accent", "--good", "--warn", "--pink"];
const GLOW_TEXT = ["--text", "--dim", "--accent"]; // the text tokens used in the hero, where the glow is
const LAYOUT_TOKENS = new Set(["--r", "--r-sm", "--max", "--gutter", "--bar-h", "--font", "--mono"]);
const stopsOf = (value, vars) => (/gradient\(/i.test(value) ? gradientStops(value, vars) : [parseColor(value, vars)]);
const rgbOf = (c) => `rgb(${c.join(",")})`;

/** The custom properties of both themes (dark = :root, light = :root under prefers-color-scheme: light, over the dark ones). */
function themesOf(css) {
  const rules = parseRules(css);
  const dark = layered(rules, [{ selector: ":root" }]);
  const lightOnly = declared(rules, ":root", (at) => at.length === 1 && /prefers-color-scheme:\s*light/.test(at[0]));
  return { rules, dark, light: { ...dark, ...lightOnly }, lightOnly };
}

/**
 * The opaque colours text can sit on, as [name, [r, g, b]]; a translucent surface is laid over the backdrop below it.
 *  - base: the plain page, glass over it, and the solid glass used where backdrop-filter is missing;
 *  - lit: the page and glass under the hero glow at full strength. The glow is a radial gradient from the top edge that has
 *    faded out by about 530px, so only what sits at the very top (the headline, the lede, links, buttons, the first card)
 *    can see it: those are checked there ("top" = base + lit), tints and badges further down the page are not;
 *  - bar: the sticky top bar, over the plain page and over the glow (it starts at the top edge), and its solid fallback.
 */
function surfacesOf(vars) {
  const bg = flatten(vars["--bg"], BLACK, vars);
  const over = (value, bases, label) => bases.flatMap(([baseName, base]) => stopsOf(value, vars).map((c) => [`${label} over ${baseName}`, flatten(c, base)]));
  const plain = [["the page", bg]];
  const glow = stopsOf(vars["--glow"], vars).filter((c) => c[3] > 0).map((c) => ["the page under the hero glow", flatten(c, bg)]);
  const solid = [["the solid glass fallback", flatten(vars["--glass-solid"], BLACK, vars)]];
  const base = [...plain, ...over(vars["--glass"], plain, "glass"), ...solid];
  const lit = [...glow, ...over(vars["--glass"], glow, "glass")];
  const bar = [...over(vars["--bar-bg"], [...plain, ...glow], "the top bar"), ["the solid top bar fallback", flatten(vars["--bar-solid"], BLACK, vars)]];
  return {
    page: [...plain, ...glow],
    base,
    top: [...base, ...lit],
    lit,
    bar,
    menu: [...bar, ...solid], // menu links sit on the bar, or on the dropdown's solid glass
    panel: over(vars["--panel"], [...base, ...bar], "a panel"),
    raised: over(vars["--panel2"], [...base, ...bar], "a raised panel")
  };
}

/** The rules of site.css whose colour is checked against the background the same rules paint (or the surface under them). */
const COMPONENTS = [
  { name: "body text", sel: ["body"], on: "top", noBackground: true },
  { name: "links", sel: ["a"], on: "top", noBackground: true },
  { name: "the brand name", sel: [".brand"], on: "bar", noBackground: true },
  { name: "the menu button", sel: [".nav-menu > summary"], on: "bar" },
  { name: "menu links", sel: [".nav-menu a"], on: "menu", noBackground: true },
  { name: "a hovered menu link", sel: [".nav-menu a", ".nav-menu a:hover"], on: "menu" },
  { name: "the current menu link", sel: [".nav-menu a", ".nav-menu a[aria-current]"], on: "menu" },
  { name: "the skip link", sel: [".skip-link"], on: "page" },
  { name: "the primary button", sel: [".btn", ".btn-primary"], on: "top" },
  { name: "the glass button", sel: [".btn", ".btn-glass"], on: "top" },
  { name: "the support button", sel: [".btn", ".btn-support"], on: "base" },
  { name: "a badge", sel: [".badge"], on: "base" },
  { name: "the Coming soon badge", sel: [".badge", ".badge-soon"], on: "base" },
  { name: "a chip or a supporter's name", sel: [".chip"], on: "base" },
  { name: "the lede", sel: [".lede"], on: "top", noBackground: true },
  { name: "the eyebrow", sel: [".eyebrow"], on: "top", noBackground: true },
  { name: "card text", sel: [".card p"], on: "base", noBackground: true },
  { name: "bold text in a card", sel: [".card p strong"], on: "base", noBackground: true },
  { name: "the footer", sel: [".site-footer"], on: "page", noBackground: true },
  { name: "table headings", sel: [".table-wrap th"], on: "base" },
  { name: "table cells", sel: [".table-wrap td"], on: "base", noBackground: true },
  { name: "a callout", sel: [".callout"], on: "base" },
  { name: "a warning callout", sel: [".callout", ".callout.is-warn"], on: "base" },
  { name: "an icon tile", sel: [".icon-tile"], on: "base", min: MIN_UI },
  { name: "a green icon tile", sel: [".icon-tile", ".icon-tile.is-good"], on: "base", min: MIN_UI },
  { name: "an amber icon tile", sel: [".icon-tile", ".icon-tile.is-warn"], on: "base", min: MIN_UI },
  { name: "a pink icon tile", sel: [".icon-tile", ".icon-tile.is-pink"], on: "base", min: MIN_UI }
];

function contrastProblems(css) {
  const t = themesOf(css);
  const problems = [];
  for (const theme of ["dark", "light"]) {
    const vars = t[theme];
    const check = (family, run) => {
      try {
        run();
      } catch (e) {
        problems.push(`${theme}: ${family}: ${e.message}`);
      }
    };
    const low = (what, fg, surface, name, min = MIN_TEXT) => {
      const r = ratio(fg, surface);
      if (r < min) problems.push(`${theme}: ${what} on ${name} ${rgbOf(surface)} = ${r.toFixed(2)} (needs ${min})`);
    };
    let S;
    try {
      S = surfacesOf(vars);
    } catch (e) {
      problems.push(`${theme}: the surfaces cannot be computed: ${e.message}`);
      continue;
    }

    check("text tokens", () => {
      for (const token of TEXT_TOKENS) {
        const where = [...S.base, ...S.bar, ...(GLOW_TEXT.includes(token) ? S.lit : []), ...(["--text", "--dim"].includes(token) ? [...S.panel, ...S.raised] : [])];
        for (const [name, surface] of where) low(`${token} ${vars[token]}`, flatten(vars[token], surface, vars), surface, name);
      }
    });
    check("tinted text", () => {
      for (const tint of ["accent", "good", "warn", "pink"]) {
        for (const [name, under] of [...S.base, ...S.bar]) {
          const soft = flatten(vars[`--${tint}-soft`], under, vars);
          low(`--${tint} on --${tint}-soft`, flatten(vars[`--${tint}`], soft, vars), soft, `its tint over ${name}`);
        }
      }
    });
    check("components", () => {
      for (const c of COMPONENTS) {
        const d = Object.assign({}, ...c.sel.map((s) => declared(t.rules, s)));
        if (!d.color) {
          problems.push(`${theme}: ${c.name}: ${c.sel.join(" + ")} declares no colour in site.css (this test reads it from there: update COMPONENTS)`);
          continue;
        }
        if (!c.noBackground && !d.background) {
          problems.push(`${theme}: ${c.name}: ${c.sel.join(" + ")} declares no background in site.css (update COMPONENTS)`);
          continue;
        }
        for (const [name, surface] of S[c.on]) {
          const under = c.noBackground ? surface : flatten(d.background, surface, vars);
          low(`${c.name} (${c.sel.join(" + ")}: ${d.color})`, flatten(d.color, under, vars), under, c.noBackground ? name : `its background over ${name}`, c.min);
        }
      }
    });
    check("the gradient headline", () => {
      for (const [name, surface] of S.page) for (const stop of gradientStops(vars["--grad"], vars)) low(`a stop of --grad ${rgbOf(stop.slice(0, 3))} (large text)`, flatten(stop, surface), surface, name, MIN_LARGE);
    });
    check("the focus ring", () => {
      const ring = /^(\d+(?:\.\d+)?)px\s+solid\s+(.+)$/.exec(declared(t.rules, ":focus-visible").outline || "");
      if (!ring || Number(ring[1]) < 2) return problems.push(`${theme}: :focus-visible has no outline of 2px or more`);
      for (const [name, surface] of [...S.base, ...S.bar]) low(`the focus ring (${ring[2]})`, flatten(ring[2], surface, vars), surface, name, MIN_UI);
    });
    check("parity with the dark theme", () => {
      if (theme === "dark") return;
      for (const key of Object.keys(t.dark)) {
        if (!LAYOUT_TOKENS.has(key) && key !== "color-scheme" && !(key in t.lightOnly)) problems.push(`light: the light theme does not redefine ${key}, so the dark value ${t.dark[key]} stays`);
      }
      if (t.dark["color-scheme"] !== "dark" || t.lightOnly["color-scheme"] !== "light") problems.push("light: color-scheme is not dark for :root and light inside prefers-color-scheme: light");
    });
  }
  return problems;
}

/** Rule by rule in a stylesheet or a page's <style>: text colours are tokens, and a colour + background pair has contrast. */
function styleProblems(label, css, themes = THEMES) {
  const problems = new Set();
  const surfaces = { dark: surfacesOf(themes.dark).base, light: surfacesOf(themes.light).base }; // the glow fades out before most of the page
  for (const rule of parseRules(css)) {
    if (!rule.selectors.length || rule.atRules.some((a) => /print|forced-colors/i.test(a))) continue;
    const d = Object.fromEntries(declarations(rule.body).map(([p, v]) => [p, v.replace(/\s*!important\s*$/i, "")]));
    const name = rule.selectors[0] + (rule.selectors.length > 1 ? ", ..." : "");
    if (d.color && !/^(?:var\(|inherit$|currentcolor$|transparent$|initial$|unset$|revert)/i.test(d.color)) problems.add(`${label}: ${name} sets color: ${d.color}; text colours must be tokens (var(--...)) so the contrast checks cover them`);
    const bg = d["background-color"] ?? d.background;
    if (!d.color || !bg) continue;
    for (const theme of ["dark", "light"]) {
      const vars = themes[theme];
      for (const [surfaceName, surface] of surfaces[theme]) {
        try {
          const tint = flatten(bg, surface, vars);
          const r = ratio(flatten(d.color, tint, vars), tint);
          if (r < MIN_TEXT) problems.add(`${label}: ${theme}: ${name} (${d.color} on ${bg}) over ${surfaceName} = ${r.toFixed(2)} (needs ${MIN_TEXT})`);
        } catch {
          /* a gradient, an image or a system colour: nothing to measure */
        }
      }
    }
  }
  return [...problems];
}

/* ── site.css: the things that must not regress ── */
function guardProblems(css) {
  const rules = parseRules(css);
  const problems = [];
  const within = (re) => (r) => r.atRules.some((a) => re.test(a));
  const reduce = rules.filter(within(/prefers-reduced-motion:\s*reduce/));
  const noMotion = reduce.find((r) => r.selectors.includes("*"));
  if (!noMotion || !/^none\b/.test(declaration(noMotion.body, "transition") || "") || !/^none\b/.test(declaration(noMotion.body, "animation") || "")) problems.push("no @media (prefers-reduced-motion: reduce) rule on * that sets transition: none and animation: none");
  if (!reduce.some((r) => r.selectors.includes("html") && declaration(r.body, "scroll-behavior") === "auto")) problems.push("prefers-reduced-motion: reduce does not put html back to scroll-behavior: auto");
  for (const r of rules) {
    if (declaration(r.body, "scroll-behavior") === "smooth" && !within(/prefers-reduced-motion:\s*no-preference/)(r)) problems.push(`${r.selectors[0]} scrolls smoothly outside @media (prefers-reduced-motion: no-preference)`);
    if (r.selectors.some((s) => /:focus-visible/.test(s) && !/:not\(:focus-visible\)/.test(s)) && /^(?:none|0)\b/.test(declaration(r.body, "outline") || "")) problems.push(`${r.selectors.join(", ")} removes the focus ring`);
  }
  const forced = rules.filter(within(/forced-colors:\s*active/));
  if (!forced.length) problems.push("no @media (forced-colors: active) block");
  const transparent = (v) => /^transparent$/i.test(v || "");
  for (const r of rules.filter((x) => !within(/forced-colors|print/)(x) && (transparent(declaration(x.body, "-webkit-text-fill-color")) || transparent(declaration(x.body, "color"))))) {
    for (const selector of r.selectors) {
      const undone = forced.some((f) => f.selectors.includes(selector) && declaration(f.body, "-webkit-text-fill-color") && !transparent(declaration(f.body, "-webkit-text-fill-color")) && !transparent(declaration(f.body, "color")));
      if (!undone) problems.push(`${selector} makes its text transparent (gradient text) and forced-colors mode does not bring the text back`);
    }
  }
  for (const selector of [".glass", ".badge", ".btn", ".callout"]) {
    if (!forced.some((f) => f.selectors.includes(selector) && declaration(f.body, "border"))) problems.push(`forced-colors mode gives ${selector} no border, so its edge would vanish`);
  }
  return problems;
}

/* ── fonts ── */
/** `files` and `ext` map a file name to its bytes (the woff2 files and OFL.txt) in assets/docs/fonts and extension/fonts. */
function fontProblems({ css, files, ext }) {
  const problems = [];
  const faces = parseRules(css).filter((r) => r.atRule === "@font-face");
  if (faces.length < 5) problems.push(`site.css declares ${faces.length} @font-face rules, Rubik is shipped as five subsets`);
  const named = new Set();
  const ranges = new Set();
  for (const r of faces) {
    const src = declaration(r.body, "src") || "";
    const m = /^url\(\s*(?:"([^"]+)"|'([^']+)'|([^)\s]+))\s*\)\s*format\(\s*["']woff2["']\s*\)$/.exec(src);
    const where = `@font-face ${src}`;
    if (!m) {
      problems.push(`${where}: src is not a single url(...) format("woff2")`);
      continue;
    }
    const url = m[1] ?? m[2] ?? m[3];
    if (!/^fonts\/[^/]+\.woff2$/.test(url)) problems.push(`${where}: the file is not fonts/<name>.woff2 (relative, inside assets/docs)`);
    const file = path.posix.basename(url);
    named.add(file);
    if (declaration(r.body, "font-family").replace(/["']/g, "") !== "Rubik") problems.push(`${where}: family is not Rubik`);
    if (declaration(r.body, "font-weight") !== "300 900") problems.push(`${where}: weight is not the variable range 300 900`);
    if (declaration(r.body, "font-display") !== "swap") problems.push(`${where}: font-display is not swap (text would be invisible while the font loads)`);
    const range = declaration(r.body, "unicode-range") || "";
    if (!/^U\+/.test(range)) problems.push(`${where}: no unicode-range`);
    if (ranges.has(range)) problems.push(`${where}: shares its unicode-range with another subset`);
    ranges.add(range);
    if (!files[file]) problems.push(`${where}: fonts/${file} is not in assets/docs`);
    else if (files[file].subarray(0, 4).toString("latin1") !== "wOF2") problems.push(`fonts/${file} is not a WOFF2 file`);
    else if (!ext[file] || !files[file].equals(ext[file])) problems.push(`fonts/${file} differs from extension/fonts/${file} (the site says it uses the same font files)`);
  }
  for (const file of Object.keys(files)) if (file.endsWith(".woff2") && !named.has(file)) problems.push(`fonts/${file} is shipped but no @font-face names it`);
  const ofl = files["OFL.txt"];
  if (!ofl || !ofl.length) problems.push("fonts/OFL.txt (the licence that travels with Rubik) is missing or empty");
  else {
    if (!/SIL OPEN FONT LICENSE/i.test(ofl.toString("utf8")) || !/Rubik/.test(ofl.toString("utf8"))) problems.push("fonts/OFL.txt is not the Rubik copy of the SIL Open Font License");
    if (!ext["OFL.txt"] || !ofl.equals(ext["OFL.txt"])) problems.push("fonts/OFL.txt differs from extension/fonts/OFL.txt");
  }
  return problems;
}
const dirBytes = (dir) => Object.fromEntries(fs.readdirSync(dir).filter((f) => /\.(?:woff2|txt)$/.test(f)).map((f) => [f, fs.readFileSync(path.join(dir, f))]));
/** Per page: the font credit and licence link in the footer, and a preload that is fetched once (it needs crossorigin). */
function fontLinkProblems({ file, doc }) {
  const problems = [];
  if (!doc.querySelector('.site-footer a[href="fonts/OFL.txt"]')) problems.push(`${file}: the footer does not credit Rubik with a link to fonts/OFL.txt`);
  doc.querySelectorAll('link[rel="preload"][as="font"]').forEach((l) => {
    if (!l.hasAttribute("crossorigin")) problems.push(`${file}: <link rel="preload" as="font" href="${l.getAttribute("href")}"> has no crossorigin, so the font is fetched twice`);
    if (l.getAttribute("type") !== "font/woff2") problems.push(`${file}: the font preload for ${l.getAttribute("href")} is not type="font/woff2"`);
  });
  return problems;
}

/* ── the install section ── */
const STORE_URL = /^https?:\/\/(?:chromewebstore\.google\.com|chrome\.google\.com\/webstore)\b/i;
const STORE_LISTING = /^https:\/\/(?:chromewebstore\.google\.com\/detail\/|chrome\.google\.com\/webstore\/detail\/)[^/?#]+\/[a-p]{32}(?:[/?#]|$)/;
const STORE_CLAIM = /\b(?:add to chrome|available (?:now )?(?:on|in|at) the chrome web store|(?:get|install)(?: it| the extension)? (?:on|from) the chrome web store)\b/i;
const NOT_LIVE = /coming soon|not live yet|no store link/gi;
/** The words a visitor reads, with a space wherever an element ends ("soon</span><button>Add" is two words). */
function words(el) {
  const walker = el.ownerDocument.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */);
  const parts = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if (!n.parentElement.closest("script, style")) parts.push(n.nodeValue);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}
function installProblems(pages) {
  const home = pages.find((p) => p.file === "index.html");
  const section = home && home.doc.getElementById("install");
  if (!section) return ["index.html has no #install section (the nav's Install button points at it)"];
  const problems = [];
  const links = pages.flatMap(({ file, doc }) => [...doc.querySelectorAll("a[href]")].filter((a) => STORE_URL.test(a.getAttribute("href"))).map((a) => ({ file, href: a.getAttribute("href"), inInstall: file === "index.html" && section.contains(a) })));
  const spoken = words(section);
  const pending = pages.flatMap(({ file, doc }) => [...doc.querySelectorAll("[data-store-pending]")].map((el) => `${file}: <${el.localName}${el.id ? ` id="${el.id}"` : ""}${el.classList.length ? ` class="${el.getAttribute("class")}"` : ""}>`));
  if (!links.length) {
    if (!pending.length) problems.push("there is no Chrome Web Store link, but nothing is marked data-store-pending any more: the elements that say the listing is not live yet must carry it, so the swap check can find them (see the comment above #store-link in index.html)");
    if (!/coming soon/i.test(spoken)) problems.push('there is no Chrome Web Store link, so #install must say "Coming soon" (it does not): visitors would look for an install button that is not there');
    if (!section.querySelector('a[href^="https://github.com/DrummingBird1/ps-store-enhancer/releases"]')) problems.push("there is no Chrome Web Store link, so #install must offer the GitHub release instead (it has no link to it)");
    for (const { file, doc } of pages) {
      const claim = STORE_CLAIM.exec(words(doc.body));
      if (claim) problems.push(`${file} says "${claim[0]}" but there is no Chrome Web Store link`);
    }
    return problems;
  }
  for (const { file, href } of links) if (!STORE_LISTING.test(href)) problems.push(`${file}: the store link ${href} is not a listing URL (https://chromewebstore.google.com/detail/<name>/<32-letter extension id>)`);
  if (!links.some((l) => l.inInstall)) problems.push(`the Chrome Web Store link (${links[0].href}) is not inside #install`);
  const stale = [...new Set([...spoken.matchAll(NOT_LIVE)].map((m) => `"${m[0].toLowerCase()}"`))];
  if (section.querySelector(".badge-soon")) stale.push("a .badge-soon badge");
  if (stale.length) {
    problems.push(`a Chrome Web Store link was added (${links[0].href}) but #install still says ${stale.join(", ")}: remove the "Coming soon" badge and every "not live yet" sentence, see the comment in index.html`);
  }
  if (pending.length) problems.push(`a Chrome Web Store link was added (${links[0].href}) but these elements are still marked data-store-pending (they say the listing is not live yet; replace or reword them): ${pending.join(", ")}`);
  const primary = section.querySelectorAll(".btn-primary").length;
  if (primary > 1) problems.push(`a Chrome Web Store link was added but #install has ${primary} primary buttons: the store link is the primary one, make "Open the latest release" a .btn-glass`);
  return problems;
}

/* ── the privacy policy ── */
/** The words of a page: the main content (or the whole body of the old page) without the restyle's own links and contents list. */
function wordingOf(doc) {
  const root = (doc.querySelector("main") || doc.body).cloneNode(true);
  root.querySelectorAll('style, script, .back-link, nav[aria-label="On this page"]').forEach((n) => n.remove());
  return text(root).replace(/\u{1F512}/gu, "").replace(/\s+/g, " ").trim(); // the lock emoji of the old title is now an SVG icon
}
function policyProblems(doc, baselineDoc) {
  const was = wordingOf(baselineDoc);
  const now = wordingOf(doc);
  if (was === now) return [];
  let i = 0;
  while (i < was.length && i < now.length && was[i] === now[i]) i++;
  const around = (s) => JSON.stringify(s.slice(Math.max(0, i - 40), i + 70));
  return [`the privacy policy wording changed at character ${i} (${was.length} characters before, ${now.length} now): was ${around(was)}, now ${around(now)}`];
}
function baselinePolicy() {
  try {
    return execFileSync("git", ["show", `${POLICY_BASELINE}:assets/docs/privacy-policy.html`], { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 16 * 1024 * 1024 });
  } catch {
    return null;
  }
}

/* ── the real site, read once ── */
const CSS = readDocs("site.css");
const THEMES = themesOf(CSS);

/* helpers for breaking a stylesheet in memory */
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Where the light tokens start: the at-rule itself (the words also appear in a comment at the top of site.css). */
function lightStart(css) {
  const m = /@media \(prefers-color-scheme: light\)\s*\{/.exec(css);
  if (!m) throw new Error("the self-test needs @media (prefers-color-scheme: light) in site.css and it is gone: update the test");
  return m.index;
}
function setToken(css, theme, name, value) {
  const cut = lightStart(css);
  const [from, to] = theme === "dark" ? [0, cut] : [cut, css.length];
  const re = new RegExp(`([\\s{;])(${esc(name)})(\\s*:\\s*)[^;]+;`);
  const part = css.slice(from, to);
  if (!re.test(part)) throw new Error(`the self-test needs ${name} in the ${theme} tokens of site.css and it is gone: update the test`);
  return css.slice(0, from) + part.replace(re, (_m, a, b, c) => `${a}${b}${c}${value};`) + css.slice(to);
}
function dropToken(css, name) {
  const cut = lightStart(css);
  const re = new RegExp(`\\s${esc(name)}\\s*:[^;]+;`);
  if (!re.test(css.slice(cut))) throw new Error(`the self-test needs ${name} in the light tokens of site.css and it is gone: update the test`);
  return css.slice(0, cut) + css.slice(cut).replace(re, " ");
}
function setDecl(css, selector, prop, value) {
  const re = new RegExp(`(${esc(selector)}\\s*\\{[^}]*?(?<![\\w-])${esc(prop)}\\s*:\\s*)[^;}]+`);
  if (!re.test(css)) throw new Error(`the self-test needs "${selector} { ${prop}: ... }" in site.css and it is gone: update the test`);
  return css.replace(re, (_m, head) => head + value);
}
function dropAtRule(css, head) {
  const m = new RegExp(`${esc(head)}\\s*\\{`).exec(css);
  if (!m) throw new Error(`the self-test needs "${head} {" in site.css and it is gone: update the test`);
  const start = m.index;
  let depth = 0;
  for (let i = start + m[0].length - 1; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return css.slice(0, start) + css.slice(i + 1);
  }
  throw new Error("unbalanced braces in site.css");
}

/* ═════════════════════════════ the tests ═════════════════════════════ */

describe("the site's files", () => {
  test("assets/docs holds the three pages the site links between, and the stylesheet they share", () => {
    expect(PAGES.map((p) => p.file)).toEqual(expect.arrayContaining(["index.html", "privacy-policy.html", "wishlist.html"]));
    expect(listDocs(".css")).toContain("site.css");
  });
});

describe("links: every local reference leads somewhere", () => {
  test.each(PAGE_ROWS)("%s: files and #anchors exist, also on the other pages", (_file, page) => {
    expect(pageLinkProblems(page)).toEqual([]);
  });
  test.each(CSS_ROWS)("%s: every url() and @import is a file in assets/docs", (file) => {
    expect(cssLinkProblems(file, readDocs(file))).toEqual([]);
  });
  test.each(JS_ROWS)("%s: a fetch() asks for a file that exists", (file) => {
    expect(jsFetchProblems(file, readDocs(file))).toEqual([]);
  });

  describe("the check itself", () => {
    const index = pageOf("index.html");
    const policy = pageOf("privacy-policy.html");
    const run = (page, edit) => pageLinkProblems(variant(page, edit));
    test.each([
      ["an image that is not there", () => run(index, (d) => pick(d, "img").setAttribute("src", "assets/icn.png")), /icn\.png, which is not in assets\/docs/],
      ["a file spelled in the wrong case (Pages is case-sensitive)", () => run(index, (d) => pick(d, "img").setAttribute("src", "assets/Icon.png")), /Icon\.png, which is not in assets\/docs/],
      ["a link to a page that is gone", () => run(index, (d) => pick(d, 'a[href="privacy-policy.html"]').setAttribute("href", "privacy.html")), /privacy\.html/],
      ["a script that is not there", () => run(index, (d) => pick(d, "script[src]").setAttribute("src", "nope.js")), /nope\.js/],
      ["an anchor with no target", () => run(index, (d) => pick(d, 'a[href="#features"]').setAttribute("href", "#featurez")), /#featurez, but nothing on the page/],
      ["an anchor into another page that has no such id", () => run(policy, (d) => pick(d, 'a[href="index.html#new"]').setAttribute("href", "index.html#nope")), /index\.html#nope/],
      ["an icon that is not in the sprite", () => run(index, (d) => pick(d, "use").setAttribute("href", "#i-nope")), /#i-nope/],
      ["an empty href", () => run(index, (d) => pick(d, 'a[href="#install"]').setAttribute("href", "")), /is empty/],
      ["a root-relative URL (leaves /ps-store-enhancer/)", () => run(index, (d) => pick(d, "img").setAttribute("src", "/assets/icon.png")), /starts with \//],
      ["a URL that climbs out of assets/docs", () => run(index, (d) => pick(d, "img").setAttribute("src", "../../README.md")), /outside assets\/docs/],
      ["a url() in a <style> that is not there", () => run(index, (d) => pick(d, "style").append(".x { background: url(assets/gone.png) }")), /gone\.png/],
      ["a url() in a style attribute that is not there", () => run(index, (d) => pick(d, "main").setAttribute("style", "background: url('gone.png')")), /gone\.png/],
      ["a srcset candidate that is not there", () => run(index, (d) => pick(d, "main img").setAttribute("srcset", "assets/screenshot-popup.png 1x, assets/gone@2x.png 2x")), /gone@2x\.png/],
      ["a url() in site.css that is not there", () => cssLinkProblems("site.css", CSS.replace("fonts/rubik-latin-wght-normal.woff2", "fonts/gone.woff2")), /gone\.woff2/],
      ["an @import in site.css of a file that is not there", () => cssLinkProblems("site.css", '@import "gone.css";\n' + CSS), /gone\.css/],
      ["a fetch() of a file that is not there", () => jsFetchProblems("supporters.js", readDocs("supporters.js").replace('"supporters.json"', '"gone.json"')), /gone\.json/]
    ])("catches %s", (_what, problems, re) => flagged(problems(), re));

    test("leaves links to other sites, mail and data: URLs alone", () => {
      const problems = run(index, (d) => {
        pick(d, "main").insertAdjacentHTML("beforeend", '<a href="https://example.com/x">x</a><a href="mailto:a@b.c">m</a><a href="//example.org">p</a><img alt="" width="1" height="1" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">');
      });
      expect(problems).toEqual(pageLinkProblems(index));
    });
  });
});

describe("nothing is loaded from another origin", () => {
  test.each(PAGE_ROWS)("%s: no script, stylesheet, font, image, frame, @import or url() from elsewhere (links to other sites are fine)", (_file, page) => {
    expect(remoteProblems(page)).toEqual([]);
  });
  test.each(CSS_ROWS)("%s: no @import or url() from elsewhere", (file) => {
    expect(cssRemoteProblems(file, readDocs(file))).toEqual([]);
  });
  test.each(JS_ROWS)("%s: no request, beacon or socket to elsewhere", (file) => {
    expect(jsRemoteProblems(file, readDocs(file))).toEqual([]);
  });

  describe("the check itself", () => {
    const index = pageOf("index.html");
    const run = (edit) => remoteProblems(variant(index, edit));
    const inHead = (html) => run((d) => d.head.insertAdjacentHTML("beforeend", html));
    const inBody = (html) => run((d) => pick(d, "main").insertAdjacentHTML("beforeend", html));
    test.each([
      ["a third-party script", () => inHead('<script src="https://cdn.example.com/lib.js"></script>'), /<script src="https:\/\/cdn\.example\.com\/lib\.js"> loads from another origin/],
      ["a web font stylesheet", () => inHead('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Rubik">'), /fonts\.googleapis\.com/],
      ["a protocol-relative stylesheet", () => inHead('<link rel="stylesheet" href="//example.com/a.css">'), /example\.com/],
      ["a preconnect to a font host", () => inHead('<link rel="preconnect" href="https://fonts.gstatic.com">'), /fonts\.gstatic\.com/],
      ["a font preload from elsewhere", () => inHead('<link rel="preload" as="font" href="https://example.com/r.woff2" crossorigin>'), /r\.woff2/],
      ["an icon from elsewhere", () => inHead('<link rel="icon" href="https://example.com/i.png">'), /i\.png/],
      ["a remote image", () => inBody('<img alt="x" width="1" height="1" src="https://example.com/p.png">'), /p\.png/],
      ["a protocol-relative image", () => inBody('<img alt="x" width="1" height="1" src="//example.com/p.png">'), /p\.png/],
      ["a remote srcset candidate", () => inBody('<img alt="x" width="1" height="1" src="assets/icon.png" srcset="https://example.com/p@2x.png 2x">'), /p@2x\.png/],
      ["a frame", () => inBody('<iframe src="https://example.com/embed"></iframe>'), /<iframe/],
      ["a form that posts elsewhere", () => inBody('<form action="https://example.com/collect"></form>'), /<form action/],
      ["an @import in a <style>", () => run((d) => pick(d, "style").append('@import url("https://example.com/x.css");')), /x\.css/],
      ["a remote url() in a <style>", () => run((d) => pick(d, "style").append(".x { background: url(https://example.com/x.png) }")), /x\.png/],
      ["a remote url() in a style attribute", () => run((d) => pick(d, "main").setAttribute("style", "background: url(//example.com/x.png)")), /x\.png/],
      ["a ping attribute", () => inBody('<a href="#top" ping="https://example.com/p">x</a>'), /ping/],
      ["an inline script that fetches elsewhere", () => inBody('<script>fetch("https://example.com/hit")</script>'), /requests a URL on another origin/],
      ["an inline script that sends a beacon", () => inBody("<script>navigator.sendBeacon('/x', 'y')</script>"), /sendBeacon/],
      ["an inline script that sets a remote src", () => inBody('<script>var i = new Image(); i.src = "https://example.com/p.gif";</script>'), /assigns a URL on another origin/],
      ["a stylesheet with a remote @import", () => cssRemoteProblems("site.css", '@import url("https://fonts.googleapis.com/css2?family=Rubik");\n' + CSS), /fonts\.googleapis\.com/],
      ["a stylesheet with a remote url()", () => cssRemoteProblems("site.css", CSS.replace("fonts/rubik-latin-wght-normal.woff2", "https://example.com/r.woff2")), /r\.woff2/],
      ["a script that fetches elsewhere", () => jsRemoteProblems("site.js", readDocs("site.js") + '\nfetch("https://example.com/t");'), /requests a URL on another origin/],
      ["a script that opens a WebSocket", () => jsRemoteProblems("site.js", readDocs("site.js") + '\nnew WebSocket("wss://example.com");'), /WebSocket/]
    ])("catches %s", (_what, problems, re) => flagged(problems(), re));

    test("leaves anchors to other sites alone", () => {
      expect(inBody('<a href="https://example.com/x" target="_blank" rel="noopener">x</a>')).toEqual(remoteProblems(index));
    });
  });
});

describe("the <head>: title, description, Open Graph, viewport, theme colour", () => {
  test.each(PAGE_ROWS)("%s", (_file, page) => {
    expect(metaProblems(page)).toEqual([]);
  });

  test("the shared-wishlist page asks search engines to skip it, which is why it needs no description or Open Graph tags", () => {
    expect(pageOf("wishlist.html").doc.querySelector('meta[name="robots"]').getAttribute("content")).toMatch(/noindex/);
  });
  test("the home page's og:image stays the one the site has always promised", () => {
    // Written out here on purpose: changing the picture's address is a decision, not a side effect of a restyle.
    expect(pageOf("index.html").doc.querySelector('meta[property="og:image"]').getAttribute("content")).toBe("https://drummingbird1.github.io/ps-store-enhancer/assets/og-image.png");
  });

  describe("the check itself", () => {
    const policy = pageOf("privacy-policy.html");
    const wishlist = pageOf("wishlist.html");
    const run = (page, edit) => metaProblems(variant(page, edit));
    const meta = (selector) => (d) => pick(d, `meta[${selector}]`);
    test.each([
      ["a missing title", () => run(policy, (d) => pick(d, "title").remove()), /no <title>/],
      ["an empty title", () => run(policy, (d) => (pick(d, "title").textContent = "  ")), /no <title>/],
      ["a missing charset", () => run(policy, (d) => pick(d, "meta[charset]").remove()), /charset/],
      ["a missing viewport", () => run(policy, (d) => meta('name="viewport"')(d).remove()), /viewport/],
      ["a viewport that forbids zooming", () => run(policy, (d) => meta('name="viewport"')(d).setAttribute("content", "width=device-width, initial-scale=1, user-scalable=no")), /forbids zooming/],
      ["a viewport with maximum-scale=1", () => run(policy, (d) => meta('name="viewport"')(d).setAttribute("content", "width=device-width, initial-scale=1, maximum-scale=1")), /forbids zooming/],
      ["a missing language", () => run(policy, (d) => d.documentElement.removeAttribute("lang")), /lang/],
      ["a missing description", () => run(policy, (d) => meta('name="description"')(d).remove()), /meta description/],
      ["a one-word description", () => run(policy, (d) => meta('name="description"')(d).setAttribute("content", "Privacy")), /meta description/],
      ["a missing og:title", () => run(policy, (d) => meta('property="og:title"')(d).remove()), /og:title/],
      ["a missing og:description", () => run(policy, (d) => meta('property="og:description"')(d).remove()), /og:description/],
      ["a missing og:image", () => run(policy, (d) => meta('property="og:image"')(d).remove()), /no og:image/],
      ["an og:image on another host", () => run(policy, (d) => meta('property="og:image"')(d).setAttribute("content", "https://example.com/og-image.png")), /og:image is https:\/\/example\.com/],
      ["an og:image that is not https", () => run(policy, (d) => meta('property="og:image"')(d).setAttribute("content", "assets/og-image.png")), /og:image is assets/],
      ["an og:url of another page", () => run(policy, (d) => meta('property="og:url"')(d).setAttribute("content", SITE)), /og:url/],
      ["a dark theme-color that is not the page background", () => run(policy, (d) => pick(d, 'meta[name="theme-color"][media*="dark"]').setAttribute("content", "#ffffff")), /theme-color \(dark\)/],
      ["a missing light theme-color", () => run(policy, (d) => pick(d, 'meta[name="theme-color"][media*="light"]').remove()), /no theme-color for the light scheme/],
      ["a missing color-scheme", () => run(policy, (d) => meta('name="color-scheme"')(d).remove()), /color-scheme/],
      ["a wishlist page that is no longer noindex (it would need a description)", () => run(wishlist, (d) => meta('name="robots"')(d).remove()), /meta description/]
    ])("catches %s", (_what, problems, re) => flagged(problems(), re));
  });
});

describe("the document: ids, headings, landmarks, names, shared header and footer", () => {
  test.each(PAGE_ROWS)("%s", (_file, page) => {
    expect(structureProblems(page)).toEqual([]);
  });
  test.each(PAGE_ROWS)("%s: the same bar and footer links as the home page", (_file, page) => {
    expect(chromeProblems(page)).toEqual([]);
  });

  describe("the check itself", () => {
    const index = pageOf("index.html");
    const policy = pageOf("privacy-policy.html");
    const wishlist = pageOf("wishlist.html");
    const run = (page, edit) => structureProblems(variant(page, edit));
    test.each([
      ["a duplicated id", () => run(index, (d) => pick(d, "#features").setAttribute("id", "new")), /2 elements with id="new"/],
      ["an id with a space", () => run(index, (d) => pick(d, "#features").setAttribute("id", "a b")), /empty or has a space/],
      ["an aria-labelledby that points nowhere", () => run(index, (d) => pick(d, "#features").setAttribute("aria-labelledby", "gone")), /aria-labelledby="gone"/],
      ["a second h1", () => run(policy, (d) => pick(d, "#overview h2").insertAdjacentHTML("afterend", "<h1>again</h1>")), /2 <h1>/],
      ["no h1", () => run(policy, (d) => pick(d, "h1").remove()), /0 <h1>/],
      ["no <main>", () => run(policy, (d) => (pick(d, "main").outerHTML = "<div>" + pick(d, "main").innerHTML + "</div>")), /0 <main>/],
      ["no footer", () => run(policy, (d) => pick(d, "body > footer").remove()), /0 top-level <footer>/],
      ["no header nav", () => run(policy, (d) => pick(d, "body > header nav").remove()), /no <nav> in the header/],
      ["a nav without a name", () => run(policy, (d) => pick(d, 'nav[aria-label="On this page"]').removeAttribute("aria-label")), /<nav> without an aria-label/],
      ["a section with no heading", () => run(policy, (d) => pick(d, "#childrens-privacy h2").remove()), /<section id="childrens-privacy"> without a heading/],
      ["a heading level that is skipped", () => run(policy, (d) => pick(d, "#overview h2").replaceWith(Object.assign(d.createElement("h4"), { textContent: "Overview" }))), /jumps from h1 to <h4>/],
      ["a missing skip link", () => run(policy, (d) => pick(d, ".skip-link").remove()), /not the skip link/],
      ["a skip link to the wrong place", () => run(policy, (d) => pick(d, ".skip-link").setAttribute("href", "#overview")), /not the skip link/],
      ["a <main> that cannot take focus", () => run(policy, (d) => pick(d, "main").removeAttribute("tabindex")), /tabindex="-1"/],
      ["a page that does not link site.css", () => run(policy, (d) => pick(d, 'link[href="site.css"]').remove()), /does not link site\.css/],
      ["a link with no name", () => run(policy, (d) => pick(d, "main").insertAdjacentHTML("beforeend", '<a href="#top"><svg aria-hidden="true"></svg></a>')), /with no text or aria-label/],
      ["an svg that is not hidden", () => run(policy, (d) => pick(d, "svg.i").removeAttribute("aria-hidden")), /<svg>/],
      ["target=_blank without noopener", () => run(index, (d) => pick(d, 'a[target="_blank"]').setAttribute("rel", "")), /rel="noopener"/],
      ["Hebrew without dir=rtl", () => run(index, (d) => pick(d, '[lang="he"]').removeAttribute("dir")), /lang="he" is right-to-left/],
      ["a lang that is not a language tag", () => run(index, (d) => pick(d, '[lang="fr"]').setAttribute("lang", "fr fr")), /not a language tag/],
      ["a script that looks up an id the page lost", () => run(wishlist, (d) => pick(d, "#list").remove()), /wishlist-view\.js looks up #list/],
      ["an inline script that looks up an id the page lost", () => run(wishlist, (d) => pick(d, "main").setAttribute("id", "primary")), /an inline script looks up #main/]
    ])("catches %s", (_what, problems, re) => flagged(problems(), re));

    test.each([
      ["a missing section link", () => chromeProblems(variant(wishlist, (d) => pick(d, ".nav-menu li").remove())), /the section links differ/],
      ["a changed footer link", () => chromeProblems(variant(policy, (d) => pick(d, '.site-footer a[href*="ko-fi"]').setAttribute("href", "https://ko-fi.com/other"))), /the footer links differ/],
      ["a different Install button", () => chromeProblems(variant(policy, (d) => pick(d, ".site-header .btn").setAttribute("href", "index.html#privacy"))), /the Install button differ/]
    ])("catches %s", (_what, problems, re) => flagged(problems(), re));
  });
});

describe("images: alt text, size that matches the file, lazy below the fold", () => {
  test.each(PAGE_ROWS)("%s", (_file, page) => {
    expect(imageProblems(page)).toEqual([]);
  });
  test("the home page really has pictures to check (the screenshots)", () => {
    expect(pageOf("index.html").doc.querySelectorAll("main img").length).toBeGreaterThanOrEqual(5);
  });

  describe("the check itself", () => {
    const index = pageOf("index.html");
    const run = (edit) => imageProblems(variant(index, edit));
    test.each([
      ["a missing alt", () => run((d) => pick(d, "#tour img").removeAttribute("alt")), /no alt attribute/],
      ["a file name as alt text", () => run((d) => pick(d, "#tour img").setAttribute("alt", "screenshot-product.png")), /file name for its alt/],
      ["an empty alt on a picture of the page's content", () => run((d) => pick(d, "#tour img").setAttribute("alt", "")), /empty alt/],
      ["a missing width", () => run((d) => pick(d, "#tour img").removeAttribute("width")), /no integer width and height/],
      ["a missing height", () => run((d) => pick(d, "#tour img").removeAttribute("height")), /no integer width and height/],
      ["a size in px units", () => run((d) => pick(d, "#tour img").setAttribute("width", "100%")), /no integer width and height/],
      ["a size of another shape than the file", () => run((d) => pick(d, "#tour img").setAttribute("height", "400")), /a different shape/],
      ["a screenshot that is not lazy", () => run((d) => pick(d, "#tour img").removeAttribute("loading")), /not loading="lazy"/],
      ["a footer picture that is not lazy", () => run((d) => pick(d, ".site-footer img").removeAttribute("loading")), /not loading="lazy"/]
    ])("catches %s", (_what, problems, re) => flagged(problems(), re));
  });
});

describe("colour: both themes keep 4.5:1 for text (3:1 for large headlines, icons and the focus ring)", () => {
  test("the tokens of both themes can be read from site.css, and the light theme differs from the dark one", () => {
    expect(THEMES.dark["--bg"]).toBe("#070b16");
    expect(THEMES.light["--bg"]).toBe("#eef2fa");
    expect(Object.keys(THEMES.lightOnly).length).toBeGreaterThan(20);
    expect(THEMES.dark["--text"]).not.toBe(THEMES.light["--text"]);
  });
  test("every text token, surface, tint, component, the gradient headline and the focus ring", () => {
    expect(contrastProblems(CSS)).toEqual([]);
  });
  test.each(PAGE_ROWS)("%s: text colours in its own <style> are tokens, and each colour + background pair has contrast", (_file, page) => {
    const css = [...page.doc.querySelectorAll("style")].map((s) => s.textContent).join("\n");
    expect(styleProblems(`${page.file} <style>`, css)).toEqual([]);
  });
  test("site.css: its own rules obey the same (colours are tokens, each colour + background pair has contrast)", () => {
    expect(styleProblems("site.css", CSS)).toEqual([]);
  });

  describe("the check itself", () => {
    test.each([
      ["a dim text token that is too dark on the dark theme", () => contrastProblems(setToken(CSS, "dark", "--dim", "#566075")), /dark: --dim #566075 on the page/],
      ["a dim text token that is too light on the light theme", () => contrastProblems(setToken(CSS, "light", "--dim", "#8f9bb5")), /light: --dim #8f9bb5 on the page/],
      ["an accent that fails on the glass panel", () => contrastProblems(setToken(CSS, "light", "--accent", "#5a8fe0")), /light: --accent #5a8fe0 on glass/],
      ["a page background that moves under the text", () => contrastProblems(setToken(CSS, "dark", "--bg", "#8a93a8")), /dark: --text/],
      ["a glass fallback that turns pale on the dark theme", () => contrastProblems(setToken(CSS, "dark", "--glass-solid", "#d8def0")), /dark: .* on the solid glass fallback/],
      ["a top bar that turns pale on the dark theme", () => contrastProblems(setToken(CSS, "dark", "--bar-solid", "#cfd6ea")), /dark: .* on the solid top bar fallback/],
      ["a tint that swallows its text (good on good-soft)", () => contrastProblems(setToken(CSS, "light", "--good-soft", "rgba(9,104,67,.8)")), /light: --good on --good-soft/],
      ["a primary button whose text is too faint", () => contrastProblems(setDecl(CSS, ".btn-primary", "color", "#8aa6d6")), /the primary button/],
      ["a badge whose colour is not readable on its tint", () => contrastProblems(setDecl(CSS, ".badge-soon", "color", "var(--bg)")), /the Coming soon badge/],
      ["a callout that loses its colour", () => contrastProblems(setDecl(CSS, ".callout", "color", "#889")), /a callout/],
      ["a rule that stops declaring its colour", () => contrastProblems(CSS.replace(/\.eyebrow\s*\{[^}]*\}/, ".eyebrow { display: inline-block; }")), /declares no colour in site\.css/],
      ["a gradient headline too pale on the light theme", () => contrastProblems(setToken(CSS, "light", "--grad", "linear-gradient(135deg, #7aa8ff, #9fc0ff)")), /light: a stop of --grad/],
      ["a focus ring in a colour that blends into the page", () => contrastProblems(setDecl(CSS, ":focus-visible", "outline", "3px solid #1a2744")), /the focus ring/],
      ["a focus ring that is a hairline", () => contrastProblems(setDecl(CSS, ":focus-visible", "outline", "1px solid var(--accent)")), /no outline of 2px or more/],
      ["a token the light theme forgot", () => contrastProblems(dropToken(CSS, "--dim")), /light: the light theme does not redefine --dim/],
      ["no light theme at all", () => contrastProblems(dropAtRule(CSS, "@media (prefers-color-scheme: light)")), /does not redefine/]
    ])("catches %s", (_what, problems, re) => flagged(problems(), re));

    test.each([
      ["a text colour written as a hex literal", ".x { color: #777 }", /sets color: #777/],
      ["a colour + background pair with too little contrast", ".x { color: var(--dim); background: var(--accent) }", /\.x \(var\(--dim\) on var\(--accent\)\)/],
      ["a hovered chip whose colour is lost on its tint", ".x:hover { background: var(--accent-soft); color: var(--bg); }", /\.x:hover/]
    ])("catches %s in a page's <style>", (_what, css, re) => flagged(styleProblems("a page", css), re));

    test("leaves tokens, inherit, transparent and system colours in print and forced-colors blocks alone", () => {
      const css = ".a { color: var(--text); background: var(--panel2) } .b { color: inherit } .c { color: transparent } @media print { .d { color: #000; background: #fff } } @media (forced-colors: active) { .e { color: CanvasText; background: Canvas } }";
      expect(styleProblems("a page", css)).toEqual([]);
    });
  });
});

describe("site.css: focus, reduced motion and forced colours stay handled", () => {
  test("the guards hold", () => {
    expect(guardProblems(CSS)).toEqual([]);
  });

  describe("the check itself", () => {
    test.each([
      ["a reduced-motion block that is gone", () => guardProblems(dropAtRule(CSS, "@media (prefers-reduced-motion: reduce)")), /prefers-reduced-motion: reduce/],
      ["smooth scrolling for everyone", () => guardProblems(CSS.replace("@media (prefers-reduced-motion: no-preference) {", "@media (min-width: 0px) {")), /scrolls smoothly outside/],
      ["a forced-colors block that is gone", () => guardProblems(dropAtRule(CSS, "@media (forced-colors: active)")), /no @media \(forced-colors: active\) block/],
      ["gradient text that stays transparent under forced colors", () => guardProblems(CSS.replace("-webkit-text-fill-color: currentColor; color: CanvasText;", "")), /\.grad makes its text transparent/],
      ["a glass panel with no border under forced colors", () => guardProblems(CSS.replace(".glass, .card, .chip, .lang-tag, .badge, .callout, .nav-menu > summary { border: 1px solid CanvasText; }", "")), /forced-colors mode gives \.glass no border/],
      ["a focus ring removed", () => guardProblems(CSS + "\n:focus-visible { outline: none; }"), /removes the focus ring/]
    ])("catches %s", (_what, problems, re) => flagged(problems(), re));
  });
});

describe("fonts: Rubik is bundled, listed, licensed and the same as the extension's", () => {
  const real = () => ({ css: CSS, files: dirBytes(path.join(DOCS, "fonts")), ext: dirBytes(EXT_FONTS) });
  test("every @font-face names a real WOFF2 file; no file is unused; OFL.txt is there and is the extension's", () => {
    expect(fontProblems(real())).toEqual([]);
  });
  test.each(PAGE_ROWS)("%s: the footer credits Rubik with a link to its licence, and the font preload has crossorigin", (_file, page) => {
    expect(fontLinkProblems(page)).toEqual([]);
  });

  describe("the check itself", () => {
    const woff = (name) => `rubik-${name}-wght-normal.woff2`;
    const without = (obj, key) => Object.fromEntries(Object.entries(obj).filter(([k]) => k !== key));
    test.each([
      ["a font file that is gone", () => ((r) => fontProblems({ ...r, files: without(r.files, woff("hebrew")) }))(real()), /fonts\/rubik-hebrew-wght-normal\.woff2 is not in assets\/docs/],
      ["a font file that is shipped but not used", () => ((r) => fontProblems({ ...r, files: { ...r.files, "stray.woff2": Buffer.from("wOF2....") } }))(real()), /stray\.woff2 is shipped but no @font-face names it/],
      ["a font file that is not a font (an HTML 404 saved as .woff2)", () => ((r) => fontProblems({ ...r, files: { ...r.files, [woff("latin")]: Buffer.from("<html>404</html>") } }))(real()), /is not a WOFF2 file/],
      ["a font file that differs from the extension's", () => ((r) => fontProblems({ ...r, files: { ...r.files, [woff("latin")]: Buffer.concat([r.files[woff("latin")], Buffer.from([0])]) } }))(real()), /differs from extension\/fonts/],
      ["a missing licence", () => ((r) => fontProblems({ ...r, files: without(r.files, "OFL.txt") }))(real()), /OFL\.txt .* is missing or empty/],
      ["a licence that is not the OFL", () => ((r) => fontProblems({ ...r, files: { ...r.files, "OFL.txt": Buffer.from("all rights reserved") } }))(real()), /not the Rubik copy of the SIL Open Font License/],
      ["a font URL on another host", () => fontProblems({ ...real(), css: CSS.replace("url(fonts/rubik-latin-wght-normal.woff2)", "url(https://example.com/fonts/rubik-latin-wght-normal.woff2)") }), /not fonts\/<name>\.woff2/],
      ["a font that is not variable", () => fontProblems({ ...real(), css: CSS.replace("font-weight: 300 900;", "font-weight: 400;") }), /variable range 300 900/],
      ["a font that blocks text while it loads", () => fontProblems({ ...real(), css: CSS.replace("font-display: swap;", "font-display: block;") }), /font-display is not swap/],
      ["a subset with no unicode-range", () => fontProblems({ ...real(), css: CSS.replace(/unicode-range: U\+0301[^;]*;/, "") }), /no unicode-range/],
      ["fewer than five faces", () => fontProblems({ ...real(), css: dropAtRule(CSS, "@font-face") }), /declares 4 @font-face rules/]
    ])("catches %s", (_what, problems, re) => flagged(problems(), re));

    const index = pageOf("index.html");
    test.each([
      ["a footer without the licence link", () => fontLinkProblems(variant(index, (d) => pick(d, '.site-footer a[href="fonts/OFL.txt"]').setAttribute("href", "fonts/"))), /does not credit Rubik/],
      ["a font preload without crossorigin", () => fontLinkProblems(variant(index, (d) => pick(d, 'link[rel="preload"]').removeAttribute("crossorigin"))), /no crossorigin/]
    ])("catches %s", (_what, problems, re) => flagged(problems(), re));
  });
});

describe("the install section says Coming soon exactly as long as there is no Chrome Web Store link", () => {
  // While there is no store link, #install says "Coming soon" and offers the GitHub release. The day a link goes in, this test
  // names every "coming soon / not live yet" wording still on the page, until the install section is rewritten for a live listing.
  test("the real pages: no store link yet and #install says Coming soon, or a store link is in and the Coming soon wording is gone", () => {
    expect(installProblems(PAGES)).toEqual([]);
  });

  describe("the check itself", () => {
    // Small stand-ins for the home page, so these cases hold both before and after the owner makes the swap in the real page.
    const LISTING = "https://chromewebstore.google.com/detail/ps-store-enhancer/abcdefghijklmnopabcdefghijklmnop";
    const RELEASE = '<a href="https://github.com/DrummingBird1/ps-store-enhancer/releases/latest">Open the latest release</a>';
    const NOT_LIVE_LEDE = "The Chrome Web Store listing is not live yet. Until it is, install the extension from the GitHub release.";
    const SOON_CARD = '<div id="store-link" data-store-pending><span class="badge badge-soon" data-store-pending>Coming soon</span><p>The listing is not live yet, so there is no store link to give you.</p></div>';
    const LIVE_LINK = (href = LISTING) => `<a id="store-link" class="btn btn-primary" href="${href}" target="_blank" rel="noopener">Add to Chrome</a>`;
    const home = ({ lede, cards, outside = "" }) => ({ file: "index.html", doc: parse(`<!DOCTYPE html><title>t</title><body><main>${outside}<section id="install"><p class="lede">${lede}</p>${cards}</section></main></body>`) });
    const other = (html) => ({ file: "privacy-policy.html", doc: parse(`<!DOCTYPE html><title>t</title><body><main>${html}</main></body>`) });
    const BEFORE = home({ lede: NOT_LIVE_LEDE, cards: SOON_CARD + RELEASE });
    const AFTER = home({ lede: "Add PS Store Enhancer to Chrome in one click.", cards: LIVE_LINK() + RELEASE });

    test("before the listing: Coming soon and the GitHub release are enough", () => {
      expect(installProblems([BEFORE, other("<p>Nothing about stores.</p>")])).toEqual([]);
    });
    test("after the listing: the link in, Coming soon and every not-live sentence out", () => {
      expect(installProblems([AFTER, other("<p>Nothing about stores.</p>")])).toEqual([]);
    });

    test.each([
      ["a store link added while #install still says Coming soon", () => installProblems([home({ lede: NOT_LIVE_LEDE, cards: SOON_CARD + LIVE_LINK().replace('id="store-link" ', "") + RELEASE })]), /a Chrome Web Store link was added .* still says .*"coming soon"/],
      ["the card swapped for a live link but the lede still saying it is not live", () => installProblems([home({ lede: NOT_LIVE_LEDE, cards: LIVE_LINK() + RELEASE })]), /still says "not live yet"/],
      ["a Coming soon badge left next to a live link", () => installProblems([home({ lede: "Add it.", cards: LIVE_LINK() + '<span class="badge badge-soon">soon</span>' + RELEASE })]), /still says a \.badge-soon badge/],
      ["a marked element left after the swap (even one with no wording the text check knows)", () => installProblems([home({ lede: "Add it.", cards: LIVE_LINK() + '<p data-store-pending>Check back later.</p>' + RELEASE })]), /still marked data-store-pending.*<p>/],
      ["the whole #store-link card left marked after the swap", () => installProblems([home({ lede: "Add it.", cards: '<div id="store-link" data-store-pending>' + LIVE_LINK().replace('id="store-link" ', "") + "</div>" + RELEASE })]), /still marked data-store-pending.*id="store-link"/],
      ["a marked element on another page after the swap", () => installProblems([AFTER, other('<p data-store-pending>Not live yet.</p>')]), /privacy-policy\.html: <p>/],
      ["two primary buttons in #install after the swap", () => installProblems([home({ lede: "Add it.", cards: LIVE_LINK() + RELEASE.replace("<a ", '<a class="btn btn-primary" ') })]), /2 primary buttons/],
      ["the markers lost while there is still no store link", () => installProblems([home({ lede: NOT_LIVE_LEDE, cards: SOON_CARD.replace(/ data-store-pending/g, "") + RELEASE })]), /nothing is marked data-store-pending/],
      ["a store link that is a placeholder", () => installProblems([home({ lede: "Add it.", cards: LIVE_LINK("https://chromewebstore.google.com/detail/THE-STORE-URL") + RELEASE })]), /is not a listing URL/],
      ["a store link outside the install section", () => installProblems([home({ lede: "Add it.", cards: RELEASE, outside: LIVE_LINK() })]), /is not inside #install/],
      ["a store link only in another page's footer", () => installProblems([BEFORE, other(`<a href="${LISTING}">store</a>`)]), /is not inside #install/],
      ["Coming soon removed with no store link to replace it", () => installProblems([home({ lede: "Install it.", cards: '<div id="store-link"><p>Install it.</p></div>' + RELEASE })]), /must say "Coming soon"/],
      ["a page that claims the extension is in the store without a link", () => installProblems([BEFORE, other("<p>Available now in the Chrome Web Store.</p>")]), /privacy-policy\.html says "Available now in the Chrome Web Store"/],
      ["an Add to Chrome button with no link behind it", () => installProblems([home({ lede: NOT_LIVE_LEDE, cards: SOON_CARD + '<button>Add to Chrome</button>' + RELEASE })]), /says "Add to Chrome"/],
      ["no GitHub release to fall back on", () => installProblems([home({ lede: NOT_LIVE_LEDE, cards: SOON_CARD })]), /offer the GitHub release/],
      ["no install section at all", () => installProblems([{ file: "index.html", doc: parse("<!DOCTYPE html><title>t</title><body><main></main></body>") }]), /no #install section/]
    ])("catches %s", (_what, problems, re) => flagged(problems(), re));
  });
});

/* ── the scripts, really run ── */
/**
 * A page with its scripts running in jsdom: every <script src="x.js"> is replaced by the file's own text (so the page needs no
 * network), the window has requestAnimationFrame (pretendToBeVisual), IntersectionObserver is a stub (jsdom has none, and
 * site.js stops early without it) and an uncaught error in any script lands in `errors`.
 * jsdom has no layout: scrollHeight is 0 and scrollY is 0, so the window counts as "at the bottom" unless a test says otherwise.
 */
function boot(file, { hash = "", edit = () => {}, scripts = {}, supporters, atTop = false } = {}) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (e) => errors.push(e.message));
  // The scripts the page loads by address are run inline (jsdom does not fetch them): done on the DOM, not by matching tags in the serialized text.
  const doc = variant(pageOf(file), edit).doc;
  for (const el of doc.querySelectorAll("script[src]")) {
    const src = el.getAttribute("src");
    el.removeAttribute("src");
    el.textContent = scripts[src] ?? readDocs(src);
  }
  const html = serialize(doc);
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    url: SITE + file + hash,
    virtualConsole,
    beforeParse(w) {
      w.IntersectionObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      };
      w.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ supporters: supporters || [] }) }); // supporters.json
      w.TextDecoder = TextDecoder; // jsdom's window has none; the wishlist viewer decodes the link with it
      if (atTop) {
        Object.defineProperty(w.Element.prototype, "scrollHeight", { configurable: true, get: () => 5000 });
        Object.defineProperty(w, "scrollY", { configurable: true, value: 0 });
      }
    }
  });
  const { window } = dom;
  const frame = () => new Promise((resolve) => window.requestAnimationFrame(() => setTimeout(resolve, 0)));
  const scroll = async () => {
    window.dispatchEvent(new window.Event("scroll"));
    await frame();
  };
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  // scripts that wait for DOMContentLoaded (the wishlist list) have run once the window has loaded
  const ready = new Promise((resolve) => (window.document.readyState === "complete" ? resolve() : window.addEventListener("load", () => resolve())));
  return { window, document: window.document, errors, frame, scroll, wait, ready, close: () => window.close() };
}
const withoutLine = (js, re) => {
  if (!re.test(js)) throw new Error(`the self-test needs a line matching ${re} in the script and it is gone: update the test`);
  return js.replace(re, "");
};
const shareFragment = (items) => "#" + Buffer.from(JSON.stringify({ v: 1, i: items })).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

describe("site.js runs on every page that loads it", () => {
  const SITE_JS = readDocs("site.js");
  const LOADS_SITE_JS = PAGES.filter((p) => p.doc.querySelector('script[src="site.js"]')).map((p) => [p.file]);

  test("all three pages load it", () => {
    expect(LOADS_SITE_JS.map(([f]) => f).sort()).toEqual(["index.html", "privacy-policy.html", "wishlist.html"]);
  });
  test.each(LOADS_SITE_JS)("%s: loading, scrolling to the bottom and pressing Escape throw nothing", async (file) => {
    const page = boot(file);
    try {
      await page.scroll();
      page.document.dispatchEvent(new page.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await page.scroll();
      expect(page.errors).toEqual([]);
    } finally {
      page.close();
    }
  });
  test("the inner pages have no section links of their own, so the script marks nothing there", async () => {
    for (const file of ["privacy-policy.html", "wishlist.html"]) {
      const page = boot(file);
      await page.scroll();
      expect(page.document.querySelectorAll(".nav-menu [aria-current]").length).toBe(0);
      page.close();
    }
  });

  describe("the home page", () => {
    const open = (page) => {
      const menu = page.document.querySelector(".nav-menu");
      menu.open = true;
      return menu;
    };
    test("the last section's link is marked at the bottom of the page", async () => {
      const page = boot("index.html");
      await page.scroll();
      const current = [...page.document.querySelectorAll(".nav-menu a[aria-current]")];
      expect(current.map((a) => a.getAttribute("href"))).toEqual(["#support"]);
      expect(current[0].getAttribute("aria-current")).toBe("location");
      expect(page.errors).toEqual([]);
      page.close();
    });
    test("near the top of the page no section link is current", async () => {
      const page = boot("index.html", { atTop: true });
      page.document.querySelector('.nav-menu a[href="#new"]').setAttribute("aria-current", "location");
      await page.scroll();
      expect(page.document.querySelectorAll(".nav-menu [aria-current]").length).toBe(0);
      page.close();
    });
    test("choosing a link closes the menu", () => {
      const page = boot("index.html");
      const menu = open(page);
      menu.querySelector('a[href="#features"]').dispatchEvent(new page.window.MouseEvent("click", { bubbles: true, cancelable: true }));
      expect(menu.open).toBe(false);
      page.close();
    });
    test("Escape closes the menu and puts the focus back on its button", () => {
      const page = boot("index.html");
      const menu = open(page);
      page.document.dispatchEvent(new page.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      expect(menu.open).toBe(false);
      expect(page.document.activeElement).toBe(menu.querySelector("summary"));
      page.close();
    });
    test("a click outside the menu closes it, a click inside it (not on a link) does not", () => {
      const page = boot("index.html");
      const menu = open(page);
      menu.querySelector("ul").dispatchEvent(new page.window.MouseEvent("click", { bubbles: true }));
      expect(menu.open).toBe(true);
      page.document.querySelector("main").dispatchEvent(new page.window.MouseEvent("click", { bubbles: true }));
      expect(menu.open).toBe(false);
      page.close();
    });
  });

  describe("the check itself", () => {
    test("without the guard for pages that have no section links, the script throws on the inner pages", async () => {
      const broken = withoutLine(SITE_JS, /^[ \t]*if \(!ids\.length\) return;.*\r?\n/m);
      for (const file of ["privacy-policy.html", "wishlist.html"]) {
        const page = boot(file, { scripts: { "site.js": broken } });
        await page.scroll();
        flagged(page.errors, /setAttribute/);
        page.close();
      }
    });
    test("a script that throws while loading is reported", () => {
      const page = boot("index.html", { scripts: { "site.js": "throw new Error('boom');" } });
      flagged(page.errors, /boom/);
      page.close();
    });
  });
});

describe("the wishlist page: the list survives the skip link", () => {
  const LIST = shareFragment([{ n: "Hades", p: 9.99 }, { n: "Celeste", p: 4.5 }]);
  const names = (page) => [...page.document.querySelectorAll("#list li a")].map((a) => a.textContent);

  test("the shared list is drawn from the link", async () => {
    const page = boot("wishlist.html", { hash: LIST });
    await page.ready;
    expect(names(page)).toEqual(["Hades", "Celeste"]);
    expect(page.document.getElementById("empty").hidden).toBe(true);
    expect(page.errors).toEqual([]);
    page.close();
  });
  test("a click on the skip link moves the focus to <main> and leaves the link's #fragment, and with it the list, alone", async () => {
    const page = boot("wishlist.html", { hash: LIST });
    await page.ready;
    const click = new page.window.MouseEvent("click", { bubbles: true, cancelable: true });
    page.document.querySelector(".skip-link").dispatchEvent(click);
    await page.wait(20);
    expect(click.defaultPrevented).toBe(true);
    expect(page.window.location.hash).toBe(LIST);
    expect(page.document.activeElement).toBe(page.document.getElementById("main"));
    expect(names(page)).toEqual(["Hades", "Celeste"]);
    page.close();
  });
  test("a page with no list in its link says so", async () => {
    const page = boot("wishlist.html");
    await page.ready;
    expect(page.document.getElementById("empty").hidden).toBe(false);
    page.close();
  });
  test("the check itself: without its inline script the skip link follows #main and the list is gone", async () => {
    const page = boot("wishlist.html", { hash: LIST, edit: (d) => d.querySelectorAll("script:not([src])").forEach((s) => s.remove()) });
    await page.ready;
    page.document.querySelector(".skip-link").dispatchEvent(new page.window.MouseEvent("click", { bubbles: true, cancelable: true }));
    await page.wait(50);
    expect(page.window.location.hash).toBe("#main");
    expect(names(page)).toEqual([]);
    page.close();
  });
  test("a game name in Hebrew or Arabic takes the direction of its own letters and starts on its own side", () => {
    const css = [...pageOf("wishlist.html").doc.querySelectorAll("style")].map((s) => s.textContent).join("\n");
    const row = declared(parseRules(css), "#list li a");
    expect(row["unicode-bidi"]).toBe("plaintext");
    expect(row["text-align"]).toBe("start");
  });
});

describe("supporters: names from supporters.json are shown as chips that wrap", () => {
  const render = async (names) => {
    const page = boot("index.html", { supporters: names });
    await page.wait(20);
    return page;
  };
  test("a 60-character name with no spaces, a longer one and a blank one: the wall opens with the real names, cut at 60", async () => {
    const page = await render(["W".repeat(60), "Q".repeat(80), "   ", 42, "Ann"]);
    const chips = [...page.document.querySelectorAll("#supporters-list .lang-tag")];
    expect(chips.map((c) => c.textContent.length)).toEqual([60, 60, 3]);
    expect(page.document.getElementById("supporters").hidden).toBe(false);
    expect(page.errors).toEqual([]);
    page.close();
  });
  test("a name is text, never markup", async () => {
    const page = await render(["<img src=x onerror=alert(1)>"]);
    expect(page.document.querySelectorAll("#supporters-list img").length).toBe(0);
    expect(page.document.querySelector("#supporters-list .lang-tag").textContent).toBe("<img src=x onerror=alert(1)>");
    page.close();
  });
  test("with no names the wall stays hidden", async () => {
    const page = await render([]);
    expect(page.document.getElementById("supporters").hidden).toBe(true);
    page.close();
  });

  /** jsdom has no layout, so the guard for a long name is read from the stylesheet: a chip may shrink, never exceeds its row, and breaks inside a word when it must. */
  function chipProblems(css) {
    const chip = declared(parseRules(css), ".lang-tag");
    const problems = [];
    if (chip["max-width"] !== "100%") problems.push(`.chip, .lang-tag has max-width: ${chip["max-width"]} (it needs 100%)`);
    if (!/^0(?:px)?$/.test(chip["min-width"] || "")) problems.push(`.chip, .lang-tag has min-width: ${chip["min-width"]} (it needs 0)`);
    if (!/^(?:anywhere|break-word)$/.test(chip["overflow-wrap"] || "")) problems.push("a .chip or .lang-tag with a long name that has no spaces would widen the page (it needs overflow-wrap: anywhere)");
    return problems;
  }
  test("site.css lets a chip wrap a long name", () => {
    expect(chipProblems(CSS)).toEqual([]);
  });
  test.each([
    ["no max-width", setDecl(CSS, ".chip, .lang-tag", "max-width", "none"), /max-width/],
    ["no min-width", setDecl(CSS, ".chip, .lang-tag", "min-width", "auto"), /min-width/],
    ["no wrapping inside a word", setDecl(CSS, ".chip, .lang-tag", "overflow-wrap", "normal"), /widen the page/]
  ])("the check itself: a chip with %s is caught", (_what, css, re) => flagged(chipProblems(css), re));
});

describe("site.css: the open menu scrolls inside itself on a short screen", () => {
  const menuProblems = (css) => {
    const rules = parseRules(css);
    const open = declared(rules, ".nav-menu[open] ul");
    const problems = [];
    if (!/calc\(100d?vh - var\(--bar-h\)/.test(open["max-height"] || "")) problems.push(`.nav-menu[open] ul has max-height: ${open["max-height"]} (it needs the viewport minus the bar)`);
    if (!/^(?:auto|scroll)$/.test(open["overflow-y"] || open.overflow || "")) problems.push("the open menu does not scroll (overflow-y: auto)");
    if (open["overscroll-behavior"] !== "contain") problems.push("scrolling the open menu would scroll the page behind it (overscroll-behavior: contain)");
    const wide = declared(rules, ".nav-menu[open] ul", (at) => at.some((a) => /min-width:\s*960px/.test(a)));
    if (wide["max-height"] !== "none") problems.push("the inline menu on wide screens keeps the dropdown's max-height");
    return problems;
  };
  test("max-height, overflow and overscroll are set, and the wide inline row is unaffected", () => {
    expect(menuProblems(CSS)).toEqual([]);
  });
  test.each([
    ["no max-height", CSS.replace(/ {2}max-height: calc\(100vh[^;]*;\n/, "").replace(/ {2}max-height: calc\(100dvh[^;]*;\n/, ""), /max-height/],
    ["no scrolling", CSS.replace("overflow-y: auto; overscroll-behavior: contain;", "overscroll-behavior: contain;"), /does not scroll/],
    ["no overscroll containment", CSS.replace("overflow-y: auto; overscroll-behavior: contain;", "overflow-y: auto;"), /page behind/]
  ])("the check itself: a menu with %s is caught", (_what, css, re) => flagged(menuProblems(css), re));
});

describe("words in quotation marks are the extension's real strings", () => {
  // “Like this” on the home page and the wishlist page names something the visitor will see in the extension: it has to be the
  // English string of extension/_locales/en/messages.json (a $PLACEHOLDER$ stands for any text, so a sale's end date can be an
  // example). The privacy policy's wording is pinned to an older commit and is checked by the test below instead.
  const MESSAGES = Object.values(JSON.parse(fs.readFileSync(path.join(REPO, "extension", "_locales", "en", "messages.json"), "utf8"))).map((m) => m.message);
  // A quote has to be a WHOLE message or a whole sentence of one (anchored): an unanchored match would let a paraphrase through
  // as soon as it contains some short message ("No", "Add", "Price", "games"...).
  const MESSAGE_RES = MESSAGES.flatMap((m) => [m, ...m.split(/(?<=[.!?])\s+/)]).map((m) => new RegExp("^" + m.split(/\$[A-Z0-9_]+\$/).map((part) => esc(part)).join(".+") + "$"));
  const quotedProblems = ({ file, doc }) => {
    const root = doc.querySelector("main");
    const quotes = [...text(root).matchAll(/“([^”]+)”/g)].map((m) => m[1]);
    return quotes.filter((q) => !MESSAGE_RES.some((re) => re.test(q))).map((q) => `${file}: “${q}” is not a string of the extension (check extension/_locales/en/messages.json, or drop the quotation marks)`);
  };
  test.each(PAGE_ROWS.filter(([file]) => file !== "privacy-policy.html"))("%s", (_file, page) => {
    expect(quotedProblems(page)).toEqual([]);
  });
  test("the home page really quotes a few of them", () => {
    expect([...text(pageOf("index.html").doc.querySelector("main")).matchAll(/“/g)].length).toBeGreaterThanOrEqual(8);
  });
  test("the check itself: a paraphrase, a lower-cased label and a shortened label are caught; the real strings and a dated example are not", () => {
    const index = pageOf("index.html");
    const run = (html) => quotedProblems(variant(index, (d) => pick(d, "main").insertAdjacentHTML("beforeend", html)));
    flagged(run("<p>It says “not enough history yet”.</p>"), /not enough history yet/);
    flagged(run("<p>The “Hide add-ons” filter</p>"), /Hide add-ons/);
    flagged(run("<p>A “near the all-time low” flag</p>"), /near the all-time low/);
    // paraphrases that merely CONTAIN a short real message ("No", "Add", "games", "Price")
    flagged(run("<p>“Not enough history yet”</p>"), /Not enough history yet/);
    flagged(run("<p>The “Hide Add-ons” filter</p>"), /Hide Add-ons/);
    flagged(run("<p>“Hide games you own”</p>"), /Hide games you own/);
    flagged(run("<p>“Near the all-time Price low”</p>"), /Near the all-time Price low/);
    expect(run("<p>“Report a problem”, “Offer ends Mar 3 (tomorrow)” and “Hide DLC &amp; Expansions”</p>")).toEqual(quotedProblems(index));
  });
});

describe("the privacy policy keeps its wording through the restyle", () => {
  const policy = pageOf("privacy-policy.html");
  const baselineHtml = baselinePolicy();
  // The baseline is a pinned commit, not HEAD: once the restyle is committed, HEAD holds the new page and would prove nothing.
  // If the wording is changed on purpose later, point POLICY_BASELINE at a commit that has the new wording.
  // A shallow clone (the CI checkout) has no history to read it from: the two git tests are then skipped, the rest still run.
  const fromGit = baselineHtml ? test : test.skip;

  fromGit(`the text equals the text at ${POLICY_BASELINE.slice(0, 7)} (tags stripped, whitespace collapsed; only the lock emoji, "Back to home" and the contents list differ)`, () => {
    expect(policyProblems(policy.doc, parse(baselineHtml))).toEqual([]);
  });
  fromGit("the baseline is the old plain page (no <main>, no site bar), so the comparison above is not the page against itself", () => {
    const old = parse(baselineHtml);
    expect(old.querySelector("main")).toBeNull();
    expect(old.querySelector(".site-header")).toBeNull();
    expect(wordingOf(old).length).toBeGreaterThan(8000);
  });

  describe("the check itself", () => {
    const edited = (edit) => variant(policy, edit).doc;
    test.each([
      ["a word changed in a paragraph", () => policyProblems(edited((d) => (pick(d, "#overview p").textContent = pick(d, "#overview p").textContent.replace(/\b(\w+)\b/, "$1x"))), policy.doc), /changed at character/],
      ["a sentence added", () => policyProblems(edited((d) => pick(d, "#childrens-privacy").insertAdjacentHTML("beforeend", "<p>We also sell your data.</p>")), policy.doc), /changed at character/],
      ["a table row removed", () => policyProblems(edited((d) => pick(d, "#data-we-collect tbody tr").remove()), policy.doc), /changed at character/],
      ["a section removed", () => policyProblems(edited((d) => pick(d, "#fonts").remove()), policy.doc), /changed at character/],
      ["a permission renamed in a table cell", () => policyProblems(edited((d) => (pick(d, "#permissions .badge").textContent = "history")), policy.doc), /changed at character/],
      ["the date changed", () => policyProblems(edited((d) => (pick(d, ".subtitle").textContent = pick(d, ".subtitle").textContent.replace(/\d{4}/, "1999"))), policy.doc), /1999/],
      ["text hidden by CSS but still in the page", () => policyProblems(edited((d) => pick(d, "#contact").insertAdjacentHTML("beforeend", '<p hidden>Extra clause.</p>')), policy.doc), /changed at character/]
    ])("catches %s", (_what, problems, re) => flagged(problems(), re));

    test("ignores what the restyle adds around the words: the back links, the contents list and the lock emoji", () => {
      const doc = edited((d) => {
        pick(d, ".back-link").textContent = "Home";
        pick(d, 'nav[aria-label="On this page"]').insertAdjacentHTML("beforeend", "<p>Jump to a section</p>");
        pick(d, "h1").prepend("\u{1F512} ");
      });
      expect(policyProblems(doc, policy.doc)).toEqual([]);
    });
    test("compares an old-style page (the whole body) with the new one (the main content)", () => {
      const old = parse("<!DOCTYPE html><title>t</title><style>h1{color:red}</style><body><div><h1>\u{1F512} Title</h1><p>Some <strong>words</strong> here.</p></div><script>1</script></body>");
      const now = parse('<!DOCTYPE html><title>t</title><body><header>Site bar</header><main><a class="back-link" href="#">Back</a><h1>Title</h1><nav aria-label="On this page"><a href="#a">Jump</a></nav><p>Some <strong>words</strong>\n here.</p></main></body>');
      expect(policyProblems(now, old)).toEqual([]);
      now.querySelector("p").textContent = "Some words there.";
      flagged(policyProblems(now, old), /changed at character/);
    });
  });
});
