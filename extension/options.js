document.addEventListener("DOMContentLoaded", async () => {
  await initI18n();
  localizePage();

  const $ = (id) => document.getElementById(id);
  const send = (msg) => chrome.runtime.sendMessage(msg);
  const { escapeHtml: esc } = PSEHelpers;
  const LOCALE = PSEi18n.getActiveLang().replace("_", "-");
  const fmtDate = (ts) => new Date(ts).toLocaleDateString(LOCALE);

  const TOGGLE_DEFAULTS = {
    enableMetacritic: true, enablePriceHistory: true, enableCrossPlatform: true,
    enableTrophies: true, enableTrophyRarity: false, enableSearchAutocomplete: true,
    enableSearchShortcut: true, hideAddons: false, hideDlc: false, hideOwned: false,
    cardsCollapsed: false
  };
  const CARD_KEYS = ["priceInsight", "crossPlatform", "trophies"];
  const CARD_LABELS = { priceInsight: "cardPriceInsight", crossPlatform: "cardCrossPlatform", trophies: "cardTrophies" };

  const el = {
    region: $("region"), displayCurrency: $("displayCurrency"), themeSel: $("themeSel"),
    userLanguage: $("userLanguage"), digestMode: $("digestMode"),
    newGame: $("newGame"), addGameBtn: $("addGameBtn"), ownList: $("ownList"), ownCount: $("ownCount"),
    exportBtn: $("exportBtn"), importBtn: $("importBtn"), importFile: $("importFile"),
    wlList: $("wlList"), wlCount: $("wlCount"), wlCheckBtn: $("wlCheckBtn"), wlShareBtn: $("wlShareBtn"),
    wlFilter: $("wlFilter"), wlSort: $("wlSort"),
    statOwned: $("statOwned"), statWishlist: $("statWishlist"), statWishlistValue: $("statWishlistValue"), statReady: $("statReady"),
    purgeBtn: $("purgeBtn"), clearBtn: $("clearBtn"), cActive: $("cActive"), cExpired: $("cExpired"), cSize: $("cSize"),
    toast: $("toast"),
    psnConnUI: $("psnConnUI"), psnDiscUI: $("psnDiscUI"), psnAvatar: $("psnAvatar"), psnName: $("psnName"), psnSync: $("psnSync"),
    psGames: $("psGames"), psDlcs: $("psDlcs"), psTotal: $("psTotal"),
    autoBtn: $("autoBtn"), npssoIn: $("npssoIn"), connBtn: $("connBtn"), syncBtn: $("syncBtn"),
    disconnBtn: $("disconnBtn"), psnMsg: $("psnMsg"), grantBtn: $("grantBtn"),
    diagBox: $("diagBox"), diagRefresh: $("diagRefresh"), diagCopy: $("diagCopy"), diagClear: $("diagClear"),
    wipeBtn: $("wipeBtn"), cardOrder: $("cardOrder")
  };

  /* ═══ Settings ═══ */
  const sync = await chrome.storage.sync.get([
    ...Object.keys(TOGGLE_DEFAULTS), "pspricesRegion", "userLanguage", "displayCurrency", "theme",
    "digestMode", "cardOrder", "cardsHidden"
  ]);
  for (const [k, dflt] of Object.entries(TOGGLE_DEFAULTS)) $(k).checked = sync[k] ?? dflt;
  el.region.value = sync.pspricesRegion ?? "IL";
  el.displayCurrency.value = sync.displayCurrency ?? "USD";
  el.themeSel.value = sync.theme ?? "auto";
  el.userLanguage.value = sync.userLanguage ?? "auto";
  el.digestMode.value = sync.digestMode ?? "instant";

  localizeSelects();
  applyOptionsTheme(el.themeSel.value);

  for (const k of Object.keys(TOGGLE_DEFAULTS)) {
    $(k).addEventListener("change", () => { chrome.storage.sync.set({ [k]: $(k).checked }); toast(t("saved")); });
  }
  el.region.addEventListener("change", () => { chrome.storage.sync.set({ pspricesRegion: el.region.value, regionAutoSet: true }); toast(t("saved")); });
  el.displayCurrency.addEventListener("change", () => { chrome.storage.sync.set({ displayCurrency: el.displayCurrency.value, currencyAutoSet: true }); toast(t("saved")); });
  el.digestMode.addEventListener("change", () => { chrome.storage.sync.set({ digestMode: el.digestMode.value }); toast(t("saved")); });
  el.themeSel.addEventListener("change", () => {
    chrome.storage.sync.set({ theme: el.themeSel.value });
    applyOptionsTheme(el.themeSel.value);
    toast(t("saved"));
  });

  function applyOptionsTheme(mode) {
    const resolved = mode === "light" || mode === "dark" || mode === "contrast"
      ? mode
      : (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) ? "light" : "dark";
    document.body.classList.toggle("theme-light", resolved === "light");
    document.body.classList.toggle("theme-contrast", resolved === "contrast");
  }

  // Country and currency names in the user's own language (the static HTML text is the fallback).
  function localizeSelects() {
    const lang = PSEi18n.getActiveLang().replace("_", "-");
    try {
      const names = new Intl.DisplayNames([lang], { type: "region" });
      for (const o of el.region.options) o.textContent = names.of(o.value) || o.textContent;
    } catch { /* unsupported locale: keep English */ }
    try {
      const names = new Intl.DisplayNames([lang], { type: "currency" });
      for (const o of el.displayCurrency.options) {
        const n = names.of(o.value);
        if (n) o.textContent = `${o.value} — ${n}`;
      }
    } catch { /* unsupported locale: keep English */ }
  }

  // Language change — save and reload page to apply
  el.userLanguage.addEventListener("change", async () => {
    await chrome.storage.sync.set({ userLanguage: el.userLanguage.value });
    location.reload();
  });

  /* ═══ Product-page cards: visibility + order ═══ */
  const cardOrder = Array.isArray(sync.cardOrder) ? sync.cardOrder.filter((k) => CARD_KEYS.includes(k)) : [];
  for (const k of CARD_KEYS) if (!cardOrder.includes(k)) cardOrder.push(k);
  let cardsHidden = Array.isArray(sync.cardsHidden) ? sync.cardsHidden.filter((k) => CARD_KEYS.includes(k)) : [];

  function saveCards() {
    chrome.storage.sync.set({ cardOrder, cardsHidden });
    toast(t("saved"));
  }

  function renderCardOrder() {
    el.cardOrder.replaceChildren();
    cardOrder.forEach((key, i) => {
      const row = document.createElement("div");
      row.className = "tr";
      const label = document.createElement("div");
      label.className = "ti";
      label.innerHTML = `<div class="lb">${esc(t(CARD_LABELS[key]))}</div>`;
      const btns = document.createElement("div");
      btns.className = "ord-btns";
      const mk = (txt, aria, disabled, fn) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = txt;
        b.setAttribute("aria-label", `${aria}: ${t(CARD_LABELS[key])}`);
        b.disabled = disabled;
        b.addEventListener("click", fn);
        return b;
      };
      btns.append(
        mk("▲", t("cardMoveUp"), i === 0, () => { [cardOrder[i - 1], cardOrder[i]] = [cardOrder[i], cardOrder[i - 1]]; saveCards(); renderCardOrder(); }),
        mk("▼", t("cardMoveDown"), i === cardOrder.length - 1, () => { [cardOrder[i + 1], cardOrder[i]] = [cardOrder[i], cardOrder[i + 1]]; saveCards(); renderCardOrder(); })
      );
      const sw = document.createElement("label");
      sw.className = "sw";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = !cardsHidden.includes(key);
      cb.setAttribute("aria-label", t(CARD_LABELS[key]));
      cb.addEventListener("change", () => {
        cardsHidden = cb.checked ? cardsHidden.filter((k) => k !== key) : [...cardsHidden, key];
        saveCards();
      });
      const slider = document.createElement("span");
      slider.className = "sl";
      sw.append(cb, slider);
      row.append(label, btns, sw);
      el.cardOrder.appendChild(row);
    });
  }
  renderCardOrder();

  /* ═══ Owned games ═══ */
  // Migration
  const local = await chrome.storage.local.get(["manual_owned", "psn_owned", "ownedGames"]);
  if (local.ownedGames && !local.manual_owned) {
    await chrome.storage.local.set({ manual_owned: local.ownedGames });
    await chrome.storage.local.remove("ownedGames");
  }
  let manualOwned = local.manual_owned || local.ownedGames || [];
  let psnOwned = local.psn_owned || [];
  let ownedTotal = 0;
  let wishlistCache = [];

  renderOwnedList();
  el.addGameBtn.addEventListener("click", addGame);
  el.newGame.addEventListener("keydown", (e) => { if (e.key === "Enter") addGame(); });

  async function addGame() {
    const name = el.newGame.value.trim();
    if (!name) return;
    if ([...manualOwned, ...psnOwned].some((g) => PSEMatch.sameGame(g, name))) {
      toast(t("gameAlreadyInList")); return;
    }
    const resp = await send({ type: "ADD_MANUAL_OWNED", gameName: name });
    if (resp?.ok) { manualOwned = resp.list; el.newGame.value = ""; renderOwnedList(); toast(t("gameAdded", name)); }
  }

  async function removeManualGame(name) {
    const resp = await send({ type: "REMOVE_MANUAL_OWNED", gameName: name });
    if (resp?.ok) { manualOwned = resp.list; renderOwnedList(); toast(t("gameRemoved", name)); }
  }

  function renderOwnedList() {
    const psnKeys = new Set(psnOwned.map((g) => PSEMatch.baseKey(g)));
    const items = [];
    for (const g of psnOwned) items.push({ name: g, source: "psn" });
    for (const g of manualOwned) { if (!psnKeys.has(PSEMatch.baseKey(g))) items.push({ name: g, source: "manual" }); }
    items.sort((a, b) => a.name.localeCompare(b.name));
    ownedTotal = items.length;
    renderStats();

    if (!items.length) {
      el.ownList.innerHTML = `<div class="own-empty">${esc(t("emptyList"))}</div>`;
      el.ownCount.textContent = "";
      return;
    }
    el.ownList.innerHTML = items.map((i) => {
      const bc = i.source === "psn" ? "src-psn" : "src-manual";
      const bt = i.source === "psn" ? t("srcPsn") : t("srcManual");
      const rm = i.source === "manual" ? `<button class="rm" data-name="${esc(i.name)}" title="${esc(t("removeTitle"))}" aria-label="${esc(t("removeTitle"))}: ${esc(i.name)}">✕</button>` : "";
      return `<div class="own-item"><span><span class="src-badge ${bc}">${esc(bt)}</span> ${esc(i.name)}</span>${rm}</div>`;
    }).join("");
    el.ownCount.textContent = t("ownCountFmt", String(items.length), String(psnOwned.length), String(manualOwned.length));
    el.ownList.querySelectorAll(".rm").forEach((b) => b.addEventListener("click", () => removeManualGame(b.dataset.name)));
  }

  function renderStats() {
    if (!el.statOwned) return;
    const value = wishlistCache.reduce((sum, i) => sum + (i.lastCheckedPrice != null ? Number(i.lastCheckedPrice) : 0), 0);
    el.statOwned.textContent = String(ownedTotal);
    el.statWishlist.textContent = String(wishlistCache.length);
    el.statWishlistValue.textContent = `$${value.toFixed(2)}`;
    el.statReady.textContent = String(wishlistCache.filter((i) => PSEHelpers.isDealReady(i)).length);
  }

  /* ═══ PSN ═══ */
  let pendingNpsso = null; // held in memory only, while waiting for the optional permission
  await refreshPsnUI();

  function psnMsg(text, type = "info") {
    const c = { info: ["rgba(0,112,209,.1)", "rgba(0,112,209,.25)", "#4da6ff"], success: ["rgba(109,200,73,.1)", "rgba(109,200,73,.25)", "#6dc849"], error: ["rgba(255,64,64,.1)", "rgba(255,64,64,.25)", "#ff6b6b"] };
    const s = c[type] || c.info;
    el.psnMsg.textContent = text;
    el.psnMsg.style.cssText = `display:block;background:${s[0]};border:1px solid ${s[1]};color:${s[2]}`;
    setTimeout(() => (el.psnMsg.style.display = "none"), 8000);
  }

  // psn.js returns i18n keys (e.g. "psnErrAuthExpired"); older paths or thrown errors return raw
  // messages. For NPSSO auth failures we collapse the cryptic Sony-side errors into one friendly
  // message — the user-facing cause is almost always a bad/expired token.
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
      const s = await send({ type: "PSN_STATUS" });
      if (s?.connected) {
        el.psnConnUI.style.display = "block"; el.psnDiscUI.style.display = "none";
        el.psnName.textContent = s.profile?.onlineId || "PSN User";
        const safeAvatar = PSEHelpers.sanitizeUrl(s.profile?.avatarUrl);
        if (safeAvatar !== "#") {
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
        if (s.lastSync) {
          const d = new Date(s.lastSync);
          el.psnSync.textContent = `${t("psnLastSync")} ${d.toLocaleDateString(LOCALE)} ${d.toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" })}`;
        } else el.psnSync.textContent = t("psnNotSynced");
        const ld = await chrome.storage.local.get(["psn_owned", "manual_owned"]);
        psnOwned = ld.psn_owned || []; manualOwned = ld.manual_owned || [];
        renderOwnedList();
      } else { el.psnConnUI.style.display = "none"; el.psnDiscUI.style.display = "block"; }
    } catch { el.psnConnUI.style.display = "none"; el.psnDiscUI.style.display = "block"; }
  }

  /** Shared by manual connect, auto-detect and the "allow access and retry" button. */
  async function connectWith(npsso) {
    const r = await send({ type: "PSN_AUTHENTICATE", npsso });
    if (r?.success) {
      pendingNpsso = null;
      el.grantBtn.style.display = "none";
      psnMsg(t("psnConnectedSync"), "success");
      await send({ type: "PSN_FETCH_LIBRARY" });
      toast(t("psnSynced"));
      el.npssoIn.value = "";
      await refreshPsnUI();
      return true;
    }
    if (r?.error === "psnErrNeedsRedirectAccess") {
      pendingNpsso = npsso;
      el.grantBtn.style.display = "inline-block";
    } else {
      el.grantBtn.style.display = "none";
    }
    psnMsg(errMsg(r?.error), "error");
    return false;
  }

  el.autoBtn.addEventListener("click", async () => {
    el.autoBtn.disabled = true; el.autoBtn.innerHTML = `🔍 ${esc(t("psnSearching"))} <span class="spinner"></span>`;
    try {
      const r = await send({ type: "PSN_AUTO_DETECT" });
      if (r?.found) {
        psnMsg(t("psnTokenFound"), "info");
        await connectWith(r.npsso);
      } else psnMsg(t("psnTokenNotFound"), "error");
    } catch (e) { psnMsg(errMsg(e.message), "error"); }
    el.autoBtn.disabled = false; el.autoBtn.innerHTML = `🔍 ${esc(t("psnAutoDetect"))}`;
  });

  el.connBtn.addEventListener("click", async () => {
    const npsso = el.npssoIn.value.trim();
    if (!npsso) { psnMsg(t("psnEmptyToken"), "error"); return; }
    el.connBtn.disabled = true; el.connBtn.innerHTML = `<span class="spinner"></span>`;
    try { await connectWith(npsso); } catch (e) { psnMsg(errMsg(e.message), "error"); }
    el.connBtn.disabled = false; el.connBtn.textContent = t("psnConnect");
  });

  // chrome.permissions.request needs a user gesture, so it lives directly in this click handler.
  el.grantBtn.addEventListener("click", async () => {
    try {
      const granted = await chrome.permissions.request({ permissions: ["webRequest"] });
      if (granted && pendingNpsso) {
        psnMsg(t("psnAccessGranted"), "info");
        el.grantBtn.style.display = "none";
        await connectWith(pendingNpsso);
      } else if (!granted) {
        psnMsg(t("psnAccessDenied"), "error");
      }
    } catch (e) { psnMsg(errMsg(e.message), "error"); }
  });

  el.syncBtn.addEventListener("click", async () => {
    el.syncBtn.disabled = true; el.syncBtn.innerHTML = `🔄 ${esc(t("psnSyncing"))} <span class="spinner"></span>`;
    try {
      const r = await send({ type: "PSN_FETCH_LIBRARY" });
      if (r?.success) { toast(t("psnSyncedItems", String(r.totalCount))); await refreshPsnUI(); }
      else psnMsg(errMsg(r?.error), "error");
    } catch (e) { psnMsg(errMsg(e.message), "error"); }
    el.syncBtn.disabled = false; el.syncBtn.innerHTML = `🔄 ${esc(t("psnSyncNow"))}`;
  });

  el.disconnBtn.addEventListener("click", async () => {
    if (!confirm(t("psnDisconnectConfirm"))) return;
    await send({ type: "PSN_DISCONNECT" });
    psnOwned = []; renderOwnedList(); toast(t("psnDisconnected")); await refreshPsnUI();
  });

  /* ═══ Wishlist ═══ */
  await renderWishlist();
  el.wlFilter.addEventListener("input", () => paintWishlist());
  el.wlSort.addEventListener("change", () => paintWishlist());

  async function renderWishlist() {
    try {
      const r = await send({ type: "GET_WISHLIST" });
      wishlistCache = r?.list || [];
      renderStats();
      paintWishlist();
    } catch {
      el.wlList.innerHTML = `<div class="own-empty">${esc(t("errorApiDown"))}</div>`;
    }
  }

  function paintWishlist() {
    const list = PSEHelpers.sortWishlist(wishlistCache, el.wlSort.value, el.wlFilter.value);
    if (!wishlistCache.length) {
      el.wlList.innerHTML = `<div class="own-empty">${esc(t("wishlistEmpty"))}</div>`;
      el.wlCount.textContent = "";
      return;
    }
    const fmt = (p) => (p == null ? "—" : `$${Number(p).toFixed(2)}`);
    el.wlList.innerHTML = list.map((item) => {
      const lastDate = item.lastCheckedAt ? fmtDate(item.lastCheckedAt) : "—";
      const percentMode = item.targetPercent != null;
      const val = percentMode ? Number(item.targetPercent) : item.targetPrice != null ? Number(item.targetPrice).toFixed(2) : "";
      const ps = item.psPrice
        ? ` · ${esc(t("psPriceSeen", `${Number(item.psPrice.amount).toFixed(2)} ${item.psPrice.currency}`, fmtDate(item.psPrice.seenAt)))}`
        : "";
      const store = item.lastCheapestStore ? ` (${esc(item.lastCheapestStore)})` : "";
      const nm = esc(item.name);
      return `<div class="own-item wl-item" data-name="${nm}">
        <div class="wl-row">
          <div class="wl-main">
            <div class="wl-name">${nm}</div>
            <div class="wl-meta">${esc(t("wishlistLastChecked"))} ${esc(lastDate)} · ${esc(t("wishlistColLast"))} ${esc(fmt(item.lastCheckedPrice))}${store}${ps}</div>
          </div>
          <div class="wl-target-wrap">
            <select class="wl-mode" data-name="${nm}" aria-label="${esc(t("wishlistColTarget"))}: ${nm}">
              <option value="price"${percentMode ? "" : " selected"}>${esc(t("targetModePrice"))}</option>
              <option value="percent"${percentMode ? " selected" : ""}>${esc(t("targetModePercent"))}</option>
            </select>
            <input type="number" step="${percentMode ? "1" : "0.01"}" min="0" ${percentMode ? 'max="99"' : ""} class="wl-target" data-name="${nm}" value="${esc(val)}" aria-label="${esc(t("wishlistColTarget"))}: ${nm}">
            <button class="rm wl-rm" data-name="${nm}" title="${esc(t("removeTitle"))}" aria-label="${esc(t("removeTitle"))}: ${nm}">✕</button>
          </div>
        </div>
        <input type="text" class="wl-note" data-name="${nm}" maxlength="200" value="${esc(item.note || "")}" placeholder="${esc(t("wishlistNotePlaceholder"))}" aria-label="${esc(t("wishlistNotePlaceholder"))}: ${nm}">
      </div>`;
    }).join("");
    el.wlCount.textContent = t("wlCountFmt", String(list.length));

    const saveTarget = async (name) => {
      const row = [...el.wlList.querySelectorAll(".wl-item")].find((r) => r.dataset.name === name);
      const mode = row.querySelector(".wl-mode").value;
      const raw = row.querySelector(".wl-target").value;
      const num = raw === "" ? null : Number(raw);
      const msg = { type: "SET_WISHLIST_TARGET", gameName: name, targetPrice: mode === "price" ? num : null, targetPercent: mode === "percent" ? num : null };
      const resp = await send(msg);
      if (resp?.list) { wishlistCache = resp.list; renderStats(); paintWishlist(); }
      toast(t("saved"));
    };
    el.wlList.querySelectorAll(".wl-target").forEach((i) => i.addEventListener("change", () => saveTarget(i.dataset.name)));
    el.wlList.querySelectorAll(".wl-mode").forEach((s) => s.addEventListener("change", () => saveTarget(s.dataset.name)));
    el.wlList.querySelectorAll(".wl-note").forEach((i) => i.addEventListener("change", async () => {
      const resp = await send({ type: "SET_WISHLIST_TARGET", gameName: i.dataset.name, note: i.value });
      if (resp?.list) wishlistCache = resp.list;
      toast(t("saved"));
    }));
    el.wlList.querySelectorAll(".wl-rm").forEach((b) => b.addEventListener("click", async () => {
      await send({ type: "REMOVE_WISHLIST", gameName: b.dataset.name });
      await renderWishlist();
      toast(t("wishlistRemoved"));
    }));
  }

  el.wlCheckBtn.addEventListener("click", async () => {
    el.wlCheckBtn.disabled = true;
    const orig = el.wlCheckBtn.innerHTML;
    el.wlCheckBtn.innerHTML = `${esc(t("wishlistChecking"))} <span class="spinner"></span>`;
    try {
      await send({ type: "CHECK_WISHLIST_NOW" });
      await renderWishlist();
      toast(t("wishlistChecked"));
    } catch {
      toast(t("errorApiDown"));
    } finally {
      el.wlCheckBtn.disabled = false;
      el.wlCheckBtn.innerHTML = orig;
    }
  });

  // Share: the list is encoded into the URL fragment of a static viewer page (never sent to a server).
  el.wlShareBtn.addEventListener("click", async () => {
    if (!wishlistCache.length) { toast(t("wishlistEmpty")); return; }
    const url = `https://drummingbird1.github.io/ps-store-enhancer/wishlist.html#${PSEHelpers.encodeShareList(wishlistCache)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast(t("shareWishlistCopied"));
    } catch {
      window.prompt(t("shareWishlistBtn"), url);
    }
  });

  /* ═══ Export / Import ═══ */
  el.exportBtn.addEventListener("click", async () => {
    const data = await chrome.storage.local.get(["manual_owned", "wishlist"]);
    const payload = {
      app: "PS Store Enhancer",
      version: chrome.runtime.getManifest().version,
      exportedAt: new Date().toISOString(),
      manual_owned: data.manual_owned || [],
      wishlist: data.wishlist || []
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ps-store-enhancer-backup-${new Date().toISOString().slice(0, 10)}.json`;
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
      const data = JSON.parse(await file.text());
      // Accept backups from every past app name (the project has been renamed twice).
      const validApp = ["PS Store Enhancer", "PS Store Insight", "GameDeals+ for PS Store"].includes(data?.app);
      if (!data || typeof data !== "object" || !validApp) throw new Error("invalid format");
      const cur = await chrome.storage.local.get(["manual_owned", "wishlist"]);
      let count = 0;
      if (Array.isArray(data.manual_owned)) {
        const merged = [...(cur.manual_owned || [])];
        for (const name of data.manual_owned) {
          const s = String(name || "");
          if (s.trim() && !merged.some((g) => PSEMatch.sameGame(g, s))) { merged.push(s); count++; }
        }
        merged.sort((a, b) => a.localeCompare(b));
        await chrome.storage.local.set({ manual_owned: merged });
      }
      if (Array.isArray(data.wishlist)) {
        const merged = [...(cur.wishlist || [])];
        for (const item of data.wishlist) {
          const nm = String(item?.name || "");
          if (nm.trim() && !merged.some((g) => PSEMatch.sameGame(g.name, nm))) {
            merged.push({
              name: nm,
              storeUrl: item.storeUrl || null,
              addedAt: item.addedAt || Date.now(),
              targetPrice: item.targetPrice != null ? Number(item.targetPrice) : null,
              targetPercent: item.targetPercent != null ? Number(item.targetPercent) : null,
              note: String(item.note || "").slice(0, 200),
              lastCheckedPrice: item.lastCheckedPrice != null ? Number(item.lastCheckedPrice) : null,
              lastSavings: item.lastSavings != null ? Number(item.lastSavings) : null,
              lastCheckedAt: item.lastCheckedAt || null,
              notified: false
            });
            count++;
          }
        }
        await chrome.storage.local.set({ wishlist: merged });
      }
      const after = await chrome.storage.local.get(["manual_owned"]);
      manualOwned = after.manual_owned || [];
      renderOwnedList();
      await renderWishlist();
      toast(t("importSuccess", String(count)));
    } catch {
      toast(t("importFailed"));
    } finally {
      ev.target.value = ""; // allow re-import of the same file
      el.importBtn.disabled = false;
      el.importBtn.innerHTML = origLabel;
    }
  });

  /* ═══ Cache ═══ */
  async function refreshCache() {
    try { const s = await send({ type: "CACHE_STATS" }); if (s) { el.cActive.textContent = s.activeEntries; el.cExpired.textContent = s.expiredEntries; el.cSize.textContent = s.sizeKB; } }
    catch { el.cActive.textContent = el.cExpired.textContent = el.cSize.textContent = "—"; }
  }
  refreshCache();
  el.purgeBtn.addEventListener("click", async () => { await send({ type: "PURGE_CACHE" }); await refreshCache(); toast(t("cachePurged")); });
  el.clearBtn.addEventListener("click", async () => { const r = await send({ type: "CLEAR_CACHE" }); await refreshCache(); toast(t("cacheCleared", String(r?.removed || 0))); });

  /* ═══ Diagnostics ═══ */
  async function refreshDiag() {
    const r = await send({ type: "DIAG_GET" });
    const entries = r?.entries || [];
    el.diagBox.textContent = entries.length ? PSEDiag.formatEntries(entries) : t("diagEmpty");
    el.diagBox.scrollTop = el.diagBox.scrollHeight;
    return entries;
  }
  await refreshDiag();
  el.diagRefresh.addEventListener("click", refreshDiag);
  el.diagCopy.addEventListener("click", async () => {
    const entries = await refreshDiag();
    try {
      await navigator.clipboard.writeText(`PS Store Enhancer ${chrome.runtime.getManifest().version}\n${PSEDiag.formatEntries(entries)}`);
      toast(t("diagCopied"));
    } catch { toast(t("genericError")); }
  });
  el.diagClear.addEventListener("click", async () => { await send({ type: "DIAG_CLEAR" }); await refreshDiag(); });

  /* ═══ Privacy: erase everything ═══ */
  el.wipeBtn.addEventListener("click", async () => {
    if (!confirm(t("wipeConfirm"))) return;
    await send({ type: "WIPE_ALL_DATA" });
    toast(t("wipeDone"));
    setTimeout(() => location.reload(), 600);
  });

  let toastTimer;
  function toast(msg) { el.toast.textContent = msg; el.toast.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.toast.classList.remove("show"), 2200); }
});
