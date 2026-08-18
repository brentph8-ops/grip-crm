// ─────────────────────────────────────────────────────────────────
// GRIP — Supabase Sync Layer
// Wraps localStorage so every write also syncs to Supabase.
// If Supabase is not configured, or the user is offline / not signed
// in, the app continues working exactly as before.
// ─────────────────────────────────────────────────────────────────

(function () {

  // Keys that should be synced to the cloud
  const SYNC_KEYS = new Set([
    "garlandCrmData",
    "garlandPunchLists",
    "garlandTasks",
    "garlandScopeDatabase",
    "garlandTakeoffEstimates",
    "garlandFavoriteSystems",
    "garlandTerritorySettings",
    "garlandProposalUpdates",
    "garlandAccountActivities",
    "garlandNotes",
    "garlandActivities",
    "garlandCallLists",
    "garlandTakeoffManualProducts",
    "grip_ai_memory",
    "grip_followup_queue",
    "garlandOutreach",
    "garlandPipeline",
    "garlandRoofNotes",
  ]);

  // ── Helpers ──────────────────────────────────────────────────────

  function isConfigured() {
    return (
      typeof window.GRIP_SUPABASE_URL === "string" &&
      window.GRIP_SUPABASE_URL.startsWith("https://") &&
      typeof window.GRIP_SUPABASE_ANON === "string" &&
      window.GRIP_SUPABASE_ANON.length > 20
    );
  }

  function getClient() {
    if (!isConfigured()) return null;
    if (window._gripSupabaseClient) return window._gripSupabaseClient;
    if (!window.supabase?.createClient) {
      console.warn("GRIP: Supabase JS library not loaded yet");
      return null;
    }
    try {
      window._gripSupabaseClient = window.supabase.createClient(
        window.GRIP_SUPABASE_URL,
        window.GRIP_SUPABASE_ANON
      );
      return window._gripSupabaseClient;
    } catch (err) {
      console.warn("GRIP: Failed to create Supabase client:", err);
      return null;
    }
  }

  async function getUser() {
    const client = getClient();
    if (!client) return null;
    try {
      const { data } = await client.auth.getUser();
      return data?.user || null;
    } catch (_) {
      return null;
    }
  }

  // ── Debounced push queue ─────────────────────────────────────────
  // Accumulates writes, then flushes after 800 ms of quiet.

  const pushQueue = {};
  const _lastLocalWriteTime = {}; // tracks when WE last wrote each key

  // Strip device-specific OAuth tokens before pushing to the cloud so one
  // device's session doesn't overwrite another device's active connection.
  function sanitizeForSync(key, value) {
    if (key === "garlandOutreach" && value && typeof value === "object" && value.settings) {
      const clean = { ...value, settings: { ...value.settings } };
      delete clean.settings.gmailToken;
      delete clean.settings.gmailTokenExpiry;
      delete clean.settings.gmailEmail;
      return clean;
    }
    return value;
  }

  async function flushKey(key, jsonString) {
    const client = getClient();
    if (!client) return;
    const user = await getUser();
    if (!user) return;
    try {
      let parsed;
      try { parsed = JSON.parse(jsonString); } catch (_) { parsed = jsonString; }
      parsed = sanitizeForSync(key, parsed);
      await client.from("grip_data").upsert(
        { user_id: user.id, data_key: key, data_value: parsed },
        { onConflict: "user_id,data_key" }
      );
      setLocalPushTimestamp(key);
      updateSyncIndicator("saved");
    } catch (err) {
      console.warn("GRIP sync push failed:", key, err);
      updateSyncIndicator("error");
    }
  }

  function schedulePush(key, jsonString) {
    _lastLocalWriteTime[key] = Date.now();
    clearTimeout(pushQueue[key]);
    pushQueue[key] = setTimeout(() => flushKey(key, jsonString), 300);
  }

  // ── localStorage monkey-patch ─────────────────────────────────────
  // Intercepts setItem for GRIP keys and queues a cloud push.
  // The original localStorage call completes synchronously as normal.

  const _origSetItem = localStorage.setItem.bind(localStorage);
  localStorage.setItem = function (key, value) {
    _origSetItem(key, value);
    if (SYNC_KEYS.has(key) && isConfigured()) {
      updateSyncIndicator("syncing");
      broadcastChange(key, value);   // instant cross-device update via WebSocket
      schedulePush(key, value);      // persistent DB write (300 ms debounce)
    }
  };

  // ── Pull from Supabase on load ───────────────────────────────────

  // Tracks when we last successfully pushed each key to Supabase (ms since epoch).
  // Persisted across page loads so we can skip pulls of stale server data.
  const LOCAL_PUSH_TS_KEY = "grip_last_push_ts";
  function getLocalPushTimestamps() {
    try { return JSON.parse(localStorage.getItem(LOCAL_PUSH_TS_KEY) || "{}"); } catch (_) { return {}; }
  }
  function setLocalPushTimestamp(key) {
    const ts = getLocalPushTimestamps();
    ts[key] = Date.now();
    _origSetItem(LOCAL_PUSH_TS_KEY, JSON.stringify(ts));
  }

  async function pullAll() {
    const client = getClient();
    const user = await getUser();
    if (!client || !user) return false;
    try {
      const { data, error } = await client
        .from("grip_data")
        .select("data_key, data_value, updated_at")
        .eq("user_id", user.id);
      if (error || !data?.length) return false;
      const localPushTs = getLocalPushTimestamps();
      let anyChanged = false;
      for (const row of data) {
        if (row.data_key === SESSION_CLAIM_KEY) continue;
        // Only overwrite local data if the server version is newer than our last push.
        // This prevents stale server data from wiping recent local changes.
        const serverUpdatedAt = row.updated_at ? new Date(row.updated_at).getTime() : 0;
        const ourLastPush = localPushTs[row.data_key] || 0;
        if (ourLastPush > 0 && serverUpdatedAt <= ourLastPush) continue;
        let incoming = row.data_value;
        // Preserve this device's active Gmail token.
        if (row.data_key === "garlandOutreach" && incoming && typeof incoming === "object") {
          try {
            const local = JSON.parse(localStorage.getItem("garlandOutreach") || "{}");
            if (local.settings?.gmailToken) {
              incoming = { ...incoming, settings: { ...incoming.settings,
                gmailToken: local.settings.gmailToken,
                gmailTokenExpiry: local.settings.gmailTokenExpiry,
                gmailEmail: local.settings.gmailEmail,
              }};
            }
          } catch (_) {}
        }
        const serialized = JSON.stringify(incoming);
        if (localStorage.getItem(row.data_key) !== serialized) {
          _origSetItem(row.data_key, serialized);
          anyChanged = true;
        }
      }
      return anyChanged ? "changed" : "unchanged";
    } catch (err) {
      console.warn("GRIP pull from Supabase failed:", err);
      return false;
    }
  }

  // ── First-time local → cloud upload ─────────────────────────────

  async function pushAllLocalData() {
    const client = getClient();
    const user = await getUser();
    if (!client || !user) return;
    const pushes = [];
    for (const key of SYNC_KEYS) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        pushes.push(
          client.from("grip_data").upsert(
            { user_id: user.id, data_key: key, data_value: JSON.parse(raw) },
            { onConflict: "user_id,data_key" }
          )
        );
      } catch (_) {}
    }
    await Promise.allSettled(pushes);
    for (const key of SYNC_KEYS) setLocalPushTimestamp(key);
    updateSyncIndicator("saved");
  }

  // ── Auth UI ──────────────────────────────────────────────────────

  function showAuthOverlay(show) {
    const overlay = document.getElementById("gripAuthOverlay");
    if (overlay) overlay.hidden = !show;
  }

  let lastSyncedAt = null;

  function updateSyncIndicator(state) {
    const el = document.getElementById("gripSyncStatus");
    if (!el) return;
    const states = {
      syncing: { text: "⟳ Syncing…", cls: "sync-syncing" },
      saved:   { text: "✓ Synced",   cls: "sync-saved"   },
      ready:   { text: "● Live",     cls: "sync-ready"   },
      error:   { text: "⚠ Offline",  cls: "sync-error"   },
      local:   { text: "Local only", cls: "sync-local"   },
    };
    const s = states[state] || states.local;
    if (state === "saved") lastSyncedAt = new Date();
    const timeLabel = lastSyncedAt && state === "ready"
      ? `<span class="grip-sync-time">${formatSyncTime(lastSyncedAt)}</span>`
      : "";
    el.innerHTML = s.text + timeLabel;
    el.className = `grip-sync-status ${s.cls}`;
    if (state === "saved") setTimeout(() => updateSyncIndicator("ready"), 3000);
  }

  function formatSyncTime(date) {
    const mins = Math.round((Date.now() - date.getTime()) / 60000);
    if (mins < 1) return "just now";
    if (mins === 1) return "1 min ago";
    if (mins < 60) return `${mins} min ago`;
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }

  function updateUserDisplay(user) {
    const el = document.getElementById("gripUserDisplay");
    if (el) { el.textContent = user?.email || ""; el.hidden = !user; }
    const signOutBtn = document.getElementById("gripSignOutButton");
    if (signOutBtn) signOutBtn.hidden = !user;
  }

  // ── Contractor token generation ──────────────────────────────────

  async function generateContractorLink(punchList) {
    const client = getClient();
    const user = await getUser();
    if (!client || !user) {
      alert("Sign in to GRIP to generate contractor links.");
      return null;
    }
    try {
      const { data, error } = await client
        .from("contractor_tokens")
        .insert({
          user_id: user.id,
          punch_list_id: punchList.punch_list_id,
          contractor_name: punchList.assigned_contractor || "",
          punch_list_snapshot: punchList,
        })
        .select("token")
        .single();
      if (error) throw error;
      const base = window.location.origin + window.location.pathname.replace("index.html", "");
      return `${base}contractor.html?token=${data.token}`;
    } catch (err) {
      console.warn("Could not generate contractor link:", err);
      alert("Could not create contractor link. Check Supabase config.");
      return null;
    }
  }

  async function loadContractorSubmissions(punchListId) {
    const client = getClient();
    const user = await getUser();
    if (!client || !user) return [];
    try {
      const { data } = await client
        .from("contractor_submissions")
        .select("*, contractor_tokens!inner(punch_list_id, user_id)")
        .eq("contractor_tokens.user_id", user.id)
        .eq("punch_list_id", punchListId)
        .order("submitted_at", { ascending: false });
      return data || [];
    } catch (_) {
      return [];
    }
  }

  // ── Single-device session management ────────────────────────────
  // Signing in on one device kicks all other devices out automatically.
  // Each device has a persistent ID stored in localStorage.

  const SESSION_CLAIM_KEY = "grip_device_session";

  function getDeviceId() {
    const k = "gripDeviceId";
    let id = localStorage.getItem(k);
    if (!id) {
      id = (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36));
      _origSetItem(k, id);
    }
    return id;
  }

  // Write our device ID to Supabase immediately (no delay).
  async function claimSessionDB(user) {
    const client = getClient();
    if (!client || !user) return;
    const deviceId = getDeviceId();
    try {
      await client.from("grip_data").upsert(
        { user_id: user.id, data_key: SESSION_CLAIM_KEY, data_value: { deviceId, at: Date.now() } },
        { onConflict: "user_id,data_key" }
      );
    } catch (_) {}
  }

  // Broadcast the session claim to all connected devices (requires channel to be SUBSCRIBED).
  function broadcastSessionClaim() {
    if (!_realtimeChannel || _channelStatus !== "SUBSCRIBED") return;
    try {
      _realtimeChannel.send({
        type: "broadcast",
        event: "grip-session",
        payload: { deviceId: getDeviceId() },
      });
    } catch (_) {}
  }

  // Write our device ID to Supabase so all other devices get kicked.
  async function claimSession(user) {
    await claimSessionDB(user);
    broadcastSessionClaim();
  }

  // Called whenever we receive a session claim — sign out if it's not ours.
  function handleSessionClaim(incomingDeviceId) {
    // Multi-device mode: same account can be active on iPad + MacBook simultaneously.
    // Only signOutEverywhere() (explicit user action) kicks other devices.
    if (!incomingDeviceId || incomingDeviceId === getDeviceId()) return;
    console.log("GRIP: Another device signed in — pulling latest data.");
    pullAll().then((result) => {
      if (result === "changed") {
        if (typeof window.gripReloadData === "function") window.gripReloadData();
        if (typeof window.render === "function") window.render();
      }
    });
  }

  // ── Real-time subscription ───────────────────────────────────────
  // Two transports on a single channel:
  //  1. Broadcast  — direct WebSocket message, ~50-100ms latency, no DB round-trip.
  //                  self:false means we never receive our own broadcasts.
  //  2. postgres_changes — DB-triggered event, arrives ~500-700ms later.
  //                  Serves as a catch-up for devices that were offline and missed
  //                  a broadcast. Echo-suppressed for 5 s after our own writes.

  let _realtimeChannel = null;
  let _channelStatus = "UNSUBSCRIBED";
  const ECHO_SUPPRESS_MS = 5000;

  // Shared handler: write remote data into localStorage, refresh in-memory
  // state, and re-render — used by both broadcast and postgres_changes paths.
  function applyRemoteData(key, incoming) {
    // Preserve this device's active Gmail tokens so they aren't stomped by
    // another device that doesn't have Gmail connected.
    if (key === "garlandOutreach" && incoming && typeof incoming === "object") {
      try {
        const local = JSON.parse(localStorage.getItem("garlandOutreach") || "{}");
        if (local.settings?.gmailToken) {
          incoming = { ...incoming, settings: { ...incoming.settings,
            gmailToken: local.settings.gmailToken,
            gmailTokenExpiry: local.settings.gmailTokenExpiry,
            gmailEmail: local.settings.gmailEmail,
          }};
        }
      } catch (_) {}
    }
    _origSetItem(key, JSON.stringify(incoming));
    // Refresh all in-memory singletons so the next render sees fresh data.
    if (typeof window.gripReloadData === "function") window.gripReloadData();
    // Notify specialized modules that their key changed.
    if (typeof window._gripHandleRemoteUpdate === "function") {
      window._gripHandleRemoteUpdate(key);
    }
    if (typeof window.render === "function") window.render();
    updateSyncIndicator("saved");
  }

  // Send an instant broadcast to all other connected devices. Falls back
  // silently — postgres_changes will catch up within ~1 s if broadcast fails.
  function broadcastChange(key, jsonString) {
    if (!_realtimeChannel || _channelStatus !== "SUBSCRIBED") return;
    try {
      let value;
      try { value = JSON.parse(jsonString); } catch (_) { value = jsonString; }
      value = sanitizeForSync(key, value);
      _realtimeChannel.send({
        type: "broadcast",
        event: "grip-change",
        payload: { key, value },
      });
    } catch (_) {
      // Silent — postgres_changes is the persistence fallback
    }
  }

  function subscribeToRemoteChanges(user) {
    const client = getClient();
    if (!client || !user) return;

    if (_realtimeChannel) {
      client.removeChannel(_realtimeChannel);
      _realtimeChannel = null;
      _channelStatus = "UNSUBSCRIBED";
    }

    _realtimeChannel = client
      .channel("grip-live-" + user.id, {
        config: { broadcast: { self: false } },
      })
      // ── Session kicks (another device signed in) ─────────────────
      .on("broadcast", { event: "grip-session" }, (payload) => {
        handleSessionClaim(payload.payload?.deviceId);
      })
      // ── Instant data sync: broadcast ─────────────────────────────
      // NOTE: postgres_changes is intentionally omitted — it requires
      // Realtime to be enabled per-table in the Supabase dashboard.
      // Broadcast-only + periodic pullAll() is more reliable for this setup.
      .on("broadcast", { event: "grip-change" }, (payload) => {
        const { key, value } = payload.payload || {};
        if (!key || !SYNC_KEYS.has(key)) return;
        // Guard against somehow receiving our own write (belt-and-suspenders)
        const lastWrite = _lastLocalWriteTime[key] || 0;
        if (Date.now() - lastWrite < ECHO_SUPPRESS_MS) return;
        applyRemoteData(key, value);
      })
      .subscribe((status) => {
        _channelStatus = status;
        console.log("GRIP channel:", status);
        if (status === "SUBSCRIBED") {
          updateSyncIndicator("ready");
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("GRIP realtime channel error:", status);
          updateSyncIndicator("error");
        }
      });
  }

  function unsubscribeFromRemoteChanges() {
    const client = getClient();
    if (client && _realtimeChannel) {
      client.removeChannel(_realtimeChannel);
      _realtimeChannel = null;
      _channelStatus = "UNSUBSCRIBED";
    }
  }

  // ── Internal sign-out (force local state clear immediately) ──────
  // Called both from the public signOut() API and from handleSessionClaim.
  // Does not await — local state clears synchronously, Supabase call is fire-and-forget.
  function _doSignOut() {
    _userSetupDone = false;
    stopHeartbeat();
    unsubscribeFromRemoteChanges();
    updateSyncIndicator("local");
    updateUserDisplay(null);
    showAuthOverlay(true);
    const client = getClient();
    if (client) client.auth.signOut().catch(() => {});
  }

  // ── Initialisation ───────────────────────────────────────────────

  // Guard against double-init when both onAuthStateChange(SIGNED_IN) and
  // getSession() both find an active session (happens on OAuth redirect).
  let _userSetupDone = false;

  // Common path for setting up an authorized user.
  // isNewSignIn = true → actual OAuth/password sign-in (kicks other devices).
  // isNewSignIn = false → page reload with existing session (don't kick others).
  async function setupAuthorizedUser(user, isNewSignIn) {
    if (_userSetupDone) return;
    _userSetupDone = true;

    updateUserDisplay(user);
    showAuthOverlay(false);
    updateSyncIndicator("syncing");
    subscribeToRemoteChanges(user);

    // Timeout so "syncing" never hangs forever (e.g. on iOS Safari with slow/no connection)
    const pullResult = await Promise.race([
      pullAll(),
      new Promise((resolve) => setTimeout(() => resolve(false), 12000)),
    ]);
    const hadCloud = !!pullResult;
    if (!hadCloud) {
      // First time — offer to push local data up
      if (Object.keys(localStorage).some((k) => SYNC_KEYS.has(k))) {
        const upload = confirm(
          "You have existing GRIP data on this device.\n\nUpload it to your cloud account now?\n\n(Click Cancel to start fresh — your local data stays safe.)"
        );
        if (upload) await pushAllLocalData();
      }
    } else {
      if (typeof window.gripReloadData === "function") window.gripReloadData();
      if (typeof window._gripHandleRemoteUpdate === "function") {
        for (const key of SYNC_KEYS) window._gripHandleRemoteUpdate(key);
      }
      if (typeof window.render === "function") window.render();
    }
    updateSyncIndicator("saved");
    startHeartbeat();

    // Multi-device: GRIP allows the same account on iPad + MacBook simultaneously.
    // We no longer enforce a single-device lock on page reload — the authorized
    // email check is the security boundary. signOutEverywhere() remains available
    // as an explicit "kick all devices" action if ever needed.
    if (isNewSignIn) {
      // Broadcast to open tabs that a new sign-in happened (so they can re-pull).
      setTimeout(() => broadcastSessionClaim(), 1500);
    }
  }

  async function init() {
    // URL-based sign-out: navigate to ?signout to force sign-out on any device
    // even if the button click handler isn't working (PWA quirk, stale JS, etc.)
    if (new URLSearchParams(window.location.search).has("signout")) {
      history.replaceState({}, "", window.location.pathname);
      try {
        const sb = getClient();
        if (sb) await sb.auth.signOut().catch(() => {});
        Object.keys(localStorage)
          .filter(k => k.startsWith("sb-") || k.includes("supabase") || k.includes("pkce"))
          .forEach(k => localStorage.removeItem(k));
      } catch (_) {}
      showAuthOverlay(true);
      updateSyncIndicator("local");
      return;
    }

    if (!isConfigured()) {
      updateSyncIndicator("local");
      showAuthOverlay(false);
      return;
    }

    const client = getClient();

    // On an OAuth callback page (?code= or #access_token=), treat any
    // INITIAL_SESSION event as a new sign-in to avoid the page-reload session
    // check racing with claimSessionDB. Also skip getSession() entirely on these
    // pages — SIGNED_IN from onAuthStateChange will handle setup.
    const isOAuthCallback = /[?&#]code=/.test(window.location.href) ||
                            window.location.hash.includes("access_token=");

    // Listen for auth state changes
    client.auth.onAuthStateChange(async (event, session) => {
      const user = session?.user || null;

      if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
        if (!user) return;
        // ── Single-user access guard ─────────────────────────────
        const authorizedEmail = window.GRIP_AUTHORIZED_EMAIL;
        if (authorizedEmail && user.email !== authorizedEmail) {
          _userSetupDone = false;
          await client.auth.signOut().catch(() => {});
          showAuthOverlay(true);
          const errEl = document.getElementById("gripAuthError");
          if (errEl) {
            errEl.textContent = `Access denied — signed in as ${user.email || "unknown"}, but this app requires ${authorizedEmail}. Try signing out of all Google accounts first.`;
            errEl.hidden = false;
          }
          const btn = document.getElementById("gripGoogleSignInButton");
          if (btn) btn.textContent = "Sign in with Garland Google Account";
          return;
        }
        // On OAuth callback pages, INITIAL_SESSION can fire with a stale
        // existing session before SIGNED_IN fires. Treat it as a new sign-in
        // so claimSessionDB runs immediately and the DB session check is skipped.
        const treatAsNew = event === "SIGNED_IN" || isOAuthCallback;
        await setupAuthorizedUser(user, treatAsNew);
      } else if (event === "SIGNED_OUT") {
        _userSetupDone = false;
        unsubscribeFromRemoteChanges();
        updateSyncIndicator("local");
        updateUserDisplay(null);
        showAuthOverlay(true);
      }
    });

    if (isOAuthCallback) return;

    // Check current session (page reload / returning visitor).
    // setupAuthorizedUser's _userSetupDone guard prevents double-init if
    // onAuthStateChange also fires for this session.
    const { data: { session } } = await client.auth.getSession();
    if (!session) {
      showAuthOverlay(true);
    } else {
      await setupAuthorizedUser(session.user, false);
    }
  }

  // ── Public API ───────────────────────────────────────────────────

  window.gripSync = {
    isConfigured,
    getClient,
    getUser,
    pushAllLocalData,
    generateContractorLink,
    loadContractorSubmissions,

    signInWithGoogle() {
      const client = getClient();
      if (!client) return;
      // Clear any stale PKCE verifiers that would block the OAuth exchange
      try {
        Object.keys(localStorage).filter(k => k.includes("supabase") || k.includes("pkce") || k.includes("code_verifier")).forEach(k => localStorage.removeItem(k));
      } catch (_) {}
      const hd = window.GRIP_AUTHORIZED_EMAIL
        ? window.GRIP_AUTHORIZED_EMAIL.split("@")[1]
        : undefined;
      // Use the base URL without query params/hash to avoid redirect mismatch
      const redirectTo = window.location.origin + window.location.pathname;
      client.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          queryParams: hd ? { hd } : {},
        },
      });
    },

    signOut() {
      _doSignOut();
    },

    async signOutEverywhere() {
      // Sign out locally FIRST — instant UI feedback regardless of network state
      _doSignOut();
      // Then kick all other devices in the background
      try {
        const client = getClient();
        const user = await getUser();
        if (client && user) {
          await client.from("grip_data").upsert(
            { user_id: user.id, data_key: SESSION_CLAIM_KEY, data_value: { deviceId: "FORCE_SIGNOUT", at: Date.now() } },
            { onConflict: "user_id,data_key" }
          ).catch(() => {});
        }
      } catch (_) {}
    },

    continueLocal() {
      showAuthOverlay(false);
      updateSyncIndicator("local");
    },

    async forceSync() {
      const user = await getUser();
      if (!user) { updateSyncIndicator("error"); return; }
      updateSyncIndicator("syncing");
      const syncResult = await pullAll();
      if (syncResult) {
        if (syncResult === "changed") {
          if (typeof window.gripReloadData === "function") window.gripReloadData();
          if (typeof window._gripHandleRemoteUpdate === "function") {
            for (const key of SYNC_KEYS) window._gripHandleRemoteUpdate(key);
          }
          if (typeof window.render === "function") window.render();
        }
        updateSyncIndicator("saved");
      } else {
        await pushAllLocalData();
      }
    },

    clearSessionAndRetry() {
      // Wipe all Supabase auth keys so a stale session can't block sign-in
      try {
        Object.keys(localStorage)
          .filter(k => k.startsWith("sb-") || k.includes("supabase") || k.includes("pkce"))
          .forEach(k => localStorage.removeItem(k));
        sessionStorage.clear();
      } catch (_) {}
      // Reset error state and re-init
      const errEl = document.getElementById("gripAuthError");
      if (errEl) { errEl.hidden = true; errEl.textContent = ""; }
      const btn = document.getElementById("gripGoogleSignInButton");
      if (btn) { btn.textContent = "Sign in with Garland Google Account"; btn.disabled = false; }
      window._gripSupabaseClient = null; // Force client re-creation
      init();
    },
  };

  // ── Periodic catch-up pull ────────────────────────────────────────
  // Broadcasts cover real-time updates. This 60-second heartbeat catches
  // any changes that were missed (offline window, missed broadcast, etc.)
  // and keeps the session alive for Supabase Realtime.
  let _heartbeatInterval = null;

  function startHeartbeat() {
    stopHeartbeat();
    // Reduced to 5 minutes — realtime broadcasts handle instant updates,
    // the heartbeat is just a catch-all for missed events.
    _heartbeatInterval = setInterval(async () => {
      if (!_userSetupDone) return;
      const result = await pullAll();
      if (result === "changed") {
        if (typeof window.gripReloadData === "function") window.gripReloadData();
        if (typeof window.render === "function") window.render();
      }
    }, 300_000);
  }

  function stopHeartbeat() {
    if (_heartbeatInterval) { clearInterval(_heartbeatInterval); _heartbeatInterval = null; }
  }

  // When the browser comes back online, push any locally queued changes
  // that may have failed while offline.
  window.addEventListener("online", () => {
    if (_userSetupDone) {
      updateSyncIndicator("syncing");
      pushAllLocalData().then(() => updateSyncIndicator("saved"));
    }
  });

  // When switching back to this tab/device, pull the latest from Supabase
  // so changes made on another device (iPad → MacBook, etc.) appear immediately.
  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState !== "visible" || !_userSetupDone) return;
    const result = await pullAll();
    if (result === "changed") {
      if (typeof window.gripReloadData === "function") window.gripReloadData();
      if (typeof window._gripHandleRemoteUpdate === "function") {
        for (const key of SYNC_KEYS) window._gripHandleRemoteUpdate(key);
      }
      if (typeof window.render === "function") window.render();
    }
  });

  // Run on DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
