// welcome.js — onboarding page logic.
// Extracted from an inline <script> because Manifest V3's default CSP
// (script-src 'self') blocks inline scripts in extension pages.
document.addEventListener("DOMContentLoaded", async () => {
  await initI18n();
  localizePage();
  const btn = document.getElementById("openSettings");
  if (btn) {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      chrome.runtime.openOptionsPage();
    });
  }
});
