/**
 * PS Store Enhancer — Pure, side-effect-free title helpers (matching / classification).
 *
 * Defined once here so they can be unit-tested in Node (via `require`) AND used in the
 * service worker (via `importScripts`) and the content script. Keep this file free of
 * `chrome.*` or DOM APIs.
 *
 * Matching philosophy: a wrong match is worse than no match. Two titles are "the same
 * game" only when their normalized forms are equal, or equal once a trailing edition
 * qualifier ("Deluxe Edition", "GOTY", "Director's Cut"…) is removed. Any other extra
 * words (a sequel number, a subtitle, "Soundtrack", an expansion name) mean a different
 * product, so the candidate is rejected.
 */
(function (root) {
  "use strict";

  const ROMAN = {
    ii: "2", iii: "3", iv: "4", vi: "6", vii: "7", viii: "8", ix: "9",
    xi: "11", xii: "12", xiii: "13", xiv: "14", xv: "15", xvi: "16"
  };

  /**
   * Canonical comparison form of a game title: case, diacritics, ™®©, every kind of
   * apostrophe/quote/dash, punctuation, platform tags, a leading "The" and roman
   * numerals (II → 2) are all normalized away. Works for non-Latin scripts too.
   */
  function normalizeTitle(s) {
    let x = String(s ?? "").replace(/[™®©℠]/g, "");
    try {
      x = x.normalize("NFKD");
    } catch {
      /* very old engines: keep as is */
    }
    x = x
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/['‘’‚‛′´`"“”]/g, "")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
    if (!x) return "";
    // Platform tags: "(PS4 & PS5)", "PlayStation 5", "PS VR2"
    x = x
      .replace(
        /\b(?:ps ?[345]|playstation ?[345])(?: (?:and|or) (?:ps ?[345]|playstation ?[345]))*\b/g,
        " "
      )
      .replace(/\bps ?vr ?2?\b/g, " ");
    const out = x
      .split(" ")
      .filter(Boolean)
      .map((tok) => ROMAN[tok] || tok)
      .join(" ")
      .replace(/^the /, "")
      .trim();
    return out;
  }

  const EDITION_TOKENS = new Set([
    "digital", "standard", "deluxe", "ultimate", "gold", "complete", "definitive", "premium",
    "collectors", "legendary", "anniversary", "royal", "special", "enhanced", "launch",
    "limited", "founders", "champion", "goty", "edition", "directors", "cut", "game", "of",
    "the", "year", "and", "bundle"
  ]);
  const EDITION_MARKERS = new Set([
    "edition", "goty", "deluxe", "ultimate", "definitive", "complete", "premium", "collectors",
    "legendary", "anniversary", "royal", "special", "directors"
  ]);

  /** Remove a trailing edition qualifier from an already-normalized title. */
  function stripEdition(n) {
    const toks = String(n || "").split(" ").filter(Boolean);
    let i = toks.length;
    while (i > 1 && EDITION_TOKENS.has(toks[i - 1])) i--;
    if (toks.slice(i).some((t) => EDITION_MARKERS.has(t))) return toks.slice(0, i).join(" ");
    return toks.join(" ");
  }

  /**
   * 3 = identical, 2 = same game but a different edition, 0 = not the same game.
   */
  function matchScore(a, b) {
    const x = normalizeTitle(a);
    const y = normalizeTitle(b);
    if (!x || !y) return 0;
    if (x === y) return 3;
    return stripEdition(x) === stripEdition(y) ? 2 : 0;
  }

  function sameGame(a, b) {
    return matchScore(a, b) >= 2;
  }

  /** Edition-independent identity of a game (two titles are "the same game" iff keys are equal). */
  function baseKey(s) {
    return stripEdition(normalizeTitle(s));
  }

  const ADDON_RE =
    /\b(?:soundtracks?|ost|artbooks?|art book|dlc|season pass|expansion(?: pass)?|upgrade|costumes?|skins?|outfits?|wallpapers?|booster pack|starter pack|bonus content|pre ?order bonus|demo|beta|prologue|v ?bucks|currency|credits|coins|cosmetics?|character pass|battle pass|(?:map|weapon|content|expansion|voice|cosmetic) pack|maps?)\b/;

  /** True for soundtracks, maps, passes, upgrades and other non-game store items. */
  function isAddonTitle(title) {
    return ADDON_RE.test(normalizeTitle(title));
  }

  /**
   * Best candidate for `query` or null. Add-on items are skipped unless the query itself
   * is one; exact matches beat edition-only matches.
   * @param {string} query
   * @param {Array} candidates
   * @param {(c:any)=>string} titleOf
   * @returns {{item:any, score:number, title:string}|null}
   */
  function pickBestMatch(query, candidates, titleOf) {
    const getTitle = titleOf || ((c) => (c && (c.external || c.title || c.name)) || "");
    const queryIsAddon = isAddonTitle(query);
    let best = null;
    for (const c of candidates || []) {
      const title = getTitle(c);
      if (!queryIsAddon && isAddonTitle(title)) continue;
      const score = matchScore(query, title);
      if (score > 0 && (!best || score > best.score)) best = { item: c, score, title };
    }
    return best;
  }

  /** PSN trophy sets are often titled "<Game> Trophies" / "<Game> Trophy Set". */
  function matchTrophyTitle(gameName, trophyTitleName) {
    const cleaned = normalizeTitle(trophyTitleName)
      .replace(/\b(?:trophies|trophy set|trophy pack|trophy)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return matchScore(gameName, cleaned);
  }

  /** Stable cache/storage key for a title. */
  function titleKey(s) {
    return normalizeTitle(s).replace(/ /g, "-");
  }

  /** Legacy URL-ish slug (kept for notification IDs and external-link building). */
  function slugify(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/[™®©'‘’":;,.!?()[\]{}]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .trim();
  }

  // Classify a PSN library title into game / dlc / app for filtering purposes.
  function classifyTitle(title) {
    const cat = String(title?.category || title?.titleType || "").toLowerCase();
    const name = String(title?.name || "").toLowerCase();
    if (cat.includes("nongame") || cat.includes("addon") || cat.includes("dlc")) return "dlc";
    if (/\b(dlc|expansion|season pass|add[\s-]?on)\b/i.test(name)) return "dlc";
    if (cat.includes("app") || cat.includes("media")) return "app";
    return "game";
  }

  // Detect a bundle/edition qualifier in a title (e.g. "Deluxe", "Ultimate", "GOTY").
  // Returns null for a plain/standard title. Longer phrases are checked first so
  // "game of the year edition" wins over a bare "edition" false-positive.
  const EDITION_PHRASES = [
    ["game of the year edition", "GOTY"],
    ["goty edition", "GOTY"],
    ["digital deluxe edition", "Deluxe"],
    ["digital deluxe", "Deluxe"],
    ["deluxe edition", "Deluxe"],
    ["ultimate edition", "Ultimate"],
    ["gold edition", "Gold"],
    ["complete edition", "Complete"],
    ["definitive edition", "Definitive"],
    ["premium edition", "Premium"],
    ["collector's edition", "Collector's"],
    ["collectors edition", "Collector's"],
    ["legendary edition", "Legendary"],
    ["anniversary edition", "Anniversary"],
    ["director's cut", "Director's Cut"],
    ["directors cut", "Director's Cut"],
    ["royal edition", "Royal"],
    ["special edition", "Special"],
    ["goty", "GOTY"]
  ];
  function detectEdition(title) {
    const n = String(title || "")
      .toLowerCase()
      .replace(/[‘’′´`]/g, "'");
    for (const [phrase, label] of EDITION_PHRASES) {
      if (n.includes(phrase)) return label;
    }
    return null;
  }

  const api = {
    normalizeTitle,
    stripEdition,
    matchScore,
    sameGame,
    baseKey,
    isAddonTitle,
    pickBestMatch,
    matchTrophyTitle,
    titleKey,
    slugify,
    classifyTitle,
    detectEdition
  };

  // CommonJS (Jest, plain Node)
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  // Service worker / content script / extension pages
  if (root) root.PSEMatch = api;
})(typeof self !== "undefined" ? self : typeof globalThis !== "undefined" ? globalThis : this);
