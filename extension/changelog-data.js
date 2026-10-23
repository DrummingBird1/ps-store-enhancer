/**
 * PS Store Enhancer — condensed "what's new" highlights, latest release first.
 * Kept in sync with changelog.html by hand on every version bump — this file only
 * needs the short bullet list shown in the popup card, not the full release notes.
 */
const PSE_CHANGELOG = [
  {
    version: "2.7.1",
    keys: ["chl_2_7_1_1", "chl_2_7_1_2", "chl_2_7_0_1", "chl_2_7_0_2", "chl_2_7_0_3", "chl_2_7_0_4", "chl_2_7_0_5", "chl_2_7_0_6"],
    highlights: [
      "🔌 PSN connection fixed — the extension was using the wrong app identity, so Sony always refused it",
      "🛠 Clearer PSN errors that name the failing step, and one-click access when Chrome hides Sony's redirect",
      "🎯 Accurate cross-platform prices — exactly the right game, never a DLC, map or sequel",
      "📊 Metacritic and Steam scores from CheapShark (OpenCritic now needs an API key and had stopped working)",
      "📉 Price Insight uses real data only: lowest PC price ever, today's cheapest, and your own recorded trend",
      "🛠 Diagnostics log, safer PSN sign-in, wishlist % targets, notes, sorting, weekly digest and an 'Erase all my data' button",
      "🧩 Reorder, hide or collapse the product-page cards; new high-contrast theme",
      "🌍 Six new languages: Italiano, Polski, Türkçe, Nederlands, 简体中文 and 繁體中文"
    ]
  },
  {
    version: "2.7.0",
    keys: ["chl_2_7_0_1", "chl_2_7_0_2", "chl_2_7_0_3", "chl_2_7_0_4", "chl_2_7_0_5", "chl_2_7_0_6"],
    highlights: [
      "🎯 Accurate cross-platform prices — exactly the right game, never a DLC, map or sequel",
      "📊 Metacritic and Steam scores from CheapShark (OpenCritic now needs an API key and had stopped working)",
      "📉 Price Insight uses real data only: lowest PC price ever, today's cheapest, and your own recorded trend",
      "🛠 Diagnostics log, safer PSN sign-in, wishlist % targets, notes, sorting, weekly digest and an 'Erase all my data' button",
      "🧩 Reorder, hide or collapse the product-page cards; new high-contrast theme",
      "🌍 Six new languages: Italiano, Polski, Türkçe, Nederlands, 简体中文 and 繁體中文"
    ]
  },
  {
    version: "2.6.0",
    highlights: [
      "✨ PS Store Insight is now PS Store Enhancer — shorter name, same extension. Old backups still import fine.",
      "🎨 New icon, real screenshots, and an expanded website",
      "📝 New CHANGELOG.md — the full version history, readable on GitHub",
      "☕ Added Ko-fi and Buy Me a Coffee, and fixed the Patreon link"
    ]
  },
  {
    version: "2.5.0",
    highlights: [
      "✨ GameDeals+ is now PS Store Insight — same extension, new name. Nothing else changes.",
      "🔎 Live search suggestions — price & score preview as you type in the store search box",
      "📊 New Library & Wishlist stats dashboard in settings",
      "🔔 Toolbar badge shows wishlist deals ready to buy",
      "🎁 Cross-platform prices now flag when a listing is for a different edition/bundle"
    ]
  }
];

if (typeof module !== "undefined" && module.exports) module.exports = PSE_CHANGELOG;
else self.PSE_CHANGELOG = PSE_CHANGELOG;
