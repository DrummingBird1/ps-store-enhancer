document.addEventListener("DOMContentLoaded", async () => {
  await initI18n();
  localizePage();
  const toggles = { hideAddons: document.getElementById("hideAddons"), hideDlc: document.getElementById("hideDlc"), hideOwned: document.getElementById("hideOwned") };
  try {
    const r = await chrome.storage.sync.get(["hideAddons","hideDlc","hideOwned","theme"]);
    toggles.hideAddons.checked = r.hideAddons ?? false;
    toggles.hideDlc.checked = r.hideDlc ?? false;
    toggles.hideOwned.checked = r.hideOwned ?? false;
    // Apply theme
    const mode = r.theme || "auto";
    const resolved = mode === "light" ? "light" : mode === "dark" ? "dark" : (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) ? "light" : "dark";
    if (resolved === "light") document.body.classList.add("theme-light");
  } catch {}
  for (const [k, el] of Object.entries(toggles)) el.addEventListener("change", () => chrome.storage.sync.set({ [k]: el.checked }));
  document.getElementById("openOptions").addEventListener("click", e => { e.preventDefault(); chrome.runtime.openOptionsPage(); });
  document.getElementById("psnStatus").addEventListener("click", () => chrome.runtime.openOptionsPage());
  const changelogLink = document.getElementById("openChangelog");
  if (changelogLink) changelogLink.addEventListener("click", e => {
    e.preventDefault();
    chrome.tabs.create({ url: chrome.runtime.getURL("changelog.html") });
  });

  try {
    const d = await chrome.storage.local.get(["pse_changelog_unseen"]);
    const version = d.pse_changelog_unseen;
    const entry = version && Array.isArray(window.PSE_CHANGELOG)
      ? (window.PSE_CHANGELOG.find(e => e.version === version) || window.PSE_CHANGELOG[0])
      : null;
    if (version && entry) {
      document.getElementById("whatsNewTitleText").textContent = t("whatsNewTitle", version);
      const ul = document.getElementById("whatsNewList");
      for (const h of entry.highlights) {
        const li = document.createElement("li");
        li.textContent = h;
        ul.appendChild(li);
      }
      document.getElementById("whatsNewCard").style.display = "block";
      document.getElementById("whatsNewClose").addEventListener("click", async () => {
        document.getElementById("whatsNewCard").style.display = "none";
        try { await chrome.runtime.sendMessage({ type: "CHANGELOG_SEEN" }); } catch {}
      });
    }
  } catch {}

  try {
    const s = await chrome.runtime.sendMessage({ type: "PSN_STATUS" });
    if (s?.connected) {
      document.getElementById("psnText").textContent = s.profile?.onlineId || "PSN User";
      document.getElementById("psnSub").textContent = `${s.gameCount} ${t("psnGames")} · ${s.dlcCount} ${t("psnDlcs")}`;
      document.getElementById("psnIcon").textContent = "✅";
    } else {
      document.getElementById("psnText").textContent = t("psnNotConnected");
      document.getElementById("psnSub").textContent = t("psnClickToConnect");
      document.getElementById("psnIcon").textContent = "🔗";
    }
  } catch {
    document.getElementById("psnText").textContent = t("psnNotConnected");
    document.getElementById("psnSub").textContent = t("psnClickToConnect");
    document.getElementById("psnIcon").textContent = "🔗";
  }
});
