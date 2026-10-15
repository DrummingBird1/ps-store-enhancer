/**
 * PS Store Enhancer — optional on-page extras (shareable deal image, first-run tour, one-time
 * review nudge). Kept separate from content.js so the core injector stays readable. Every function
 * receives what it needs through `ctx`; nothing here talks to the network.
 */
const PSEExtras = (() => {
  "use strict";

  /* ───────────── shareable deal image ───────────── */

  function fitText(g, text, maxWidth) {
    if (g.measureText(text).width <= maxWidth) return text;
    let s = text;
    while (s.length > 1 && g.measureText(s + "…").width > maxWidth) s = s.slice(0, -1);
    return s + "…";
  }

  /**
   * Draw a 1200×630 price-comparison card. `d`: { title, deals[], formatPrice, cheapestEver,
   * labels: { lowestEver, footer }, dir }.
   * @returns {Promise<Blob|null>}
   */
  function drawDealImage(d) {
    const W = 1200;
    const H = 630;
    const rtl = d.dir === "rtl";
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const g = c.getContext("2d");
    const bg = g.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, "#0a0f1a");
    bg.addColorStop(1, "#003087");
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    g.direction = rtl ? "rtl" : "ltr";
    g.textAlign = rtl ? "right" : "left";
    const x = rtl ? W - 60 : 60;
    const font = '"Segoe UI", Inter, Arial, sans-serif';

    g.fillStyle = "#ffffff";
    g.font = `700 56px ${font}`;
    g.fillText(fitText(g, d.title, W - 120), x, 110);

    const best = d.deals[0];
    if (best) {
      g.fillStyle = "#6dc849";
      g.font = `800 120px ${font}`;
      g.fillText(d.formatPrice(best.price), x, 250);
      g.fillStyle = "#a0aec0";
      g.font = `500 34px ${font}`;
      const sub = best.savings > 0 ? `${best.store}  ·  -${best.savings}%` : best.store;
      g.fillText(sub, x, 305);
    }

    let y = 380;
    g.font = `600 34px ${font}`;
    for (const row of d.deals.slice(0, 4)) {
      g.fillStyle = "#e2e8f0";
      g.textAlign = rtl ? "right" : "left";
      g.fillText(row.store, x, y);
      g.textAlign = rtl ? "left" : "right";
      g.fillText(d.formatPrice(row.price), rtl ? 60 : W - 60, y);
      y += 52;
    }

    g.textAlign = rtl ? "right" : "left";
    if (d.cheapestEver) {
      g.fillStyle = "#f5c518";
      g.font = `500 28px ${font}`;
      g.fillText(`${d.labels.lowestEver} ${d.formatPrice(d.cheapestEver)}`, x, H - 78);
    }
    g.fillStyle = "#718096";
    g.font = `500 24px ${font}`;
    g.fillText(d.labels.footer, x, H - 36);

    return new Promise((resolve) => c.toBlob((b) => resolve(b), "image/png"));
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  /* ───────────── first-run tour ───────────── */

  /**
   * A short, skippable walkthrough of the injected cards. Shown once per install (the caller
   * stores `pse_tour_done`); every step is optional and skipped when its card is absent.
   */
  function showTour(ctx) {
    const defs = [
      [".pse-price-insight", "tourStepInsight"],
      [".pse-xplatform", "tourStepCompare"],
      [".pse-trophy-box", "tourStepTrophies"],
      [".pse-wishlist-btn-wrap", "tourStepWishlist"]
    ];
    const steps = defs
      .map(([sel, key]) => ({ el: document.querySelector(sel), key }))
      .filter((s) => s.el);
    if (!steps.length || document.querySelector(".pse-tour")) return;

    let i = 0;
    const panel = document.createElement("div");
    panel.className = "pse-injected pse-tour";
    panel.dir = ctx.dir();
    panel.dataset.pseTheme = ctx.theme();
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", ctx.t("tourTitle"));
    const title = document.createElement("div");
    title.className = "pse-tour-title";
    const text = document.createElement("div");
    text.className = "pse-tour-text";
    const row = document.createElement("div");
    row.className = "pse-tour-row";
    const skip = document.createElement("button");
    skip.type = "button";
    skip.className = "pse-tour-skip";
    skip.textContent = ctx.t("tourSkip");
    const next = document.createElement("button");
    next.type = "button";
    next.className = "pse-tour-next";
    row.append(skip, next);
    panel.append(title, text, row);

    function clearHighlight() {
      document.querySelectorAll(".pse-tour-highlight").forEach((e) => e.classList.remove("pse-tour-highlight"));
    }
    function finish() {
      clearHighlight();
      panel.remove();
      ctx.onDone();
    }
    function render() {
      clearHighlight();
      const s = steps[i];
      s.el.classList.add("pse-tour-highlight");
      s.el.scrollIntoView({ block: "center", behavior: "auto" });
      title.textContent = `${ctx.t("tourTitle")} · ${i + 1}/${steps.length}`;
      text.textContent = ctx.t(s.key);
      next.textContent = i === steps.length - 1 ? ctx.t("tourDone") : ctx.t("tourNext");
    }
    skip.addEventListener("click", finish);
    next.addEventListener("click", () => {
      if (i === steps.length - 1) finish();
      else {
        i++;
        render();
      }
    });
    document.body.appendChild(panel);
    render();
  }

  /* ───────────── one-time review nudge ───────────── */

  const NUDGE_MIN_VIEWS = 12;
  const NUDGE_MIN_DAYS = 7;

  /**
   * Counts product-page views and, after sustained use, offers ONE dismissible review prompt
   * (never repeated: both buttons mark it done).
   * @param {{t:Function, dir:Function, theme:Function, reviewUrl:string, storage:{get:Function,set:Function}}} ctx
   */
  async function maybeRateNudge(ctx) {
    let st = {};
    try {
      st = (await ctx.storage.get(["pse_rate"])).pse_rate || {};
    } catch {
      return;
    }
    if (st.done) return;
    const now = Date.now();
    st = { views: (st.views || 0) + 1, first: st.first || now, done: false };
    const due = st.views >= NUDGE_MIN_VIEWS && now - st.first >= NUDGE_MIN_DAYS * 86400000;
    if (!due || document.querySelector(".pse-rate-nudge")) {
      try { await ctx.storage.set({ pse_rate: st }); } catch {}
      return;
    }
    const finish = async () => {
      banner.remove();
      try { await ctx.storage.set({ pse_rate: { ...st, done: true } }); } catch {}
    };
    const banner = document.createElement("div");
    banner.className = "pse-injected pse-rate-nudge";
    banner.dir = ctx.dir();
    banner.dataset.pseTheme = ctx.theme();
    const msg = document.createElement("span");
    msg.className = "pse-wn-text";
    msg.textContent = ctx.t("rateNudgeText");
    const actions = document.createElement("div");
    actions.className = "pse-wn-actions";
    const link = document.createElement("a");
    link.className = "pse-wn-link";
    link.href = ctx.reviewUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = ctx.t("rateNudgeBtn");
    link.addEventListener("click", finish);
    const no = document.createElement("button");
    no.type = "button";
    no.className = "pse-wn-close";
    no.textContent = ctx.t("rateNudgeDismiss");
    no.addEventListener("click", finish);
    actions.append(link, no);
    banner.append(msg, actions);
    document.body.appendChild(banner);
    try { await ctx.storage.set({ pse_rate: st }); } catch {}
  }

  return { drawDealImage, downloadBlob, showTour, maybeRateNudge, NUDGE_MIN_VIEWS, NUDGE_MIN_DAYS };
})();

self.PSEExtras = PSEExtras;
