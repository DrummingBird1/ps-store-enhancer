/**
 * PS Store Insight — Content Script (v2.2)
 * All 13 fixes applied.
 */
(() => {
  "use strict";

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

  const TROPHY_DB = {
    "god of war ragnarök": { hasPlatinum: true, difficulty: 3, hours: "50-60", playthroughs: "1" },
    "god of war": { hasPlatinum: true, difficulty: 4, hours: "40-50", playthroughs: "1" },
    "the last of us part i": { hasPlatinum: true, difficulty: 3, hours: "15-20", playthroughs: "2" },
    "the last of us part ii remastered": { hasPlatinum: true, difficulty: 4, hours: "25-30", playthroughs: "2" },
    "the last of us part ii": { hasPlatinum: true, difficulty: 4, hours: "25-30", playthroughs: "2" },
    "marvel's spider-man 2": { hasPlatinum: true, difficulty: 2, hours: "20-25", playthroughs: "1" },
    "marvel's spider-man remastered": { hasPlatinum: true, difficulty: 3, hours: "20-25", playthroughs: "1" },
    "marvel's spider-man: miles morales": { hasPlatinum: true, difficulty: 2, hours: "10-15", playthroughs: "1" },
    "final fantasy xvi": { hasPlatinum: true, difficulty: 4, hours: "70-80", playthroughs: "2" },
    "final fantasy vii rebirth": { hasPlatinum: true, difficulty: 5, hours: "80-100", playthroughs: "1" },
    "final fantasy vii remake intergrade": { hasPlatinum: true, difficulty: 5, hours: "60-80", playthroughs: "2" },
    "elden ring": { hasPlatinum: true, difficulty: 7, hours: "100-120", playthroughs: "2-3" },
    "elden ring shadow of the erdtree": { hasPlatinum: true, difficulty: 7, hours: "40-60", playthroughs: "1" },
    "horizon forbidden west": { hasPlatinum: true, difficulty: 3, hours: "60-70", playthroughs: "1" },
    "horizon zero dawn remastered": { hasPlatinum: true, difficulty: 3, hours: "40-50", playthroughs: "1" },
    "gran turismo 7": { hasPlatinum: true, difficulty: 6, hours: "80-100", playthroughs: "1" },
    "returnal": { hasPlatinum: true, difficulty: 7, hours: "50-70", playthroughs: "1" },
    "ratchet & clank: rift apart": { hasPlatinum: true, difficulty: 3, hours: "12-15", playthroughs: "1" },
    "astro bot": { hasPlatinum: true, difficulty: 3, hours: "15-20", playthroughs: "1" },
    "astro's playroom": { hasPlatinum: true, difficulty: 2, hours: "4-6", playthroughs: "1" },
    "stellar blade": { hasPlatinum: true, difficulty: 4, hours: "30-40", playthroughs: "1" },
    "helldivers 2": { hasPlatinum: true, difficulty: 5, hours: "50-70", playthroughs: "1" },
    "alan wake 2": { hasPlatinum: true, difficulty: 5, hours: "25-35", playthroughs: "2" },
    "baldur's gate 3": { hasPlatinum: true, difficulty: 5, hours: "100-150", playthroughs: "2-3" },
    "resident evil 4": { hasPlatinum: true, difficulty: 5, hours: "30-40", playthroughs: "2" },
    "resident evil 2": { hasPlatinum: true, difficulty: 4, hours: "20-25", playthroughs: "4" },
    "resident evil 3": { hasPlatinum: true, difficulty: 4, hours: "15-20", playthroughs: "3" },
    "resident evil village": { hasPlatinum: true, difficulty: 4, hours: "20-25", playthroughs: "3" },
    "street fighter 6": { hasPlatinum: true, difficulty: 8, hours: "100+", playthroughs: "1" },
    "cyberpunk 2077": { hasPlatinum: true, difficulty: 3, hours: "60-80", playthroughs: "1" },
    "cyberpunk 2077: phantom liberty": { hasPlatinum: true, difficulty: 3, hours: "20-30", playthroughs: "1" },
    "hogwarts legacy": { hasPlatinum: true, difficulty: 3, hours: "35-45", playthroughs: "1" },
    "demon's souls": { hasPlatinum: true, difficulty: 6, hours: "40-60", playthroughs: "2-3" },
    "ghost of tsushima director's cut": { hasPlatinum: true, difficulty: 3, hours: "40-50", playthroughs: "1" },
    "ghost of yotei": { hasPlatinum: true, difficulty: 3, hours: "40-50", playthroughs: "1" },
    "hades": { hasPlatinum: true, difficulty: 4, hours: "60-80", playthroughs: "1" },
    "hades ii": { hasPlatinum: true, difficulty: 5, hours: "70-90", playthroughs: "1" },
    "stray": { hasPlatinum: true, difficulty: 3, hours: "6-10", playthroughs: "2" },
    "sifu": { hasPlatinum: true, difficulty: 9, hours: "20-40", playthroughs: "1" },
    "dave the diver": { hasPlatinum: true, difficulty: 3, hours: "30-40", playthroughs: "1" },
    "lies of p": { hasPlatinum: true, difficulty: 7, hours: "40-60", playthroughs: "3" },
    "black myth: wukong": { hasPlatinum: true, difficulty: 6, hours: "40-50", playthroughs: "1" },
    "metaphor: refantazio": { hasPlatinum: true, difficulty: 4, hours: "80-100", playthroughs: "1" },
    "persona 5 royal": { hasPlatinum: true, difficulty: 4, hours: "100-120", playthroughs: "1" },
    "persona 3 reload": { hasPlatinum: true, difficulty: 4, hours: "80-100", playthroughs: "1" },
    "tekken 8": { hasPlatinum: true, difficulty: 7, hours: "60-80", playthroughs: "1" },
    "mortal kombat 1": { hasPlatinum: true, difficulty: 6, hours: "40-50", playthroughs: "1" },
    "ea sports fc 24": { hasPlatinum: true, difficulty: 6, hours: "60-80", playthroughs: "1" },
    "ea sports fc 25": { hasPlatinum: true, difficulty: 6, hours: "60-80", playthroughs: "1" },
    "ea sports fc 26": { hasPlatinum: true, difficulty: 6, hours: "60-80", playthroughs: "1" },
    "mlb the show 24": { hasPlatinum: true, difficulty: 5, hours: "80-100", playthroughs: "1" },
    "nba 2k24": { hasPlatinum: true, difficulty: 5, hours: "60-80", playthroughs: "1" },
    "diablo iv": { hasPlatinum: true, difficulty: 4, hours: "60-80", playthroughs: "1" },
    "starfield": { hasPlatinum: true, difficulty: 3, hours: "60-80", playthroughs: "1" },
    "death stranding director's cut": { hasPlatinum: true, difficulty: 3, hours: "60-80", playthroughs: "1" },
    "death stranding 2": { hasPlatinum: true, difficulty: 3, hours: "50-70", playthroughs: "1" },
    "uncharted: legacy of thieves collection": { hasPlatinum: true, difficulty: 4, hours: "30-40", playthroughs: "2" },
    "concord": { hasPlatinum: false, difficulty: 5, hours: "30-40", playthroughs: "1" },
    "dragon's dogma 2": { hasPlatinum: true, difficulty: 5, hours: "50-70", playthroughs: "2" },
    "monster hunter wilds": { hasPlatinum: true, difficulty: 6, hours: "80-120", playthroughs: "1" },
    "monster hunter rise": { hasPlatinum: true, difficulty: 5, hours: "60-80", playthroughs: "1" },
    "kingdom hearts iv": { hasPlatinum: true, difficulty: 4, hours: "40-50", playthroughs: "1" },
    "dragon ball: sparking! zero": { hasPlatinum: true, difficulty: 5, hours: "50-70", playthroughs: "1" },
    "silent hill 2": { hasPlatinum: true, difficulty: 5, hours: "30-40", playthroughs: "3" },
    "until dawn": { hasPlatinum: true, difficulty: 3, hours: "12-18", playthroughs: "2-3" },
    "the plucky squire": { hasPlatinum: true, difficulty: 3, hours: "8-12", playthroughs: "1" },
    "ufc 5": { hasPlatinum: true, difficulty: 5, hours: "40-60", playthroughs: "1" },
    "call of duty: black ops 6": { hasPlatinum: true, difficulty: 5, hours: "30-50", playthroughs: "1" },
    "call of duty: modern warfare iii": { hasPlatinum: true, difficulty: 5, hours: "30-50", playthroughs: "1" },
    "indiana jones and the great circle": { hasPlatinum: true, difficulty: 3, hours: "25-35", playthroughs: "1" },
    "the witcher 3: wild hunt": { hasPlatinum: true, difficulty: 4, hours: "100-150", playthroughs: "1" },
    "red dead redemption 2": { hasPlatinum: true, difficulty: 5, hours: "100-120", playthroughs: "1" },
    "red dead redemption": { hasPlatinum: true, difficulty: 5, hours: "60-70", playthroughs: "1" },
    "gta v": { hasPlatinum: true, difficulty: 5, hours: "60-80", playthroughs: "1" },
    "grand theft auto v": { hasPlatinum: true, difficulty: 5, hours: "60-80", playthroughs: "1" }
  };

  let settings = {};
  let lastProcessedUrl = "";
  let gridObserver = null;
  let urlDebounceTimer = null;
  let gridFilterTimer = null; // Fix #7
  let sparklineIdCounter = 0; // Fix #8

  const RTL_LANGS = ["he", "ar"];
  function activeDir() {
    try {
      const lang = PSEi18n?.getActiveLang ? PSEi18n.getActiveLang() : "en";
      return RTL_LANGS.some(rl => lang.startsWith(rl)) ? "rtl" : "ltr";
    } catch { return "ltr"; }
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
      // Re-process current page with new language
      lastProcessedUrl = "";
      processCurrentPage();
    }
  });

  async function loadSettings() {
    try {
      const result = await chrome.storage.sync.get([
        "hideAddons", "hideDlc", "hideOwned", "pspricesRegion", "displayCurrency", "theme",
        "enableMetacritic", "enablePriceHistory", "enableTrophies", "enableCrossPlatform",
        "enableWishlist", "enableSearchAutocomplete", "regionAutoSet"
      ]);
      settings = {
        hideAddons: result.hideAddons ?? false,
        hideDlc: result.hideDlc ?? false,
        hideOwned: result.hideOwned ?? false,
        pspricesRegion: result.pspricesRegion ?? "IL",
        displayCurrency: result.displayCurrency ?? "USD",
        theme: result.theme ?? "auto",
        enableMetacritic: result.enableMetacritic ?? true,
        enablePriceHistory: result.enablePriceHistory ?? true,
        enableTrophies: result.enableTrophies ?? true,
        enableCrossPlatform: result.enableCrossPlatform ?? true,
        enableWishlist: result.enableWishlist ?? true,
        enableSearchAutocomplete: result.enableSearchAutocomplete ?? true,
        regionAutoSet: result.regionAutoSet ?? false
      };
    } catch {
      settings = {
        hideAddons: false, hideDlc: false, hideOwned: false,
        pspricesRegion: "IL", displayCurrency: "USD", theme: "auto",
        enableMetacritic: true, enablePriceHistory: true, enableTrophies: true,
        enableCrossPlatform: true, enableWishlist: true, enableSearchAutocomplete: true,
        regionAutoSet: false
      };
    }
  }

  /* ──── Auto-detect PS Store region from URL ──── */
  function autoDetectRegion() {
    if (settings.regionAutoSet) return; // already done once
    const m = location.pathname.match(/^\/[a-z]{2}-([a-z]{2})\//i);
    if (!m) return;
    const region = m[1].toUpperCase();
    const valid = ["IL","US","GB","DE","FR","JP","AU","CA","BR","TR","SA","AE"];
    if (!valid.includes(region)) return;
    chrome.storage.sync.set({ pspricesRegion: region, regionAutoSet: true })
      .catch(() => {});
  }

  /* ──── Theme resolution ──── */
  function resolvedTheme() {
    if (settings.theme === "light") return "light";
    if (settings.theme === "dark") return "dark";
    return (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) ? "light" : "dark";
  }

  /* ──── Currency formatting / conversion cache ──── */
  let exchangeRates = { USD: 1 }; // base USD → others
  async function ensureRates() {
    const cur = settings.displayCurrency || "USD";
    if (cur === "USD" || exchangeRates[cur] != null) return;
    try {
      const r = await chrome.runtime.sendMessage({ type: "GET_RATES", target: cur });
      if (r?.ok && r.rates) exchangeRates = { ...exchangeRates, ...r.rates };
    } catch {}
  }
  function formatPrice(usd) {
    const cur = settings.displayCurrency || "USD";
    const rate = exchangeRates[cur] || 1;
    const value = usd * rate;
    try {
      return new Intl.NumberFormat(undefined, { style: "currency", currency: cur, maximumFractionDigits: 2 }).format(value);
    } catch {
      return `${value.toFixed(2)} ${cur}`;
    }
  }

  /* ──── SPA watcher ──── */
  function observePageChanges() {
    let currentUrl = location.href;
    const obs = new MutationObserver(() => {
      if (location.href !== currentUrl) {
        currentUrl = location.href;
        lastProcessedUrl = "";
        clearTimeout(urlDebounceTimer);
        urlDebounceTimer = setTimeout(processCurrentPage, 900);
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });

    window.addEventListener("popstate", () => {
      lastProcessedUrl = "";
      clearTimeout(urlDebounceTimer);
      urlDebounceTimer = setTimeout(processCurrentPage, 900);
    });

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
    removeInjectedElements();
    if (gridObserver) { gridObserver.disconnect(); gridObserver = null; }

    if (isProductPage(url)) {
      waitForElement(SEL.titleFallbacks, 10000).then(async () => {
        const gameName = getGameTitle();
        if (!gameName) return;
        // Fix #11: show skeletons first, then replace with real data
        if (settings.enableMetacritic) await injectMetacriticScore(gameName);
        if (settings.enablePriceHistory) await injectPriceHistory(gameName);
        if (settings.enableCrossPlatform) await injectCrossPlatform(gameName);
        if (settings.enableTrophies) await injectTrophyInfo(gameName);
        // Fix #9: "mark as owned" button
        await injectOwnedButton(gameName);
        // v2.3: wishlist toggle button
        if (settings.enableWishlist) await injectWishlistButton(gameName);
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
  function removeInjectedElements() { document.querySelectorAll(".pse-injected").forEach(el => el.remove()); }

  function findElement(list) {
    for (const s of list) { const el = document.querySelector(s); if (el) return el; }
    return null;
  }

  function getGameTitle() {
    const el = findElement(SEL.titleFallbacks);
    return el ? el.textContent.replace(/[™®©]/g, "").trim() : null;
  }

  function waitForElement(sels, timeout = 8000) {
    return new Promise((resolve, reject) => {
      for (const s of sels) { const el = document.querySelector(s); if (el) return resolve(el); }
      const obs = new MutationObserver(() => {
        for (const s of sels) {
          const el = document.querySelector(s);
          if (el) { obs.disconnect(); clearTimeout(t); return resolve(el); }
        }
      });
      obs.observe(document.body, { childList: true, subtree: true });
      const t = setTimeout(() => { obs.disconnect(); reject(); }, timeout);
    });
  }

  // Fix #5: validate anchor is still in DOM before inserting
  function insertAfterAnchor(element) {
    const cta = findElement(SEL.ctaFallbacks);
    const title = findElement(SEL.titleFallbacks);
    const allCards = document.querySelectorAll(".pse-injected:not(.pse-mc-link):not(.pse-owned-btn-wrap)");
    const lastCard = allCards.length > 0 ? allCards[allCards.length - 1] : null;

    // Pick anchor, verify it's still in DOM
    const candidates = [lastCard, cta, title];
    for (const anchor of candidates) {
      if (anchor && document.contains(anchor) && anchor.parentElement) {
        anchor.parentElement.insertBefore(element, anchor.nextSibling);
        return;
      }
    }
  }

  // Fix #11: create a skeleton loading placeholder
  function createSkeleton(className) {
    const el = document.createElement("div");
    el.className = `pse-injected pse-skeleton ${className}`;
    el.dir = activeDir();
    el.dataset.pseTheme = resolvedTheme();
    el.innerHTML = `
      <div class="pse-skel-line" style="width:60%"></div>
      <div class="pse-skel-line" style="width:100%;height:40px"></div>
      <div class="pse-skel-line" style="width:80%"></div>
    `;
    return el;
  }

  // Fix #4: sanitize URLs to prevent XSS
  function sanitizeUrl(url) {
    if (!url) return "#";
    try {
      const u = new URL(url);
      if (u.protocol === "https:" || u.protocol === "http:") return u.href;
    } catch {}
    return "#";
  }

  // Attribute-safe escaping (covers quotes too) — escapeHtml output is used in both
  // text and attribute contexts (e.g. title="…"), and the textContent→innerHTML trick
  // does not escape quotes.
  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /* ═══════════════════════════════════════════════
   * FEATURE 1 — Metacritic / OpenCritic
   * ═══════════════════════════════════════════════ */
  async function injectMetacriticScore(gameName) {
    const titleEl = findElement(SEL.titleFallbacks);
    if (!titleEl || titleEl.querySelector(".pse-mc-link")) return;

    let scoreData = null;
    try {
      const resp = await chrome.runtime.sendMessage({ type: "FETCH_METACRITIC", gameName });
      if (resp?.success) scoreData = resp.data;
    } catch {}

    if (!scoreData) scoreData = localMetacriticLookup(gameName);
    if (!scoreData) return;

    const score = scoreData.score;
    const color = score >= 75 ? BADGE_COLORS.green : score >= 50 ? BADGE_COLORS.yellow : BADGE_COLORS.red;
    const safeUrl = sanitizeUrl(scoreData.url) || `https://opencritic.com/search?q=${encodeURIComponent(gameName)}`;

    const link = document.createElement("a");
    link.href = safeUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = "pse-injected pse-mc-link";
    link.title = `${escapeHtml(scoreData.source)}: ${score}/100`;
    link.innerHTML = `<span class="pse-metacritic-badge">
      <span class="pse-mc-logo">${scoreData.source === "OpenCritic" ? "OC" : "MC"}</span>
      <span class="pse-mc-score" style="background:${color}">${score}</span>
    </span>`;

    titleEl.style.display = "flex";
    titleEl.style.alignItems = "center";
    titleEl.style.gap = "12px";
    titleEl.style.flexWrap = "wrap";
    titleEl.appendChild(link);
  }

  function localMetacriticLookup(title) {
    const db = {
      "god of war ragnarök":94,"the last of us part i":88,"marvel's spider-man 2":90,
      "elden ring":96,"final fantasy vii rebirth":92,"astro bot":94,"baldur's gate 3":96,
      "resident evil 4":93,"alan wake 2":89,"demon's souls":92,"hades":93,
      "cyberpunk 2077":86,"hogwarts legacy":84,"stray":83
    };
    const key = title.toLowerCase().trim();
    for (const [k, v] of Object.entries(db)) {
      if (key.includes(k) || k.includes(key)) {
        return { score: v, source: "Metacritic", url: `https://www.metacritic.com/search/${encodeURIComponent(title)}/` };
      }
    }
    return null;
  }

  /* ═══════════════════════════════════════════════
   * FEATURE 2 — Price History with Sparkline
   * ═══════════════════════════════════════════════ */
  async function injectPriceHistory(gameName) {
    // Fix #11: skeleton while loading
    const skeleton = createSkeleton("pse-price-history");
    insertAfterAnchor(skeleton);

    const region = settings.pspricesRegion || "IL";
    const pspUrl = `https://psprices.com/search/?q=${encodeURIComponent(gameName)}&platform=PS5&region=${region}`;

    let priceData = null;
    try {
      const resp = await chrome.runtime.sendMessage({ type: "FETCH_PRICE_HISTORY", gameName });
      if (resp?.success) { priceData = resp.data; }
    } catch {}

    // Replace skeleton with real content
    const container = document.createElement("div");
    container.className = "pse-injected pse-price-history";
    container.dir = activeDir();
    container.dataset.pseTheme = resolvedTheme();

    let sparklineHTML = "", cheapestHTML = "";
    if (priceData?.points?.length > 0) {
      sparklineHTML = buildSparklineSVG(priceData.points);
      if (priceData.cheapestEver != null) {
        cheapestHTML = `<div class="pse-ph-cheapest">
          <span class="pse-ph-cheapest-label">${t("cheapestEver")}</span>
          <span class="pse-ph-cheapest-value">$${priceData.cheapestEver.toFixed(2)}</span>
        </div>`;
      }
    }

    // Synthesized history is always estimated — be transparent about it
    const estimateTag = priceData?.points?.length > 0
      ? `<span class="pse-cache-tag pse-estimate-tag" title="${escapeHtml(t("priceHistoryEstimated"))}">~ ${escapeHtml(t("priceHistoryEstimated"))}</span>`
      : "";

    container.innerHTML = `
      <div class="pse-ph-header">
        <svg class="pse-ph-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
        <span>${t("priceHistory")}</span>
        ${estimateTag}
      </div>
      ${sparklineHTML}${cheapestHTML}
      <a href="${sanitizeUrl(pspUrl)}" target="_blank" rel="noopener noreferrer" class="pse-ph-link">${t("viewFullHistory")}</a>
    `;

    if (skeleton.parentElement) {
      skeleton.parentElement.replaceChild(container, skeleton);
    } else {
      skeleton.remove();
      insertAfterAnchor(container);
    }
  }

  // Fix #8: unique gradient ID per sparkline
  function buildSparklineSVG(points) {
    sparklineIdCounter++;
    const gradId = `pse-spark-grad-${sparklineIdCounter}`;
    const W = 320, H = 80, PAD = 8;
    const prices = points.map(p => p.price);
    const minP = Math.min(...prices), maxP = Math.max(...prices);
    const range = maxP - minP || 1;

    const coords = points.map((p, i) => ({
      x: PAD + (i / (points.length - 1)) * (W - PAD * 2),
      y: PAD + (1 - (p.price - minP) / range) * (H - PAD * 2),
      price: p.price, month: p.month
    }));

    const pathD = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(" ");
    const areaD = pathD + ` L ${coords[coords.length-1].x.toFixed(1)} ${H} L ${coords[0].x.toFixed(1)} ${H} Z`;
    const lowest = coords.reduce((m, c) => c.price < m.price ? c : m, coords[0]);

    const labels = [points[0], points[Math.floor(points.length/2)], points[points.length-1]];
    const lCoords = [coords[0], coords[Math.floor(coords.length/2)], coords[coords.length-1]];

    return `<div class="pse-sparkline-wrap">
      <svg viewBox="0 0 ${W} ${H+18}" class="pse-sparkline-svg" xmlns="http://www.w3.org/2000/svg">
        <defs><linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#0070d1" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="#0070d1" stop-opacity="0.02"/>
        </linearGradient></defs>
        <path d="${areaD}" fill="url(#${gradId})" />
        <path d="${pathD}" fill="none" stroke="#4da6ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        ${coords.map(c => `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="3" fill="#1b2838" stroke="#4da6ff" stroke-width="1.5" class="pse-spark-dot"><title>$${c.price.toFixed(2)} — ${escapeHtml(c.month)}</title></circle>`).join("")}
        <circle cx="${lowest.x.toFixed(1)}" cy="${lowest.y.toFixed(1)}" r="4.5" fill="#6dc849" stroke="#fff" stroke-width="1.5"><title>${t("cheapestEver")} $${lowest.price.toFixed(2)}</title></circle>
        <text x="${lowest.x.toFixed(1)}" y="${lowest.y-8}" fill="#6dc849" font-size="9" text-anchor="middle" font-weight="700">$${lowest.price.toFixed(2)}</text>
        ${lCoords.map((c,i) => `<text x="${c.x.toFixed(1)}" y="${H+14}" fill="#718096" font-size="8" text-anchor="middle">${escapeHtml(labels[i].month)}</text>`).join("")}
      </svg>
    </div>`;
  }

  /* ═══════════════════════════════════════════════
   * FEATURE 3 — Cross-Platform Prices (Fix #4: XSS)
   * ═══════════════════════════════════════════════ */
  async function injectCrossPlatform(gameName) {
    const skeleton = createSkeleton("pse-xplatform");
    insertAfterAnchor(skeleton);

    await ensureRates();

    let deals = [];
    let apiFailed = false;
    try {
      const resp = await chrome.runtime.sendMessage({ type: "FETCH_CROSS_PLATFORM", gameName });
      if (resp?.success) deals = resp.data;
      else apiFailed = true;
    } catch { apiFailed = true; }

    skeleton.remove();
    if (deals.length === 0) {
      if (apiFailed) showInlineNotice("pse-xplatform", t("errorApiDown"));
      return;
    }

    const container = document.createElement("div");
    container.className = "pse-injected pse-xplatform";
    container.dir = activeDir();
    container.dataset.pseTheme = resolvedTheme();

    const icons = { "Steam":"🟦","Epic Games Store":"🟪","GOG":"🟩","Humble Store":"🟧","Origin / EA App":"🟥","Ubisoft Store":"⬜","GreenManGaming":"🟢","Fanatical":"🔴" };

    const cur = settings.displayCurrency || "USD";
    const tagText = cur === "USD" ? "USD" : `${cur} (≈USD)`;

    // Fix #4: sanitize all deal links
    const rowsHTML = deals.map(d => {
      const icon = icons[d.store] || "🏪";
      const savings = d.savings > 0 ? `<span class="pse-xp-savings">-${d.savings}%</span>` : "";
      const original = d.normalPrice > d.price ? `<span class="pse-xp-original">${escapeHtml(formatPrice(d.normalPrice))}</span>` : "";
      return `<a href="${sanitizeUrl(d.dealLink)}" target="_blank" rel="noopener noreferrer" class="pse-xp-row">
        <span class="pse-xp-store">${icon} ${escapeHtml(d.store)}</span>
        <span class="pse-xp-price-group">${savings}${original}<span class="pse-xp-current">${escapeHtml(formatPrice(d.price))}</span></span>
      </a>`;
    }).join("");

    container.innerHTML = `
      <div class="pse-xp-header"><span>🔀</span><span>${t("crossPlatformTitle")}</span><span class="pse-cache-tag pse-usd-tag" title="${escapeHtml(t("crossPlatformUSD"))}">${escapeHtml(tagText)}</span></div>
      <div class="pse-xp-list">${rowsHTML}</div>
      <p class="pse-xp-note">${t("crossPlatformSource")}${cur === "USD" ? ` · ${escapeHtml(t("crossPlatformUSD"))}` : ""}</p>
    `;
    insertAfterAnchor(container);
  }

  /* Lightweight inline error notice (used when an API fetch fails) */
  function showInlineNotice(className, text) {
    const el = document.createElement("div");
    el.className = `pse-injected pse-inline-notice ${className}`;
    el.dir = activeDir();
    el.dataset.pseTheme = resolvedTheme();
    el.textContent = text;
    insertAfterAnchor(el);
  }

  /* ═══════════════════════════════════════════════
   * FEATURE 4 — Trophy Info (Fix #12: live PSN data)
   * ═══════════════════════════════════════════════ */
  async function injectTrophyInfo(gameName) {
    const skeleton = createSkeleton("pse-trophy-box");
    insertAfterAnchor(skeleton);

    // Try live PSN trophy data first (Fix #12)
    let psnTrophy = null;
    try {
      const resp = await chrome.runtime.sendMessage({ type: "FETCH_PSN_TROPHY", gameName });
      if (resp?.success) psnTrophy = resp.data;
    } catch {}

    const localTrophy = lookupTrophyData(gameName);

    // If we have neither PSN data nor a local DB entry, don't fabricate trophy info
    if (!psnTrophy && !localTrophy) {
      skeleton.remove();
      return;
    }

    const container = document.createElement("div");
    container.className = "pse-injected pse-trophy-box";
    container.dir = activeDir();
    container.dataset.pseTheme = resolvedTheme();

    // Merge: prefer PSN for hasPlatinum/progress, local for difficulty/hours
    const hasPlatinum = psnTrophy ? psnTrophy.hasPlatinum : localTrophy.hasPlatinum;
    const difficulty = localTrophy?.difficulty ?? null;
    const hours = localTrophy?.hours ?? null;
    const playthroughs = localTrophy?.playthroughs ?? null;
    const diffColor = difficulty == null ? "#4a5568"
      : difficulty <= 3 ? BADGE_COLORS.green
      : difficulty <= 6 ? BADGE_COLORS.yellow
      : BADGE_COLORS.red;
    const platIcon = hasPlatinum ? "🏆" : "❌";

    // PSN progress bar
    let progressHTML = "";
    if (psnTrophy) {
      const pct = psnTrophy.progress || 0;
      const earnedPlat = psnTrophy.earnedPlatinum ? "✅" : "";
      progressHTML = `
        <div class="pse-trophy-stat" style="grid-column:1/-1">
          <div class="pse-trophy-stat-label">${t("psnProgress")} ${earnedPlat}</div>
          <div class="pse-trophy-progress-bar">
            <div class="pse-trophy-progress-fill" style="width:${pct}%"></div>
            <span class="pse-trophy-progress-text">${psnTrophy.earnedTrophies}/${psnTrophy.totalTrophies} (${pct}%)</span>
          </div>
        </div>`;
    }

    const diffValueHTML = difficulty != null
      ? `<span class="pse-diff-badge" style="background:${diffColor}">${difficulty}/10</span>`
      : `<span class="pse-diff-badge" style="background:${diffColor}">—</span>`;

    container.innerHTML = `
      <div class="pse-trophy-header"><span>🎮</span><span>${t("completionistInfo")}</span>${psnTrophy ? '<span class="pse-cache-tag">PSN</span>' : ''}</div>
      <div class="pse-trophy-grid">
        <div class="pse-trophy-stat">
          <div class="pse-trophy-stat-label">${t("platinum")}</div>
          <div class="pse-trophy-stat-value">${platIcon} ${hasPlatinum ? t("yes") : t("no")}</div>
        </div>
        <div class="pse-trophy-stat">
          <div class="pse-trophy-stat-label">${t("difficulty")}</div>
          <div class="pse-trophy-stat-value">${diffValueHTML}</div>
        </div>
        <div class="pse-trophy-stat">
          <div class="pse-trophy-stat-label">${t("estimatedTime")}</div>
          <div class="pse-trophy-stat-value">${hours ? `${escapeHtml(hours)} ${t("hours")}` : "—"}</div>
        </div>
        <div class="pse-trophy-stat">
          <div class="pse-trophy-stat-label">${t("playthroughs")}</div>
          <div class="pse-trophy-stat-value">${playthroughs ? escapeHtml(playthroughs) : "—"}</div>
        </div>
        ${progressHTML}
      </div>
      <a href="https://psnprofiles.com/search/games?q=${encodeURIComponent(gameName)}" target="_blank" rel="noopener noreferrer" class="pse-trophy-link">${t("trophyGuide")}</a>
      <a href="https://howlongtobeat.com/?q=${encodeURIComponent(gameName)}" target="_blank" rel="noopener noreferrer" class="pse-trophy-link" style="margin-top:6px">${t("hltbLink")}</a>
    `;

    if (skeleton.parentElement) {
      skeleton.parentElement.replaceChild(container, skeleton);
    } else {
      skeleton.remove();
      insertAfterAnchor(container);
    }
  }

  function lookupTrophyData(title) {
    const key = title.toLowerCase().replace(/[™®©]/g, "").trim();
    for (const [k, d] of Object.entries(TROPHY_DB)) {
      if (key.includes(k) || k.includes(key)) return d;
    }
    return null; // unknown game — caller decides whether to skip the box
  }

  /* ═══════════════════════════════════════════════
   * Fix #9 — "Mark as owned" button on product page
   * ═══════════════════════════════════════════════ */
  async function injectOwnedButton(gameName) {
    let isOwned = false;
    try {
      const resp = await chrome.runtime.sendMessage({ type: "IS_GAME_OWNED", gameName });
      isOwned = resp?.owned || false;
    } catch {}

    const wrap = document.createElement("div");
    wrap.className = "pse-injected pse-owned-btn-wrap";
    wrap.dir = activeDir();
    wrap.dataset.pseTheme = resolvedTheme();

    const btn = document.createElement("button");
    btn.className = "pse-owned-btn" + (isOwned ? " pse-owned-active" : "");
    btn.textContent = isOwned ? `✓ ${t("iOwnThis")}` : `➕ ${t("markOwned")}`;
    btn.title = isOwned ? t("gameRemoved", gameName) : t("gameAdded", gameName);

    btn.addEventListener("click", async () => {
      btn.disabled = true;
      if (isOwned) {
        await chrome.runtime.sendMessage({ type: "REMOVE_MANUAL_OWNED", gameName });
        isOwned = false;
      } else {
        await chrome.runtime.sendMessage({ type: "ADD_MANUAL_OWNED", gameName });
        isOwned = true;
      }
      btn.className = "pse-owned-btn" + (isOwned ? " pse-owned-active" : "");
      btn.textContent = isOwned ? `✓ ${t("iOwnThis")}` : `➕ ${t("markOwned")}`;
      btn.title = isOwned ? t("gameRemoved", gameName) : t("gameAdded", gameName);
      btn.disabled = false;
    });

    wrap.appendChild(btn);
    insertAfterAnchor(wrap);
  }

  /* ═══════════════════════════════════════════════
   * FEATURE 6 — Wishlist toggle button
   * ═══════════════════════════════════════════════ */
  async function injectWishlistButton(gameName) {
    let inList = false;
    try {
      const r = await chrome.runtime.sendMessage({ type: "IS_IN_WISHLIST", gameName });
      inList = r?.inWishlist || false;
    } catch {}

    const wrap = document.createElement("div");
    wrap.className = "pse-injected pse-wishlist-btn-wrap";
    wrap.dir = activeDir();
    wrap.dataset.pseTheme = resolvedTheme();

    const btn = document.createElement("button");
    btn.className = "pse-wishlist-btn" + (inList ? " pse-wishlist-active" : "");
    btn.textContent = inList ? t("wishlistInBtn") : t("wishlistAddBtn");

    btn.addEventListener("click", async () => {
      btn.disabled = true;
      if (inList) {
        await chrome.runtime.sendMessage({ type: "REMOVE_WISHLIST", gameName });
        inList = false;
      } else {
        await chrome.runtime.sendMessage({ type: "ADD_WISHLIST", gameName, storeUrl: location.href });
        inList = true;
      }
      btn.className = "pse-wishlist-btn" + (inList ? " pse-wishlist-active" : "");
      btn.textContent = inList ? t("wishlistInBtn") : t("wishlistAddBtn");
      btn.disabled = false;
    });

    wrap.appendChild(btn);
    insertAfterAnchor(wrap);
  }

  /* ═══════════════════════════════════════════════
   * FEATURE 5 — Search Filters (Fix #6, #7)
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

    // Fix #2: get merged owned list from background
    let ownedSet = new Set();
    if (settings.hideOwned) {
      try {
        const resp = await chrome.runtime.sendMessage({ type: "GET_MERGED_OWNED" });
        if (resp?.list) ownedSet = new Set(resp.list.map(g => g.toLowerCase().trim()));
      } catch {}
    }

    const items = document.querySelectorAll(SEL.gridItems.join(", "));
    items.forEach(item => {
      const text = (item.textContent || "").trim();
      let hide = false;

      if (settings.hideAddons && addonPatterns.some(p => p.test(text))) hide = true;
      if (!hide && settings.hideDlc && dlcPatterns.some(p => p.test(text))) hide = true;

      // Fix #6: match owned by item title text, not full card textContent
      if (!hide && settings.hideOwned && ownedSet.size > 0) {
        // Try to find the title element within the grid item
        const titleEl = item.querySelector('[data-qa*="game-title"], [class*="Title"], span[class*="name"]');
        const itemTitle = titleEl ? titleEl.textContent.trim().toLowerCase() : "";

        if (itemTitle) {
          // Strict: exact title match against owned list
          if (ownedSet.has(itemTitle)) hide = true;
        } else {
          // Fallback: check if any owned game name matches as substring
          const textLower = text.toLowerCase();
          for (const owned of ownedSet) {
            if (owned.length > 3 && textLower.includes(owned)) { hide = true; break; }
          }
        }
      }

      item.classList.toggle("pse-hidden-addon", hide);
    });
  }

  // Fix #7: debounce grid observer (v2.3: bumped to 500ms + idle callback to reduce CPU)
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
   * FEATURE — Live Search Autocomplete
   * Adds an enriched (price + thumbnail) dropdown under the PS Store search box,
   * clearly labeled as PS Store Insight's own overlay — it does not touch or replace
   * Sony's native search UI. Selecting a row jumps to PS Store's own search
   * results for that exact title.
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
    rows.forEach((r, i) => r.classList.toggle("pse-ac-active", i === acSelectedIndex));
    if (acSelectedIndex >= 0) rows[acSelectedIndex].scrollIntoView({ block: "nearest" });
  }

  async function runAutocomplete(inputEl, query) {
    acLastQuery = query;
    const token = ++acToken;
    let results = [];
    try {
      const resp = await chrome.runtime.sendMessage({ type: "FETCH_SEARCH_SUGGESTIONS", query });
      if (resp?.success) results = resp.data || [];
    } catch {}
    if (token !== acToken || acLastQuery !== query || !document.contains(inputEl)) return;
    renderAutocomplete(inputEl, results);
  }

  function renderAutocomplete(inputEl, results) {
    closeAutocomplete();
    if (!results.length) return;
    acSelectedIndex = -1;

    const rect = inputEl.getBoundingClientRect();
    const dd = document.createElement("div");
    dd.className = "pse-injected pse-ac-dropdown";
    dd.dir = activeDir();
    dd.dataset.pseTheme = resolvedTheme();
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
      row.href = buildStoreSearchUrl(g.title);

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

  function buildStoreSearchUrl(title) {
    const m = location.pathname.match(/^\/([a-z]{2}-[a-z]{2})\//i);
    const locale = m ? m[1] : "en-us";
    return `https://store.playstation.com/${locale}/search/${encodeURIComponent(title)}`;
  }

  /* ═══════════════════════════════════════════════
   * FEATURE — "What's new" banner after an update
   * Shown at most once per page load; dismissed permanently once the user closes it
   * or opens the full changelog (mirrors the popup's "What's new" card).
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
