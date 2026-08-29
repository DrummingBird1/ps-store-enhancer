document.addEventListener("DOMContentLoaded", async () => {
  await initI18n();
  localizePage();

  const el = {
    enableMetacritic: document.getElementById("enableMetacritic"),
    enablePriceHistory: document.getElementById("enablePriceHistory"),
    enableCrossPlatform: document.getElementById("enableCrossPlatform"),
    enableTrophies: document.getElementById("enableTrophies"),
    enableSearchAutocomplete: document.getElementById("enableSearchAutocomplete"),
    hideAddons: document.getElementById("hideAddons"),
    hideDlc: document.getElementById("hideDlc"),
    hideOwned: document.getElementById("hideOwned"),
    region: document.getElementById("region"),
    displayCurrency: document.getElementById("displayCurrency"),
    themeSel: document.getElementById("themeSel"),
    userLanguage: document.getElementById("userLanguage"),
    newGame: document.getElementById("newGame"),
    addGameBtn: document.getElementById("addGameBtn"),
    ownList: document.getElementById("ownList"),
    ownCount: document.getElementById("ownCount"),
    exportBtn: document.getElementById("exportBtn"),
    importBtn: document.getElementById("importBtn"),
    importFile: document.getElementById("importFile"),
    wlList: document.getElementById("wlList"),
    wlCount: document.getElementById("wlCount"),
    wlCheckBtn: document.getElementById("wlCheckBtn"),
    statOwned: document.getElementById("statOwned"),
    statWishlist: document.getElementById("statWishlist"),
    statWishlistValue: document.getElementById("statWishlistValue"),
    statReady: document.getElementById("statReady"),
    purgeBtn: document.getElementById("purgeBtn"),
    clearBtn: document.getElementById("clearBtn"),
    cActive: document.getElementById("cActive"),
    cExpired: document.getElementById("cExpired"),
    cSize: document.getElementById("cSize"),
    toast: document.getElementById("toast"),
    psnConnUI: document.getElementById("psnConnUI"),
    psnDiscUI: document.getElementById("psnDiscUI"),
    psnAvatar: document.getElementById("psnAvatar"),
    psnName: document.getElementById("psnName"),
    psnSync: document.getElementById("psnSync"),
    psGames: document.getElementById("psGames"),
    psDlcs: document.getElementById("psDlcs"),
    psTotal: document.getElementById("psTotal"),
    autoBtn: document.getElementById("autoBtn"),
    npssoIn: document.getElementById("npssoIn"),
    connBtn: document.getElementById("connBtn"),
    syncBtn: document.getElementById("syncBtn"),
    disconnBtn: document.getElementById("disconnBtn"),
    psnMsg: document.getElementById("psnMsg")
  };

  // Load settings
  const sync = await chrome.storage.sync.get(["enableMetacritic","enablePriceHistory","enableCrossPlatform","enableTrophies","enableSearchAutocomplete","hideAddons","hideDlc","hideOwned","pspricesRegion","userLanguage","displayCurrency","theme"]);
  el.enableMetacritic.checked = sync.enableMetacritic ?? true;
  el.enablePriceHistory.checked = sync.enablePriceHistory ?? true;
  el.enableCrossPlatform.checked = sync.enableCrossPlatform ?? true;
  el.enableTrophies.checked = sync.enableTrophies ?? true;
  el.enableSearchAutocomplete.checked = sync.enableSearchAutocomplete ?? true;
  el.hideAddons.checked = sync.hideAddons ?? false;
  el.hideDlc.checked = sync.hideDlc ?? false;
  el.hideOwned.checked = sync.hideOwned ?? false;
  el.region.value = sync.pspricesRegion ?? "IL";
  el.displayCurrency.value = sync.displayCurrency ?? "USD";
  el.themeSel.value = sync.theme ?? "auto";
  el.userLanguage.value = sync.userLanguage ?? "auto";

  // Apply theme to the options page itself
  applyOptionsTheme(el.themeSel.value);

  // Migration
  const local = await chrome.storage.local.get(["manual_owned","psn_owned","ownedGames"]);
  if (local.ownedGames && !local.manual_owned) {
    await chrome.storage.local.set({ manual_owned: local.ownedGames });
    await chrome.storage.local.remove("ownedGames");
  }
  let manualOwned = local.manual_owned || local.ownedGames || [];
  let psnOwned = local.psn_owned || [];
  let ownedTotal = 0;
  let wishlistCache = [];

  // Auto-save toggles
  for (const k of ["enableMetacritic","enablePriceHistory","enableCrossPlatform","enableTrophies","enableSearchAutocomplete","hideAddons","hideDlc","hideOwned"])
    el[k].addEventListener("change", () => { chrome.storage.sync.set({ [k]: el[k].checked }); toast(t("saved")); });
  el.region.addEventListener("change", () => { chrome.storage.sync.set({ pspricesRegion: el.region.value, regionAutoSet: true }); toast(t("saved")); });
  el.displayCurrency.addEventListener("change", () => { chrome.storage.sync.set({ displayCurrency: el.displayCurrency.value }); toast(t("saved")); });
  el.themeSel.addEventListener("change", () => {
    chrome.storage.sync.set({ theme: el.themeSel.value });
    applyOptionsTheme(el.themeSel.value);
    toast(t("saved"));
  });

  function applyOptionsTheme(mode) {
    const resolved = mode === "light" ? "light"
      : mode === "dark" ? "dark"
      : (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) ? "light" : "dark";
    document.body.classList.toggle("theme-light", resolved === "light");
  }

  // Language change — save and reload page to apply
  el.userLanguage.addEventListener("change", async () => {
    await chrome.storage.sync.set({ userLanguage: el.userLanguage.value });
    // Reload to apply new language across all UI
    location.reload();
  });

  // ═══ Owned games ═══
  renderOwnedList();
  el.addGameBtn.addEventListener("click", addGame);
  el.newGame.addEventListener("keydown", e => { if (e.key === "Enter") addGame(); });

  async function addGame() {
    const name = el.newGame.value.trim();
    if (!name) return;
    if (manualOwned.some(g => g.toLowerCase() === name.toLowerCase()) || psnOwned.some(g => g.toLowerCase() === name.toLowerCase())) {
      toast(t("gameAlreadyInList")); return;
    }
    const resp = await chrome.runtime.sendMessage({ type: "ADD_MANUAL_OWNED", gameName: name });
    if (resp?.ok) { manualOwned = resp.list; el.newGame.value = ""; renderOwnedList(); toast(t("gameAdded", name)); }
  }

  async function removeManualGame(name) {
    const resp = await chrome.runtime.sendMessage({ type: "REMOVE_MANUAL_OWNED", gameName: name });
    if (resp?.ok) { manualOwned = resp.list; renderOwnedList(); toast(t("gameRemoved", name)); }
  }

  function renderOwnedList() {
    const psnSet = new Set(psnOwned.map(g => g.toLowerCase().trim()));
    const items = [];
    for (const g of psnOwned) items.push({ name: g, source: "psn" });
    for (const g of manualOwned) { if (!psnSet.has(g.toLowerCase().trim())) items.push({ name: g, source: "manual" }); }
    items.sort((a, b) => a.name.localeCompare(b.name));
    ownedTotal = items.length;
    renderStats();

    if (!items.length) {
      el.ownList.innerHTML = `<div class="own-empty">${t("emptyList")}</div>`;
      el.ownCount.textContent = ""; return;
    }
    el.ownList.innerHTML = items.map(i => {
      const bc = i.source === "psn" ? "src-psn" : "src-manual";
      const bt = i.source === "psn" ? t("srcPsn") : t("srcManual");
      const rm = i.source === "manual" ? `<button class="rm" data-name="${esc(i.name)}">✕</button>` : "";
      return `<div class="own-item"><span><span class="src-badge ${bc}">${bt}</span> ${esc(i.name)}</span>${rm}</div>`;
    }).join("");
    el.ownCount.textContent = `${items.length} total (${psnOwned.length} PSN, ${manualOwned.length} manual)`;
    el.ownList.querySelectorAll(".rm").forEach(b => b.addEventListener("click", () => removeManualGame(b.dataset.name)));
  }

  function renderStats() {
    if (!el.statOwned) return;
    const value = wishlistCache.reduce((sum, i) => sum + (i.lastCheckedPrice != null ? Number(i.lastCheckedPrice) : 0), 0);
    const ready = wishlistCache.filter(i => i.targetPrice != null && i.lastCheckedPrice != null && i.lastCheckedPrice <= i.targetPrice).length;
    el.statOwned.textContent = String(ownedTotal);
    el.statWishlist.textContent = String(wishlistCache.length);
    el.statWishlistValue.textContent = `$${value.toFixed(2)}`;
    el.statReady.textContent = String(ready);
  }

  // ═══ PSN ═══
  await refreshPsnUI();

  function psnMsg(text, type = "info") {
    const c = { info:["rgba(0,112,209,.1)","rgba(0,112,209,.25)","#4da6ff"], success:["rgba(109,200,73,.1)","rgba(109,200,73,.25)","#6dc849"], error:["rgba(255,64,64,.1)","rgba(255,64,64,.25)","#ff6b6b"] };
    const s = c[type] || c.info;
    el.psnMsg.textContent = text;
    el.psnMsg.style.cssText = `display:block;background:${s[0]};border:1px solid ${s[1]};color:${s[2]}`;
    setTimeout(() => el.psnMsg.style.display = "none", 8000);
  }

  function safeUrl(url) {
    if (!url) return "";
    try {
      const u = new URL(url);
      return (u.protocol === "https:" || u.protocol === "http:") ? u.href : "";
    } catch { return ""; }
  }

  // Translate error returned by background. psn.js returns i18n keys (e.g. "psnErrAuthExpired"),
  // older paths or thrown errors return raw messages — fall back to those if no translation exists.
  //
  // For NPSSO auth failures specifically, we collapse all the cryptic Sony-side errors into one
  // friendly message — the user-facing causes are all the same (bad/expired token), and reviewers
  // don't need to see a scary "400 Bad Request" if they typed something to test the flow.
  function errMsg(err) {
    if (!err) return t("genericError");
    if (err === "psnErrAuthCode" || err === "psnErrAccessToken" ||
        /Token exchange failed|authorization code|Bad Request|40[0-9]/i.test(String(err))) {
      return t("psnErrFriendly");
    }
    const translated = t(err);
    return translated && translated !== err ? translated : err;
  }

  async function refreshPsnUI() {
    try {
      const s = await chrome.runtime.sendMessage({ type: "PSN_STATUS" });
      if (s?.connected) {
        el.psnConnUI.style.display = "block"; el.psnDiscUI.style.display = "none";
        el.psnName.textContent = s.profile?.onlineId || "PSN User";
        const safeAvatar = safeUrl(s.profile?.avatarUrl);
        if (safeAvatar) {
          const img = document.createElement("img");
          img.src = safeAvatar;
          img.alt = "";
          el.psnAvatar.replaceChildren(img);
        } else {
          el.psnAvatar.replaceChildren(document.createTextNode("🎮"));
        }
        el.psGames.textContent = s.gameCount || 0;
        el.psDlcs.textContent = s.dlcCount || 0;
        el.psTotal.textContent = s.libraryCount || 0;
        if (s.lastSync) { const d = new Date(s.lastSync); el.psnSync.textContent = `${t("psnLastSync")} ${d.toLocaleDateString()} ${d.toLocaleTimeString(undefined,{hour:"2-digit",minute:"2-digit"})}`; }
        else el.psnSync.textContent = t("psnNotSynced");
        const ld = await chrome.storage.local.get(["psn_owned","manual_owned"]);
        psnOwned = ld.psn_owned || []; manualOwned = ld.manual_owned || [];
        renderOwnedList();
      } else { el.psnConnUI.style.display = "none"; el.psnDiscUI.style.display = "block"; }
    } catch { el.psnConnUI.style.display = "none"; el.psnDiscUI.style.display = "block"; }
  }

  el.autoBtn.addEventListener("click", async () => {
    el.autoBtn.disabled = true; el.autoBtn.innerHTML = `🔍 ${t("psnSearching")} <span class="spinner"></span>`;
    try {
      const r = await chrome.runtime.sendMessage({ type: "PSN_AUTO_DETECT" });
      if (r?.found) {
        psnMsg(t("psnTokenFound"), "info");
        const auth = await chrome.runtime.sendMessage({ type: "PSN_AUTHENTICATE", npsso: r.npsso });
        if (auth?.success) { psnMsg(t("psnConnectedSync"), "success"); await chrome.runtime.sendMessage({ type: "PSN_FETCH_LIBRARY" }); toast(t("psnSynced")); await refreshPsnUI(); }
        else psnMsg(errMsg(auth?.error), "error");
      } else psnMsg(t("psnTokenNotFound"), "error");
    } catch (e) { psnMsg(errMsg(e.message), "error"); }
    el.autoBtn.disabled = false; el.autoBtn.innerHTML = `🔍 ${t("psnAutoDetect")}`;
  });

  el.connBtn.addEventListener("click", async () => {
    const npsso = el.npssoIn.value.trim();
    if (!npsso) { psnMsg(t("psnPasteToken"), "error"); return; }
    el.connBtn.disabled = true; el.connBtn.innerHTML = `<span class="spinner"></span>`;
    try {
      const r = await chrome.runtime.sendMessage({ type: "PSN_AUTHENTICATE", npsso });
      if (r?.success) { psnMsg(t("psnConnectedSync"), "success"); await chrome.runtime.sendMessage({ type: "PSN_FETCH_LIBRARY" }); toast(t("psnSynced")); el.npssoIn.value = ""; await refreshPsnUI(); }
      else psnMsg(errMsg(r?.error), "error");
    } catch (e) { psnMsg(errMsg(e.message), "error"); }
    el.connBtn.disabled = false; el.connBtn.textContent = t("psnConnect");
  });

  el.syncBtn.addEventListener("click", async () => {
    el.syncBtn.disabled = true; el.syncBtn.innerHTML = `🔄 ${t("psnSyncing")} <span class="spinner"></span>`;
    try {
      const r = await chrome.runtime.sendMessage({ type: "PSN_FETCH_LIBRARY" });
      if (r?.success) { toast(t("psnSyncedItems", String(r.totalCount))); await refreshPsnUI(); }
      else psnMsg(errMsg(r?.error), "error");
    } catch (e) { psnMsg(errMsg(e.message), "error"); }
    el.syncBtn.disabled = false; el.syncBtn.innerHTML = `🔄 ${t("psnSyncNow")}`;
  });

  el.disconnBtn.addEventListener("click", async () => {
    if (!confirm(t("psnDisconnectConfirm"))) return;
    await chrome.runtime.sendMessage({ type: "PSN_DISCONNECT" });
    psnOwned = []; renderOwnedList(); toast(t("psnDisconnected")); await refreshPsnUI();
  });

  // ═══ Wishlist ═══
  await renderWishlist();

  async function renderWishlist() {
    try {
      const r = await chrome.runtime.sendMessage({ type: "GET_WISHLIST" });
      const list = r?.list || [];
      wishlistCache = list;
      renderStats();
      if (!list.length) {
        el.wlList.innerHTML = `<div class="own-empty">${esc(t("wishlistEmpty"))}</div>`;
        el.wlCount.textContent = "";
        return;
      }
      const fmt = (p) => p == null ? "—" : `$${Number(p).toFixed(2)}`;
      el.wlList.innerHTML = list.map(item => {
        const lastDate = item.lastCheckedAt ? new Date(item.lastCheckedAt).toLocaleDateString() : "—";
        return `<div class="own-item" data-name="${esc(item.name)}" style="flex-wrap:wrap;gap:8px">
          <div style="flex:1;min-width:160px">
            <div style="font-weight:600">${esc(item.name)}</div>
            <div style="font-size:10px;color:#718096;margin-top:2px">${esc(t("wishlistLastChecked"))} ${esc(lastDate)} · ${esc(t("wishlistColLast"))} ${esc(fmt(item.lastCheckedPrice))}</div>
          </div>
          <div style="display:flex;align-items:center;gap:6px">
            <label style="font-size:10px;color:#a0aec0">${esc(t("wishlistColTarget"))}</label>
            <input type="number" step="0.01" min="0" class="wl-target" data-name="${esc(item.name)}" value="${item.targetPrice != null ? Number(item.targetPrice).toFixed(2) : ""}" style="width:80px;background:#1b2838;border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:#e2e8f0;padding:4px 8px;font-size:12px;font-family:inherit">
            <button class="rm wl-rm" data-name="${esc(item.name)}" title="Remove">✕</button>
          </div>
        </div>`;
      }).join("");
      el.wlCount.textContent = `${list.length} game${list.length === 1 ? "" : "s"}`;
      el.wlList.querySelectorAll(".wl-target").forEach(input => {
        input.addEventListener("change", async () => {
          const val = input.value === "" ? null : Number(input.value);
          const resp = await chrome.runtime.sendMessage({ type: "SET_WISHLIST_TARGET", gameName: input.dataset.name, targetPrice: val });
          if (resp?.list) { wishlistCache = resp.list; renderStats(); }
          toast(t("saved"));
        });
      });
      el.wlList.querySelectorAll(".wl-rm").forEach(b => b.addEventListener("click", async () => {
        await chrome.runtime.sendMessage({ type: "REMOVE_WISHLIST", gameName: b.dataset.name });
        await renderWishlist();
        toast(t("wishlistRemoved"));
      }));
    } catch {
      el.wlList.innerHTML = `<div class="own-empty">${esc(t("errorApiDown"))}</div>`;
    }
  }

  el.wlCheckBtn.addEventListener("click", async () => {
    el.wlCheckBtn.disabled = true;
    const orig = el.wlCheckBtn.innerHTML;
    el.wlCheckBtn.innerHTML = `${t("wishlistChecking")} <span class="spinner"></span>`;
    try {
      await chrome.runtime.sendMessage({ type: "CHECK_WISHLIST_NOW" });
      await renderWishlist();
      toast(t("wishlistChecked"));
    } catch {
      toast(t("errorApiDown"));
    } finally {
      el.wlCheckBtn.disabled = false;
      el.wlCheckBtn.innerHTML = orig;
    }
  });

  // ═══ Export / Import ═══
  el.exportBtn.addEventListener("click", async () => {
    const local = await chrome.storage.local.get(["manual_owned","wishlist"]);
    const payload = {
      app: "PS Store Enhancer",
      version: chrome.runtime.getManifest().version,
      exportedAt: new Date().toISOString(),
      manual_owned: local.manual_owned || [],
      wishlist: local.wishlist || []
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ps-store-enhancer-backup-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(t("exportSuccess"));
  });

  el.importBtn.addEventListener("click", () => el.importFile.click());
  el.importFile.addEventListener("change", async (ev) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    const origLabel = el.importBtn.innerHTML;
    el.importBtn.disabled = true;
    el.importBtn.innerHTML = `<span class="spinner"></span>`;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      // Accept backups from every past app name (the project has been renamed twice) so
      // old backups still restore correctly.
      const validApp = ["PS Store Enhancer", "PS Store Insight", "GameDeals+ for PS Store"].includes(data?.app);
      if (!data || typeof data !== "object" || !validApp) {
        throw new Error("invalid format");
      }
      const local = await chrome.storage.local.get(["manual_owned","wishlist"]);
      let count = 0;
      // Merge manual_owned (case-insensitive dedupe)
      if (Array.isArray(data.manual_owned)) {
        const existing = new Set((local.manual_owned || []).map(g => g.toLowerCase().trim()));
        const merged = [...(local.manual_owned || [])];
        for (const name of data.manual_owned) {
          const key = String(name || "").toLowerCase().trim();
          if (key && !existing.has(key)) { existing.add(key); merged.push(String(name)); count++; }
        }
        merged.sort((a, b) => a.localeCompare(b));
        await chrome.storage.local.set({ manual_owned: merged });
      }
      // Merge wishlist (preserve existing target prices for existing items)
      if (Array.isArray(data.wishlist)) {
        const existingWl = local.wishlist || [];
        const existingNames = new Set(existingWl.map(g => g.name.toLowerCase().trim()));
        const merged = [...existingWl];
        for (const item of data.wishlist) {
          const key = String(item?.name || "").toLowerCase().trim();
          if (key && !existingNames.has(key)) {
            existingNames.add(key);
            merged.push({
              name: String(item.name),
              storeUrl: item.storeUrl || null,
              addedAt: item.addedAt || Date.now(),
              targetPrice: item.targetPrice != null ? Number(item.targetPrice) : null,
              lastCheckedPrice: item.lastCheckedPrice != null ? Number(item.lastCheckedPrice) : null,
              lastCheckedAt: item.lastCheckedAt || null,
              notified: false
            });
            count++;
          }
        }
        await chrome.storage.local.set({ wishlist: merged });
      }
      // Refresh UI
      const localAfter = await chrome.storage.local.get(["manual_owned"]);
      manualOwned = localAfter.manual_owned || [];
      renderOwnedList();
      await renderWishlist();
      toast(t("importSuccess", String(count)));
    } catch (e) {
      toast(t("importFailed"));
    } finally {
      ev.target.value = ""; // allow re-import same file
      el.importBtn.disabled = false;
      el.importBtn.innerHTML = origLabel;
    }
  });

  // ═══ Cache ═══
  async function refreshCache() {
    try { const s = await chrome.runtime.sendMessage({ type: "CACHE_STATS" }); if (s) { el.cActive.textContent = s.activeEntries; el.cExpired.textContent = s.expiredEntries; el.cSize.textContent = s.sizeKB; } }
    catch { el.cActive.textContent = el.cExpired.textContent = el.cSize.textContent = "—"; }
  }
  refreshCache();
  el.purgeBtn.addEventListener("click", async () => { await chrome.runtime.sendMessage({ type: "PURGE_CACHE" }); await refreshCache(); toast(t("cachePurged")); });
  el.clearBtn.addEventListener("click", async () => { const r = await chrome.runtime.sendMessage({ type: "CLEAR_CACHE" }); await refreshCache(); toast(t("cacheCleared", String(r?.removed||0))); });

  let toastTimer;
  function toast(msg) { el.toast.textContent = msg; el.toast.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.toast.classList.remove("show"), 2200); }
  // Attribute-safe escaping: covers <, >, &, ", '. The textContent→innerHTML trick
  // does NOT escape quotes, so output placed inside HTML attributes (data-name="…",
  // value="…") could break out. We escape explicitly instead.
  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
});
