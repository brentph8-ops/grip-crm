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
    "garlandCrmNotes",             // was "garlandNotes" (stale key — app writes garlandCrmNotes)
    "garlandCallLists",
    "garlandTakeoffManualProducts",
    "garlandPunchGroupCollapsed",
    // "garlandPriceBooks" intentionally excluded — contains base64 PDF dataUrls (too large for cloud sync)
    "garlandPriceBookProducts",    // extracted product rows (text/numbers only — safe to sync)
    "garlandProjectChecklists",    // project checklist data
    "garlandProposalAttachments",  // proposal attachments
  ]);

  // Storage bucket name (must match SUPABASE_SETUP.sql)
  const STORAGE_BUCKET = "grip-attachments";

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
    if (!window.supabase) return null;          // CDN failed to load — degrade gracefully
    if (window._gripSupabaseClient) return window._gripSupabaseClient;
    const { createClient } = window.supabase;
    window._gripSupabaseClient = createClient(
      window.GRIP_SUPABASE_URL,
      window.GRIP_SUPABASE_ANON,
      {
        auth: {
          flowType: "pkce",          // required for Safari / iPhone OAuth
          detectSessionInUrl: true,
          persistSession: true,
        },
      }
    );
    return window._gripSupabaseClient;
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

  async function flushKey(key, jsonString) {
    const client = getClient();
    if (!client) return;
    const user = await getUser();
    if (!user) return;
    try {
      let parsed;
      try { parsed = JSON.parse(jsonString); } catch (_) { parsed = jsonString; }
      await client.from("grip_data").upsert(
        { user_id: user.id, data_key: key, data_value: parsed },
        { onConflict: "user_id,data_key" }
      );
      updateSyncIndicator("saved");
    } catch (err) {
      console.warn("GRIP sync push failed:", key, err);
      updateSyncIndicator("error");
    }
  }

  function schedulePush(key, jsonString) {
    clearTimeout(pushQueue[key]);
    pushQueue[key] = setTimeout(() => flushKey(key, jsonString), 800);
  }

  // ── localStorage monkey-patch ─────────────────────────────────────
  // Intercepts setItem for GRIP keys and queues a cloud push.
  // The original localStorage call completes synchronously as normal.

  const _origSetItem = localStorage.setItem.bind(localStorage);
  localStorage.setItem = function (key, value) {
    _origSetItem(key, value);
    if (SYNC_KEYS.has(key) && isConfigured()) {
      // Record when this key was last written locally so pullAll() can detect
      // which side is newer (guards against overwriting fresh offline edits).
      try {
        const ts = JSON.parse(localStorage.getItem("grip_local_timestamps") || "{}");
        ts[key] = new Date().toISOString();
        _origSetItem("grip_local_timestamps", JSON.stringify(ts));
      } catch (_) {}
      updateSyncIndicator("syncing");
      schedulePush(key, value);
    }
  };

  // ── Pull from Supabase on load ───────────────────────────────────

  async function pullAll() {
    const client = getClient();
    const user = await getUser();
    if (!client || !user) return false;

    // If a base-data migration just ran this session, push the new
    // localStorage snapshot to Supabase BEFORE pulling so the fresh
    // merged data takes precedence over any older cloud record.
    if (localStorage.getItem("grip_base_migrated_v1") === "pending_push") {
      await pushAllLocalData();
      localStorage.setItem("grip_base_migrated_v1", "1");
    }

    try {
      const { data, error } = await client
        .from("grip_data")
        .select("data_key, data_value, updated_at")
        .eq("user_id", user.id);
      if (error || !data?.length) return false;
      // Read local write timestamps to guard against overwriting fresh offline edits.
      // If local was written more recently than the cloud record, keep local.
      let localTs = {};
      try { localTs = JSON.parse(localStorage.getItem("grip_local_timestamps") || "{}"); } catch (_) {}
      for (const row of data) {
        const localWriteTime = localTs[row.data_key];
        const cloudWriteTime = row.updated_at;
        if (localWriteTime && cloudWriteTime && new Date(localWriteTime) > new Date(cloudWriteTime)) {
          // Local is newer — user made offline edits; skip overwrite, push local up instead.
          // Use Date objects for comparison so ISO 8601 format differences (Z vs +00:00) don't cause false results.
          console.log(`GRIP sync: keeping local ${row.data_key} (local: ${localWriteTime} > cloud: ${cloudWriteTime})`);
          schedulePush(row.data_key, localStorage.getItem(row.data_key));
          continue;
        }
        _origSetItem(row.data_key, JSON.stringify(row.data_value));
      }
      return true;
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
    updateSyncIndicator("saved");
  }

  // ── Supabase Storage file upload ─────────────────────────────────
  // Uploads a File object to the grip-attachments bucket.
  // Returns the public URL string, or null if upload failed or
  // Supabase is not configured / user is not signed in.

  async function uploadFile(file, folder = "photos") {
    const client = getClient();
    const user = await getUser();
    if (!client || !user) return null;
    try {
      const ext = (file.name || "file").split(".").pop() || "bin";
      const path = `${user.id}/${folder}/${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;
      const { error: uploadError } = await client.storage
        .from(STORAGE_BUCKET)
        .upload(path, file, { upsert: false, contentType: file.type || "application/octet-stream" });
      if (uploadError) throw uploadError;
      const { data } = client.storage.from(STORAGE_BUCKET).getPublicUrl(path);
      return data?.publicUrl || null;
    } catch (err) {
      console.warn("GRIP Storage upload failed:", err.message || err);
      return null;
    }
  }

  // ── Sync diagnostics ─────────────────────────────────────────────

  async function syncNow() {
    const user = await getUser();
    if (!user) {
      (window.showToast || alert)("Sign in first to sync with the cloud.", "warning");
      return;
    }
    updateSyncIndicator("syncing");
    await pushAllLocalData();
    updateSyncIndicator("saved");
  }

  function lastSyncInfo() {
    try {
      const ts = JSON.parse(localStorage.getItem("grip_local_timestamps") || "{}");
      const times = Object.values(ts).filter(Boolean).map((t) => new Date(t).getTime());
      if (!times.length) return "No local writes recorded.";
      const latest = new Date(Math.max(...times));
      const pending = Object.keys(ts).filter((k) => pushQueue[k]);
      return `Last local write: ${latest.toLocaleTimeString()}${pending.length ? ` · ${pending.length} key(s) pending push` : " · All synced"}`;
    } catch (_) {
      return "Sync status unavailable.";
    }
  }

  // ── Auth UI ──────────────────────────────────────────────────────

  function showAuthOverlay(show) {
    const overlay = document.getElementById("gripAuthOverlay");
    if (overlay) overlay.hidden = !show;
  }

  function updateSyncIndicator(state) {
    const el = document.getElementById("gripSyncStatus");
    if (!el) return;
    const states = {
      syncing: { text: "⟳ Syncing…", cls: "sync-syncing" },
      saved:   { text: "✓ Synced",   cls: "sync-saved"   },
      error:   { text: "⚠ Offline",  cls: "sync-error"   },
      local:   { text: "Local only", cls: "sync-local"   },
      ready:   { text: "",           cls: "sync-ready"   }, // idle after sync — hidden
    };
    const s = states[state] || states.ready;
    el.textContent = s.text;
    el.className = `grip-sync-status ${s.cls}`;
    // Tooltip: tapping "Local only" signs you in; other states are informational
    el.title = state === "local" ? "Tap to sign in and sync" : "Cloud sync status";
    if (state === "saved") setTimeout(() => updateSyncIndicator("ready"), 3000);
  }

  function updateUserDisplay(user) {
    const el = document.getElementById("gripUserDisplay");
    if (el) { el.textContent = user?.email || ""; el.hidden = !user; }
    const signOutBtn = document.getElementById("gripSignOutButton");
    if (signOutBtn) signOutBtn.hidden = !user;
    const syncNowBtn = document.getElementById("gripSyncNowButton");
    if (syncNowBtn) syncNowBtn.hidden = !user;
    const forceSignOutBtn = document.getElementById("gripForceSignOutButton");
    if (forceSignOutBtn) forceSignOutBtn.hidden = !user;
  }

  // ── Contractor token generation ──────────────────────────────────

  async function generateContractorLink(punchList) {
    const client = getClient();
    const user = await getUser();
    if (!client || !user) {
      (window.showToast || alert)("Sign in to GRIP to generate contractor links.", "warning");
      return null;
    }
    try {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      // ── Check for an existing unexpired token for this punch list ──
      // Renew it rather than creating a duplicate row.
      const { data: existing } = await client
        .from("contractor_tokens")
        .select("token, expires_at")
        .eq("user_id", user.id)
        .eq("punch_list_id", punchList.punch_list_id)
        .order("created_at", { ascending: false })
        .limit(1);

      const existingToken = existing?.[0];
      const isExpired = existingToken?.expires_at && new Date(existingToken.expires_at) < new Date();

      if (existingToken && !isExpired) {
        // Unexpired token exists — offer to renew or create fresh
        const renew = await (window.gripConfirm || window.confirm)(
          `A contractor link was already generated for this punch list.\n\n` +
          `Expires: ${new Date(existingToken.expires_at).toLocaleDateString()}\n\n` +
          `Click OK to extend it 30 more days from today.\nClick Cancel to create a brand-new link.`,
          "Renew Contractor Link"
        );
        if (renew) {
          await client
            .from("contractor_tokens")
            .update({
              expires_at: expiresAt.toISOString(),
              punch_list_snapshot: punchList, // refresh snapshot with latest items
            })
            .eq("token", existingToken.token);
          const base = window.location.origin + window.location.pathname.replace("index.html", "");
          return `${base}contractor.html?token=${existingToken.token}`;
        }
        // Fall through to create a new token
      }

      const { data, error } = await client
        .from("contractor_tokens")
        .insert({
          user_id: user.id,
          punch_list_id: punchList.punch_list_id,
          contractor_name: punchList.assigned_contractor || "",
          punch_list_snapshot: punchList,
          expires_at: expiresAt.toISOString(),
        })
        .select("token")
        .single();
      if (error) throw error;
      const base = window.location.origin + window.location.pathname.replace("index.html", "");
      return `${base}contractor.html?token=${data.token}`;
    } catch (err) {
      console.warn("Could not generate contractor link:", err);
      (window.showToast || alert)("Could not create contractor link. Make sure SUPABASE_SETUP.sql has been run in your Supabase project.", "error");
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

  // ── Realtime subscription ────────────────────────────────────────
  // Subscribes to grip_data changes for the current user so that a
  // second device (or browser tab) receives updates without a reload.
  // Changes from other sessions overwrite local state for that key.

  let _realtimeChannel = null;

  function subscribeRealtime(userId) {
    const client = getClient();
    if (!client || !userId) return;
    if (_realtimeChannel) client.removeChannel(_realtimeChannel);

    _realtimeChannel = client
      .channel("grip_data_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "grip_data", filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = payload.new || payload.old;
          if (!row?.data_key || !SYNC_KEYS.has(row.data_key)) return;
          if (payload.eventType === "DELETE") return; // don't delete local data
          // Only apply if cloud record is newer than local
          let localTs = {};
          try { localTs = JSON.parse(localStorage.getItem("grip_local_timestamps") || "{}"); } catch (_) {}
          const localWriteTime = localTs[row.data_key];
          if (localWriteTime && row.updated_at && new Date(localWriteTime) >= new Date(row.updated_at)) return;
          _origSetItem(row.data_key, JSON.stringify(row.data_value));
          updateSyncIndicator("saved");
          // Notify the app to re-render the changed data
          window.dispatchEvent(new CustomEvent("grip:remote-update", { detail: { key: row.data_key } }));
        }
      )
      .subscribe();
  }

  // ── Initialisation ───────────────────────────────────────────────

  async function init() {
    if (!isConfigured()) {
      updateSyncIndicator("local");
      showAuthOverlay(false);
      return;
    }

    const client = getClient();
    if (!client) {
      // Supabase SDK unavailable (CDN outage, offline install, etc.)
      // Fall through to local-only mode so the app still opens.
      updateSyncIndicator("local");
      showAuthOverlay(false);
      return;
    }

    // Listen for auth state changes
    client.auth.onAuthStateChange(async (event, session) => {
      const user = session?.user || null;

      if (event === "SIGNED_IN") {
        // ── Access guard: check email or domain ──────────────────
        const userEmail   = user?.email || "";
        const userDomain  = userEmail.split("@")[1] || "";
        const reqEmail    = window.GRIP_AUTHORIZED_EMAIL  || "";
        const reqDomain   = window.GRIP_AUTHORIZED_DOMAIN || "";
        const emailOk  = !reqEmail  || userEmail  === reqEmail;
        const domainOk = !reqDomain || userDomain === reqDomain;
        if (!emailOk || !domainOk) {
          await client.auth.signOut();
          showAuthOverlay(true);
          const errEl = document.getElementById("gripAuthError");
          if (errEl) {
            const expected = reqEmail || `@${reqDomain}`;
            errEl.textContent = `Access denied — this app requires a ${expected} Google account.`;
            errEl.hidden = false;
          }
          return;
        }
        // ── Authorized ───────────────────────────────────────────
        updateUserDisplay(user);
        showAuthOverlay(false);
        updateSyncIndicator("syncing");
        subscribeRealtime(user.id);
        const hadCloud = await pullAll();
        if (!hadCloud) {
          // First time — offer to push local data up
          if (Object.keys(localStorage).some((k) => SYNC_KEYS.has(k))) {
            const upload = await (window.gripConfirm || window.confirm)(
              "You have existing GRIP data on this device.\n\nUpload it to your cloud account now?\n\n(Click Cancel to start fresh — your local data stays safe.)",
              "Upload Local Data"
            );
            if (upload) {
              await pushAllLocalData();
              updateSyncIndicator("saved");
            }
          }
        } else {
          updateSyncIndicator("saved");
          // Reload once so the page re-reads fresh Supabase data from
          // localStorage.  Guard against looping with a localStorage
          // timestamp — if we reloaded less than 15 seconds ago, skip
          // and just re-render in place.  localStorage is reliable on
          // iOS Safari (unlike sessionStorage which can be cleared by
          // location.reload() in standalone/PWA mode).
          const _lastReload = parseInt(localStorage.getItem("grip_last_sync_reload") || "0", 10);
          if (Date.now() - _lastReload > 15000) {
            _origSetItem("grip_last_sync_reload", String(Date.now()));
            window.location.reload();
          } else {
            // Already reloaded recently — re-render in place with fresh data
            if (typeof window.render === "function") window.render();
          }
        }
      } else if (event === "SIGNED_OUT") {
        updateSyncIndicator("local");
        updateUserDisplay(null);
        showAuthOverlay(true);
        if (_realtimeChannel) {
          client.removeChannel(_realtimeChannel);
          _realtimeChannel = null;
        }
      }
    });

    // Check current session
    const { data: { session } } = await client.auth.getSession();
    if (!session) {
      showAuthOverlay(true);
    } else {
      showAuthOverlay(false);
      updateUserDisplay(session.user);
      updateSyncIndicator("saved");
      subscribeRealtime(session.user.id);
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
    uploadFile,
    syncNow,
    lastSyncInfo,

    async signInWithGoogle() {
      const client = getClient();
      if (!client) return;

      // ── iOS PWA detection ─────────────────────────────────────────
      // When GRIP is installed to the iOS home screen (standalone mode), OAuth
      // redirects open in Safari (separate storage) so the PKCE verifier can't
      // be found on callback — auth silently fails. Guide the user to sign in
      // through Safari first, which stores the session in localStorage that the
      // PWA will see after they return and refresh.
      const isIosPwa = (
        window.navigator.standalone === true &&
        /iPad|iPhone|iPod/.test(window.navigator.userAgent)
      );
      if (isIosPwa) {
        if (await (window.gripConfirm || window.confirm)(
          "iOS home-screen apps can't complete Google sign-in in-app.\n\n" +
          "Tap OK to open GRIP in Safari — sign in there, then come back to this app and pull down to refresh.\n\n" +
          "Your data will sync automatically after signing in.",
          "Sign In via Safari"
        )) {
          window.open("https://brentph8-ops.github.io/grip-crm/", "_blank");
        }
        return;
      }

      // hd hint pre-selects the authorized Google Workspace domain.
      // The domain guard in onAuthStateChange is the real lock.
      const hd = window.GRIP_AUTHORIZED_DOMAIN
        || (window.GRIP_AUTHORIZED_EMAIL ? window.GRIP_AUTHORIZED_EMAIL.split("@")[1] : undefined);
      // Use the canonical Pages URL so redirect always matches Supabase's allowlist
      const redirectTo = window.location.origin.includes("github.io")
        ? "https://brentph8-ops.github.io/grip-crm/"
        : window.location.href;
      client.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          queryParams: hd ? { hd } : {},
        },
      });
    },

    signOut() {
      const client = getClient();
      if (!client) return;
      client.auth.signOut();
    },

    // Signs out of ALL sessions on all devices (global scope).
    // Use this if a device is lost or shared access needs to be revoked.
    async signOutAllDevices() {
      const client = getClient();
      if (!client) return;
      if (!await (window.gripConfirm || window.confirm)(
        "Sign out of GRIP on ALL devices? You'll need to sign in again on each one.",
        "Sign Out All Devices"
      )) return;
      client.auth.signOut({ scope: "global" });
    },

    continueLocal() {
      showAuthOverlay(false);
      updateSyncIndicator("local");
    },
  };

  // ── Sync-badge click → show sign-in overlay ──────────────────────
  // When the user is in "local only" mode, tapping the sync badge
  // brings the sign-in overlay back without needing a page refresh.
  function bindSyncBadgeClick() {
    const badge = document.getElementById("gripSyncStatus");
    if (!badge) return;
    badge.addEventListener("click", async () => {
      const user = await getUser();
      if (!user) showAuthOverlay(true);
    });
  }

  // ── Realtime remote-update → re-render ───────────────────────────
  // When another device pushes a change, update in-memory state and
  // re-render the affected section without a full page reload.
  function bindRemoteUpdateHandler() {
    window.addEventListener("grip:remote-update", (e) => {
      const key = e.detail?.key;
      if (!key || typeof window._gripHandleRemoteUpdate !== "function") return;
      window._gripHandleRemoteUpdate(key);
    });
  }

  // Run on DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { init(); bindSyncBadgeClick(); bindRemoteUpdateHandler(); });
  } else {
    init();
    bindSyncBadgeClick();
    bindRemoteUpdateHandler();
  }

})();
