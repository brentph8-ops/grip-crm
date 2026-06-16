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
    const { createClient } = window.supabase;
    window._gripSupabaseClient = createClient(
      window.GRIP_SUPABASE_URL,
      window.GRIP_SUPABASE_ANON
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
      updateSyncIndicator("syncing");
      schedulePush(key, value);
    }
  };

  // ── Pull from Supabase on load ───────────────────────────────────

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
      for (const row of data) {
        const local = localStorage.getItem(row.data_key);
        // Only overwrite if Supabase record is newer than local data
        // (simple last-write-wins; future: use updated_at timestamps)
        if (!local) {
          _origSetItem(row.data_key, JSON.stringify(row.data_value));
        } else {
          // Always prefer Supabase on initial cloud load to ensure
          // cross-device data is current
          _origSetItem(row.data_key, JSON.stringify(row.data_value));
        }
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
    };
    const s = states[state] || states.local;
    el.textContent = s.text;
    el.className = `grip-sync-status ${s.cls}`;
    if (state === "saved") setTimeout(() => updateSyncIndicator("ready"), 3000);
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

  // ── Initialisation ───────────────────────────────────────────────

  async function init() {
    if (!isConfigured()) {
      updateSyncIndicator("local");
      showAuthOverlay(false);
      return;
    }

    const client = getClient();

    // Listen for auth state changes
    client.auth.onAuthStateChange(async (event, session) => {
      const user = session?.user || null;

      if (event === "SIGNED_IN") {
        // ── Single-user access guard ─────────────────────────────
        const authorizedEmail = window.GRIP_AUTHORIZED_EMAIL;
        if (authorizedEmail && user?.email !== authorizedEmail) {
          await client.auth.signOut();
          showAuthOverlay(true);
          const errEl = document.getElementById("gripAuthError");
          if (errEl) {
            errEl.textContent = `Access denied — signed in as ${user?.email || "unknown"}, but this app requires ${authorizedEmail}. Try signing out of all Google accounts first.`;
            errEl.hidden = false;
          }
          const btn = document.getElementById("gripGoogleSignInButton");
          if (btn) btn.textContent = "Sign in with Garland Google Account";
          return;
        }
        // ── Authorized ───────────────────────────────────────────
        updateUserDisplay(user);
        showAuthOverlay(false);
        updateSyncIndicator("syncing");
        const hadCloud = await pullAll();
        if (!hadCloud) {
          // First time — offer to push local data up
          if (Object.keys(localStorage).some((k) => SYNC_KEYS.has(k))) {
            const upload = confirm(
              "You have existing GRIP data on this device.\n\nUpload it to your cloud account now?\n\n(Click Cancel to start fresh — your local data stays safe.)"
            );
            if (upload) {
              await pushAllLocalData();
              updateSyncIndicator("saved");
            }
          }
        } else {
          updateSyncIndicator("saved");
          // Reload the app with fresh data from Supabase
          window.location.reload();
        }
      } else if (event === "SIGNED_OUT") {
        updateSyncIndicator("local");
        updateUserDisplay(null);
        showAuthOverlay(true);
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
      const client = getClient();
      if (!client) return;
      client.auth.signOut();
    },

    continueLocal() {
      showAuthOverlay(false);
      updateSyncIndicator("local");
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
      if (btn) btn.textContent = "Sign in with Garland Google Account";
      window._gripSupabaseClient = null; // Force client re-creation
      init();
    },
  };

  // Run on DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
