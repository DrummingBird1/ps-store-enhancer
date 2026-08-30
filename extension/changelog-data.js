/**
 * PS Store Enhancer — condensed "what's new" highlights, latest release first.
 * Kept in sync with changelog.html by hand on every version bump — this file only
 * needs the short bullet list shown in the popup card, not the full release notes.
 */
const PSE_CHANGELOG = [
  {
    version: "2.6.2",
    highlights: [
      "📝 New CHANGELOG.md — the full version history, readable on GitHub",
      "☕ Added Ko-fi and Buy Me a Coffee, and fixed the Patreon link"
    ]
  },
  {
    version: "2.6.1",
    highlights: [
      "🎨 New icon — cleaner and still crisp at 16px",
      "🌐 The website now shows real screenshots of every major feature"
    ]
  },
  {
    version: "2.6.0",
    highlights: [
      "✨ PS Store Insight is now PS Store Enhancer — shorter name, same extension. Old backups still import fine."
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
