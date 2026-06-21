// changelog.js — applies the user's theme preference to the changelog page.
// Extracted from an inline <script> because Manifest V3's default CSP
// (script-src 'self') blocks inline scripts in extension pages.
(async () => {
  try {
    const r = await chrome.storage.sync.get(["theme"]);
    const mode = r.theme || "auto";
    const resolved =
      mode === "light"
        ? "light"
        : mode === "dark"
          ? "dark"
          : window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches
            ? "light"
            : "dark";
    if (resolved === "light") document.body.classList.add("theme-light");
  } catch {}
})();
