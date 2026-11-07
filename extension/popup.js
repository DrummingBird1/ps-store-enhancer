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
        $("psnIcon").dataset.state = "on";
        $("psnRefresh").style.display = "grid";
      } else {
        $("psnText").textContent = t("psnNotConnected");
        $("psnSub").textContent = t("psnClickToConnect");
        $("psnSynced").textContent = "";
        $("psnIcon").dataset.state = "off";
        $("psnRefresh").style.display = "none";
      }
    } catch {
      $("psnText").textContent = t("psnNotConnected");
      $("psnSub").textContent = t("psnClickToConnect");
      $("psnIcon").dataset.state = "off";
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

  /* "Check this page": runs every lookup the extension relies on in the active PlayStation Store tab. */
  const CHECK_LABELS = { title: "chk_title", price: "chk_price", anchor: "chk_anchor", tiles: "chk_tiles", names: "chk_names", prices: "chk_prices" };
  const CHECK_STATUS = { ok: "checkOk", warn: "checkWarn", fail: "checkFail" };
  $("checkPageBtn").addEventListener("click", async () => {
    const list = $("checkList");
    const msg = $("checkMsg");
    list.hidden = true;
    list.textContent = "";
    msg.textContent = "";
    let tab = null;
    try { [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); } catch {}
    let host = "";
    try { host = new URL(tab && tab.url).hostname; } catch {}
    if (!tab || host !== "store.playstation.com") { msg.textContent = t("checkPageNoStore"); return; }
    let resp = null;
    try { resp = await chrome.tabs.sendMessage(tab.id, { type: "PSE_CHECK_PAGE" }); } catch {}
    if (!resp || !resp.ok) { msg.textContent = t("checkPageNotReady"); return; }
    const r = resp.result;
    if (!r.checks.length) { msg.textContent = t("checkPageOther"); return; }
    for (const c of r.checks) {
      const li = document.createElement("li");
      const dot = document.createElement("span");
      dot.className = `ck-dot ck-${c.status}`;
      const label = document.createElement("span");
      label.textContent = `${t(CHECK_LABELS[c.id] || c.id)} — ${t(CHECK_STATUS[c.status])}`;
      li.append(dot, label);
      const extra = [c.detail && c.id !== "title" ? c.detail : "", c.strategy || ""].filter(Boolean).join(" · ");
      if (extra) {
        const small = document.createElement("small");
        small.textContent = extra;
        li.append(small);
      }
      list.appendChild(li);
    }
    for (const f of r.features || []) {
      if (f.ok) continue;
      const li = document.createElement("li");
      const dot = document.createElement("span");
      dot.className = "ck-dot ck-fail";
      const label = document.createElement("span");
      label.textContent = t("checkFeatureFailed", f.feature);
      li.append(dot, label);
      list.appendChild(li);
    }
    list.hidden = false;
    msg.textContent = t("checkPageSummary", String(r.ok), String(r.total));
    // Kept in the local diagnostics log (statuses and strategy names only) so "Copy" in Settings includes it.
    try {
      chrome.runtime.sendMessage({ type: "DIAG_LOG", event: "check-page", details: { page: r.page, checks: r.checks.map((c) => `${c.id}:${c.status}:${c.strategy || ""}`) } });
    } catch {}
  });

  /* One-click panic button: disconnect PSN and erase everything stored locally. */
  $("wipeBtn").addEventListener("click", async () => {
    if (!confirm(t("wipeConfirm"))) return;
    await chrome.runtime.sendMessage({ type: "WIPE_ALL_DATA" });
    await renderPsn();
    $("wipeBtn").textContent = t("wipeDone");
  });
});
