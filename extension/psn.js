/**
 * GameDeals+ for PS Store — PSN Integration Module (v2.2)
 * ===================================================
 * FIXES from v2.1:
 *  - Auth: uses chrome.cookies.set() instead of forbidden Cookie header
 *  - Auth: handles opaque-redirect properly in service worker
 *  - Owned games: separate psn_owned vs manual_owned, merged on read
 *  - Disconnect: only removes PSN-sourced games, keeps manual
 *  - Trophy API: fetches real trophy data when connected
 *  - Rate limiting: cooldown on sync operations
 */

const PSN = (() => {
  "use strict";

  const AUTH_BASE = "https://ca.account.sony.com/api/authz/v3/oauth";
  const CLIENT_ID = "09515159-7ef5-4e3d-8ddb-8385f52e599d";
  const REDIRECT_URI = "com.scee.psxandroid.scecompcall://redirect";
  const SCOPE = "psn:mobile.v2.core psn:clientapp";

  const GAMELIST_URL = "https://m.np.playstation.com/api/gamelist/v2/users/me/titles";
  const PROFILE_URL = "https://m.np.playstation.com/api/userProfile/v1/internal/users/me/profiles";
  const TROPHY_URL = "https://m.np.playstation.com/api/trophy/v1/users/me/trophyTitles";

  const SYNC_INTERVAL = 2 * 3600000;
  const SYNC_COOLDOWN = 30000; // 30s between syncs (fix #13)

  let lastSyncTime = 0;

  /* ════════════════════════════════════════════
   * AUTH — Fix #1: proper cookie-based auth
   * ════════════════════════════════════════════ */

  async function authenticate(npsso) {
    if (!npsso || npsso.length < 30) {
      return { success: false, error: "psnErrTokenShort" };
    }
    // NPSSO tokens are ~64 chars, base64url-ish: alphanumeric + - _
    // Reject obvious garbage before sending to Sony (avoids confusing 400 errors)
    if (!/^[A-Za-z0-9_-]{40,128}$/.test(npsso)) {
      return { success: false, error: "psnErrInvalidFormat" };
    }

    try {
      // Fix #1a: Inject NPSSO into browser cookie jar via chrome.cookies API
      // (instead of forbidden Cookie header)
      await chrome.cookies.set({
        url: "https://ca.account.sony.com",
        name: "npsso",
        value: npsso,
        domain: "ca.account.sony.com",
        path: "/",
        secure: true,
        httpOnly: true,
        sameSite: "no_restriction"
      });

      // Step A — Get authorization code
      const code = await exchangeNpssoForCode();
      if (!code) {
        return { success: false, error: "psnErrAuthCode" };
      }

      // Step B — Exchange code for tokens
      const tokens = await exchangeCodeForTokens(code);
      if (!tokens.access_token) {
        return { success: false, error: "psnErrAccessToken" };
      }

      await chrome.storage.local.set({
        psn_npsso: npsso,
        psn_access_token: tokens.access_token,
        psn_refresh_token: tokens.refresh_token || null,
        psn_token_expiry: Date.now() + (tokens.expires_in || 3600) * 1000
      });

      // Step C — Fetch profile
      const profile = await fetchProfile(tokens.access_token);
      if (profile) await chrome.storage.local.set({ psn_profile: profile });

      return { success: true, profile };
    } catch (err) {
      console.error("[PSE/PSN] Auth error:", err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Fix #1b: Don't pass Cookie header — cookies are in jar already.
   * Fix #1c: Handle redirect in multiple ways for robustness.
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

    // Attempt 1: redirect:"manual" — in extension service workers with
    // host_permissions, Location header should be readable on 302 responses
    try {
      const resp = await fetch(url, { redirect: "manual", credentials: "include" });
      const loc = resp.headers.get("location") || "";
      const m = loc.match(/code=(v3\.[A-Za-z0-9_-]+)/);
      if (m) return m[1];

      // Check if the response URL itself contains the code (some Chrome versions)
      if (resp.url) {
        const m2 = resp.url.match(/code=(v3\.[A-Za-z0-9_-]+)/);
        if (m2) return m2[1];
      }
    } catch (e) {
      console.warn("[PSE/PSN] redirect:manual attempt failed:", e);
    }

    // Attempt 2: redirect:"follow" — will fail on custom scheme but
    // the error URL might contain the code
    try {
      const resp = await fetch(url, { redirect: "follow", credentials: "include" });
      // If we got here without error, check response URL
      if (resp.url) {
        const m = resp.url.match(/code=(v3\.[A-Za-z0-9_-]+)/);
        if (m) return m[1];
      }
      // Try JSON body (some Sony endpoints return redirect_uri in JSON)
      try {
        const body = await resp.json();
        if (body.redirect_uri) {
          const m = body.redirect_uri.match(/code=(v3\.[A-Za-z0-9_-]+)/);
          if (m) return m[1];
        }
      } catch {}
    } catch (e) {
      // fetch() throws on redirect to non-http scheme — parse code from error
      const errStr = String(e);
      const m = errStr.match(/code=(v3\.[A-Za-z0-9_-]+)/);
      if (m) return m[1];
    }

    return null;
  }

  async function exchangeCodeForTokens(code) {
    const resp = await fetch(`${AUTH_BASE}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        grant_type: "authorization_code",
        redirect_uri: REDIRECT_URI,
        client_id: CLIENT_ID
      }).toString()
    });
    if (!resp.ok) {
      const t = await resp.text();
      throw new Error(`Token exchange failed (${resp.status}): ${t.substring(0, 200)}`);
    }
    return resp.json();
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
      const resp = await fetch(`${AUTH_BASE}/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          refresh_token: refreshToken,
          grant_type: "refresh_token",
          scope: SCOPE,
          client_id: CLIENT_ID
        }).toString()
      });
      if (!resp.ok) return null;
      const t = await resp.json();
      if (t.access_token) {
        await chrome.storage.local.set({
          psn_access_token: t.access_token,
          psn_refresh_token: t.refresh_token || refreshToken,
          psn_token_expiry: Date.now() + (t.expires_in || 3600) * 1000
        });
        return t.access_token;
      }
    } catch (e) { console.error("[PSE/PSN] Refresh failed:", e); }
    return null;
  }

  /* ════════════════════════════════════════════
   * LIBRARY FETCH — Fix #2: separate storage
   * ════════════════════════════════════════════ */

  async function fetchLibrary() {
    // Fix #13: rate limiting
    if (Date.now() - lastSyncTime < SYNC_COOLDOWN) {
      return { success: false, error: "psnWait30" };
    }
    lastSyncTime = Date.now();

    const token = await getAccessToken();
    if (!token) return { success: false, error: "psnErrNotConnected" };

    try {
      const allGames = [];
      let offset = 0;
      const limit = 100;
      let totalCount = 0;
      let hasMore = true;

      while (hasMore) {
        const url = `${GAMELIST_URL}?limit=${limit}&offset=${offset}&categories=ps4_game,ps5_native_game,ps4_nongame,ps5_native_nongame`;
        const resp = await fetch(url, { headers: { "Authorization": `Bearer ${token}` } });
        if (!resp.ok) {
          if (resp.status === 401) return { success: false, error: "psnErrAuthExpired" };
          throw new Error(`Library API ${resp.status}`);
        }
        const data = await resp.json();
        totalCount = data.totalItemCount || 0;
        if (data.titles && data.titles.length > 0) {
          for (const title of data.titles) {
            allGames.push({
              titleId: title.titleId || title.npTitleId || "",
              name: title.name || title.localizedName || "Unknown",
              platform: title.category || title.platform || "unknown",
              imageUrl: title.imageUrl || title.icon?.url || null,
              type: classifyTitle(title)
            });
          }
        }
        offset += limit;
        hasMore = data.titles && data.titles.length === limit && offset < totalCount;
        if (offset >= 5000) break;
      }

      // Fix #2: Store PSN games separately — don't touch manual_owned
      // Only "game" type counts as owned for filtering — DLC names too easily match unrelated games
      await chrome.storage.local.set({
        psn_library: allGames,
        psn_library_updated: Date.now(),
        psn_owned: allGames.filter(g => g.type === "game").map(g => g.name)
      });

      return { success: true, games: allGames, totalCount };
    } catch (err) {
      console.error("[PSE/PSN] Library fetch error:", err);
      return { success: false, error: err.message };
    }
  }

  function classifyTitle(title) {
    const cat = (title.category || title.titleType || "").toLowerCase();
    const name = (title.name || "").toLowerCase();
    if (cat.includes("nongame") || cat.includes("addon") || cat.includes("dlc")) return "dlc";
    if (/\b(dlc|expansion|season pass|add[\s-]?on)\b/i.test(name)) return "dlc";
    if (cat.includes("app") || cat.includes("media")) return "app";
    return "game";
  }

  /* ════════════════════════════════════════════
   * Fix #12: TROPHY DATA from PSN API
   * ════════════════════════════════════════════ */

  async function fetchTrophyInfo(gameName) {
    const token = await getAccessToken();
    if (!token) return null;

    try {
      const normalized = gameName.toLowerCase().replace(/[™®©]/g, "").trim();
      const limit = 100;
      let offset = 0;
      let totalItemCount = 0;

      while (true) {
        const resp = await fetch(`${TROPHY_URL}?limit=${limit}&offset=${offset}`, {
          headers: { "Authorization": `Bearer ${token}` }
        });
        if (!resp.ok) return null;
        const data = await resp.json();
        if (!data.trophyTitles?.length) return null;

        totalItemCount = data.totalItemCount || data.trophyTitles.length;

        const match = data.trophyTitles.find(t => {
          const tn = (t.trophyTitleName || "").toLowerCase().replace(/[™®©]/g, "").trim();
          return tn.includes(normalized) || normalized.includes(tn);
        });

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
            source: "psn"
          };
        }

        offset += limit;
        if (offset >= totalItemCount || offset >= 1500) return null;
      }
    } catch (e) {
      console.error("[PSE/PSN] Trophy fetch error:", e);
      return null;
    }
  }

  /* ════════════════════════════════════════════
   * PROFILE
   * ════════════════════════════════════════════ */

  async function fetchProfile(accessToken) {
    try {
      const resp = await fetch(PROFILE_URL, { headers: { "Authorization": `Bearer ${accessToken}` } });
      if (!resp.ok) return null;
      const d = await resp.json();
      return {
        onlineId: d.onlineId || d.personalDetail?.firstName || "PSN User",
        accountId: d.accountId || null,
        avatarUrl: d.avatars?.[0]?.url || null
      };
    } catch { return null; }
  }

  /* ════════════════════════════════════════════
   * STATUS & MANAGEMENT
   * Fix #3: disconnect only removes PSN data
   * Fix #2: getMergedOwned merges both lists
   * ════════════════════════════════════════════ */

  async function getStatus() {
    const d = await chrome.storage.local.get([
      "psn_access_token", "psn_token_expiry", "psn_profile",
      "psn_library", "psn_library_updated"
    ]);
    const connected = !!d.psn_access_token;
    return {
      connected,
      tokenValid: d.psn_token_expiry ? Date.now() < d.psn_token_expiry : false,
      profile: d.psn_profile || null,
      libraryCount: (d.psn_library || []).length,
      gameCount: (d.psn_library || []).filter(g => g.type === "game").length,
      dlcCount: (d.psn_library || []).filter(g => g.type === "dlc").length,
      lastSync: d.psn_library_updated || null,
      needsSync: !d.psn_library_updated || (Date.now() - d.psn_library_updated > SYNC_INTERVAL)
    };
  }

  /**
   * Fix #2: Return merged owned list (PSN + manual), deduplicated.
   */
  async function getMergedOwned() {
    const d = await chrome.storage.local.get(["psn_owned", "manual_owned"]);
    const psn = d.psn_owned || [];
    const manual = d.manual_owned || [];
    // Merge + deduplicate (case-insensitive)
    const seen = new Set();
    const merged = [];
    for (const name of [...psn, ...manual]) {
      const key = name.toLowerCase().trim();
      if (key && !seen.has(key)) {
        seen.add(key);
        merged.push(name);
      }
    }
    return merged;
  }

  /**
   * Fix #3: Disconnect removes ONLY PSN data, keeps manual_owned intact.
   */
  async function disconnect() {
    await chrome.storage.local.remove([
      "psn_access_token", "psn_refresh_token", "psn_token_expiry",
      "psn_npsso", "psn_profile", "psn_library", "psn_library_updated",
      "psn_owned"
    ]);
    return { success: true };
  }

  async function tryAutoDetectNpsso() {
    try {
      for (const domain of ["https://ca.account.sony.com", "https://store.playstation.com"]) {
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
    fetchTrophyInfo, getStatus, getMergedOwned, disconnect,
    tryAutoDetectNpsso, SYNC_INTERVAL
  };
})();

self.PSN = PSN;
