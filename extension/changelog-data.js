/**
 * PS Store Insight — condensed "what's new" highlights, latest release first.
 * Kept in sync with changelog.html by hand on every version bump — this file only
 * needs the short bullet list shown in the popup card, not the full release notes.
 */
const PSE_CHANGELOG = [
  {
    version: "2.5.0",
    highlights: [
      "✨ GameDeals+ is now PS Store Insight — same extension, new name. Nothing else changes.",
      "🔎 Live search suggestions — price & score preview as you type in the store search box",
      "🎉 \"What's new\" now shows up right here and on the store page after every update"
    ]
  }
];

if (typeof module !== "undefined" && module.exports) module.exports = PSE_CHANGELOG;
else self.PSE_CHANGELOG = PSE_CHANGELOG;
