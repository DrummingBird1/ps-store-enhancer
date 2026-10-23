/**
 * PS Store Enhancer — PSN Integration Module
 * ==========================================
 * - Auth: injects the user's NPSSO into the cookie jar only for the duration of the exchange and
 *   then restores whatever cookie was there before (so a wrong token never replaces a real Sony
 *   session and nothing is left behind).
 * - Redirect handling: reads Sony's redirect Location directly; if Chrome hides it (opaque
 *   redirect) and the optional `webRequest` permission was granted, falls back to observing the
 *   redirect. Every step is written to the local diagnostics log (never any token value).
 * - Token requests: made as Sony's PlayStation app (its client id + Basic client auth, JWT tokens),
 *   exactly like the open-source psn-api project.
 * - Requests: one 401 → refresh-token → retry before giving up.
 * - Owned games: separate psn_owned vs manual_owned, merged on read.
 * - Disconnect: only removes PSN-sourced data, keeps manual data.
 */

const PSN = (() => {
  "use strict";

  const SONY_URL = "https://ca.account.sony.com";
  const AUTH_BASE = `${SONY_URL}/api/authz/v3/oauth`;
  const CLIENT_ID = "09515159-7237-4370-9b40-3806e67c0891";
  // HTTP Basic credentials of that same client ("<client id>:<client secret>", base64) for the token
  // endpoint. They identify Sony's PlayStation app, not the user, and are published by psn-api.
  const CLIENT_AUTH = "Basic MDk1MTUxNTktNzIzNy00MzcwLTliNDAtMzgwNmU2N2MwODkxOnVjUGprYTV0bnRCMktxc1A=";
  const REDIRECT_URI = "com.scee.psxandroid.scecompcall://redirect";
  const SCOPE = "psn:mobile.v2.core psn:clientapp";
  const CODE_RE = /code=(v3\.[A-Za-z0-9_-]+)/;

  const GAMELIST_URL = "https://m.np.playstation.com/api/gamelist/v2/users/me/titles";
  // Only the category values Sony documents for this endpoint (as used by the psn-api project).
  // It lists games the account has played; DLC and add-ons never appear in it.
  const GAME_CATEGORIES = "ps4_game,ps5_native_game,pspc_game";
  const PROFILE_URL = "https://m.np.playstation.com/api/userProfile/v1/internal/users/me/profiles";
  const TROPHY_BASE = "https://m.np.playstation.com/api/trophy/v1";
  const TROPHY_URL = `${TROPHY_BASE}/users/me/trophyTitles`;

  const SYNC_INTERVAL = 2 * 3600000;
  const SYNC_COOLDOWN = 30000; // 30s between syncs
  const NPSSO_OK = /^[A-Za-z0-9_-]{40,128}$/;

  let lastSyncTime = 0;
  const log = (event, details) => PSEDiag.log("psn", event, details);

  /** Sony's short JSON error code (e.g. "invalid_client") — never a token — or null. */
  async function sonyErrorCode(resp) {
    try {
      const body = await resp.clone().json();
      const code = body && (body.error || body.error_code || body.code);
      return code == null ? null : String(code).replace(/[^\w.-]/g, "").slice(0, 40) || null;
    } catch {
      return null;
    }
  }

  /* ════════════════════════════════════════════
   * COOKIE HYGIENE — never clobber the user's real Sony cookie
   * ════════════════════════════════════════════ */

  async function readSonyCookie() {
    try {
      return await chrome.cookies.get({ url: SONY_URL, name: "npsso" });
    } catch {
      return null;
    }
  }

  async function restoreSonyCookie(prev) {
    try {
      if (prev && prev.value) {
        const details = {
          url: SONY_URL,
          name: "npsso",
          value: prev.value,
          path: prev.path || "/",
          secure: prev.secure !== false,
          httpOnly: prev.httpOnly !== false,
          sameSite: prev.sameSite || "no_restriction"
        };
        if (prev.hostOnly === false && prev.domain) details.domain = prev.domain;
        if (prev.expirationDate) details.expirationDate = prev.expirationDate;
        await chrome.cookies.set(details);
      } else {
        await chrome.cookies.remove({ url: SONY_URL, name: "npsso" });
      }
    } catch (e) {
      log("cookie-restore-failed", { message: e && e.message });
    }
  }

  /* ════════════════════════════════════════════
   * AUTH
   * ════════════════════════════════════════════ */

  async function authenticate(npsso) {
    if (!npsso || npsso.length < 30) {
      log("auth-rejected", { reason: "too-short" });
      return { success: false, error: "psnErrTokenShort" };
    }
    // NPSSO tokens are ~64 chars, base64url-ish: alphanumeric + - _
    // Reject obvious garbage before sending to Sony (avoids confusing 400 errors)
    if (!NPSSO_OK.test(npsso)) {
      log("auth-rejected", { reason: "bad-format" });
      return { success: false, error: "psnErrInvalidFormat" };
    }

    const previous = await readSonyCookie();
    try {
      log("auth-start", { hadPrevious: !!previous });
      await chrome.cookies.set({
        url: SONY_URL,
        name: "npsso",
        value: npsso,
        domain: "ca.account.sony.com",
        path: "/",
        secure: true,
        httpOnly: true,
        sameSite: "no_restriction"
      });

      // Step A — authorization code
      const step = await exchangeNpssoForCode();
      if (!step.code) {
        log("auth-failed", { step: "authorize", reason: step.reason });
        return {
          success: false,
          error: step.reason === "opaque-redirect" ? "psnErrNeedsRedirectAccess" : "psnErrAuthCode",
          detail: `authorize/${step.reason}`
        };
      }

      // Step B — code → tokens
      const exchange = await exchangeCodeForTokens(step.code);
      const tokens = exchange.tokens || {};
      if (!tokens.access_token) {
        const reason = `${exchange.status}${exchange.errorCode ? "-" + exchange.errorCode : ""}`;
        log("auth-failed", { step: "token", reason });
        return { success: false, error: "psnErrAccessToken", detail: `token/${reason}` };
      }

      await chrome.storage.local.set({
        psn_npsso: npsso,
        psn_access_token: tokens.access_token,
        psn_refresh_token: tokens.refresh_token || null,
        psn_token_expiry: Date.now() + (tokens.expires_in || 3600) * 1000
      });

      // Step C — profile
      const profile = await fetchProfile(tokens.access_token);
      if (profile) await chrome.storage.local.set({ psn_profile: profile });
      log("auth-ok", { profile: !!profile, expiresIn: tokens.expires_in });
      return { success: true, profile };
    } catch (err) {
      log("auth-error", { message: err && err.message });
      return { success: false, error: err.message, detail: "network" };
    } finally {
      await restoreSonyCookie(previous);
    }
  }

  /**
   * Ask Sony for an authorization code using the NPSSO cookie.
   * @returns {Promise<{code:string|null, reason?:string}>}
   */
  async function exchangeNpssoForCode() {
    const params = new URLSearchParams({
      access_type: "offline",
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      scope: SCOPE
    });
    const url = `${AUTH_BASE}/authorize?${params}`;

    // Optional fallback: observe the redirect (needs the optional `webRequest` permission). Both the
    // 302 response headers and the redirect event are watched; whichever carries the code wins.
    let observed = null;
    const webRequest = chrome.webRequest;
    const wr = webRequest && webRequest.onBeforeRedirect;
    const grab = (value) => {
      const m = String(value || "").match(CODE_RE);
      if (m) observed = m[1];
    };
    const onRedirect = (d) => grab(d && d.redirectUrl);
    const onHeaders = (d) => {
      const h = ((d && d.responseHeaders) || []).find((x) => String(x && x.name).toLowerCase() === "location");
      if (h) grab(h.value);
    };
    const filter = { urls: [`${SONY_URL}/*`] };
    const attached = [];
    if (wr) {
      try {
        wr.addListener(onRedirect, filter);
        attached.push(() => wr.removeListener(onRedirect));
        if (webRequest.onHeadersReceived) {
          webRequest.onHeadersReceived.addListener(onHeaders, filter, ["responseHeaders"]);
          attached.push(() => webRequest.onHeadersReceived.removeListener(onHeaders));
        }
        log("webrequest-listener", { attached: true });
      } catch (e) {
        log("webrequest-listener", { attached: false, message: e && e.message });
      }
    }

    let opaque = false;
    let reason = null; // why no code was found, for the Diagnostics log and the error detail
    try {
      // Attempt 1: redirect:"manual" — read the Location header directly when Chrome exposes it
      try {
        const resp = await fetch(url, { redirect: "manual", credentials: "include" });
        const loc = resp.headers.get("location") || "";
        opaque = resp.type === "opaqueredirect" || resp.status === 0;
        const errorCode = resp.status >= 400 ? await sonyErrorCode(resp) : null;
        log("authorize-response", {
          type: resp.type,
          status: resp.status,
          hasLocation: !!loc,
          locationHost: loc ? PSEDiag.urlInfo(loc) : null
        });
        const m = loc.match(CODE_RE) || String(resp.url || "").match(CODE_RE);
        if (m) return { code: m[1] };
        if (loc) reason = "login-redirect"; // Sony sent us to its sign-in page: the NPSSO is not valid
        else if (resp.status >= 400) reason = `http-${resp.status}${errorCode ? "-" + errorCode : ""}`;
      } catch (e) {
        log("authorize-error", { mode: "manual", message: e && e.message });
      }
      if (observed) return { code: observed };

      // Attempt 2: follow — fails on the custom scheme, but the error/URL can still carry the code
      try {
        const resp = await fetch(url, { redirect: "follow", credentials: "include" });
        const m = String(resp.url || "").match(CODE_RE);
        if (m) return { code: m[1] };
        try {
          const body = await resp.clone().json();
          const mb = String((body && body.redirect_uri) || "").match(CODE_RE);
          if (mb) return { code: mb[1] };
        } catch {
          /* not JSON */
        }
      } catch (e) {
        log("authorize-error", { mode: "follow", message: e && e.message });
        const m = String(e).match(CODE_RE);
        if (m) return { code: m[1] };
      }
      if (observed) return { code: observed };

      if (opaque) return { code: null, reason: wr ? "redirect-not-observed" : "opaque-redirect" };
      return { code: null, reason: reason || "no-code" };
    } finally {
      for (const detach of attached) {
        try {
          detach();
        } catch {
          /* already gone */
        }
      }
    }
  }

  /** POST to Sony's token endpoint as the PlayStation app (Basic client auth, JWT tokens). */
  function tokenRequest(params) {
    return fetch(`${AUTH_BASE}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: CLIENT_AUTH },
      body: new URLSearchParams({ ...params, token_format: "jwt" }).toString()
    });
  }

  async function exchangeCodeForTokens(code) {
    const resp = await tokenRequest({
      code,
      grant_type: "authorization_code",
      redirect_uri: REDIRECT_URI
    });
    if (!resp.ok) {
      const errorCode = await sonyErrorCode(resp);
      log("token-exchange-failed", { status: resp.status });
      return { tokens: null, status: resp.status, errorCode };
    }
    return { tokens: await resp.json(), status: resp.status, errorCode: null };
  }

  /* ════════════════════════════════════════════
   * TOKEN MANAGEMENT
   * ════════════════════════════════════════════ */

  async function getAccessToken() {
    const d = await chrome.storage.local.get([
      "psn_access_token", "psn_refresh_token", "psn_token_expiry", "psn_npsso"
    ]);
    if (!d.psn_access_token) return null;
    if (d.psn_token_expiry && Date.now() < d.psn_token_expiry - 60000) return d.psn_access_token;

    if (d.psn_refresh_token) {
      const r = await refreshAccessToken(d.psn_refresh_token);
      if (r) return r;
    }
    if (d.psn_npsso) {
      const result = await authenticate(d.psn_npsso);
      if (result.success) {
        const nd = await chrome.storage.local.get(["psn_access_token"]);
        return nd.psn_access_token;
      }
    }
    return null;
  }

  async function refreshAccessToken(refreshToken) {
    try {
      const resp = await tokenRequest({
        refresh_token: refreshToken,
        grant_type: "refresh_token",
        scope: SCOPE
      });
      if (!resp.ok) {
        log("refresh-failed", { status: resp.status });
        return null;
      }
      const t = await resp.json();
      if (t.access_token) {
        await chrome.storage.local.set({
          psn_access_token: t.access_token,
          psn_refresh_token: t.refresh_token || refreshToken,
          psn_token_expiry: Date.now() + (t.expires_in || 3600) * 1000
        });
        log("refresh-ok", {});
        return t.access_token;
      }
    } catch (e) {
      log("refresh-error", { message: e && e.message });
    }
    return null;
  }

  /**
   * Authorized GET with a single refresh-and-retry when Sony answers 401.
   * @returns {Promise<Response|null>} null when there is no usable session
   */
  async function authedFetch(url, retried = false) {
    const token = await getAccessToken();
    if (!token) return null;
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (resp.status === 401 && !retried) {
      log("401-retry", { url: PSEDiag.urlInfo(url) });
      await chrome.storage.local.set({ psn_token_expiry: 0 }); // force the refresh path
      return authedFetch(url, true);
    }
    return resp;
  }

  /* ════════════════════════════════════════════
   * LIBRARY
   * ════════════════════════════════════════════ */

  async function fetchLibrary() {
    if (Date.now() - lastSyncTime < SYNC_COOLDOWN) {
      return { success: false, error: "psnWait30" };
    }
    lastSyncTime = Date.now();

    try {
      const allGames = [];
      let offset = 0;
      const limit = 100;
      let totalCount = 0;
      let hasMore = true;
      let pages = 0;

      while (hasMore) {
        const url = `${GAMELIST_URL}?limit=${limit}&offset=${offset}&categories=${GAME_CATEGORIES}`;
        const resp = await authedFetch(url);
        if (!resp) return { success: false, error: "psnErrNotConnected" };
        if (!resp.ok) {
          log("library-http-error", { status: resp.status, page: pages });
          if (resp.status === 401) return { success: false, error: "psnErrAuthExpired" };
          throw new Error(`Library API ${resp.status}`);
        }
        const data = await resp.json();
        pages++;
        totalCount = data.totalItemCount || 0;
        if (data.titles && data.titles.length > 0) {
          for (const title of data.titles) {
            allGames.push({
              titleId: title.titleId || title.npTitleId || "",
              name: title.name || title.localizedName || "Unknown",
              platform: title.category || title.platform || "unknown",
              imageUrl: title.imageUrl || title.icon?.url || null,
              type: PSEMatch.classifyTitle(title)
            });
          }
        }
        offset += limit;
        hasMore = data.titles && data.titles.length === limit && offset < totalCount;
        if (offset >= 5000) break;
      }

      // Only "game" type counts as owned for filtering — DLC names too easily match unrelated games
      await chrome.storage.local.set({
        psn_library: allGames,
        psn_library_updated: Date.now(),
        psn_owned: allGames.filter((g) => g.type === "game").map((g) => g.name)
      });
      log("library-ok", { pages, titles: allGames.length });
      return { success: true, games: allGames, totalCount };
    } catch (err) {
      log("library-error", { message: err && err.message });
      return { success: false, error: err.message };
    }
  }

  /* ════════════════════════════════════════════
   * TROPHIES
   * ════════════════════════════════════════════ */

  async function fetchTrophyInfo(gameName) {
    try {
      const limit = 100;
      let offset = 0;
      let totalItemCount = 0;

      while (true) {
        const resp = await authedFetch(`${TROPHY_URL}?limit=${limit}&offset=${offset}`);
        if (!resp || !resp.ok) return null;
        const data = await resp.json();
        if (!data.trophyTitles?.length) return null;
        totalItemCount = data.totalItemCount || data.trophyTitles.length;

        let match = null;
        let matchScore = 0;
        for (const t of data.trophyTitles) {
          const s = PSEMatch.matchTrophyTitle(gameName, t.trophyTitleName);
          if (s > matchScore) {
            match = t;
            matchScore = s;
            if (s === 3) break;
          }
        }

        if (match) {
          const earned = match.earnedTrophies || {};
          const defined = match.definedTrophies || {};
          const totalEarned = (earned.bronze || 0) + (earned.silver || 0) + (earned.gold || 0) + (earned.platinum || 0);
          const totalDefined = (defined.bronze || 0) + (defined.silver || 0) + (defined.gold || 0) + (defined.platinum || 0);
          return {
            hasPlatinum: (defined.platinum || 0) > 0,
            earnedPlatinum: (earned.platinum || 0) > 0,
            totalTrophies: totalDefined,
            earnedTrophies: totalEarned,
            progress: match.progress || Math.round((totalEarned / Math.max(totalDefined, 1)) * 100),
            npCommunicationId: match.npCommunicationId || null,
            npServiceName: match.npServiceName || null,
            source: "psn"
          };
        }

        offset += limit;
        if (offset >= totalItemCount || offset >= 1500) return null;
      }
    } catch (e) {
      log("trophy-error", { message: e && e.message });
      return null;
    }
  }

  /**
   * EXPERIMENTAL (off by default): per-trophy earn rates for one title.
   * Uses Sony's trophy endpoints as documented by the community psn-api project; not verified
   * against a live account yet, so every failure is logged and swallowed.
   */
  async function fetchTrophyRarity(npCommunicationId, npServiceName) {
    if (!npCommunicationId) return null;
    const svc = encodeURIComponent(npServiceName || "trophy");
    const id = encodeURIComponent(npCommunicationId);
    try {
      const [mine, defs] = await Promise.all([
        authedFetch(`${TROPHY_BASE}/users/me/npCommunicationIds/${id}/trophyGroups/all/trophies?npServiceName=${svc}`),
        authedFetch(`${TROPHY_BASE}/npCommunicationIds/${id}/trophyGroups/all/trophies?npServiceName=${svc}`)
      ]);
      if (!mine || !mine.ok) {
        log("rarity-http-error", { status: mine && mine.status });
        return null;
      }
      const mineData = await mine.json();
      const defsData = defs && defs.ok ? await defs.json() : { trophies: [] };
      const names = new Map((defsData.trophies || []).map((t) => [t.trophyId, t.trophyName]));
      const list = (mineData.trophies || [])
        .map((t) => ({
          id: t.trophyId,
          name: names.get(t.trophyId) || null,
          rate: parseFloat(t.trophyEarnedRate),
          earned: !!t.earned,
          type: t.trophyType
        }))
        .filter((t) => Number.isFinite(t.rate));
      if (!list.length) return null;
      const rarest = (arr) => arr.slice().sort((a, b) => a.rate - b.rate)[0] || null;
      return {
        rarestEarned: rarest(list.filter((t) => t.earned)),
        rarestRemaining: rarest(list.filter((t) => !t.earned)),
        total: list.length
      };
    } catch (e) {
      log("rarity-error", { message: e && e.message });
      return null;
    }
  }

  /* ════════════════════════════════════════════
   * PROFILE / STATUS / MANAGEMENT
   * ════════════════════════════════════════════ */

  async function fetchProfile(accessToken) {
    try {
      const resp = await fetch(PROFILE_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!resp.ok) {
        log("profile-http-error", { status: resp.status });
        return null;
      }
      const d = await resp.json();
      return {
        onlineId: d.onlineId || d.personalDetail?.firstName || "PSN User",
        accountId: d.accountId || null,
        avatarUrl: d.avatars?.[0]?.url || null
      };
    } catch {
      return null;
    }
  }

  async function getStatus() {
    const d = await chrome.storage.local.get([
      "psn_access_token", "psn_token_expiry", "psn_profile", "psn_library", "psn_library_updated"
    ]);
    const connected = !!d.psn_access_token;
    return {
      connected,
      tokenValid: d.psn_token_expiry ? Date.now() < d.psn_token_expiry : false,
      profile: d.psn_profile || null,
      libraryCount: (d.psn_library || []).length,
      gameCount: (d.psn_library || []).filter((g) => g.type === "game").length,
      dlcCount: (d.psn_library || []).filter((g) => g.type === "dlc").length,
      lastSync: d.psn_library_updated || null,
      needsSync: !d.psn_library_updated || Date.now() - d.psn_library_updated > SYNC_INTERVAL
    };
  }

  /** Merged owned list (PSN + manual), deduplicated by normalized title. */
  async function getMergedOwned() {
    const d = await chrome.storage.local.get(["psn_owned", "manual_owned"]);
    const seen = new Set();
    const merged = [];
    for (const name of [...(d.psn_owned || []), ...(d.manual_owned || [])]) {
      const key = PSEMatch.titleKey(name);
      if (key && !seen.has(key)) {
        seen.add(key);
        merged.push(name);
      }
    }
    return merged;
  }

  /** Disconnect removes ONLY PSN data, keeps manual_owned intact. */
  async function disconnect() {
    await chrome.storage.local.remove([
      "psn_access_token", "psn_refresh_token", "psn_token_expiry",
      "psn_npsso", "psn_profile", "psn_library", "psn_library_updated",
      "psn_owned"
    ]);
    log("disconnected", {});
    return { success: true };
  }

  async function tryAutoDetectNpsso() {
    try {
      for (const domain of [SONY_URL, "https://store.playstation.com"]) {
        const c = await chrome.cookies.get({ url: domain, name: "npsso" });
        if (c && c.value) return { found: true, npsso: c.value };
      }
      return { found: false };
    } catch (e) {
      return { found: false, error: e.message };
    }
  }

  return {
    authenticate, getAccessToken, fetchLibrary, fetchProfile,
    fetchTrophyInfo, fetchTrophyRarity, getStatus, getMergedOwned, disconnect,
    tryAutoDetectNpsso, SYNC_INTERVAL
  };
})();

self.PSN = PSN;
