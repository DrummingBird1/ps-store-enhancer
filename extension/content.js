/**
 * PS Store Enhancer — Content Script
 *
 * Injects the price-insight, cross-platform and trophy cards, review-score badges, owned/wishlist
 * buttons, search filters and live search suggestions on store.playstation.com. All data comes
 * from the service worker (see .github/MESSAGING.md); this file only renders it.
 */
(() => {
  "use strict";

  const { escapeHtml, sanitizeUrl, buildStoreSearchUrl } = PSEHelpers;

  const SEL = {
    titleFallbacks: [
      '[data-qa="mfe-game-title#name"]',
      'h1[class*="GameTitle"]',
      'h1[class*="psw-t-title"]',
      "h1"
    ],
    ctaFallbacks: [
      '[data-qa="mfeCtaMain#offer0#ctaWithPrice"]',
      '[data-qa*="ctaWithPrice"]',
      '[class*="CTAPrice"]',
      '[class*="cta-container"]'
    ],
    gridItems: [
      'li[class*="ems-sdk"]',
      'div[data-qa*="search#productTile"]',
      'li[data-qa*="product"]',
      '[data-qa*="ems-sdk-grid"] li'
    ]
  };

  const BADGE_COLORS = { green: "#6dc849", yellow: "#f5c518", red: "#ff4040" };
  const DEFAULT_ORDER = ["priceInsight", "crossPlatform", "trophies"];
  const RTL_LANGS = ["he", "ar"];

  const DEFAULTS = {
    hideAddons: false, hideDlc: false, hideOwned: false,
    pspricesRegion: "IL", displayCurrency: "USD", theme: "auto",
    enableMetacritic: true, enablePriceHistory: true, enableTrophies: true,
    enableCrossPlatform: true, enableWishlist: true, enableSearchAutocomplete: true,
    enableSearchShortcut: true, enableTrophyRarity: false,
    cardsCollapsed: false, cardOrder: DEFAULT_ORDER, cardsHidden: [], regionAutoSet: false,
    currencyAutoSet: false
  };

  let settings = { ...DEFAULTS };
  let collapsedMap = {};
  let lastProcessedUrl = "";
  let pageToken = 0; // bumps on every page (re)process so late async results can be dropped
  let urlDebounceTimer = null;
  let gridObserver = null;
  let gridFilterTimer = null;
  let sparklineIdCounter = 0;
  let trophyDbPromise = null;

  function activeDir() {
    try {
      const lang = PSEi18n?.getActiveLang ? PSEi18n.getActiveLang() : "en";
      return RTL_LANGS.some((rl) => lang.startsWith(rl)) ? "rtl" : "ltr";
    } catch {
      return "ltr";
    }
  }

  /* ──── messaging with a short in-page cache (rapid re-renders don't re-ask the worker) ──── */
  const msgCache = new Map();
  function ask(type, payload = {}, ttl = 0) {
    const key = ttl ? type + JSON.stringify(payload) : null;
    if (key) {
      const hit = msgCache.get(key);
      if (hit && Date.now() - hit.t < ttl) return hit.p;
    }
    const p = Promise.resolve()
      .then(() => chrome.runtime.sendMessage({ type, ...payload }))
      .catch(() => undefined);
    if (key) msgCache.set(key, { t: Date.now(), p });
    return p;
  }

  /* ──── init ──── */
  async function init() {
    await initI18n();
    await loadSettings();
    autoDetectRegion();
    ensureRates();
    observePageChanges();
    processCurrentPage();
    initSearchAutocomplete();
    initChangelogBanner();
  }

  // Re-init i18n when language changes
  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (area === "sync" && changes.userLanguage) {
      await initI18n();
      lastProcessedUrl = "";
      processCurrentPage();
    }
  });

  async function loadSettings() {
    try {
      const result = await chrome.storage.sync.get(Object.keys(DEFAULTS));
      settings = { ...DEFAULTS };
      for (const k of Object.keys(DEFAULTS)) if (result[k] !== undefined) settings[k] = result[k];
      const order = Array.isArray(settings.cardOrder) ? settings.cardOrder.filter((k) => DEFAULT_ORDER.includes(k)) : [];
      for (const k of DEFAULT_ORDER) if (!order.includes(k)) order.push(k);
      settings.cardOrder = order;
      if (!Array.isArray(settings.cardsHidden)) settings.cardsHidden = [];
      const local = await chrome.storage.local.get(["pse_collapsed"]);
      collapsedMap = local.pse_collapsed || {};
    } catch {
      settings = { ...DEFAULTS };
    }
  }

  /* ──── Auto-detect PS Store region (and a matching display currency) from the URL ──── */
  const REGION_CURRENCY = {
    US: "USD", GB: "GBP", DE: "EUR", FR: "EUR", JP: "JPY", AU: "AUD", CA: "CAD", BR: "BRL",
    IL: "ILS", TR: "USD", SA: "USD", AE: "USD"
  };
  function autoDetectRegion() {
    const m = location.pathname.match(/^\/[a-z]{2}-([a-z]{2})\//i);
    if (!m) return;
    const region = m[1].toUpperCase();
    if (!Object.hasOwn(REGION_CURRENCY, region)) return;
    const patch = {};
    if (!settings.regionAutoSet) {
      patch.pspricesRegion = region;
      patch.regionAutoSet = true;
    }
    // Only ever fill the currency in once, and only if the user never changed it themselves.
    if (!settings.currencyAutoSet && settings.displayCurrency === "USD") {
      patch.displayCurrency = REGION_CURRENCY[region];
      patch.currencyAutoSet = true;
    } else if (!settings.currencyAutoSet) {
      patch.currencyAutoSet = true;
    }
    if (Object.keys(patch).length) chrome.storage.sync.set(patch).catch(() => {});
  }

  /* ──── Theme resolution ──── */
  function resolvedTheme() {
    if (settings.theme === "light") return "light";
    if (settings.theme === "dark") return "dark";
    if (settings.theme === "contrast") return "contrast";
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }

  /* ──── Currency formatting / conversion cache ──── */
  let exchangeRates = { USD: 1 }; // base USD → others
  async function ensureRates() {
    const cur = settings.displayCurrency || "USD";
    if (cur === "USD" || exchangeRates[cur] != null) return;
    const r = await ask("GET_RATES", { target: cur });
    if (r?.ok && r.rates) exchangeRates = { ...exchangeRates, ...r.rates };
  }
  // Numbers and dates follow the extension's own language, not the browser's (an English UI in a
  // Hebrew browser must not get Hebrew month names or RTL marks around prices).
  function uiLocale() {
    try {
      return PSEi18n.getActiveLang().replace("_", "-");
    } catch {
      return undefined;
    }
  }
  function formatPrice(usd) {
    const cur = settings.displayCurrency || "USD";
    return PSEHelpers.formatMoney(usd, cur, exchangeRates[cur], uiLocale());
  }
  function formatMonth(ms) {
    try {
      return new Date(ms).toLocaleDateString(uiLocale(), { year: "numeric", month: "short" });
    } catch {
      return "";
    }
  }

  /* ──── Screen-reader announcements ──── */
  function announce(text) {
    let live = document.getElementById("pse-live");
    if (!live) {
      live = document.createElement("div");
      live.id = "pse-live";
      live.className = "pse-injected pse-sr-only";
      live.setAttribute("aria-live", "polite");
      live.setAttribute("role", "status");
      document.body.appendChild(live);
    }
    live.textContent = "";
    setTimeout(() => (live.textContent = text), 50);
  }

  /* ──── SPA watcher: no body-wide MutationObserver, just URL checks ──── */
  function observePageChanges() {
    let currentUrl = location.href;
    const check = () => {
      if (location.href === currentUrl) return;
      currentUrl = location.href;
      lastProcessedUrl = "";
      clearTimeout(urlDebounceTimer);
      urlDebounceTimer = setTimeout(processCurrentPage, 900);
    };
    if (window.navigation && typeof window.navigation.addEventListener === "function") {
      window.navigation.addEventListener("navigatesuccess", check);
    }
    window.addEventListener("popstate", check);
    window.addEventListener("hashchange", check);
    setInterval(check, 1000); // one string comparison per second — the safety net for pushState

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "sync" || area === "local") {
        loadSettings().then(() => applySearchFilters());
      }
    });
  }

  /* ──── page processor ──── */
  function processCurrentPage() {
    const url = location.href;
    if (url === lastProcessedUrl) return;
    lastProcessedUrl = url;
    pageToken++;
    removeInjectedElements();
    if (gridObserver) { gridObserver.disconnect(); gridObserver = null; }

    if (isProductPage(url)) {
      const token = pageToken;
      waitForElement(SEL.titleFallbacks, 10000).then(async () => {
        if (token !== pageToken) return;
        const gameName = getGameTitle();
        if (!gameName) return;
        const jobs = [];
        if (settings.enableMetacritic) jobs.push(injectReviewScores(gameName));
        // Skeletons are placed synchronously in the user's chosen order, then filled in parallel.
        for (const key of settings.cardOrder) {
          if (settings.cardsHidden.includes(key)) continue;
          const def = CARD_DEFS[key];
          if (def && def.enabled()) jobs.push(def.run(gameName));
        }
        jobs.push(injectOwnedButton(gameName));
        if (settings.enableWishlist) jobs.push(injectWishlistButton(gameName));
        await Promise.all(jobs);
        if (token !== pageToken) return;
        recordPsPrice(gameName);
        maybeShowTour();
        maybeRateNudge();
      }).catch(() => {});
    }

    if (isSearchOrBrowsePage(url)) {
      setTimeout(applySearchFilters, 1200);
      observeGrid();
    }
  }

  /* ──── DOM helpers ──── */
  function isProductPage(url) { return /\/(concept|product)\/[A-Z0-9_-]+/i.test(url); }
  function isSearchOrBrowsePage(url) { return /\/(search|category|deals|collection)/i.test(url); }
  function removeInjectedElements() { document.querySelectorAll(".pse-injected").forEach((el) => el.remove()); }

  function findElement(list) {
    for (const s of list) { const el = document.querySelector(s); if (el) return el; }
    return null;
  }

  function getGameTitle() {
    const el = findElement(SEL.titleFallbacks);
    if (!el) return null;
    const clone = el.cloneNode(true);
    clone.querySelectorAll(".pse-injected").forEach((n) => n.remove());
    return clone.textContent.replace(/[™®©]/g, "").replace(/\s+/g, " ").trim() || null;
  }

  function waitForElement(sels, timeout = 8000) {
    return new Promise((resolve, reject) => {
      for (const s of sels) { const el = document.querySelector(s); if (el) return resolve(el); }
      const obs = new MutationObserver(() => {
        for (const s of sels) {
          const el = document.querySelector(s);
          if (el) { obs.disconnect(); clearTimeout(timer); return resolve(el); }
        }
      });
      obs.observe(document.body, { childList: true, subtree: true });
      const timer = setTimeout(() => { obs.disconnect(); reject(new Error("timeout")); }, timeout);
    });
  }

  // Validate the anchor is still in the DOM before inserting
  function insertAfterAnchor(element) {
    const cta = findElement(SEL.ctaFallbacks);
    const title = findElement(SEL.titleFallbacks);
    const allCards = document.querySelectorAll(".pse-injected:not(.pse-mc-link):not(.pse-owned-btn-wrap):not(.pse-sr-only):not(.pse-tour):not(.pse-wn-banner):not(.pse-rate-nudge):not(.pse-ac-dropdown)");
    const lastCard = allCards.length > 0 ? allCards[allCards.length - 1] : null;
    for (const anchor of [lastCard, cta, title]) {
      if (anchor && document.contains(anchor) && anchor.parentElement) {
        anchor.parentElement.insertBefore(element, anchor.nextSibling);
        return;
      }
    }
  }

  function createSkeleton(className) {
    const el = document.createElement("div");
    el.className = `pse-injected pse-skeleton ${className}`;
    el.dir = activeDir();
    el.dataset.pseTheme = resolvedTheme();
    el.setAttribute("aria-busy", "true");
    el.innerHTML = `
      <div class="pse-skel-line" style="width:60%"></div>
      <div class="pse-skel-line" style="width:100%;height:40px"></div>
      <div class="pse-skel-line" style="width:80%"></div>
    `;
    return el;
  }

  function placeSkeleton(className) {
    const sk = createSkeleton(className);
    insertAfterAnchor(sk);
    return sk;
  }

  /** Replace the skeleton with the finished element (or add it if the page re-rendered). */
  function fillSlot(slot, el) {
    if (slot.isConnected) slot.replaceWith(el);
    else insertAfterAnchor(el);
  }

  /* ──── collapsible cards ──── */
  function isCollapsed(key) {
    return Object.hasOwn(collapsedMap, key) ? !!collapsedMap[key] : !!settings.cardsCollapsed;
  }

  function buildCard({ key, cls, icon, title, tag, summary, body }) {
    const collapsed = isCollapsed(key);
    const el = document.createElement("section");
    el.className = `pse-injected pse-card ${cls}`;
    el.dir = activeDir();
    el.dataset.pseTheme = resolvedTheme();
    el.dataset.pseCard = key;
    el.setAttribute("role", "region");
    el.setAttribute("aria-label", title);
    el.innerHTML = `
      <button type="button" class="pse-card-head" aria-expanded="${!collapsed}">
        <span class="pse-card-icon" aria-hidden="true">${icon}</span>
        <span class="pse-card-title">${escapeHtml(title)}</span>
        ${tag ? `<span class="pse-cache-tag pse-usd-tag">${escapeHtml(tag)}</span>` : ""}
        <span class="pse-card-chevron" aria-hidden="true"></span>
      </button>
      <div class="pse-card-summary"${collapsed ? "" : " hidden"}>${escapeHtml(summary || "")}</div>
      <div class="pse-card-body"${collapsed ? " hidden" : ""}>${body}</div>`;
    el.querySelector(".pse-card-head").addEventListener("click", () => {
      const nowCollapsed = !isCollapsed(key);
      collapsedMap = { ...collapsedMap, [key]: nowCollapsed };
      chrome.storage.local.set({ pse_collapsed: collapsedMap }).catch(() => {});
      el.querySelector(".pse-card-head").setAttribute("aria-expanded", String(!nowCollapsed));
      el.querySelector(".pse-card-summary").hidden = !nowCollapsed;
      el.querySelector(".pse-card-body").hidden = nowCollapsed;
    });
    return el;
  }

  /* Lightweight inline notice (used when an API fetch fails) */
  function showInlineNotice(className, text) {
    const el = document.createElement("div");
    el.className = `pse-injected pse-inline-notice ${className}`;
    el.dir = activeDir();
    el.dataset.pseTheme = resolvedTheme();
    el.textContent = text;
    insertAfterAnchor(el);
  }

  /* ═══════════════════════════════════════════════
   * Review scores — Metacritic (PC) and Steam user rating, both from CheapShark
   * ═══════════════════════════════════════════════ */
  function scoreBadge({ href, logo, value, color, title }) {
    const link = document.createElement("a");
    link.href = sanitizeUrl(href);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = "pse-injected pse-mc-link";
    link.title = title;
    const wrap = document.createElement("span");
    wrap.className = "pse-metacritic-badge";
    const l = document.createElement("span");
    l.className = "pse-mc-logo";
    l.textContent = logo;
    const v = document.createElement("span");
    v.className = "pse-mc-score";
    v.style.background = color;
    v.textContent = value;
    wrap.append(l, v);
    link.appendChild(wrap);
    return link;
  }

  async function injectReviewScores(gameName) {
    const titleEl = findElement(SEL.titleFallbacks);
    if (!titleEl || titleEl.querySelector(".pse-mc-link")) return;
    const token = pageToken;
    const resp = await ask("FETCH_REVIEW_SCORES", { gameName }, 60000);
    if (token !== pageToken || !resp?.success || !resp.data?.found) return;
    const { metacritic, steam } = resp.data;
    const badges = [];
    if (metacritic) {
      const s = metacritic.score;
      badges.push(scoreBadge({
        href: metacritic.url, logo: "MC", value: String(s),
        color: s >= 75 ? BADGE_COLORS.green : s >= 50 ? BADGE_COLORS.yellow : BADGE_COLORS.red,
        title: t("metacriticTitle", String(s))
      }));
    }
    if (steam) {
      const p = steam.percent;
      badges.push(scoreBadge({
        href: steam.url || "", logo: "Steam", value: `${p}%`,
        color: p >= 70 ? BADGE_COLORS.green : p >= 40 ? BADGE_COLORS.yellow : BADGE_COLORS.red,
        title: t("steamRatingTitle", String(p), steam.count.toLocaleString(uiLocale()))
      }));
    }
    if (!badges.length) return;
    titleEl.style.display = "flex";
    titleEl.style.alignItems = "center";
    titleEl.style.gap = "12px";
    titleEl.style.flexWrap = "wrap";
    for (const b of badges) titleEl.appendChild(b);
  }

  /* ═══════════════════════════════════════════════
   * Price insight — REAL data only: the all-time low, today's cheapest, and the trend of prices
   * this browser actually recorded (no synthesized history)
   * ═══════════════════════════════════════════════ */
  async function injectPriceInsight(gameName) {
    const token = pageToken;
    const slot = placeSkeleton("pse-price-insight");
    await ensureRates();
    const resp = await ask("FETCH_PRICE_INSIGHT", { gameName }, 60000);
    if (token !== pageToken) return;
    if (!resp?.success) {
      slot.remove();
      showInlineNotice("pse-price-insight", t("errorApiDown"));
      return;
    }
    const d = resp.data;
    const region = settings.pspricesRegion || "IL";
    const pspUrl = `https://psprices.com/search/?q=${encodeURIComponent(gameName)}&platform=PS5&region=${region}`;
    const link = `<a href="${escapeHtml(sanitizeUrl(pspUrl))}" target="_blank" rel="noopener noreferrer" class="pse-ph-link">${escapeHtml(t("viewFullHistory"))}</a>`;

    let body = "";
    let summary = "";
    if (!d.found) {
      body = `<p class="pse-card-note">${escapeHtml(t("noPcData"))}</p>${link}`;
      summary = t("noPcData");
    } else {
      const parts = [];
      if (d.cheapestEver) {
        const when = d.cheapestEver.date ? formatMonth(d.cheapestEver.date) : "";
        parts.push(`<div class="pse-ph-cheapest">
          <span class="pse-ph-cheapest-label">${escapeHtml(t("cheapestEver"))}${when ? ` <small>(${escapeHtml(when)})</small>` : ""}</span>
          <span class="pse-ph-cheapest-value">${escapeHtml(formatPrice(d.cheapestEver.price))}</span>
        </div>`);
      }
      if (d.cheapest != null) {
        const chips = d.low === "at"
          ? `<span class="pse-chip pse-chip-good">${escapeHtml(t("insightAtLow"))}</span>`
          : d.low === "near"
            ? `<span class="pse-chip pse-chip-warn">${escapeHtml(t("insightNearLow"))}</span>`
            : "";
        parts.push(`<div class="pse-insight-row">
          <span class="pse-insight-label">${escapeHtml(t("insightCheapestNow"))}${d.cheapestStore ? ` · ${escapeHtml(d.cheapestStore)}` : ""}</span>
          <span class="pse-insight-value">${escapeHtml(formatPrice(d.cheapest))}</span>
        </div>${chips ? `<div class="pse-chip-row">${chips}</div>` : ""}`);
      }
      if (d.trend) {
        const pct = Math.abs(d.trend.pct).toFixed(1);
        const key = d.trend.direction === "down" ? "insightTrendDown" : d.trend.direction === "up" ? "insightTrendUp" : "insightTrendFlat";
        parts.push(`<div class="pse-trend pse-trend-${d.trend.direction}">${escapeHtml(t(key, pct, String(d.trend.spanDays)))}</div>`);
      }
      const pts = d.points || [];
      if (pts.length >= 4 && pts[pts.length - 1][0] - pts[0][0] >= 7) {
        const series = pts.map(([day, price]) => ({
          month: new Date(day * 86400000).toLocaleDateString(uiLocale(), { month: "short", day: "numeric" }),
          price
        }));
        parts.push(buildSparklineSVG(series));
        parts.push(`<p class="pse-card-note">${escapeHtml(t("insightRecordedSince", formatMonth(pts[0][0] * 86400000)))}</p>`);
      }
      if (d.edition) {
        parts.push(`<p class="pse-card-note">🎁 ${escapeHtml(t("crossPlatformEditionNote", d.edition))}</p>`);
      }
      body = parts.join("") + link;
      summary = [
        d.cheapestEver ? `${t("cheapestEver")} ${formatPrice(d.cheapestEver.price)}` : "",
        d.cheapest != null ? `${t("insightCheapestNow")} ${formatPrice(d.cheapest)}` : ""
      ].filter(Boolean).join(" · ");
    }

    const card = buildCard({
      key: "priceInsight", cls: "pse-price-insight",
      icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
      title: t("priceHistory"), tag: t("insightPcLabel"), summary, body
    });
    fillSlot(slot, card);
    announce(t("priceHistory"));
  }

  // Unique gradient ID per sparkline
  function buildSparklineSVG(points) {
    sparklineIdCounter++;
    const gradId = `pse-spark-grad-${sparklineIdCounter}`;
    const W = 320, H = 80, PAD = 8;
    const prices = points.map((p) => p.price);
    const minP = Math.min(...prices), maxP = Math.max(...prices);
    const range = maxP - minP || 1;

    const coords = points.map((p, i) => ({
      x: PAD + (i / (points.length - 1)) * (W - PAD * 2),
      y: PAD + (1 - (p.price - minP) / range) * (H - PAD * 2),
      price: p.price, month: p.month
    }));

    const pathD = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(" ");
    const areaD = pathD + ` L ${coords[coords.length - 1].x.toFixed(1)} ${H} L ${coords[0].x.toFixed(1)} ${H} Z`;
    const lowest = coords.reduce((m, c) => (c.price < m.price ? c : m), coords[0]);
    const labels = [points[0], points[Math.floor(points.length / 2)], points[points.length - 1]];
    const lCoords = [coords[0], coords[Math.floor(coords.length / 2)], coords[coords.length - 1]];

    return `<div class="pse-sparkline-wrap">
      <svg viewBox="0 0 ${W} ${H + 18}" class="pse-sparkline-svg" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeHtml(t("priceHistory"))}">
        <defs><linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#0070d1" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="#0070d1" stop-opacity="0.02"/>
        </linearGradient></defs>
        <path d="${areaD}" fill="url(#${gradId})" />
        <path d="${pathD}" fill="none" stroke="#4da6ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        ${coords.map((c) => `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="3" fill="#1b2838" stroke="#4da6ff" stroke-width="1.5" class="pse-spark-dot"><title>${escapeHtml(formatPrice(c.price))} — ${escapeHtml(c.month)}</title></circle>`).join("")}
        <circle cx="${lowest.x.toFixed(1)}" cy="${lowest.y.toFixed(1)}" r="4.5" fill="#6dc849" stroke="#fff" stroke-width="1.5"><title>${escapeHtml(formatPrice(lowest.price))}</title></circle>
        ${lCoords.map((c, i) => `<text x="${c.x.toFixed(1)}" y="${H + 14}" fill="#718096" font-size="8" text-anchor="middle">${escapeHtml(labels[i].month)}</text>`).join("")}
      </svg>
    </div>`;
  }

  /* ═══════════════════════════════════════════════
   * Cross-platform prices — the exact game's own CheapShark deals
   * ═══════════════════════════════════════════════ */
  async function injectCrossPlatform(gameName) {
    const token = pageToken;
    const slot = placeSkeleton("pse-xplatform");
    await ensureRates();
    const resp = await ask("FETCH_CROSS_PLATFORM", { gameName }, 60000);
    if (token !== pageToken) return;
    if (!resp?.success) {
      slot.remove();
      showInlineNotice("pse-xplatform", t("errorApiDown"));
      return;
    }
    const d = resp.data;
    if (!d.found || !d.deals.length) {
      slot.remove();
      // The price-insight card already explains "no PC listing"; avoid saying it twice.
      if (!CARD_DEFS.priceInsight.enabled() || settings.cardsHidden.includes("priceInsight")) {
        showInlineNotice("pse-xplatform", t("noPcData"));
      }
      return;
    }

    const icons = { "Steam": "🟦", "Epic Games Store": "🟪", "GOG": "🟩", "Humble Store": "🟧", "Origin / EA App": "🟥", "Ubisoft Store": "⬜", "GreenManGaming": "🟢", "Fanatical": "🔴" };
    const cur = settings.displayCurrency || "USD";
    const tagText = cur === "USD" ? "USD" : `${cur} (≈USD)`;

    const rowsHTML = d.deals.map((deal) => {
      const icon = icons[deal.store] || "🏪";
      const savings = deal.savings > 0 ? `<span class="pse-xp-savings">-${deal.savings}%</span>` : "";
      const original = deal.normalPrice > deal.price ? `<span class="pse-xp-original">${escapeHtml(formatPrice(deal.normalPrice))}</span>` : "";
      const editionTag = d.edition
        ? `<span class="pse-xp-edition" title="${escapeHtml(t("crossPlatformEditionNote", d.edition))}">🎁 ${escapeHtml(d.edition)}</span>`
        : "";
      return `<a href="${escapeHtml(sanitizeUrl(deal.dealLink))}" target="_blank" rel="noopener noreferrer" class="pse-xp-row">
        <span class="pse-xp-store">${icon} ${escapeHtml(deal.store)}${editionTag}</span>
        <span class="pse-xp-price-group">${savings}${original}<span class="pse-xp-current">${escapeHtml(formatPrice(deal.price))}</span></span>
      </a>`;
    }).join("");

    // Informational only: sales usually happen around these dates; this is not a prediction.
    let saleHTML = "";
    const sale = PSEHelpers.upcomingSales(new Date(), 1)[0];
    if (sale && (sale.underway || sale.daysUntil <= 90)) {
      const dateText = new Date(2000, sale.month - 1, sale.day).toLocaleDateString(uiLocale(), { month: "short", day: "numeric" });
      const text = sale.underway ? t("saleNow", sale.name) : t("saleSoon", sale.name, dateText, String(sale.daysUntil));
      saleHTML = `<p class="pse-card-note pse-sale-note">🗓 ${escapeHtml(text)}</p>`;
    }

    const body = `
      <div class="pse-xp-list">${rowsHTML}</div>
      <p class="pse-xp-note">${escapeHtml(t("crossPlatformSource"))}${cur === "USD" ? ` · ${escapeHtml(t("crossPlatformUSD"))}` : ""}</p>
      ${saleHTML}
      <button type="button" class="pse-share-btn">🖼 ${escapeHtml(t("shareDealBtn"))}</button>`;

    const best = d.deals[0];
    const card = buildCard({
      key: "crossPlatform", cls: "pse-xplatform", icon: "🔀",
      title: t("crossPlatformTitle"), tag: tagText,
      summary: `${best.store} ${formatPrice(best.price)}`, body
    });
    card.querySelector(".pse-share-btn").addEventListener("click", async (ev) => {
      const btn = ev.currentTarget;
      btn.disabled = true;
      try {
        const insight = (await ask("FETCH_PRICE_INSIGHT", { gameName }, 60000))?.data;
        const blob = await PSEExtras.drawDealImage({
          title: d.title || gameName,
          deals: d.deals,
          formatPrice,
          cheapestEver: insight && insight.cheapestEver ? insight.cheapestEver.price : null,
          labels: { lowestEver: t("cheapestEver"), footer: t("shareDealFooter") },
          dir: activeDir()
        });
        if (blob) PSEExtras.downloadBlob(blob, `ps-store-enhancer-${PSEMatch.titleKey(gameName) || "deal"}.png`);
      } catch {
        /* canvas unavailable: nothing to share */
      }
      btn.disabled = false;
    });
    fillSlot(slot, card);
    announce(t("crossPlatformTitle"));
  }

  /* ═══════════════════════════════════════════════
   * Trophy / completionist info
   * ═══════════════════════════════════════════════ */
  function loadTrophyDb() {
    if (!trophyDbPromise) {
      trophyDbPromise = fetch(chrome.runtime.getURL("data/trophies.json"))
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (!j || !j.games) return null;
          const index = new Map();
          for (const [k, v] of Object.entries(j.games)) index.set(PSEMatch.baseKey(k), { ...v, name: k });
          return index;
        })
        .catch(() => null);
    }
    return trophyDbPromise;
  }

  async function injectTrophyInfo(gameName) {
    const token = pageToken;
    const slot = placeSkeleton("pse-trophy-box");
    const [psnResp, index] = await Promise.all([ask("FETCH_PSN_TROPHY", { gameName }, 60000), loadTrophyDb()]);
    if (token !== pageToken) return;
    const psnTrophy = psnResp?.success ? psnResp.data : null;
    const local = index ? index.get(PSEMatch.baseKey(gameName)) || null : null;

    // If we have neither PSN data nor a database entry, don't fabricate trophy info
    if (!psnTrophy && !local) { slot.remove(); return; }

    const hasPlatinum = psnTrophy ? psnTrophy.hasPlatinum : local.hasPlatinum;
    const difficulty = local?.difficulty ?? null;
    const hours = local?.hours ?? null;
    const playthroughs = local?.playthroughs ?? null;
    const diffColor = difficulty == null ? "#4a5568"
      : difficulty <= 3 ? BADGE_COLORS.green
      : difficulty <= 6 ? BADGE_COLORS.yellow
      : BADGE_COLORS.red;
    const platIcon = hasPlatinum ? "🏆" : "❌";

    // Extras that need other data (all best-effort, all cached by the worker)
    const [ownedResp, insightResp, rarityResp] = await Promise.all([
      local ? ask("GET_MERGED_OWNED", {}, 30000) : null,
      local && hours ? ask("FETCH_PRICE_INSIGHT", { gameName }, 60000) : null,
      settings.enableTrophyRarity && psnTrophy ? ask("FETCH_TROPHY_RARITY", { gameName }, 60000) : null
    ]);
    if (token !== pageToken) return;

    const score = local ? PSEHelpers.completionistScore(difficulty, hours) : null;
    const scoreHTML = score ? `
      <div class="pse-trophy-stat">
        <div class="pse-trophy-stat-label">${escapeHtml(t("completionistScoreLabel"))}</div>
        <div class="pse-trophy-stat-value"><span class="pse-diff-badge pse-tier-${score.tier}" title="${score.score}/100">${escapeHtml(t("tier_" + score.tier))}</span></div>
      </div>` : "";

    let progressHTML = "";
    if (psnTrophy) {
      const pct = Math.max(0, Math.min(100, Number(psnTrophy.progress) || 0));
      const earnedPlat = psnTrophy.earnedPlatinum ? "✅" : "";
      progressHTML = `
        <div class="pse-trophy-stat" style="grid-column:1/-1">
          <div class="pse-trophy-stat-label">${escapeHtml(t("psnProgress"))} ${earnedPlat}</div>
          <div class="pse-trophy-progress-bar">
            <div class="pse-trophy-progress-fill" style="width:${pct}%"></div>
            <span class="pse-trophy-progress-text">${Number(psnTrophy.earnedTrophies) || 0}/${Number(psnTrophy.totalTrophies) || 0} (${pct}%)</span>
          </div>
        </div>`;
    }

    const lines = [];
    const pc = insightResp?.data?.cheapest;
    const perHour = pc != null ? PSEHelpers.pricePerHour(pc, hours) : null;
    if (perHour != null) lines.push(`💲 ${escapeHtml(t("pricePerHourLine", formatPrice(perHour)))}`);
    if (local && ownedResp?.list?.length) {
      const similar = PSEHelpers.similarOwned(PSEMatch.baseKey(gameName), difficulty, ownedResp.list, Object.fromEntries([...index.entries()].map(([k, v]) => [k, v])), (s) => PSEMatch.baseKey(s), 3);
      if (similar.length) lines.push(`🎯 ${escapeHtml(t("similarOwnedLine", similar.map((s) => s.name).join(", ")))}`);
    }
    const rar = rarityResp?.success ? rarityResp.data : null;
    if (rar && rar.rarestRemaining) {
      const nm = rar.rarestRemaining.name ? `${rar.rarestRemaining.name} ` : "";
      lines.push(`💎 ${escapeHtml(t("rarestRemainingLine", `${nm}(${rar.rarestRemaining.rate}%)`.trim()))}`);
    }
    const linesHTML = lines.length ? `<ul class="pse-trophy-notes">${lines.map((l) => `<li>${l}</li>`).join("")}</ul>` : "";

    const diffValueHTML = `<span class="pse-diff-badge" style="background:${diffColor}">${difficulty != null ? `${difficulty}/10` : "—"}</span>`;
    const body = `
      <div class="pse-trophy-grid">
        <div class="pse-trophy-stat">
          <div class="pse-trophy-stat-label">${escapeHtml(t("platinum"))}</div>
          <div class="pse-trophy-stat-value">${platIcon} ${hasPlatinum ? escapeHtml(t("yes")) : escapeHtml(t("no"))}</div>
        </div>
        <div class="pse-trophy-stat">
          <div class="pse-trophy-stat-label">${escapeHtml(t("difficulty"))}</div>
          <div class="pse-trophy-stat-value">${diffValueHTML}</div>
        </div>
        <div class="pse-trophy-stat">
          <div class="pse-trophy-stat-label">${escapeHtml(t("estimatedTime"))}</div>
          <div class="pse-trophy-stat-value">${hours ? `${escapeHtml(hours)} ${escapeHtml(t("hours"))}` : "—"}</div>
        </div>
        <div class="pse-trophy-stat">
          <div class="pse-trophy-stat-label">${escapeHtml(t("playthroughs"))}</div>
          <div class="pse-trophy-stat-value">${playthroughs ? escapeHtml(playthroughs) : "—"}</div>
        </div>
        ${scoreHTML}
        ${progressHTML}
      </div>
      ${linesHTML}
      <a href="https://psnprofiles.com/search/games?q=${encodeURIComponent(gameName)}" target="_blank" rel="noopener noreferrer" class="pse-trophy-link">${escapeHtml(t("trophyGuide"))}</a>
      <a href="https://howlongtobeat.com/?q=${encodeURIComponent(gameName)}" target="_blank" rel="noopener noreferrer" class="pse-trophy-link" style="margin-top:6px">${escapeHtml(t("hltbLink"))}</a>`;

    const card = buildCard({
      key: "trophies", cls: "pse-trophy-box", icon: "🎮",
      title: t("completionistInfo"), tag: psnTrophy ? "PSN" : "",
      summary: `${hasPlatinum ? "🏆" : "❌"} ${difficulty != null ? `${difficulty}/10` : ""} ${hours ? `· ${hours} ${t("hours")}` : ""}`.trim(),
      body
    });
    fillSlot(slot, card);
    announce(t("completionistInfo"));
  }

  const CARD_DEFS = {
    priceInsight: { enabled: () => settings.enablePriceHistory, run: injectPriceInsight },
    crossPlatform: { enabled: () => settings.enableCrossPlatform, run: injectCrossPlatform },
    trophies: { enabled: () => settings.enableTrophies, run: injectTrophyInfo }
  };

  /* ═══════════════════════════════════════════════
   * "Mark as owned" and wishlist buttons (placed immediately, enabled once state is known)
   * ═══════════════════════════════════════════════ */
  async function injectOwnedButton(gameName) {
    const token = pageToken;
    const wrap = document.createElement("div");
    wrap.className = "pse-injected pse-owned-btn-wrap";
    wrap.dir = activeDir();
    wrap.dataset.pseTheme = resolvedTheme();
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pse-owned-btn";
    btn.disabled = true;
    btn.textContent = "…";
    wrap.appendChild(btn);
    insertAfterAnchor(wrap);

    const resp = await ask("IS_GAME_OWNED", { gameName });
    if (token !== pageToken) return;
    let isOwned = resp?.owned || false;
    const paint = () => {
      btn.className = "pse-owned-btn" + (isOwned ? " pse-owned-active" : "");
      btn.textContent = isOwned ? `✓ ${t("iOwnThis")}` : `➕ ${t("markOwned")}`;
      btn.title = isOwned ? t("gameRemoved", gameName) : t("gameAdded", gameName);
      btn.disabled = false;
    };
    paint();
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      await ask(isOwned ? "REMOVE_MANUAL_OWNED" : "ADD_MANUAL_OWNED", { gameName });
      isOwned = !isOwned;
      msgCache.clear();
      paint();
    });
  }

  async function injectWishlistButton(gameName) {
    const token = pageToken;
    const wrap = document.createElement("div");
    wrap.className = "pse-injected pse-wishlist-btn-wrap";
    wrap.dir = activeDir();
    wrap.dataset.pseTheme = resolvedTheme();
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pse-wishlist-btn";
    btn.disabled = true;
    btn.textContent = "…";
    wrap.appendChild(btn);
    insertAfterAnchor(wrap);

    const r = await ask("IS_IN_WISHLIST", { gameName });
    if (token !== pageToken) return;
    let inList = r?.inWishlist || false;
    const paint = () => {
      btn.className = "pse-wishlist-btn" + (inList ? " pse-wishlist-active" : "");
      btn.textContent = inList ? t("wishlistInBtn") : t("wishlistAddBtn");
      btn.disabled = false;
    };
    paint();
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      if (inList) await ask("REMOVE_WISHLIST", { gameName });
      else await ask("ADD_WISHLIST", { gameName, storeUrl: location.href, psPrice: readPsPrice() || undefined });
      inList = !inList;
      msgCache.clear();
      paint();
    });
  }

  /* ═══════════════════════════════════════════════
   * PS Store price shown on the page (best effort — recorded locally as a snapshot)
   * ═══════════════════════════════════════════════ */
  function readPsPrice() {
    const hint = PSEHelpers.currencyFromStorePath(location.pathname);
    for (const sel of SEL.ctaFallbacks) {
      const el = document.querySelector(sel);
      const p = el && PSEHelpers.parsePsPrice(el.textContent, hint);
      if (p) return p;
    }
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const j = JSON.parse(s.textContent);
        const nodes = Array.isArray(j) ? j : [j];
        for (const n of nodes) {
          for (const o of [].concat((n && n.offers) || [])) {
            const price = Number(o && o.price);
            if (price > 0 && /^[A-Z]{3}$/.test((o && o.priceCurrency) || "")) return { amount: price, currency: o.priceCurrency };
          }
        }
      } catch { /* not JSON-LD we understand */ }
    }
    return null;
  }

  async function recordPsPrice(gameName) {
    const token = pageToken;
    try { await waitForElement(SEL.ctaFallbacks, 6000); } catch { /* price may live in JSON-LD */ }
    if (token !== pageToken) return;
    const p = readPsPrice();
    if (p) ask("RECORD_PS_PRICE", { gameName, amount: p.amount, currency: p.currency });
  }

  /* ═══════════════════════════════════════════════
   * First-run tour and one-time review nudge
   * ═══════════════════════════════════════════════ */
  async function maybeShowTour() {
    try {
      const d = await chrome.storage.local.get(["pse_tour_pending"]);
      if (!d.pse_tour_pending) return;
      PSEExtras.showTour({
        t, dir: activeDir, theme: resolvedTheme,
        onDone: () => chrome.storage.local.remove("pse_tour_pending").catch(() => {})
      });
    } catch { /* storage unavailable */ }
  }

  function maybeRateNudge() {
    PSEExtras.maybeRateNudge({
      t, dir: activeDir, theme: resolvedTheme,
      reviewUrl: `https://chromewebstore.google.com/detail/${chrome.runtime.id}/reviews`,
      storage: chrome.storage.local
    });
  }

  /* ═══════════════════════════════════════════════
   * Search filters
   * ═══════════════════════════════════════════════ */
  async function applySearchFilters() {
    const addonPatterns = [
      /\bcurrency\b/i, /\bcoins?\b/i, /\btokens?\b/i, /\bcredits?\b/i,
      /\bpoints?\s*pack/i, /\badd[\s-]?on\b/i, /\bv[\s-]?bucks\b/i,
      /\bgold\s*(bars?|pack)/i, /\bstarter\s*pack\b/i, /\bboost(er)?\s*pack\b/i,
      /\b\d+[\s,.]?\d*\s*(coins?|tokens?|credits?|gems?|gold|points)\b/i,
      /\bמטבעות\b/, /\bאסימונים\b/
    ];
    const dlcPatterns = [
      /\bdlc\b/i, /\bexpansion\b/i, /\bseason\s*pass\b/i,
      /\bbundle\b/i, /\bdeluxe\s*upgrade\b/i, /\bתוסף\b/, /\bחבילת\b/
    ];

    // Owned games compared by normalized identity (curly quotes, ™, editions, … all agree)
    let ownedKeys = new Set();
    if (settings.hideOwned) {
      const resp = await ask("GET_MERGED_OWNED", {}, 30000);
      if (resp?.list) ownedKeys = new Set(resp.list.map((g) => PSEMatch.baseKey(g)).filter(Boolean));
    }

    const items = document.querySelectorAll(SEL.gridItems.join(", "));
    items.forEach((item) => {
      const text = (item.textContent || "").trim();
      let hide = false;

      if (settings.hideAddons && addonPatterns.some((p) => p.test(text))) hide = true;
      if (!hide && settings.hideDlc && dlcPatterns.some((p) => p.test(text))) hide = true;

      if (!hide && settings.hideOwned && ownedKeys.size > 0) {
        const titleEl = item.querySelector('[data-qa*="game-title"], [class*="Title"], span[class*="name"]');
        const itemTitle = titleEl ? titleEl.textContent.trim() : "";
        if (itemTitle) {
          if (ownedKeys.has(PSEMatch.baseKey(itemTitle))) hide = true;
        } else {
          // No title element: whole-word containment of an owned game's name in the tile text
          const padded = ` ${PSEMatch.normalizeTitle(text)} `;
          for (const key of ownedKeys) {
            if (key.length > 3 && padded.includes(` ${key} `)) { hide = true; break; }
          }
        }
      }

      item.classList.toggle("pse-hidden-addon", hide);
    });
  }

  // Debounce grid observer (500ms + idle callback to reduce CPU)
  function observeGrid() {
    if (gridObserver) { gridObserver.disconnect(); gridObserver = null; }
    const grid = document.querySelector('[data-qa*="grid"], [class*="SearchResults"], main');
    if (!grid) return;
    const schedule = () => {
      if (typeof requestIdleCallback === "function") requestIdleCallback(applySearchFilters, { timeout: 800 });
      else applySearchFilters();
    };
    gridObserver = new MutationObserver(() => {
      clearTimeout(gridFilterTimer);
      gridFilterTimer = setTimeout(schedule, 500);
    });
    gridObserver.observe(grid, { childList: true, subtree: true });
  }

  /* ═══════════════════════════════════════════════
   * Live search autocomplete (+ "/" shortcut)
   * ═══════════════════════════════════════════════ */
  let acDebounce = null;
  let acDropdown = null;
  let acActiveInput = null;
  let acSelectedIndex = -1;
  let acLastQuery = "";
  let acToken = 0;

  function initSearchAutocomplete() {
    document.addEventListener("input", onSearchInput, true);
    document.addEventListener("keydown", onSearchKeydown, true);
    document.addEventListener("keydown", onShortcut, true);
    document.addEventListener("click", (e) => {
      if (acDropdown && e.target !== acActiveInput && !acDropdown.contains(e.target)) closeAutocomplete();
    });
    window.addEventListener("blur", closeAutocomplete);
    window.addEventListener("scroll", closeAutocomplete, true);
    window.addEventListener("resize", closeAutocomplete);
  }

  const UNSAFE_INPUT_TYPES = new Set(["password", "email", "tel", "number", "hidden", "cc-number"]);
  function isSearchInput(el) {
    if (!el || el.tagName !== "INPUT" || UNSAFE_INPUT_TYPES.has(el.type)) return false;
    if (el.type === "search") return true;
    const label = `${el.getAttribute("aria-label") || ""} ${el.placeholder || ""} ${el.getAttribute("data-qa") || ""}`.toLowerCase();
    return /search|חיפוש|بحث/.test(label);
  }

  /** "/" focuses the store's search box from anywhere on the page (never while typing). */
  function onShortcut(e) {
    if (!settings.enableSearchShortcut || e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
    const tgt = e.target;
    if (tgt && (tgt.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tgt.tagName))) return;
    const input = Array.from(document.querySelectorAll("input")).find(isSearchInput);
    if (!input) return;
    e.preventDefault();
    input.focus();
    if (typeof input.select === "function") input.select();
  }

  function onSearchInput(e) {
    if (!settings.enableSearchAutocomplete || !isSearchInput(e.target)) return;
    const el = e.target;
    acActiveInput = el;
    const query = el.value.trim();
    clearTimeout(acDebounce);
    if (query.length < 2) { closeAutocomplete(); return; }
    acDebounce = setTimeout(() => runAutocomplete(el, query), 300);
  }

  function onSearchKeydown(e) {
    if (!acDropdown) return;
    const rows = Array.from(acDropdown.querySelectorAll(".pse-ac-row"));
    if (!rows.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); acSelectedIndex = Math.min(acSelectedIndex + 1, rows.length - 1); highlightAcRows(rows); }
    else if (e.key === "ArrowUp") { e.preventDefault(); acSelectedIndex = Math.max(acSelectedIndex - 1, 0); highlightAcRows(rows); }
    else if (e.key === "Enter" && acSelectedIndex >= 0) { rows[acSelectedIndex].click(); }
    else if (e.key === "Escape") { closeAutocomplete(); }
  }

  function highlightAcRows(rows) {
    rows.forEach((r, i) => {
      const active = i === acSelectedIndex;
      r.classList.toggle("pse-ac-active", active);
      r.setAttribute("aria-selected", String(active));
    });
    if (acSelectedIndex >= 0) rows[acSelectedIndex].scrollIntoView({ block: "nearest" });
  }

  async function runAutocomplete(inputEl, query) {
    acLastQuery = query;
    const token = ++acToken;
    const [resp, ownedResp, wlResp] = await Promise.all([
      ask("FETCH_SEARCH_SUGGESTIONS", { query }),
      ask("GET_MERGED_OWNED", {}, 30000),
      ask("GET_WISHLIST", {}, 30000)
    ]);
    const results = resp?.success ? resp.data || [] : [];
    if (token !== acToken || acLastQuery !== query || !document.contains(inputEl)) return;
    const owned = new Set((ownedResp?.list || []).map((g) => PSEMatch.baseKey(g)));
    const wished = new Set((wlResp?.list || []).map((g) => PSEMatch.baseKey(g.name)));
    renderAutocomplete(inputEl, results, owned, wished);
  }

  function renderAutocomplete(inputEl, results, owned, wished) {
    closeAutocomplete();
    if (!results.length) return;
    acSelectedIndex = -1;

    const rect = inputEl.getBoundingClientRect();
    const dd = document.createElement("div");
    dd.className = "pse-injected pse-ac-dropdown";
    dd.dir = activeDir();
    dd.dataset.pseTheme = resolvedTheme();
    dd.setAttribute("role", "listbox");
    dd.setAttribute("aria-label", t("autocompleteBadge"));
    dd.style.position = "fixed";
    dd.style.top = `${rect.bottom + 4}px`;
    dd.style.left = `${rect.left}px`;
    dd.style.width = `${Math.max(rect.width, 300)}px`;

    const header = document.createElement("div");
    header.className = "pse-ac-header";
    header.textContent = t("autocompleteBadge");
    dd.appendChild(header);

    const list = document.createElement("div");
    list.className = "pse-ac-list";

    for (const g of results) {
      const row = document.createElement("a");
      row.className = "pse-ac-row";
      row.setAttribute("role", "option");
      row.href = buildStoreSearchUrl(location.pathname, g.title);

      if (g.thumb) {
        const img = document.createElement("img");
        img.className = "pse-ac-thumb";
        img.src = sanitizeUrl(g.thumb);
        img.alt = "";
        img.loading = "lazy";
        row.appendChild(img);
      }

      const info = document.createElement("div");
      info.className = "pse-ac-info";
      const titleEl = document.createElement("span");
      titleEl.className = "pse-ac-title";
      titleEl.textContent = g.title;
      info.appendChild(titleEl);
      if (g.cheapest != null) {
        const priceEl = document.createElement("span");
        priceEl.className = "pse-ac-price";
        priceEl.textContent = `${t("autocompletePcFrom")} ${formatPrice(g.cheapest)}`;
        info.appendChild(priceEl);
      }
      row.appendChild(info);

      const key = PSEMatch.baseKey(g.title);
      const flag = owned.has(key) ? ["✓", t("acOwnedBadge")] : wished.has(key) ? ["★", t("acWishlistBadge")] : null;
      if (flag) {
        const f = document.createElement("span");
        f.className = "pse-ac-flag";
        f.textContent = flag[0];
        f.title = flag[1];
        f.setAttribute("aria-label", flag[1]);
        row.appendChild(f);
      }
      list.appendChild(row);
    }
    dd.appendChild(list);

    document.body.appendChild(dd);
    acDropdown = dd;
  }

  function closeAutocomplete() {
    if (acDropdown) { acDropdown.remove(); acDropdown = null; }
    acSelectedIndex = -1;
  }

  /* ═══════════════════════════════════════════════
   * "What's new" banner after an update
   * ═══════════════════════════════════════════════ */
  let whatsNewShown = false;
  async function initChangelogBanner() {
    if (whatsNewShown) return;
    try {
      const d = await chrome.storage.local.get(["pse_changelog_unseen"]);
      const version = d.pse_changelog_unseen;
      if (!version) return;
      whatsNewShown = true;
      showChangelogBanner(version);
    } catch {}
  }

  function showChangelogBanner(version) {
    const banner = document.createElement("div");
    banner.className = "pse-injected pse-wn-banner";
    banner.dir = activeDir();
    banner.dataset.pseTheme = resolvedTheme();

    const text = document.createElement("span");
    text.className = "pse-wn-text";
    text.textContent = t("whatsNewBannerText", version);
    banner.appendChild(text);

    const actions = document.createElement("div");
    actions.className = "pse-wn-actions";

    const link = document.createElement("a");
    link.href = chrome.runtime.getURL("changelog.html");
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = "pse-wn-link";
    link.textContent = t("viewChangelog");
    link.addEventListener("click", () => dismissChangelogBanner(banner));
    actions.appendChild(link);

    const close = document.createElement("button");
    close.type = "button";
    close.className = "pse-wn-close";
    close.textContent = "✕";
    close.setAttribute("aria-label", t("whatsNewDismiss"));
    close.addEventListener("click", () => dismissChangelogBanner(banner));
    actions.appendChild(close);

    banner.appendChild(actions);
    document.body.appendChild(banner);
  }

  function dismissChangelogBanner(banner) {
    banner.remove();
    chrome.runtime.sendMessage({ type: "CHANGELOG_SEEN" }).catch(() => {});
  }

  init();
})();
