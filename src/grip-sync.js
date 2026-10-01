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
    "garlandProjectChecklists",
    "garlandProposalAttachments",
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
    "garlandGeocoords",          // map geocode cache — syncs pins across devices
    "garlandCrmNotes",           // account notes (was missing — notes never synced)
    "garlandPriceBooks",         // price books
    "garlandPriceBookProducts",  // price book line items
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
      // getSession() reads from local storage first (no network needed) and refreshes
      // the token if expired — more reliable on iOS resume than getUser() which always
      // makes a network request that may fail if the connection isn't ready yet.
      const { data: sessionData } = await client.auth.getSession();
      if (sessionData?.session?.user) return sessionData.session.user;
      // Fallback to network call if no local session
      const { data } = await client.auth.getUser();
      return data?.user || null;
    } catch (_) {
      return null;
    }
  }

  // ── Debounced push queue ─────────────────────────────────────────
  // Accumulates writes, then flushes after 800 ms of quiet.

  const pushQueue = {};

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

  const _origSetItem = localStorage.setItem.bind(localStorage);
  const inFlight = new Map();
  let syncProblem = false;
  // Before authentication/hydration, app scripts may seed or normalize data.
  // Those automatic writes must not become user edits or replace stored work.
  let initialDataReady = !isConfigured();
  if (!initialDataReady) showAuthOverlay(true);

  function releaseInitialData() {
    window.gripReloadData?.();
    initialDataReady = true;
    const error = document.getElementById("gripAuthError");
    if (error) error.hidden = true;
    showAuthOverlay(false);
  }

  function sameValue(a, b) {
    if (a === b) return true;
    if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every(key =>
      Object.prototype.hasOwnProperty.call(b, key) && sameValue(a[key], b[key]));
  }

  // Cloud-primary write: upsert directly to Supabase, localStorage is the cache.
  async function flushKey(key) {
    if (inFlight.has(key)) return inFlight.get(key);
    const operation = (async () => {
      const raw = localStorage.getItem(key);
      if (!raw) return true;
      const client = getClient();
      const user = await getUser();
      if (!client || !user) { updateSyncIndicator("local"); return false; }
      try {
        const parsed = sanitizeForSync(key, JSON.parse(raw));
        updateSyncIndicator("syncing");
        const { error } = await client.from("grip_data")
          .upsert({ user_id: user.id, data_key: key, data_value: parsed },
                  { onConflict: "user_id,data_key" });
        if (error) throw error;
        broadcastChange(key, JSON.stringify(parsed));
        updateSyncIndicator("saved");
        return true;
      } catch (err) {
        console.warn("GRIP save failed:", key, err);
        syncProblem = "error";
        updateSyncIndicator("error");
        return false;
      }
    })();
    inFlight.set(key, operation);
    try { return await operation; } finally { inFlight.delete(key); }
  }

  function schedulePush(key) {
    clearTimeout(pushQueue[key]);
    pushQueue[key] = setTimeout(() => flushKey(key), 300);
  }

  // Intercept writes to sync keys and push them to Supabase immediately.
  // Storage instances have a named-property setter — wrap the prototype so
  // sessionStorage and other instances are unaffected (notably Safari).
  const storagePrototype = Object.getPrototypeOf(localStorage);
  const nativeSetItem = storagePrototype.setItem;
  storagePrototype.setItem = function (key, value) {
    if (this !== localStorage) return nativeSetItem.call(this, key, value);
    key = String(key);
    value = String(value);
    try {
      nativeSetItem.call(this, key, value);
    } catch (error) {
      syncProblem = "storage";
      updateSyncIndicator("storage");
      throw error;
    }
    if (SYNC_KEYS.has(key) && isConfigured() && initialDataReady && _userSetupDone) {
      schedulePush(key);
    }
  };

  // ── Pull from Supabase ───────────────────────────────────────────
  // Cloud is the source of truth. pullAll always wins over local cache,
  // except for keys currently being written (skip those to avoid clobbering
  // an in-flight push that hasn't reached the server yet).

  async function pullAll() {
    const client = getClient();
    const user = await getUser();
    if (!client || !user) return false;
    try {
      const { data, error } = await client
        .from("grip_data")
        .select("data_key, data_value")
        .eq("user_id", user.id);
      if (error) { updateSyncIndicator("error"); return false; }
      if (!data?.length) return "empty";
      let anyChanged = false;
      for (const row of data) {
        if (!SYNC_KEYS.has(row.data_key)) continue;
        // Don't clobber a key that's currently being pushed to the cloud.
        if (inFlight.has(row.data_key)) continue;
        // Preserve this device's active Gmail token (never stored in cloud).
        let incoming = row.data_value;
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
      console.warn("GRIP pull failed:", err);
      return false;
    }
  }

  // ── First-time local → cloud upload ─────────────────────────────

  async function pushAllLocalData() {
    for (const key of SYNC_KEYS) {
      if (localStorage.getItem(key)) await flushKey(key);
    }
  }

  // ── Auth UI ──────────────────────────────────────────────────────

  function showAuthOverlay(show) {
    const overlay = document.getElementById("gripAuthOverlay");
    if (overlay) overlay.hidden = !show;
  }

  function updateSyncIndicator(state) {
    if (["saved", "ready", "syncing"].includes(state)) {
      if (syncProblem) state = syncProblem;
    }
    const el = document.getElementById("gripSyncStatus");
    if (!el) return;
    const isOn = ["syncing", "saved", "ready"].includes(state);
    el.innerHTML = isOn
      ? `<span class="sync-dot sync-dot--on"></span>Cloud On`
      : state === "error"   ? "⚠ Save failed — tap to retry"
      : state === "storage" ? "⚠ Storage full"
      : `<span class="sync-dot sync-dot--off"></span>Cloud Off`;
    el.className = `grip-sync-status ${isOn ? "sync-on" : state === "error" || state === "storage" ? "sync-error" : "sync-local"}`;
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
        _gripFullRender();
      }
    });
  }

  // ── Full render (main app + modular views) ───────────────────────
  // Called only on remote sync events — Today and Pipeline read directly
  // from localStorage so they need their own render() on remote update.
  function _gripFullRender() {
    if (typeof window.render === "function") window.render();
    if (typeof window.gripToday?.render === "function") window.gripToday.render();
    if (typeof window.gripPipeline?.render === "function") window.gripPipeline.render();
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

  // Shared handler: write remote data into localStorage, refresh in-memory
  // state, and re-render — used by both broadcast and postgres_changes paths.
  function applyRemoteData(key, incoming) {
    if (inFlight.has(key)) return; // don't clobber an in-flight write
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
    _gripFullRender();
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
        // Skip if we're currently pushing this key (we'll receive a broadcast for it already)
        if (inFlight.has(key)) return;
        // Treat broadcasts as a notification; read the durable cloud version.
        pullAll().then(result => {
          if (result === "changed") {
            window.gripReloadData?.();
            _gripFullRender();
          }
        });
      })
      .subscribe((status) => {
        _channelStatus = status;
        console.log("GRIP channel:", status);
        if (status === "SUBSCRIBED") {
          updateSyncIndicator("ready");
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("GRIP realtime channel error:", status);
          updateSyncIndicator("error");
          // Auto-reconnect after 5 seconds so live sync resumes
          setTimeout(async () => {
            if (!_userSetupDone) return;
            const u = await getUser();
            if (u) subscribeToRemoteChanges(u);
          }, 5000);
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
    initialDataReady = !isConfigured();
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

    // If a different user signs in on this device, clear the previous user's local cache.
    const storedUserId = localStorage.getItem("gripCurrentUserId");
    if (storedUserId && storedUserId !== user.id) {
      for (const key of SYNC_KEYS) localStorage.removeItem(key);
      localStorage.removeItem("gripUserFirstName");
    }
    localStorage.setItem("gripCurrentUserId", user.id);

    updateUserDisplay(user);
    const fullName = user?.user_metadata?.full_name || user?.user_metadata?.name || "";
    const firstName = fullName.split(" ")[0] || "";
    if (firstName) localStorage.setItem("gripUserFirstName", firstName);
    showAuthOverlay(true);
    const loadingMessage = document.getElementById("gripAuthError");
    if (loadingMessage) { loadingMessage.textContent = "Loading your saved GRIP data…"; loadingMessage.hidden = false; }
    updateSyncIndicator("syncing");
    subscribeToRemoteChanges(user);

    // Timeout so "syncing" never hangs forever (e.g. on iOS Safari with slow/no connection)
    const pullResult = await Promise.race([
      pullAll(),
      new Promise((resolve) => setTimeout(() => resolve(false), 12000)),
    ]);
    if (pullResult) releaseInitialData();
    if (pullResult === "empty") {
      // Supabase is empty — push all local data up
      updateSyncIndicator("syncing");
      await pushAllLocalData();
    } else if (pullResult) {
      if (typeof window.gripReloadData === "function") window.gripReloadData();
      if (typeof window._gripHandleRemoteUpdate === "function") {
        for (const key of SYNC_KEYS) window._gripHandleRemoteUpdate(key);
      }
      _gripFullRender();
      // Background-push any local keys not yet in Supabase (e.g. data added while logged out)
      setTimeout(() => pushAllLocalData(), 2000);
    }
    if (pullResult === "empty") _gripFullRender();
    if (!pullResult && loadingMessage) loadingMessage.textContent = "Cloud data could not load. Your stored changes are safe. Continue locally to work offline, or try again when connected.";
    updateSyncIndicator(pullResult ? "saved" : "error");
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
    client.auth.onAuthStateChange((event, session) => {
      // Run outside the auth callback lock before requesting the session again.
      setTimeout(async () => {
      const user = session?.user || null;

      if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
        if (!user) return;
        // Capture Google Drive access token while it's present in the session
        if (session?.provider_token && typeof window.GripDrive?.saveToken === "function") {
          window.GripDrive.saveToken(session.provider_token, session.expires_in);
        }
        // ── Access guard ─────────────────────────────────────────
        const authorizedEmail = window.GRIP_AUTHORIZED_EMAIL;
        const authorizedList = Array.isArray(authorizedEmail) ? authorizedEmail : (authorizedEmail ? [authorizedEmail] : []);
        if (authorizedList.length && !authorizedList.includes(user.email)) {
          _userSetupDone = false;
          await client.auth.signOut().catch(() => {});
          showAuthOverlay(true);
          const errEl = document.getElementById("gripAuthError");
          if (errEl) {
            errEl.textContent = `Access denied — ${user.email || "unknown"} does not have access to this app. Contact your administrator.`;
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
      } else if (event === "PASSWORD_RECOVERY") {
        showAuthOverlay(true);
        document.getElementById("gripEmailForm")?.setAttribute("hidden", "");
        document.getElementById("gripNewPasswordForm")?.removeAttribute("hidden");
        return;
      } else if (event === "SIGNED_OUT") {
        initialDataReady = !isConfigured();
        _userSetupDone = false;
        unsubscribeFromRemoteChanges();
        updateSyncIndicator("local");
        updateUserDisplay(null);
        showAuthOverlay(true);
      }
      }, 0);
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

  function callSaveStatus(accountId, activityId, completionKey = "") {
    if (!isConfigured() || !_userSetupDone) return "Local only";
    const saving = inFlight.has("garlandAccountActivities") ||
                   (completionKey && inFlight.has("garlandCallLists"));
    if (saving) return "Saving…";
    if (syncProblem === "error") return "Save failed — tap sync to retry";
    return "Saved to cloud";
  }

  window.gripSync = {
    callSaveStatus,
    isConfigured,
    getClient,
    getUser,
    pushAllLocalData,
    generateContractorLink,
    loadContractorSubmissions,

    signInWithPassword(email, password) {
      const client = getClient();
      if (!client) return;
      const btn = document.getElementById("gripEmailSignInButton");
      const err = document.getElementById("gripAuthError");
      if (btn) { btn.disabled = true; btn.textContent = "Signing in…"; }
      if (err) { err.hidden = true; err.textContent = ""; }
      client.auth.signInWithPassword({ email: email.trim(), password })
        .then(({ error }) => {
          if (error) {
            if (err) { err.textContent = error.message; err.hidden = false; }
            if (btn) { btn.disabled = false; btn.textContent = "Sign in"; }
          }
          // success: onAuthStateChange handles the rest
        });
    },

    sendPasswordReset(email) {
      const client = getClient();
      if (!client) return;
      const err = document.getElementById("gripAuthError");
      const redirectTo = window.location.origin + window.location.pathname;
      client.auth.resetPasswordForEmail((email || "").trim(), { redirectTo })
        .then(({ error }) => {
          if (err) {
            err.textContent = error
              ? error.message
              : "Password reset email sent — check your inbox and click the link.";
            err.className = error ? "auth-error" : "auth-success";
            err.hidden = false;
          }
        });
    },

    updatePassword(newPassword) {
      const client = getClient();
      if (!client) return;
      const btn = document.getElementById("gripSetPasswordButton");
      const err = document.getElementById("gripAuthError");
      if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }
      if (err) { err.hidden = true; err.textContent = ""; }
      client.auth.updateUser({ password: newPassword })
        .then(({ error }) => {
          if (error) {
            if (err) { err.textContent = error.message; err.hidden = false; }
            if (btn) { btn.disabled = false; btn.textContent = "Set password & sign in"; }
          } else {
            document.getElementById("gripNewPasswordForm")?.setAttribute("hidden", "");
            document.getElementById("gripEmailForm")?.removeAttribute("hidden");
            if (err) { err.textContent = "Password set — you can now sign in with email."; err.className = "auth-success"; err.hidden = false; }
            if (btn) { btn.disabled = false; btn.textContent = "Set password & sign in"; }
          }
        });
    },

    signInWithGoogle() {
      const client = getClient();
      if (!client) return;
      // Clear any stale PKCE verifiers that would block the OAuth exchange
      try {
        Object.keys(localStorage).filter(k => k.includes("supabase") || k.includes("pkce") || k.includes("code_verifier")).forEach(k => localStorage.removeItem(k));
      } catch (_) {}
      const _authEmail = Array.isArray(window.GRIP_AUTHORIZED_EMAIL) ? window.GRIP_AUTHORIZED_EMAIL[0] : window.GRIP_AUTHORIZED_EMAIL;
      const hd = _authEmail ? _authEmail.split("@")[1] : undefined;
      // Use the base URL without query params/hash to avoid redirect mismatch
      const redirectTo = window.location.origin + window.location.pathname;
      client.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          scopes: "https://www.googleapis.com/auth/drive.file",
          queryParams: {
            ...(hd ? { hd } : {}),
            access_type: "offline",
            prompt: "consent",
          },
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
      releaseInitialData();
      _gripFullRender();
      showAuthOverlay(false);
      updateSyncIndicator("local");
    },

    async forceUpload() {
      const user = await getUser();
      if (!user) { updateSyncIndicator("error"); return; }
      syncProblem = false;
      updateSyncIndicator("syncing");
      await pushAllLocalData();
      updateSyncIndicator("saved");
    },

    async forceSync() {
      const user = await getUser();
      if (!user) { updateSyncIndicator("error"); return; }
      syncProblem = false;
      updateSyncIndicator("syncing");
      const syncResult = await pullAll();
      if (syncResult) {
        if (!initialDataReady) releaseInitialData();
        if (syncResult === "changed") {
          if (typeof window.gripReloadData === "function") window.gripReloadData();
          if (typeof window._gripHandleRemoteUpdate === "function") {
            for (const key of SYNC_KEYS) window._gripHandleRemoteUpdate(key);
          }
          _gripFullRender();
        }
        updateSyncIndicator("saved");
      } else {
        updateSyncIndicator("error");
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
    // 30-second heartbeat: catches changes missed by broadcast (offline window,
    // dropped WebSocket, iOS background) without hammering the API.
    _heartbeatInterval = setInterval(async () => {
      if (!_userSetupDone) return;
      const result = await pullAll();
      if (result === "changed") {
        if (typeof window.gripReloadData === "function") window.gripReloadData();
        if (typeof window._gripHandleRemoteUpdate === "function") {
          for (const key of SYNC_KEYS) window._gripHandleRemoteUpdate(key);
        }
        _gripFullRender();
      }
    }, 30_000);
  }

  function stopHeartbeat() {
    if (_heartbeatInterval) { clearInterval(_heartbeatInterval); _heartbeatInterval = null; }
  }

  window.addEventListener("online", () => {
    if (_userSetupDone) _onResume();
  });

  async function _onResume() {
    if (!_userSetupDone) return;
    const u = await getUser();
    if (u) subscribeToRemoteChanges(u);
    const applyResult = async (result) => {
      if (result === "changed") {
        if (typeof window.gripReloadData === "function") window.gripReloadData();
        if (typeof window._gripHandleRemoteUpdate === "function") {
          for (const key of SYNC_KEYS) window._gripHandleRemoteUpdate(key);
        }
        _gripFullRender();
      }
    };
    const result = await pullAll();
    if (result === false) {
      // Network may not be ready on iOS resume — retry after 3 s
      setTimeout(async () => applyResult(await pullAll()), 3000);
    } else {
      await applyResult(result);
    }
  }

  // visibilitychange: standard cross-browser resume event
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      _lastResumeTime = Date.now();
      _onResume();
    }
  });

  // pageshow: fires on iOS bfcache restore (back-forward navigation, PWA resume)
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) {
      _lastResumeTime = Date.now();
      _onResume();
    }
  });

  // focus: catches cases where visibilitychange doesn't fire (some iOS Safari scenarios)
  let _lastResumeTime = 0;
  window.addEventListener("focus", () => {
    const now = Date.now();
    if (now - _lastResumeTime > 10_000) {  // debounce: don't double-fire with visibilitychange
      _lastResumeTime = now;
      _onResume();
    }
  });

  // Run on DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
