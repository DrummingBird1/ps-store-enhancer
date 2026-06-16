/**
 * GameDeals+ — Pure, side-effect-free helpers used in matching/sorting/classification.
 *
 * Defined once here so they can be unit-tested in Node (via `require`) AND used in the
 * service worker (via `importScripts`). Keep this file free of `chrome.*` or DOM APIs.
 */
(function (root) {
  "use strict";

  function slugify(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/[™®©''":;,.!?()[\]{}]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .trim();
  }

  function fuzzyMatch(q, c) {
    const n = (s) =>
      String(s || "")
        .toLowerCase()
        .replace(/[™®©''":;,.!?()[\]{}]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    const a = n(q);
    const b = n(c);
    if (!a || !b) return false;
    if (a === b) return true;
    // Substring match — but only if lengths are comparable (otherwise "Hades" matches
    // "Hades II Anniversary Special Edition")
    if (
      (b.includes(a) || a.includes(b)) &&
      Math.max(a.length, b.length) <= Math.min(a.length, b.length) * 1.6
    ) {
      return true;
    }
    const wa = a.split(" ").filter(Boolean);
    const wb = new Set(b.split(" ").filter(Boolean));
    if (!wa.length) return false;
    return wa.filter((w) => wb.has(w)).length / wa.length >= 0.75;
  }

  // Synthetic-history base price for a given current-cheapest value.
  // Indies don't pretend they once cost $60. AAA don't pretend $112.
  function computeBasePrice(cheapest) {
    if (cheapest <= 0) return 59.99;
    if (cheapest < 15) return cheapest * 1.5;
    if (cheapest < 40) return cheapest * 1.4;
    return Math.min(cheapest * 1.2, 79.99);
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

  const api = { slugify, fuzzyMatch, computeBasePrice, classifyTitle };

  // CommonJS (Jest, plain Node)
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  // Service worker / browser
  if (root) {
    root.PSEMatch = api;
    // Also expose each function at top-level for the legacy callsites in background.js / psn.js
    root.slugify = slugify;
    root.fuzzyMatch = fuzzyMatch;
    root.computeBasePrice = computeBasePrice;
    root.classifyTitle = classifyTitle;
  }
})(typeof self !== "undefined" ? self : typeof globalThis !== "undefined" ? globalThis : this);
