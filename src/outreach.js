// ─────────────────────────────────────────────────────────────────
// GRIP Outreach — Payton, Sales Assistant
// Cold email campaigns, prospect tracking, Gmail sending
// ─────────────────────────────────────────────────────────────────

(function () {

  // ── Defaults ─────────────────────────────────────────────────────

  const DEFAULT_SETTINGS = {
    assistantName: "Payton",
    repName: "Brent Phillips",
    repState: "Texas",
    repGender: "male",
    recapEmail: "brentph8@gmail.com",
    ccEmail: "brentph8@gmail.com",
    googleClientId: "",
    gmailToken: null,
    gmailEmail: "",
    gmailTokenExpiry: null,
  };

  const STATUSES = ["Cold", "Contacted", "Replied", "Warm", "Qualified", "Meeting Set", "Unsubscribed"];

  // ── State ─────────────────────────────────────────────────────────

  let _data = loadData();
  let _activeCampaignId = _data.campaigns.find(c => c.status === "active")?.id || null;
  let _selectedContactId = null;
  let _pendingEmailContactId = null;
  let _pendingEmailType = null;
  let _importSelections = new Set();
  let _searchTerm = "";
  let _statusFilter = "all";
  let _importFilterCounty = "";
  let _importFilterEntity = "";

  // ── Data I/O ─────────────────────────────────────────────────────

  function loadData() {
    try {
      const raw = localStorage.getItem("garlandOutreach");
      const p = raw ? JSON.parse(raw) : {};
      return {
        settings:    { ...DEFAULT_SETTINGS, ...(p.settings || {}) },
        campaigns:   Array.isArray(p.campaigns) ? p.campaigns : [],
        contacts:    Array.isArray(p.contacts)  ? p.contacts  : [],
        doNotContact: Array.isArray(p.doNotContact) ? p.doNotContact : [],
      };
    } catch (_) {
      return { settings: { ...DEFAULT_SETTINGS }, campaigns: [], contacts: [], doNotContact: [] };
    }
  }

  function saveData() {
    localStorage.setItem("garlandOutreach", JSON.stringify(_data));
  }

  function uid() {
    return `o-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  }

  // ── Pronouns ─────────────────────────────────────────────────────

  function heOrShe()  { return _data.settings.repGender === "female" ? "she" : "he"; }
  function himOrHer() { return _data.settings.repGender === "female" ? "her" : "him"; }
  function hisOrHer() { return _data.settings.repGender === "female" ? "her" : "his"; }

  // ── Date formatting ───────────────────────────────────────────────

  function fmtDate(iso) {
    if (!iso) return "";
    const d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  }

  function fmtShortDate(iso) {
    if (!iso) return "";
    const d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  function addDays(iso, n) {
    const d = new Date(iso);
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function daysSince(iso) {
    if (!iso) return null;
    return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  }

  function todayIso() { return new Date().toISOString().slice(0, 10); }

  // ── Email Templates ───────────────────────────────────────────────

  function buildEmail(contact, campaign, type) {
    const s = _data.settings;
    const a = s.assistantName;
    const rep = s.repName;
    const state = s.repState;
    const visitDate = campaign?.visitDate ? fmtDate(campaign.visitDate) : "[Date]";
    const first = contact.firstName || contact.company || "[First Name]";
    const he = heOrShe();
    const him = himOrHer();
    const his = hisOrHer();
    const HeUc = he.charAt(0).toUpperCase() + he.slice(1);

    const sig = `Thanks,\n\n${a}\n\nThe Garland Company\nW: www.garlandco.com\nE: payton.garlandco@gmail.com`;

    if (type === "initial") {
      return {
        subject: "Quick question on your roofing",
        body: `Hey ${first},\n\nMy name is ${a} and I assist ${rep} with The Garland Company out of ${state}. ${rep} is a building envelope representative covering roofing, waterproofing, and everything that keeps water and air out of a building.\n\n${HeUc} will be in the area on ${visitDate} and I am putting together a short list of stops for ${him}. Would you be the right person to connect with about roofing or exterior maintenance at your facility? Even 10 or 15 minutes while ${he} is nearby would be well worth your time.\n\n${sig}`,
      };
    }

    if (type === "followup1") {
      return {
        subject: "Re: Quick question on your roofing",
        body: `Hey ${first},\n\nJust wanted to bump this up in case it got lost. ${rep} still has a few openings on ${his} schedule for ${visitDate} and would love to stop by if you have a few minutes to spare.\n\n${sig}`,
      };
    }

    if (type === "followup2") {
      return {
        subject: "Re: Quick question on your roofing",
        body: `Hey ${first},\n\nStill reaching out on behalf of ${rep}. ${his.charAt(0).toUpperCase() + his.slice(1)} schedule for ${visitDate} is getting close to full, but ${he} still has a couple of openings. Wanted to make sure you had a chance to see this before ${he} locks everything in.\n\n${sig}`,
      };
    }

    if (type === "final") {
      return {
        subject: "Re: Quick question on your roofing",
        body: `Hey ${first},\n\nLast note from me on this. If the timing ever lines up down the road, feel free to reach back out and I will get something on the calendar for ${rep}. No pressure at all.\n\n${sig}`,
      };
    }

    if (type === "warmCheckin") {
      return {
        subject: "Checking in",
        body: `Hey ${first},\n\nThis is ${a}, ${rep}'s assistant. ${rep} has been meaning to reconnect and asked me to reach out. ${HeUc} will be in the area on ${visitDate} and thought it might be a good chance to stop by and catch up. Would you have 15 or 20 minutes while ${he} is around?\n\n${sig}`,
      };
    }

    return { subject: "", body: "" };
  }

  // ── Campaign CRUD ─────────────────────────────────────────────────

  function activeCampaign() {
    return _data.campaigns.find(c => c.id === _activeCampaignId) || null;
  }

  function createCampaign(city, state, visitDate) {
    // Deactivate previous active
    _data.campaigns.forEach(c => { if (c.status === "active") c.status = "paused"; });
    const c = {
      id: uid(),
      city: city.trim(),
      state: (state || "").trim(),
      visitDate,
      status: "active",
      createdAt: new Date().toISOString(),
    };
    _data.campaigns.push(c);
    _activeCampaignId = c.id;
    saveData();
    renderOutreach();
  }

  function setCampaignActive(id) {
    _data.campaigns.forEach(c => { if (c.status === "active") c.status = "paused"; });
    const c = _data.campaigns.find(c => c.id === id);
    if (c) { c.status = "active"; _activeCampaignId = id; }
    saveData();
    renderOutreach();
  }

  // ── Contact CRUD ──────────────────────────────────────────────────

  function campaignContacts(campaignId) {
    return _data.contacts.filter(c => c.campaignId === campaignId);
  }

  function findContact(id) { return _data.contacts.find(c => c.id === id); }

  function addContact(campaignId, { firstName, lastName, company, title, email, phone, accountId }) {
    const contact = {
      id: uid(),
      campaignId,
      accountId: accountId || null,
      firstName: (firstName || "").trim(),
      lastName:  (lastName  || "").trim(),
      company:   (company   || "").trim(),
      title:     (title     || "").trim(),
      email:     (email     || "").trim(),
      phone:     (phone     || "").trim(),
      status: "Cold",
      emailHistory: [],
      followUp: { day3Due: null, day3Sent: null, day7Due: null, day7Sent: null, day14Due: null, day14Sent: null },
      notes: "",
      doNotContact: false,
      createdAt: new Date().toISOString(),
      lastContactedAt: null,
    };
    _data.contacts.push(contact);
    saveData();
  }

  function updateContactStatus(id, status) {
    const c = findContact(id);
    if (c) { c.status = status; saveData(); renderContactList(); renderFollowUpQueue(); }
  }

  function markContactSent(contactId, type, subject, body) {
    const c = findContact(contactId);
    if (!c) return;
    const now = new Date().toISOString();
    c.emailHistory.push({ type, subject, body, sentAt: now });
    c.lastContactedAt = now;
    if (type === "initial" && c.status === "Cold") c.status = "Contacted";
    if (type === "warmCheckin" && ["Cold", "Contacted"].includes(c.status)) c.status = "Warm";
    // Schedule cold outreach follow-ups from initial send date
    if (type === "initial") {
      c.followUp.day3Due  = c.followUp.day3Due  || addDays(now.slice(0, 10), 3);
      c.followUp.day7Due  = c.followUp.day7Due  || addDays(now.slice(0, 10), 7);
      c.followUp.day14Due = c.followUp.day14Due || addDays(now.slice(0, 10), 14);
    }
    if (type === "followup1") c.followUp.day3Sent = now;
    if (type === "followup2") c.followUp.day7Sent = now;
    if (type === "final")     c.followUp.day14Sent = now;
    saveData();
    renderContactList();
    renderFollowUpQueue();
    // Log to GRIP account activity if this contact is linked to an account
    if (c.accountId && typeof window.addAccountActivity === "function") {
      const typeLabel = {
        initial:     "Cold Outreach",
        followup1:   "Follow-Up 1",
        followup2:   "Follow-Up 2",
        final:       "Final Follow-Up",
        warmCheckin: "Warm Check-In",
      }[type] || type;
      const name = [c.firstName, c.lastName].filter(Boolean).join(" ") || c.company;
      window.addAccountActivity(
        c.accountId,
        `Payton sent ${typeLabel} email to ${name} (${c.email}).`,
        false,
        { source: "Outreach" }
      );
    }
    (window.showToast || alert)("Marked as sent.", "success");
  }

  function deleteContact(id) {
    _data.contacts = _data.contacts.filter(c => c.id !== id);
    saveData();
    renderContactList();
    renderFollowUpQueue();
  }

  function followUpsDue() {
    const today = todayIso();
    const campaign = activeCampaign();
    if (!campaign) return [];
    return _data.contacts.filter(c => {
      if (c.campaignId !== campaign.id) return false;
      if (c.doNotContact || c.status === "Unsubscribed") return false;
      const { day3Due, day3Sent, day7Due, day7Sent, day14Due, day14Sent } = c.followUp;
      return (
        (day3Due  && day3Due  <= today && !day3Sent)  ||
        (day7Due  && day7Due  <= today && !day7Sent)  ||
        (day14Due && day14Due <= today && !day14Sent)
      );
    });
  }

  function nextFollowUpType(contact) {
    const today = todayIso();
    const { day3Due, day3Sent, day7Due, day7Sent, day14Due, day14Sent } = contact.followUp;
    if (day3Due && day3Due <= today && !day3Sent)  return "followup1";
    if (day7Due && day7Due <= today && !day7Sent)  return "followup2";
    if (day14Due && day14Due <= today && !day14Sent) return "final";
    return null;
  }

  // ── Gmail OAuth ───────────────────────────────────────────────────

  function isGmailConnected() {
    const s = _data.settings;
    return !!(s.gmailToken && s.gmailTokenExpiry && Date.now() < s.gmailTokenExpiry);
  }

  function isGmailExpiringSoon() {
    const s = _data.settings;
    if (!s.gmailToken || !s.gmailTokenExpiry) return false;
    // warn when < 10 minutes remain
    return Date.now() > s.gmailTokenExpiry - 10 * 60 * 1000;
  }

  function _initTokenClient(prompt, callback) {
    if (!_data.settings.googleClientId || !window.google?.accounts?.oauth2) return null;
    return window.google.accounts.oauth2.initTokenClient({
      client_id: _data.settings.googleClientId,
      scope: "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email",
      callback,
      prompt,
    });
  }

  function connectGmail() {
    if (!_data.settings.googleClientId) {
      openSettings();
      (window.showToast || alert)("Enter your Google OAuth Client ID in settings first.", "warning");
      return;
    }
    if (!window.google?.accounts?.oauth2) {
      (window.showToast || alert)("Google Identity Services not loaded yet. Try again in a moment.", "warning");
      return;
    }
    const client = _initTokenClient("select_account", async (res) => {
      if (res.error) { (window.showToast || alert)("Gmail auth failed: " + res.error, "error"); return; }
      _data.settings.gmailToken = res.access_token;
      _data.settings.gmailTokenExpiry = Date.now() + (res.expires_in || 3600) * 1000;
      try {
        const me = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
          headers: { Authorization: `Bearer ${res.access_token}` },
        }).then(r => r.json());
        _data.settings.gmailEmail = me.email || "";
      } catch (_) {}
      saveData();
      renderOutreach();
      (window.showToast || alert)(`Gmail connected as ${_data.settings.gmailEmail}`, "success");
    });
    if (client) client.requestAccessToken();
  }

  function disconnectGmail() {
    _data.settings.gmailToken = null;
    _data.settings.gmailTokenExpiry = null;
    _data.settings.gmailEmail = "";
    saveData();
    renderOutreach();
    (window.showToast || alert)("Gmail disconnected.", "info");
  }

  // Silently refreshes the token without forcing account picker.
  // Returns true if a new token was obtained.
  function silentTokenRefresh() {
    return new Promise((resolve) => {
      if (!_data.settings.googleClientId || !window.google?.accounts?.oauth2) {
        resolve(false); return;
      }
      const client = _initTokenClient("", async (res) => {
        if (res.error || !res.access_token) { resolve(false); return; }
        _data.settings.gmailToken = res.access_token;
        _data.settings.gmailTokenExpiry = Date.now() + (res.expires_in || 3600) * 1000;
        saveData();
        renderGmailBadge();
        resolve(true);
      });
      if (client) client.requestAccessToken();
      else resolve(false);
    });
  }

  async function sendViaGmail(to, subject, body) {
    // Auto-refresh expired token silently before sending
    if (!isGmailConnected()) {
      const refreshed = await silentTokenRefresh();
      if (!refreshed) {
        (window.showToast || alert)("Gmail session expired — please reconnect in Settings.", "warning");
        return false;
      }
    }

    const s = _data.settings;
    const headers = [`To: ${to}`];
    if (s.ccEmail) headers.push(`Cc: ${s.ccEmail}`);
    headers.push(
      `Subject: ${subject}`,
      `Content-Type: text/plain; charset=utf-8`,
      `MIME-Version: 1.0`,
      ``,
      body,
    );
    const msg = headers.join("\r\n");

    // URL-safe base64 encoding (RFC 4648)
    const encoded = btoa(unescape(encodeURIComponent(msg)))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

    try {
      const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${s.gmailToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw: encoded }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = err.error?.message || `HTTP ${res.status}`;
        // Scope error after reconnect = user needs to re-auth manually
        if (res.status === 403 || (err.error?.status === "PERMISSION_DENIED")) {
          (window.showToast || alert)(
            "Gmail permission denied. Go to Settings → Disconnect Gmail → Reconnect to grant send access.",
            "error"
          );
          return false;
        }
        throw new Error(msg);
      }
      return true;
    } catch (e) {
      (window.showToast || alert)("Send failed: " + e.message, "error");
      return false;
    }
  }

  // ── Campaign stats ────────────────────────────────────────────────

  function campaignStats(campaignId) {
    const contacts = campaignContacts(campaignId);
    return {
      total:      contacts.length,
      contacted:  contacts.filter(c => c.status !== "Cold").length,
      replied:    contacts.filter(c => ["Replied", "Warm", "Qualified", "Meeting Set"].includes(c.status)).length,
      meetings:   contacts.filter(c => c.status === "Meeting Set").length,
    };
  }

  // ── Recap email ───────────────────────────────────────────────────

  function buildRecap() {
    const campaign = activeCampaign();
    const s = _data.settings;
    if (!campaign) return { subject: "GRIP Outreach Recap", body: "No active campaign." };
    const stats = campaignStats(campaign.id);
    const due = followUpsDue();
    const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    const body = `GRIP Outreach Daily Recap — ${today}
Campaign: ${campaign.city}${campaign.state ? ", " + campaign.state : ""} · Visit: ${fmtDate(campaign.visitDate)}

SUMMARY
Total prospects: ${stats.total}
Contacted: ${stats.contacted}
Replied: ${stats.replied}
Meetings booked: ${stats.meetings}

FOLLOW-UPS DUE TODAY (${due.length})
${due.length ? due.map(c => `• ${c.firstName} ${c.lastName} — ${c.company} (${nextFollowUpType(c)})`).join("\n") : "None due today."}

${s.assistantName}`;
    return {
      subject: `Outreach Recap — ${campaign.city} — ${today}`,
      body,
    };
  }

  // ── Rendering ─────────────────────────────────────────────────────

  function escHtml(str) {
    return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function statusBadge(status) {
    const map = {
      Cold:           "status-cold",
      Contacted:      "status-contacted",
      Replied:        "status-replied",
      Warm:           "status-warm",
      Qualified:      "status-qualified",
      "Meeting Set":  "status-meeting",
      Unsubscribed:   "status-unsub",
    };
    return `<span class="outreach-status-badge ${map[status] || ""}">${escHtml(status)}</span>`;
  }

  function avatarInitials(contact) {
    const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.company || "?";
    return name.trim().split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join("");
  }

  function renderCampaignBar() {
    const el = document.getElementById("outreachCampaignInfo");
    if (!el) return;
    const campaign = activeCampaign();
    if (!campaign) {
      el.innerHTML = `<div class="payton-empty-campaign">No active campaign — <button class="link-button" id="startFirstCampaignBtn" type="button">create one to get started</button></div>`;
      document.getElementById("startFirstCampaignBtn")?.addEventListener("click", () => {
        document.getElementById("newCampaignForm")?.reset();
        populateCampaignAreaDropdown();
        document.getElementById("newCampaignDialog")?.showModal();
      });
      return;
    }
    const stats = campaignStats(campaign.id);
    const due = followUpsDue().length;
    el.innerHTML = `
      <div class="payton-campaign-card">
        <div class="payton-campaign-left">
          <div class="payton-campaign-name">${escHtml(campaign.city)}${campaign.state ? `, ${escHtml(campaign.state)}` : ""}</div>
          <div class="payton-campaign-date">Visit · ${fmtDate(campaign.visitDate)}</div>
        </div>
        <div class="payton-stat-row">
          <div class="payton-stat"><span class="payton-stat-num">${stats.total}</span><span class="payton-stat-label">Prospects</span></div>
          <div class="payton-stat"><span class="payton-stat-num">${stats.contacted}</span><span class="payton-stat-label">Contacted</span></div>
          <div class="payton-stat"><span class="payton-stat-num">${stats.replied}</span><span class="payton-stat-label">Replied</span></div>
          <div class="payton-stat"><span class="payton-stat-num ${stats.meetings ? "payton-stat-accent" : ""}">${stats.meetings}</span><span class="payton-stat-label">Meetings</span></div>
          ${due ? `<div class="payton-stat payton-stat-warn"><span class="payton-stat-num">${due}</span><span class="payton-stat-label">Due Today</span></div>` : ""}
        </div>
        ${_data.campaigns.length > 1 ? `<button class="payton-switch-btn" id="switchCampaignBtn" type="button">Switch</button>` : ""}
      </div>
    `;
    document.getElementById("switchCampaignBtn")?.addEventListener("click", openSwitchCampaign);
  }

  function renderGmailBadge() {
    const statusEl = document.getElementById("outreachGmailStatus");
    const connectBtn = document.getElementById("outreachConnectGmailButton");
    if (!statusEl || !connectBtn) return;
    if (isGmailConnected()) {
      if (isGmailExpiringSoon()) {
        statusEl.textContent = `⚠ Session expiring — ${_data.settings.gmailEmail}`;
        statusEl.className = "outreach-gmail-status expiring";
      } else {
        statusEl.textContent = `✓ Sending as ${_data.settings.gmailEmail}`;
        statusEl.className = "outreach-gmail-status connected";
      }
      connectBtn.textContent = "Disconnect Gmail";
    } else {
      statusEl.textContent = "Gmail not connected";
      statusEl.className = "outreach-gmail-status";
      connectBtn.textContent = "Connect Gmail";
    }
  }

  function renderContactList() {
    const el = document.getElementById("outreachProspectList");
    if (!el) return;
    const campaign = activeCampaign();
    if (!campaign) {
      el.innerHTML = `<p class="empty-state">Create a campaign to start adding prospects.</p>`;
      return;
    }
    const search = _searchTerm.toLowerCase();
    let contacts = campaignContacts(campaign.id)
      .filter(c => _statusFilter === "all" || c.status === _statusFilter)
      .filter(c => !search || [c.firstName, c.lastName, c.company, c.email, c.title]
        .join(" ").toLowerCase().includes(search))
      .sort((a, b) => {
        const order = { "Meeting Set": 0, Qualified: 1, Warm: 2, Replied: 3, Contacted: 4, Cold: 5, Unsubscribed: 6 };
        return (order[a.status] ?? 9) - (order[b.status] ?? 9);
      });

    if (!contacts.length) {
      el.innerHTML = `<p class="empty-state">${_statusFilter !== "all" ? "No prospects with this status." : "No prospects yet. Add one or import from GRIP accounts."}</p>`;
      return;
    }

    el.innerHTML = contacts.map(c => {
      const daysAgo = c.lastContactedAt ? daysSince(c.lastContactedAt) : null;
      const contacted = daysAgo !== null ? `${daysAgo}d ago` : "—";
      const hasSent = c.emailHistory.length > 0;
      const fup = nextFollowUpType(c);
      const initials = avatarInitials(c);
      const avatarClass = { "Meeting Set": "avatar-meeting", Qualified: "avatar-qualified", Warm: "avatar-warm", Replied: "avatar-replied", Contacted: "avatar-contacted", Cold: "avatar-cold", Unsubscribed: "avatar-unsub" }[c.status] || "avatar-cold";
      return `
        <div class="prospect-card${fup ? " prospect-card--due" : ""}" data-contact-id="${escHtml(c.id)}">
          <div class="prospect-avatar ${avatarClass}">${escHtml(initials)}</div>
          <div class="prospect-body">
            <div class="prospect-name-row">
              <span class="prospect-name">${escHtml(c.firstName)} ${escHtml(c.lastName)}</span>
              ${statusBadge(c.status)}
              ${fup ? `<span class="prospect-due-dot" title="Follow-up due">●</span>` : ""}
            </div>
            <span class="prospect-meta">${escHtml(c.company)}${c.title ? ` · ${escHtml(c.title)}` : ""}</span>
            <a class="prospect-email" href="mailto:${escHtml(c.email)}">${escHtml(c.email)}</a>
          </div>
          <div class="prospect-right">
            <span class="prospect-last">${contacted}</span>
            <div class="prospect-actions">
              <button class="payton-btn" type="button" data-open-email="${escHtml(c.id)}" data-email-type="initial">${hasSent ? "Re-draft" : "Cold"}</button>
              <button class="payton-btn" type="button" data-open-email="${escHtml(c.id)}" data-email-type="warmCheckin">Check-In</button>
              ${fup ? `<button class="payton-btn payton-btn--accent" type="button" data-open-email="${escHtml(c.id)}" data-email-type="${fup}">Follow Up</button>` : ""}
              <select class="payton-select" data-status-contact="${escHtml(c.id)}" title="Change status">
                ${STATUSES.map(s => `<option ${s === c.status ? "selected" : ""}>${escHtml(s)}</option>`).join("")}
              </select>
              <button class="payton-remove" type="button" data-delete-contact="${escHtml(c.id)}" title="Remove">✕</button>
            </div>
          </div>
        </div>`;
    }).join("");
  }

  function renderFollowUpQueue() {
    const el = document.getElementById("outreachFollowUpQueue");
    if (!el) return;
    const due = followUpsDue();
    if (!due.length) {
      el.innerHTML = `<p class="empty-state">No follow-ups due today.</p>`;
      return;
    }
    const campaign = activeCampaign();
    el.innerHTML = due.map(c => {
      const type = nextFollowUpType(c);
      const typeLabel = { followup1: "Day 3", followup2: "Day 7", final: "Final" }[type] || type;
      const initials = avatarInitials(c);
      return `
        <div class="fup-card">
          <div class="prospect-avatar avatar-contacted" style="width:32px;height:32px;font-size:11px">${escHtml(initials)}</div>
          <div class="fup-card-body">
            <span class="fup-card-name">${escHtml(c.firstName)} ${escHtml(c.lastName)}</span>
            <span class="fup-card-company">${escHtml(c.company)}</span>
          </div>
          <div class="fup-card-right">
            <span class="fup-type-badge">${typeLabel}</span>
            <button class="payton-btn payton-btn--accent" type="button" data-open-email="${escHtml(c.id)}" data-email-type="${type}">Draft</button>
          </div>
        </div>`;
    }).join("");
  }

  function renderCampaignList() {
    const el = document.getElementById("switchCampaignList");
    if (!el) return;
    el.innerHTML = _data.campaigns.map(c => {
      const stats = campaignStats(c.id);
      const isActive = c.id === _activeCampaignId;
      return `
        <div class="outreach-campaign-item ${isActive ? "is-active" : ""}">
          <div>
            <strong>${escHtml(c.city)}${c.state ? `, ${escHtml(c.state)}` : ""}</strong>
            <span class="muted-note">${fmtDate(c.visitDate)} · ${stats.total} prospects</span>
          </div>
          ${!isActive ? `<button class="secondary-button btn-sm" type="button" data-activate-campaign="${escHtml(c.id)}">Activate</button>` : `<span class="outreach-active-label">Active</span>`}
        </div>`;
    }).join("") || `<p class="empty-state">No campaigns yet.</p>`;
  }

  function accountAreas() {
    if (typeof window.cleanAccounts !== "function") return [];
    return [...new Set(window.cleanAccounts().map(a => a.county).filter(Boolean))].sort();
  }

  function accountEntities() {
    if (typeof window.cleanAccounts !== "function") return [];
    return [...new Set(window.cleanAccounts().map(a => a.entity).filter(Boolean))].sort();
  }

  function populateImportFilters() {
    const countyEl = document.getElementById("importFilterCounty");
    const entityEl = document.getElementById("importFilterEntity");
    if (countyEl) {
      const current = countyEl.value;
      countyEl.innerHTML = `<option value="">All Areas / Counties</option>` +
        accountAreas().map(c => `<option value="${escHtml(c)}" ${c === current ? "selected" : ""}>${escHtml(c)}</option>`).join("");
      if (!current && _importFilterCounty) countyEl.value = _importFilterCounty;
    }
    if (entityEl) {
      const current = entityEl.value;
      entityEl.innerHTML = `<option value="">All Entity Types</option>` +
        accountEntities().map(e => `<option value="${escHtml(e)}" ${e === current ? "selected" : ""}>${escHtml(e)}</option>`).join("");
      if (!current && _importFilterEntity) entityEl.value = _importFilterEntity;
    }
  }

  function populateCampaignAreaDropdown() {
    const sel = document.getElementById("campaignAreaSelect");
    if (!sel) return;
    const areas = accountAreas();
    sel.innerHTML = `<option value="">-- Select from your accounts --</option>` +
      areas.map(a => `<option value="${escHtml(a)}">${escHtml(a)}</option>`).join("") +
      `<option value="__other__">Other (type custom)...</option>`;
  }

  function renderImportList() {
    const el = document.getElementById("importGripList");
    if (!el || typeof window.cleanAccounts !== "function") return;
    const search = document.getElementById("importGripSearch")?.value?.toLowerCase() || "";
    const existing = new Set(_data.contacts.filter(c => c.campaignId === _activeCampaignId).map(c => c.email.toLowerCase()));
    const accounts = window.cleanAccounts()
      .filter(a => a.email && !existing.has(a.email.toLowerCase()))
      .filter(a => !_importFilterCounty || (a.county || "").toLowerCase() === _importFilterCounty.toLowerCase())
      .filter(a => !_importFilterEntity || (a.entity || "").toLowerCase() === _importFilterEntity.toLowerCase())
      .filter(a => !search || [a.client, a.email, a.poc, a.county, a.entity].join(" ").toLowerCase().includes(search));

    const countEl = document.getElementById("importGripCount");
    if (countEl) countEl.textContent = accounts.length ? `${accounts.length} account${accounts.length === 1 ? "" : "s"}` : "";

    if (!accounts.length) {
      el.innerHTML = `<p class="empty-state">No matching accounts found.</p>`;
      return;
    }
    el.innerHTML = accounts.map(a => `
      <label class="import-grip-item">
        <input type="checkbox" value="${escHtml(a.id)}" ${_importSelections.has(a.id) ? "checked" : ""} />
        <div>
          <strong>${escHtml(a.client)}</strong>
          <span>${escHtml(a.poc || "")}${a.poc ? " · " : ""}${escHtml(a.email)}</span>
          <span class="import-grip-meta">
            ${a.county ? `<span class="import-tag">${escHtml(a.county)}</span>` : ""}
            ${a.entity ? `<span class="import-tag import-tag-entity">${escHtml(a.entity)}</span>` : ""}
          </span>
        </div>
      </label>`).join("");
  }

  function renderOutreach() {
    renderGmailBadge();
    renderCampaignBar();
    renderContactList();
    renderFollowUpQueue();
  }

  // ── Email dialog ──────────────────────────────────────────────────

  function openEmailDialog(contactId, type) {
    const contact = findContact(contactId);
    const campaign = activeCampaign();
    if (!contact || !campaign) return;

    _pendingEmailContactId = contactId;
    _pendingEmailType = type;

    const email = buildEmail(contact, campaign, type);
    const prev = contact.emailHistory.find(h => h.type === type);

    const typeLabel = {
      initial:    "Cold Outreach",
      followup1:  "Follow-Up 1 (Day 3)",
      followup2:  "Follow-Up 2 (Day 7)",
      final:      "Final Follow-Up (Day 14)",
      warmCheckin: "Warm Check-In",
    }[type] || type;

    document.getElementById("outreachEmailDialogTitle").textContent =
      `${typeLabel} — ${contact.firstName} ${contact.lastName}`;
    document.getElementById("outreachEmailTo").value = contact.email;
    document.getElementById("outreachEmailSubject").value = prev?.subject || email.subject;
    document.getElementById("outreachEmailBody").value   = prev?.body    || email.body;

    const fromNote = document.getElementById("outreachEmailFromNote");
    if (fromNote) {
      fromNote.textContent = isGmailConnected()
        ? `Will send from ${_data.settings.gmailEmail}`
        : "Gmail not connected — use Copy to clipboard to send manually.";
    }

    const sendBtn = document.getElementById("sendOutreachEmailButton");
    if (sendBtn) sendBtn.disabled = !isGmailConnected();

    document.getElementById("outreachEmailDialog")?.showModal();
  }

  // ── Settings dialog ───────────────────────────────────────────────

  function openSettings() {
    const s = _data.settings;
    const form = document.getElementById("outreachSettingsForm");
    if (!form) return;
    form.elements.assistantName.value = s.assistantName;
    form.elements.repName.value       = s.repName;
    form.elements.repState.value      = s.repState;
    form.elements.recapEmail.value    = s.recapEmail;
    form.elements.ccEmail.value       = s.ccEmail || "";
    form.elements.googleClientId.value = s.googleClientId;
    const statusEl = document.getElementById("outreachGmailSetupStatus");
    if (statusEl) {
      statusEl.textContent = isGmailConnected()
        ? `Connected: ${s.gmailEmail}`
        : s.googleClientId ? "Client ID saved. Click Connect Gmail on main screen." : "Not connected.";
    }
    document.getElementById("outreachSettingsDialog")?.showModal();
  }

  function openSwitchCampaign() {
    renderCampaignList();
    document.getElementById("switchCampaignDialog")?.showModal();
  }

  // ── Event wiring ──────────────────────────────────────────────────

  function bindEvents() {
    // Connect/disconnect Gmail
    document.getElementById("outreachConnectGmailButton")?.addEventListener("click", () => {
      if (isGmailConnected()) disconnectGmail();
      else connectGmail();
    });

    // Settings
    document.getElementById("outreachSettingsButton")?.addEventListener("click", openSettings);
    document.getElementById("cancelOutreachSettingsButton")?.addEventListener("click", () =>
      document.getElementById("outreachSettingsDialog")?.close());
    document.getElementById("closeOutreachSettingsDialog")?.addEventListener("click", () =>
      document.getElementById("outreachSettingsDialog")?.close());

    document.getElementById("outreachSettingsForm")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const form = new FormData(e.currentTarget);
      _data.settings.assistantName  = String(form.get("assistantName") || "").trim() || "Payton";
      _data.settings.repName        = String(form.get("repName") || "").trim();
      _data.settings.repState       = String(form.get("repState") || "").trim();
      _data.settings.recapEmail     = String(form.get("recapEmail") || "").trim();
      _data.settings.ccEmail        = String(form.get("ccEmail") || "").trim();
      _data.settings.googleClientId = String(form.get("googleClientId") || "").trim();
      saveData();
      document.getElementById("outreachSettingsDialog")?.close();
      renderOutreach();
      (window.showToast || alert)("Settings saved.", "success");
    });

    // New campaign
    document.getElementById("newCampaignButton")?.addEventListener("click", () => {
      document.getElementById("newCampaignForm")?.reset();
      document.getElementById("campaignCustomCity")?.closest(".campaign-custom-city-row")?.classList.add("hidden");
      populateCampaignAreaDropdown();
      document.getElementById("newCampaignDialog")?.showModal();
    });
    document.getElementById("cancelNewCampaignButton")?.addEventListener("click", () =>
      document.getElementById("newCampaignDialog")?.close());
    document.getElementById("closeNewCampaignDialog")?.addEventListener("click", () =>
      document.getElementById("newCampaignDialog")?.close());

    document.getElementById("campaignAreaSelect")?.addEventListener("change", (e) => {
      const customRow = document.getElementById("campaignCustomCity")?.closest(".campaign-custom-city-row");
      if (e.target.value === "__other__") {
        customRow?.classList.remove("hidden");
        document.getElementById("campaignCustomCity")?.focus();
      } else {
        customRow?.classList.add("hidden");
      }
    });

    document.getElementById("newCampaignForm")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const form = new FormData(e.currentTarget);
      const area = form.get("campaignArea") || "";
      const city = area === "__other__" ? (form.get("campaignCustomCity") || "").trim() : area;
      if (!city) { (window.showToast || alert)("Please select or enter an area.", "warning"); return; }
      createCampaign(city, form.get("state"), form.get("visitDate"));
      document.getElementById("newCampaignDialog")?.close();
    });

    // Add prospect
    document.getElementById("addProspectButton")?.addEventListener("click", () => {
      if (!activeCampaign()) {
        (window.showToast || alert)("Create a campaign first.", "warning");
        return;
      }
      document.getElementById("addProspectForm")?.reset();
      document.getElementById("addProspectDialog")?.showModal();
    });
    document.getElementById("cancelAddProspectButton")?.addEventListener("click", () =>
      document.getElementById("addProspectDialog")?.close());
    document.getElementById("closeAddProspectDialog")?.addEventListener("click", () =>
      document.getElementById("addProspectDialog")?.close());

    document.getElementById("addProspectForm")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const form = new FormData(e.currentTarget);
      addContact(_activeCampaignId, {
        firstName: form.get("firstName"),
        lastName:  form.get("lastName"),
        company:   form.get("company"),
        title:     form.get("title"),
        email:     form.get("email"),
        phone:     form.get("phone"),
      });
      document.getElementById("addProspectDialog")?.close();
      renderContactList();
      (window.showToast || alert)("Prospect added.", "success");
    });

    // Import from GRIP
    document.getElementById("importFromGripButton")?.addEventListener("click", () => {
      if (!activeCampaign()) {
        (window.showToast || alert)("Create a campaign first.", "warning");
        return;
      }
      _importSelections.clear();
      // Pre-select the active campaign's area
      _importFilterCounty = activeCampaign()?.city || "";
      _importFilterEntity = "";
      populateImportFilters();
      renderImportList();
      document.getElementById("importFromGripDialog")?.showModal();
    });
    document.getElementById("cancelImportGripButton")?.addEventListener("click", () =>
      document.getElementById("importFromGripDialog")?.close());
    document.getElementById("closeImportFromGripDialog")?.addEventListener("click", () =>
      document.getElementById("importFromGripDialog")?.close());

    document.getElementById("importGripSearch")?.addEventListener("input", renderImportList);
    document.getElementById("importFilterCounty")?.addEventListener("change", (e) => {
      _importFilterCounty = e.target.value;
      renderImportList();
    });
    document.getElementById("importFilterEntity")?.addEventListener("change", (e) => {
      _importFilterEntity = e.target.value;
      renderImportList();
    });

    document.getElementById("importGripList")?.addEventListener("change", (e) => {
      const cb = e.target.closest("input[type=checkbox]");
      if (!cb) return;
      if (cb.checked) _importSelections.add(cb.value);
      else _importSelections.delete(cb.value);
    });

    document.getElementById("confirmImportGripButton")?.addEventListener("click", () => {
      if (!_importSelections.size) return;
      if (typeof window.cleanAccounts === "function") {
        const accts = window.cleanAccounts().filter(a => _importSelections.has(a.id));
        accts.forEach(a => {
          const [firstName = "", ...rest] = (a.poc || a.client || "").trim().split(/\s+/);
          addContact(_activeCampaignId, {
            firstName,
            lastName: rest.join(" "),
            company:  a.client || "",
            title:    "",
            email:    a.email || "",
            phone:    a.phone || "",
            accountId: a.id,
          });
        });
        document.getElementById("importFromGripDialog")?.close();
        renderContactList();
        (window.showToast || alert)(`${accts.length} prospect${accts.length === 1 ? "" : "s"} imported.`, "success");
      }
    });

    // Switch campaign dialog
    document.getElementById("closeSwitchCampaignDialog")?.addEventListener("click", () =>
      document.getElementById("switchCampaignDialog")?.close());

    document.getElementById("switchCampaignList")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-activate-campaign]");
      if (btn) { setCampaignActive(btn.dataset.activateCampaign); document.getElementById("switchCampaignDialog")?.close(); }
    });

    // Contact list delegation
    document.getElementById("outreachProspectList")?.addEventListener("click", (e) => {
      const openBtn = e.target.closest("[data-open-email]");
      if (openBtn) { openEmailDialog(openBtn.dataset.openEmail, openBtn.dataset.emailType); return; }
      const delBtn = e.target.closest("[data-delete-contact]");
      if (delBtn && (window.confirm || (() => true))(`Remove this prospect?`)) {
        deleteContact(delBtn.dataset.deleteContact);
      }
    });

    document.getElementById("outreachProspectList")?.addEventListener("change", (e) => {
      const sel = e.target.closest("[data-status-contact]");
      if (sel) updateContactStatus(sel.dataset.statusContact, sel.value);
    });

    document.getElementById("outreachFollowUpQueue")?.addEventListener("click", (e) => {
      const openBtn = e.target.closest("[data-open-email]");
      if (openBtn) openEmailDialog(openBtn.dataset.openEmail, openBtn.dataset.emailType);
    });

    // Email dialog
    document.getElementById("closeOutreachEmailDialog")?.addEventListener("click", () =>
      document.getElementById("outreachEmailDialog")?.close());

    document.getElementById("copyOutreachEmailButton")?.addEventListener("click", () => {
      const subject = document.getElementById("outreachEmailSubject")?.value || "";
      const body    = document.getElementById("outreachEmailBody")?.value || "";
      navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`)
        .then(() => (window.showToast || alert)("Copied to clipboard.", "success"))
        .catch(() => (window.showToast || alert)("Copy failed — select the text manually.", "warning"));
    });

    document.getElementById("sendOutreachEmailButton")?.addEventListener("click", async () => {
      const to      = document.getElementById("outreachEmailTo")?.value || "";
      const subject = document.getElementById("outreachEmailSubject")?.value || "";
      const body    = document.getElementById("outreachEmailBody")?.value || "";
      const sent = await sendViaGmail(to, subject, body);
      if (sent && _pendingEmailContactId && _pendingEmailType) {
        markContactSent(_pendingEmailContactId, _pendingEmailType, subject, body);
        document.getElementById("outreachEmailDialog")?.close();
      }
    });

    // Mark sent without Gmail
    document.getElementById("markSentButton")?.addEventListener("click", () => {
      const subject = document.getElementById("outreachEmailSubject")?.value || "";
      const body    = document.getElementById("outreachEmailBody")?.value || "";
      if (_pendingEmailContactId && _pendingEmailType) {
        markContactSent(_pendingEmailContactId, _pendingEmailType, subject, body);
        document.getElementById("outreachEmailDialog")?.close();
      }
    });

    // Search + filter
    document.getElementById("outreachSearch")?.addEventListener("input", (e) => {
      _searchTerm = e.target.value;
      renderContactList();
    });
    document.getElementById("outreachStatusFilter")?.addEventListener("change", (e) => {
      _statusFilter = e.target.value;
      renderContactList();
    });

    // Generate recap
    document.getElementById("generateRecapButton")?.addEventListener("click", () => {
      const recap = buildRecap();
      openEmailDialog("__recap__", "__recap__");
      document.getElementById("outreachEmailDialogTitle").textContent = "Daily Recap Email";
      document.getElementById("outreachEmailTo").value = _data.settings.recapEmail;
      document.getElementById("outreachEmailSubject").value = recap.subject;
      document.getElementById("outreachEmailBody").value = recap.body;
      document.getElementById("outreachEmailDialog")?.showModal();
    });
  }

  // ── Init ──────────────────────────────────────────────────────────

  function init() {
    _activeCampaignId = _data.campaigns.find(c => c.status === "active")?.id || null;
    bindEvents();
  }

  // ── Public API ────────────────────────────────────────────────────

  window.gripOutreach = {
    render: renderOutreach,
    init,
  };

  // Handle remote Supabase updates
  const _origHandler = window._gripHandleRemoteUpdate;
  window._gripHandleRemoteUpdate = function (key) {
    if (key === "garlandOutreach") {
      _data = loadData();
      renderOutreach();
    }
    if (_origHandler) _origHandler(key);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
