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
    const city = campaign?.city || "[City]";
    const visitDate = campaign?.visitDate ? fmtDate(campaign.visitDate) : "[Date]";
    const first = contact.firstName || contact.company || "[First Name]";
    const he = heOrShe();
    const him = himOrHer();
    const his = hisOrHer();

    if (type === "initial") {
      return {
        subject: "Quick question on your roofing",
        body:
`Hey ${first},

My name is ${a}. I am ${rep}'s assistant with The Garland Company here in ${state}.

I wanted to touch base because on paper Garland tends to be a good fit for groups like yours. Are you involved with maintaining the roofing or building envelope for your facilities?

Garland works on everything on the exterior of the building that keeps out wind and rain. We help teams with roof evaluations, long term planning, and solving issues before they turn into expensive problems.

${rep} will be in ${city} on ${visitDate} and I am helping line up a few quick stops for ${him} while ${he} is in town. ${he.charAt(0).toUpperCase() + he.slice(1)} would be the one stopping in.

If you would be open to a quick 10 to 15 minute intro while ${he} is there, I can coordinate a time that works best for you.

Appreciate it either way, ${first}.

${a}`,
      };
    }

    if (type === "followup1") {
      return {
        subject: "Re: Quick question on your roofing",
        body:
`Just wanted to bump this. ${rep}'s schedule in ${city} is filling up for ${visitDate}.

${a}`,
      };
    }

    if (type === "followup2") {
      return {
        subject: "Re: Quick question on your roofing",
        body:
`Not sure if this is relevant right now but figured I would reach out while ${he} is in the area.

${a}`,
      };
    }

    if (type === "final") {
      return {
        subject: "Re: Quick question on your roofing",
        body:
`I will leave you alone after this. But if a second set of eyes on your roof ever helps, just let me know.

${a}`,
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
    // Schedule follow-ups based on sent date
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
    showToast("Marked as sent.", "success");
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
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: _data.settings.googleClientId,
      scope: [
        "https://www.googleapis.com/auth/gmail.send",
        "https://www.googleapis.com/auth/userinfo.email",
      ].join(" "),
      callback: async (res) => {
        if (res.error) { (window.showToast || alert)("Gmail auth failed: " + res.error, "error"); return; }
        _data.settings.gmailToken = res.access_token;
        _data.settings.gmailTokenExpiry = Date.now() + res.expires_in * 1000;
        try {
          const me = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
            headers: { Authorization: `Bearer ${res.access_token}` },
          }).then(r => r.json());
          _data.settings.gmailEmail = me.email || "";
        } catch (_) {}
        saveData();
        renderOutreach();
        (window.showToast || alert)(`Gmail connected: ${_data.settings.gmailEmail}`, "success");
      },
    });
    client.requestAccessToken({ prompt: "select_account" });
  }

  function disconnectGmail() {
    _data.settings.gmailToken = null;
    _data.settings.gmailTokenExpiry = null;
    _data.settings.gmailEmail = "";
    saveData();
    renderOutreach();
    (window.showToast || alert)("Gmail disconnected.", "info");
  }

  async function sendViaGmail(to, subject, body) {
    if (!isGmailConnected()) {
      (window.showToast || alert)("Connect Gmail first.", "warning");
      return false;
    }
    const s = _data.settings;
    const from = `${s.assistantName} <${s.gmailEmail}>`;
    const headers = [
      `From: ${from}`,
      `To: ${to}`,
    ];
    if (s.ccEmail) headers.push(`Cc: ${s.ccEmail}`);
    headers.push(
      `Subject: ${subject}`,
      `Content-Type: text/plain; charset=utf-8`,
      `MIME-Version: 1.0`,
      ``,
      body,
    );
    const msg = headers.join("\r\n");

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
        throw new Error(err.error?.message || `HTTP ${res.status}`);
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

  function renderCampaignBar() {
    const el = document.getElementById("outreachCampaignInfo");
    if (!el) return;
    const campaign = activeCampaign();
    if (!campaign) {
      el.innerHTML = `<span class="outreach-no-campaign">No active campaign — create one to get started.</span>`;
      return;
    }
    const stats = campaignStats(campaign.id);
    const due = followUpsDue().length;
    el.innerHTML = `
      <div class="outreach-campaign-title">
        <strong>${escHtml(campaign.city)}${campaign.state ? `, ${escHtml(campaign.state)}` : ""}</strong>
        <span class="outreach-visit-date">Visit: ${fmtDate(campaign.visitDate)}</span>
      </div>
      <div class="outreach-campaign-stats">
        <span>${stats.total} prospects</span>
        <span>${stats.contacted} contacted</span>
        <span>${stats.replied} replied</span>
        ${stats.meetings ? `<span class="stat-highlight">🗓 ${stats.meetings} meeting${stats.meetings === 1 ? "" : "s"} booked</span>` : ""}
        ${due ? `<span class="stat-alert">⚑ ${due} follow-up${due === 1 ? "" : "s"} due</span>` : ""}
      </div>
      ${_data.campaigns.length > 1 ? `<button class="link-button" id="switchCampaignBtn" type="button">Switch campaign</button>` : ""}
    `;
    document.getElementById("switchCampaignBtn")?.addEventListener("click", openSwitchCampaign);
  }

  function renderGmailBadge() {
    const statusEl = document.getElementById("outreachGmailStatus");
    const connectBtn = document.getElementById("outreachConnectGmailButton");
    if (!statusEl || !connectBtn) return;
    if (isGmailConnected()) {
      statusEl.textContent = `✓ Sending as ${_data.settings.gmailEmail}`;
      statusEl.className = "outreach-gmail-status connected";
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
      const contacted = daysAgo !== null ? `${daysAgo}d ago` : "Not yet";
      const hasSent = c.emailHistory.length > 0;
      const fup = nextFollowUpType(c);
      return `
        <div class="outreach-contact-row" data-contact-id="${escHtml(c.id)}">
          <div class="outreach-contact-info">
            <strong class="outreach-contact-name">${escHtml(c.firstName)} ${escHtml(c.lastName)}</strong>
            <span class="outreach-contact-company">${escHtml(c.company)}</span>
            ${c.title ? `<span class="outreach-contact-title">${escHtml(c.title)}</span>` : ""}
            <a class="outreach-contact-email" href="mailto:${escHtml(c.email)}">${escHtml(c.email)}</a>
          </div>
          <div class="outreach-contact-meta">
            ${statusBadge(c.status)}
            <span class="outreach-contact-sent">Last contact: ${contacted}</span>
            ${fup ? `<span class="outreach-followup-due">Follow-up due</span>` : ""}
          </div>
          <div class="outreach-contact-actions">
            <button class="secondary-button btn-sm" type="button" data-open-email="${escHtml(c.id)}" data-email-type="initial">
              ${hasSent ? "View Draft" : "Draft Email"}
            </button>
            ${fup ? `<button class="secondary-button btn-sm" type="button" data-open-email="${escHtml(c.id)}" data-email-type="${fup}">Follow Up</button>` : ""}
            <select class="select-sm" data-status-contact="${escHtml(c.id)}" title="Change status">
              ${STATUSES.map(s => `<option ${s === c.status ? "selected" : ""}>${escHtml(s)}</option>`).join("")}
            </select>
            <button class="icon-button btn-danger-sm" type="button" data-delete-contact="${escHtml(c.id)}" title="Remove prospect">✕</button>
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
      const typeLabel = { followup1: "Day 3", followup2: "Day 7", final: "Day 14 (Final)" }[type] || type;
      return `
        <div class="outreach-fup-row">
          <div class="outreach-contact-info">
            <strong>${escHtml(c.firstName)} ${escHtml(c.lastName)}</strong>
            <span>${escHtml(c.company)}</span>
          </div>
          <span class="outreach-fup-type">${typeLabel}</span>
          <div class="outreach-contact-actions">
            <button class="secondary-button btn-sm" type="button" data-open-email="${escHtml(c.id)}" data-email-type="${type}">Draft Follow-Up</button>
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

  function renderImportList() {
    const el = document.getElementById("importGripList");
    if (!el || typeof window.cleanAccounts !== "function") return;
    const search = document.getElementById("importGripSearch")?.value?.toLowerCase() || "";
    const existing = new Set(_data.contacts.filter(c => c.campaignId === _activeCampaignId).map(c => c.email.toLowerCase()));
    const accounts = window.cleanAccounts()
      .filter(a => a.email && !existing.has(a.email.toLowerCase()))
      .filter(a => !search || [a.client, a.email, a.poc, a.county].join(" ").toLowerCase().includes(search));

    if (!accounts.length) {
      el.innerHTML = `<p class="empty-state">No accounts with email addresses found (or all already imported).</p>`;
      return;
    }
    el.innerHTML = accounts.map(a => `
      <label class="import-grip-item">
        <input type="checkbox" value="${escHtml(a.id)}" ${_importSelections.has(a.id) ? "checked" : ""} />
        <div>
          <strong>${escHtml(a.client)}</strong>
          <span>${escHtml(a.poc || "")}${a.poc ? " · " : ""}${escHtml(a.email)}</span>
          ${a.county ? `<span class="muted-note">${escHtml(a.county)}</span>` : ""}
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
      initial:  "Initial Email",
      followup1: "Follow-Up 1 (Day 3)",
      followup2: "Follow-Up 2 (Day 7)",
      final:     "Final Follow-Up (Day 14)",
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
      document.getElementById("newCampaignDialog")?.showModal();
    });
    document.getElementById("cancelNewCampaignButton")?.addEventListener("click", () =>
      document.getElementById("newCampaignDialog")?.close());
    document.getElementById("closeNewCampaignDialog")?.addEventListener("click", () =>
      document.getElementById("newCampaignDialog")?.close());

    document.getElementById("newCampaignForm")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const form = new FormData(e.currentTarget);
      createCampaign(form.get("city"), form.get("state"), form.get("visitDate"));
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
      renderImportList();
      document.getElementById("importFromGripDialog")?.showModal();
    });
    document.getElementById("cancelImportGripButton")?.addEventListener("click", () =>
      document.getElementById("importFromGripDialog")?.close());
    document.getElementById("closeImportFromGripDialog")?.addEventListener("click", () =>
      document.getElementById("importFromGripDialog")?.close());

    document.getElementById("importGripSearch")?.addEventListener("input", renderImportList);

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
