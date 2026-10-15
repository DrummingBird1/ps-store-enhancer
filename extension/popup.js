document.addEventListener("DOMContentLoaded", async () => {
  await initI18n();
  localizePage();
  const $ = (id) => document.getElementById(id);
  const toggles = { hideAddons: $("hideAddons"), hideDlc: $("hideDlc"), hideOwned: $("hideOwned") };

  try {
    const r = await chrome.storage.sync.get(["hideAddons", "hideDlc", "hideOwned", "theme"]);
    toggles.hideAddons.checked = r.hideAddons ?? false;
    toggles.hideDlc.checked = r.hideDlc ?? false;
    toggles.hideOwned.checked = r.hideOwned ?? false;
    const mode = r.theme || "auto";
    const resolved = mode === "light" || mode === "dark" || mode === "contrast"
      ? mode
      : window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    if (resolved === "light") document.body.classList.add("theme-light");
    if (resolved === "contrast") document.body.classList.add("theme-contrast");
  } catch {}
  for (const [k, el] of Object.entries(toggles)) el.addEventListener("change", () => chrome.storage.sync.set({ [k]: el.checked }));

  $("openOptions").addEventListener("click", (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });
  const psnRow = $("psnStatus");
  psnRow.addEventListener("click", () => chrome.runtime.openOptionsPage());
  psnRow.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target === psnRow) { e.preventDefault(); chrome.runtime.openOptionsPage(); }
  });
  const changelogLink = $("openChangelog");
  if (changelogLink) changelogLink.addEventListener("click", (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: chrome.runtime.getURL("changelog.html") });
  });

  /* What's new — highlights are translated when the release shipped i18n keys for them. */
  try {
    const d = await chrome.storage.local.get(["pse_changelog_unseen"]);
    const version = d.pse_changelog_unseen;
    const entry = version && Array.isArray(self.PSE_CHANGELOG)
      ? (self.PSE_CHANGELOG.find((e) => e.version === version) || self.PSE_CHANGELOG[0])
      : null;
    if (version && entry) {
      $("whatsNewTitleText").textContent = t("whatsNewTitle", version);
      const ul = $("whatsNewList");
      entry.highlights.forEach((h, i) => {
        const key = entry.keys && entry.keys[i];
        const translated = key ? t(key) : "";
        const li = document.createElement("li");
        li.textContent = translated && translated !== key ? translated : h;
        ul.appendChild(li);
      });
      $("whatsNewCard").style.display = "block";
      $("whatsNewClose").addEventListener("click", async () => {
        $("whatsNewCard").style.display = "none";
        try { await chrome.runtime.sendMessage({ type: "CHANGELOG_SEEN" }); } catch {}
      });
    }
  } catch {}

  /* PSN status: who is connected, how recently the library synced, and a manual refresh. */
  function relativeTime(ts) {
    const diff = ts - Date.now();
    const mins = Math.round(diff / 60000);
    const lang = PSEi18n.getActiveLang().replace("_", "-");
    try {
      const rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
      if (Math.abs(mins) < 60) return rtf.format(mins, "minute");
      if (Math.abs(mins) < 60 * 48) return rtf.format(Math.round(mins / 60), "hour");
      return rtf.format(Math.round(mins / 1440), "day");
    } catch { return new Date(ts).toLocaleString(); }
  }

  async function renderPsn() {
    try {
      const s = await chrome.runtime.sendMessage({ type: "PSN_STATUS" });
      if (s?.connected) {
        $("psnText").textContent = s.profile?.onlineId || "PSN User";
        $("psnSub").textContent = `${s.gameCount} ${t("psnGames")} · ${s.dlcCount} ${t("psnDlcs")}`;
        $("psnSynced").textContent = s.lastSync ? t("popupSyncedAgo", relativeTime(s.lastSync)) : t("psnNotSynced");
        $("psnIcon").textContent = "✅";
        $("psnRefresh").style.display = "inline-block";
      } else {
        $("psnText").textContent = t("psnNotConnected");
        $("psnSub").textContent = t("psnClickToConnect");
        $("psnSynced").textContent = "";
        $("psnIcon").textContent = "🔗";
        $("psnRefresh").style.display = "none";
      }
    } catch {
      $("psnText").textContent = t("psnNotConnected");
      $("psnSub").textContent = t("psnClickToConnect");
      $("psnIcon").textContent = "🔗";
    }
  }
  await renderPsn();

  $("psnRefresh").addEventListener("click", async (e) => {
    e.stopPropagation(); // the row itself opens the settings page
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const r = await chrome.runtime.sendMessage({ type: "PSN_FETCH_LIBRARY" });
      if (r?.success) await renderPsn();
      else $("psnSynced").textContent = t(r?.error || "genericError") || t("genericError");
    } catch { /* worker asleep or unreachable */ }
    btn.disabled = false;
  });

  /* One-click panic button: disconnect PSN and erase everything stored locally. */
  $("wipeBtn").addEventListener("click", async () => {
    if (!confirm(t("wipeConfirm"))) return;
    await chrome.runtime.sendMessage({ type: "WIPE_ALL_DATA" });
    await renderPsn();
    $("wipeBtn").textContent = t("wipeDone");
  });
});
