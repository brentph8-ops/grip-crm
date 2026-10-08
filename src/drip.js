// ─────────────────────────────────────────────────────────────────
// GRIP Drip — configurable email sequence campaigns
// ─────────────────────────────────────────────────────────────────

(function () {

  const DEFAULT_ENTITIES = [
    "K-12", "Higher Education", "Healthcare", "Municipal", "Manufacturing",
    "Architects", "Government", "Religious", "Senior Living", "Industrial",
    "Hospitality", "Retail", "Other"
  ];

  const ACCOUNT_STAGES = ["Prospecting", "In Progress", "Meeting", "C", "B", "A", "Unresponsive", "Dead End"];
  const STATUSES = ["Active", "Replied", "OOO Paused", "Unresponsive", "Graveyard", "Completed"];

  const PLACEHOLDERS = [
    { label: "First Name",     value: "[First Name]" },
    { label: "Full Name",      value: "[Full Name]" },
    { label: "Account Name",   value: "[Account Name]" },
    { label: "Entity",         value: "[Entity]" },
    { label: "Rep Name",       value: "[Rep Name]" },
    { label: "Meeting Times",  value: "[Meeting Times]" },
  ];

  // ── State ─────────────────────────────────────────────────────────

  let _data = loadData();
  let _activeCampaignId = _data.campaigns.find(c => c.status === "active")?.id || null;
  let _viewMode = "queue";
  let _pendingEmailContactId = null;
  let _pendingEmailNumber = null;
  let _editingCampaignId = null;
  let _editorCurrentTab = 1;
  let _editorEmails = [];

  // ── Data I/O ──────────────────────────────────────────────────────

  function loadData() {
    try {
      const raw = localStorage.getItem("garlandDrip");
      const p = raw ? JSON.parse(raw) : {};
      return {
        campaigns: Array.isArray(p.campaigns) ? p.campaigns : [],
        contacts:  Array.isArray(p.contacts)  ? p.contacts  : [],
      };
    } catch (_) {
      return { campaigns: [], contacts: [] };
    }
  }

  function saveData() {
    localStorage.setItem("garlandDrip", JSON.stringify(_data));
  }

  function uid() {
    return `dr-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  }

  // ── Entity helpers ────────────────────────────────────────────────

  function allEntities() {
    const crmEntities = typeof window.cleanAccounts === "function"
      ? [...new Set(window.cleanAccounts().map(a => a.entity).filter(Boolean))]
      : [];
    const combined = [...new Set([...DEFAULT_ENTITIES, ...crmEntities])];
    return combined.sort((a, b) => {
      const ai = DEFAULT_ENTITIES.indexOf(a), bi = DEFAULT_ENTITIES.indexOf(b);
      if (ai >= 0 && bi >= 0) return ai - bi;
      if (ai >= 0) return -1;
      if (bi >= 0) return 1;
      return a.localeCompare(b);
    });
  }

  // ── Date helpers ──────────────────────────────────────────────────

  function todayIso() { return new Date().toISOString().slice(0, 10); }

  function addDays(iso, n) {
    const d = new Date(iso + "T12:00:00");
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function fmtDate(iso) {
    if (!iso) return "";
    return new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  function generateMeetingTimes() {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    const slots = [];
    while (slots.length < 3) {
      if (d.getDay() !== 0 && d.getDay() !== 6) {
        const label = d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
        slots.push(`- ${label}: 9:00 AM, 11:00 AM, or 2:00 PM`);
      }
      d.setDate(d.getDate() + 1);
    }
    return slots.join("\n");
  }

  // ── Placeholder resolution ────────────────────────────────────────

  function resolvePlaceholders(text, contact) {
    const first   = contact.firstName || "there";
    const last    = contact.lastName  || "";
    const full    = [first, last].filter(Boolean).join(" ") || contact.company || "there";
    const company = contact.company || "your organization";
    const entity  = contact.entity  || "";
    const repName = "Brent Phillips";
    return (text || "")
      .replace(/\[First Name\]/g, first)
      .replace(/\[Last Name\]/g,  last)
      .replace(/\[Full Name\]/g,  full)
      .replace(/\[Account Name\]/g, company)
      .replace(/\[Entity\]/g,     entity)
      .replace(/\[Rep Name\]/g,   repName)
      .replace(/\[Meeting Times\]/g, generateMeetingTimes());
  }

  // ── Default email templates ───────────────────────────────────────

  function defaultEmailTemplate(num) {
    const defaults = [
      { dayOffset: 0,  replyTo: null, stageOnSend: "Unresponsive", subject: "Can we schedule a meeting? - Garland",
        body: `Hi [First Name],\n\nBrent Phillips with The Garland Company. We assist facilities with roofing, waterproofing, and building envelope needs.\n\nI was going to initially stop by but wanted to try to schedule an appointment first. Would any of these times work?\n\n[Meeting Times]\n\nOr just name a better time.` },
      { dayOffset: 3,  replyTo: 1,    subject: "Re: Can we schedule a meeting? - Garland",
        body: `Hi [First Name],\n\nWanted to reach back out and see if you had anything available for a phone call or in person.` },
      { dayOffset: 7,  replyTo: null, subject: "Building budgets at [Account Name]?",
        body: `Hi [First Name],\n\nWe do building assessments that turn roof conditions into a phased capital plan. Worth 15 minutes to walk through what that looks like for [Account Name]? We could start with your worst building.` },
      { dayOffset: 14, replyTo: 3,    subject: "Re: Building budgets at [Account Name]?",
        body: `Hi [First Name],\n\nIf now's not a good time, is there a better time to connect?` },
      { dayOffset: 21, replyTo: null, subject: "Quick question",
        body: `Hi [First Name],\n\nDo you have any problems I can look at? Roof leaks or building envelope issues?` },
      { dayOffset: 30, replyTo: null, subject: "Is there a better time to connect?",
        body: `Hi [First Name],\n\nHaven't heard back but is there a better time to connect? If the timing changes, just reply and we can connect.` },
    ];
    const d = defaults[num - 1] || {
      dayOffset: (num - 1) * 7, replyTo: null,
      subject: `Follow-up ${num}`, body: `Hi [First Name],\n\n`,
    };
    return { number: num, ...d };
  }

  function defaultEmailTemplates(count) {
    return Array.from({ length: count }, (_, i) => defaultEmailTemplate(i + 1));
  }

  // ── Campaign helpers ──────────────────────────────────────────────

  function campaignEmailCount(campaign) {
    if (!campaign) return 6;
    return campaign.emails?.length || campaign.emailCount || 6;
  }

  function campaignEmails(campaign) {
    if (!campaign) return defaultEmailTemplates(6);
    if (campaign.emails?.length) return campaign.emails;
    return defaultEmailTemplates(campaignEmailCount(campaign));
  }

  function getDayGap(campaign, fromEmailNum) {
    const emails = campaignEmails(campaign);
    const from = emails.find(e => e.number === fromEmailNum);
    const to   = emails.find(e => e.number === fromEmailNum + 1);
    if (!from || !to) return 7;
    return Math.max(1, to.dayOffset - from.dayOffset);
  }

  // ── buildDripEmail ────────────────────────────────────────────────

  function buildDripEmail(contact, emailNumber) {
    const campaign = _data.campaigns.find(c => c.id === contact.campaignId);
    const emails = campaignEmails(campaign);
    const emailData = emails.find(e => e.number === emailNumber);
    if (emailData) {
      return {
        subject:   resolvePlaceholders(emailData.subject, contact),
        body:      resolvePlaceholders(emailData.body,    contact),
        isReplyTo: emailData.replyTo || null,
      };
    }
    return { subject: `Email ${emailNumber}`, body: `Hi [First Name],\n\n`, isReplyTo: null };
  }

  // ── Campaign CRUD ─────────────────────────────────────────────────

  function activeCampaign() {
    return _data.campaigns.find(c => c.id === _activeCampaignId) || null;
  }

  function createCampaign(name, entities, stages, emails) {
    _data.campaigns.forEach(c => { if (c.status === "active") c.status = "paused"; });
    const c = {
      id: uid(), name: name.trim(), entities, stages, status: "active",
      emailCount: emails.length, emails,
      createdAt: new Date().toISOString(),
    };
    _data.campaigns.push(c);
    _activeCampaignId = c.id;
    saveData();
    renderDrip();
  }

  function updateCampaign(id, name, entities, stages, emails) {
    const c = _data.campaigns.find(c => c.id === id);
    if (!c) return;
    c.name = name.trim();
    c.entities = entities;
    c.stages = stages;
    c.emailCount = emails.length;
    c.emails = emails;
    saveData();
    renderDrip();
  }

  function setCampaignActive(id) {
    _data.campaigns.forEach(c => { if (c.status === "active") c.status = "paused"; });
    const c = _data.campaigns.find(c => c.id === id);
    if (c) { c.status = "active"; _activeCampaignId = id; }
    saveData();
    renderDrip();
  }

  // ── Contact CRUD ──────────────────────────────────────────────────

  function campaignContacts(campaignId) {
    return _data.contacts.filter(c => c.campaignId === campaignId);
  }

  function findContact(id) { return _data.contacts.find(c => c.id === id); }

  function addDripContact(campaignId, { firstName, lastName, company, email, entity, accountId }) {
    if (!email) return;
    const contact = {
      id: uid(), campaignId,
      accountId: accountId || null,
      firstName: (firstName || "").trim(),
      lastName:  (lastName  || "").trim(),
      company:   (company   || "").trim(),
      email:     (email     || "").trim(),
      entity:    (entity    || "Other").trim(),
      emailNumber: 0, status: "Active",
      sentDates: {}, nextDueDate: todayIso(),
      log: [], notes: "",
      createdAt: new Date().toISOString(),
    };
    _data.contacts.push(contact);
    saveData();
  }

  function deleteContact(id) {
    _data.contacts = _data.contacts.filter(c => c.id !== id);
    saveData();
    renderDrip();
  }

  function markEmailSent(contactId, emailNumber, subject) {
    const c = findContact(contactId);
    if (!c) return;
    const campaign = _data.campaigns.find(cp => cp.id === c.campaignId);
    const totalEmails = campaignEmailCount(campaign);
    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    c.emailNumber = emailNumber;
    c.sentDates[emailNumber] = today;
    c.log.push({ emailNum: emailNumber, logLabel: `Email ${emailNumber} of ${totalEmails} sent`, subject, sentAt: now });

    if (emailNumber < totalEmails) {
      c.nextDueDate = addDays(today, getDayGap(campaign, emailNumber));
    } else {
      c.nextDueDate = null;
      c.status = "Unresponsive";
    }

    if (c.accountId && typeof window.addAccountActivity === "function") {
      const name = [c.firstName, c.lastName].filter(Boolean).join(" ") || c.company;
      const emails = campaignEmails(campaign);
      const emailData = emails.find(e => e.number === emailNumber);
      const stageNote = emailData?.stageOnSend ? ` → stage moved to "${emailData.stageOnSend}"` : "";
      window.addAccountActivity(c.accountId, `Email ${emailNumber} of ${totalEmails} sent to ${name} (${c.email}) · "${subject}"${stageNote}`, false, { source: "Email List", contactName: name });
      if (emailData?.stageOnSend && typeof window.gripApp?.persistRecordEdit === "function") {
        window.gripApp.persistRecordEdit("account", c.accountId, "clientRanking", emailData.stageOnSend, false);
      }
    }

    saveData();
    renderDrip();
    (window.showToast || alert)(`Email ${emailNumber} of ${totalEmails} marked as sent.`, "success");
  }

  function updateContactStatus(id, status) {
    const c = findContact(id);
    if (!c) return;
    c.status = status;
    if (status === "Replied") {
      c.nextDueDate = null;
      if (c.accountId && typeof window.addAccountActivity === "function") {
        const name = [c.firstName, c.lastName].filter(Boolean).join(" ") || c.company;
        window.addAccountActivity(c.accountId, `Reply received from ${name} — email sequence stopped.`, false, { source: "Email List" });
      }
    }
    if (!["Active", "OOO Paused"].includes(status)) c.nextDueDate = null;
    saveData();
    renderDrip();
  }

  // ── Queue logic ───────────────────────────────────────────────────

  function dueToday(campaignId) {
    const today = todayIso();
    return _data.contacts
      .filter(c => c.campaignId === campaignId && ["Active", "OOO Paused"].includes(c.status) && c.nextDueDate && c.nextDueDate <= today)
      .sort((a, b) => (a.nextDueDate || "").localeCompare(b.nextDueDate || ""));
  }

  function upcomingContacts(campaignId) {
    const today = todayIso();
    const next7 = addDays(today, 7);
    return _data.contacts
      .filter(c => c.campaignId === campaignId && c.status === "Active" && c.nextDueDate && c.nextDueDate > today && c.nextDueDate <= next7)
      .sort((a, b) => (a.nextDueDate || "").localeCompare(b.nextDueDate || ""));
  }

  // ── Escape HTML ───────────────────────────────────────────────────

  function esc(str) {
    return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function statusClass(status) {
    return { Active: "drip-status-active", Replied: "drip-status-replied", "OOO Paused": "drip-status-ooo", Unresponsive: "drip-status-unresponsive", Graveyard: "drip-status-graveyard", Completed: "drip-status-completed" }[status] || "";
  }

  // ── Campaign Stats ────────────────────────────────────────────────

  function campaignStats(campaignId) {
    const contacts = campaignContacts(campaignId);
    return {
      total:    contacts.length,
      active:   contacts.filter(c => c.status === "Active").length,
      replied:  contacts.filter(c => c.status === "Replied").length,
      dueToday: dueToday(campaignId).length,
    };
  }

  // ── Render helpers ────────────────────────────────────────────────

  function progressDots(c) {
    const campaign = _data.campaigns.find(cp => cp.id === c.campaignId);
    const total = campaignEmailCount(campaign);
    const next = c.emailNumber + 1;
    return Array.from({ length: total }, (_, i) => i + 1).map(n =>
      `<span class="drip-dot ${c.sentDates[n] ? "drip-dot-sent" : n === next && c.status === "Active" ? "drip-dot-next" : ""}" title="Email ${n}${c.sentDates[n] ? " · sent " + fmtDate(c.sentDates[n]) : n === next ? " · next" : ""}"></span>`
    ).join("");
  }

  function renderContactCard(c, isDue) {
    const campaign = _data.campaigns.find(cp => cp.id === c.campaignId);
    const totalEmails = campaignEmailCount(campaign);
    const nextNum = c.emailNumber + 1;
    const canDraft = nextNum <= totalEmails && ["Active", "OOO Paused"].includes(c.status);
    const emails = campaignEmails(campaign);
    const nextEmailData = emails.find(e => e.number === nextNum);
    const isReply = nextEmailData?.replyTo;
    const name = [c.firstName, c.lastName].filter(Boolean).join(" ") || c.company;
    return `
      <div class="drip-contact-row${isDue ? " drip-row-due" : ""}">
        <div class="drip-contact-info">
          <div class="drip-contact-name">${esc(name)}</div>
          <div class="drip-contact-meta">
            <span class="drip-contact-company">${esc(c.company)}</span>
            ${c.entity ? `<span class="drip-entity-pill">${esc(c.entity)}</span>` : ""}
            <span class="drip-status-badge ${statusClass(c.status)}">${esc(c.status)}</span>
          </div>
          <div class="drip-progress-dots">${progressDots(c)}</div>
        </div>
        <div class="drip-contact-actions">
          ${canDraft ? `
            <div class="drip-next-label">Email ${nextNum}${isReply ? " ↩" : ""} · ${isDue ? "<strong>due " + fmtDate(c.nextDueDate) + "</strong>" : fmtDate(c.nextDueDate)}</div>
            <button class="primary-button btn-sm" type="button" data-drip-draft="${esc(c.id)}" data-drip-num="${nextNum}">Draft Email ${nextNum}</button>
          ` : `<span class="drip-seq-done">${c.status === "Replied" ? "Replied ✓" : "Sequence complete"}</span>`}
          <select class="payton-select" data-drip-status="${esc(c.id)}" title="Status">
            ${STATUSES.map(s => `<option ${s === c.status ? "selected" : ""}>${esc(s)}</option>`).join("")}
          </select>
          <button class="payton-remove" type="button" data-drip-delete="${esc(c.id)}" title="Remove">✕</button>
        </div>
      </div>`;
  }

  // ── Main render ───────────────────────────────────────────────────

  function renderDripCampaignBar() {
    const el = document.getElementById("dripCampaignBar");
    if (!el) return;
    const campaign = activeCampaign();
    if (!campaign) {
      el.innerHTML = `<div class="drip-no-campaign">No active campaign — <button class="link-button" id="dripCreateFirst" type="button">create one to get started</button></div>`;
      document.getElementById("dripCreateFirst")?.addEventListener("click", () => openCampaignEditor(null));
      return;
    }
    const stats = campaignStats(campaign.id);
    const totalEmails = campaignEmailCount(campaign);
    el.innerHTML = `
      <div class="drip-campaign-bar">
        <div class="drip-campaign-left">
          <div class="drip-campaign-name">${esc(campaign.name)}</div>
          <div class="drip-campaign-meta">
            ${campaign.entities?.length ? campaign.entities.map(e => `<span class="import-tag import-tag-entity">${esc(e)}</span>`).join("") : ""}
            <span class="drip-email-count-badge">${totalEmails}-email sequence</span>
          </div>
        </div>
        <div class="payton-stat-row">
          <div class="payton-stat"><span class="payton-stat-num">${stats.total}</span><span class="payton-stat-label">Contacts</span></div>
          <div class="payton-stat"><span class="payton-stat-num">${stats.active}</span><span class="payton-stat-label">Active</span></div>
          <div class="payton-stat"><span class="payton-stat-num">${stats.replied}</span><span class="payton-stat-label">Replied</span></div>
          ${stats.dueToday ? `<div class="payton-stat payton-stat-warn"><span class="payton-stat-num">${stats.dueToday}</span><span class="payton-stat-label">Due Today</span></div>` : ""}
        </div>
        <div class="drip-header-actions">
          ${_data.campaigns.length > 1 ? `<button class="secondary-button btn-sm" id="dripSwitchBtn" type="button">Switch</button>` : ""}
          <button class="secondary-button btn-sm" id="dripEditCampaignBtn" type="button">✏ Edit</button>
          <button class="secondary-button btn-sm" id="dripNewCampaignBtn" type="button">+ Campaign</button>
          <button class="secondary-button btn-sm" id="dripImportBtn" type="button">Import</button>
          <button class="secondary-button btn-sm" id="dripAddContactBtn" type="button">+ Contact</button>
        </div>
      </div>`;
    document.getElementById("dripSwitchBtn")?.addEventListener("click", openSwitchDialog);
    document.getElementById("dripEditCampaignBtn")?.addEventListener("click", () => openCampaignEditor(campaign.id));
    document.getElementById("dripNewCampaignBtn")?.addEventListener("click", () => openCampaignEditor(null));
    document.getElementById("dripImportBtn")?.addEventListener("click", openDripImportDialog);
    document.getElementById("dripAddContactBtn")?.addEventListener("click", openDripAddContactDialog);
  }

  function renderDripQueue() {
    const el = document.getElementById("dripQueueContent");
    if (!el) return;
    const campaign = activeCampaign();
    if (!campaign) { el.innerHTML = `<p class="empty-state">Create a campaign to start adding contacts.</p>`; return; }
    const due = dueToday(campaign.id);
    const upcoming = upcomingContacts(campaign.id);
    let html = "";
    if (due.length) {
      html += `<h4 class="drip-section-title">Due Today (${due.length})</h4>${due.map(c => renderContactCard(c, true)).join("")}`;
    } else {
      html += `<p class="empty-state drip-empty">No emails due today.</p>`;
    }
    if (upcoming.length) {
      html += `<h4 class="drip-section-title drip-upcoming-title">Coming Up This Week</h4>${upcoming.map(c => renderContactCard(c, false)).join("")}`;
    }
    el.innerHTML = html;
  }

  function renderDripContacts() {
    const el = document.getElementById("dripContactsContent");
    if (!el) return;
    const campaign = activeCampaign();
    if (!campaign) { el.innerHTML = `<p class="empty-state">Create a campaign first.</p>`; return; }
    const contacts = campaignContacts(campaign.id);
    if (!contacts.length) {
      el.innerHTML = `<p class="empty-state">No contacts yet. Use Import or + Contact to add people to this sequence.</p>`;
      return;
    }
    el.innerHTML = contacts.map(c => renderContactCard(c, false)).join("");
  }

  function renderDripSequence() {
    const el = document.getElementById("dripTemplatesContent");
    if (!el) return;
    const campaign = activeCampaign();
    if (!campaign) { el.innerHTML = `<p class="empty-state">Create a campaign to see its email sequence.</p>`; return; }
    const emails = campaignEmails(campaign);
    el.innerHTML = `<div class="drip-template-grid">${emails.map(em => {
      const previewBody = em.body.length > 200 ? em.body.slice(0, 200) + "…" : em.body;
      return `
        <div class="drip-template-card">
          <div class="drip-template-header">
            <span class="drip-template-num">Email ${em.number}</span>
            <span class="drip-template-day">Day ${em.dayOffset}${em.replyTo ? " · ↩ reply to Email " + em.replyTo : ""}${em.stageOnSend ? ` · → <strong>${esc(em.stageOnSend)}</strong>` : ""}</span>
            <button class="mini-button" type="button" data-edit-email="${em.number}">Edit</button>
          </div>
          <div class="drip-template-subject">${esc(em.subject)}</div>
          <pre class="drip-template-body">${esc(previewBody)}</pre>
        </div>`;
    }).join("")}</div>`;

    el.querySelectorAll("[data-edit-email]").forEach(btn => {
      btn.addEventListener("click", () => {
        const num = parseInt(btn.dataset.editEmail, 10);
        openCampaignEditor(campaign.id, num);
      });
    });
  }

  function renderDrip() {
    renderDripCampaignBar();
    const panels = { queue: "dripQueuePanel", contacts: "dripContactsPanel", templates: "dripTemplatesPanel" };
    Object.entries(panels).forEach(([mode, id]) => {
      const el = document.getElementById(id);
      if (el) el.style.display = mode === _viewMode ? "block" : "none";
    });
    document.querySelectorAll(".drip-sub-tab").forEach(btn => {
      btn.classList.toggle("is-active", btn.dataset.dripView === _viewMode);
    });
    if (_viewMode === "queue")     renderDripQueue();
    else if (_viewMode === "contacts") renderDripContacts();
    else if (_viewMode === "templates") renderDripSequence();
  }

  // ── Campaign Editor ───────────────────────────────────────────────

  function openCampaignEditor(campaignId = null, jumpToEmail = null) {
    _editingCampaignId = campaignId;
    const campaign = campaignId ? _data.campaigns.find(c => c.id === campaignId) : null;
    const count = campaign ? campaignEmailCount(campaign) : 6;
    _editorEmails = campaign?.emails?.length
      ? JSON.parse(JSON.stringify(campaign.emails))
      : defaultEmailTemplates(count);
    _editorCurrentTab = jumpToEmail || 1;

    document.getElementById("dripCampaignDialogTitle").textContent = campaignId ? "Edit Campaign" : "New Campaign";
    document.getElementById("dripCampaignName").value = campaign?.name || "";
    const countEl = document.getElementById("dripEmailCount");
    if (countEl) countEl.value = count;

    renderEntityCheckboxes(campaign?.entities || []);
    renderStageCheckboxes(campaign?.stages || []);
    renderEditorEmailTabs(count);
    renderEditorEmailPanel(_editorCurrentTab);

    document.getElementById("dripCampaignDialog").showModal();
  }

  function renderEntityCheckboxes(selected) {
    const el = document.getElementById("dripEntityCheckboxes");
    if (!el) return;
    const entities = allEntities();
    el.innerHTML = entities.map(e =>
      `<label><input type="checkbox" name="campaignEntities" value="${esc(e)}" ${selected.includes(e) ? "checked" : ""} /> ${esc(e)}</label>`
    ).join("");
  }

  function renderStageCheckboxes(selected) {
    const el = document.getElementById("dripStageCheckboxes");
    if (!el) return;
    el.innerHTML = ACCOUNT_STAGES.map(s =>
      `<label><input type="checkbox" name="campaignStages" value="${esc(s)}" ${selected.includes(s) ? "checked" : ""} /> ${esc(s)}</label>`
    ).join("");
  }

  function renderEditorEmailTabs(count) {
    const el = document.getElementById("dripEmailTabs");
    if (!el) return;
    el.innerHTML = Array.from({ length: count }, (_, i) => i + 1).map(n =>
      `<button class="sort-tab${n === _editorCurrentTab ? " is-active" : ""}" type="button" data-editor-email-tab="${n}">Email ${n}</button>`
    ).join("");
  }

  function renderEditorEmailPanel(num) {
    _editorCurrentTab = num;
    const el = document.getElementById("dripEmailEditorPanel");
    if (!el) return;
    const emailData = _editorEmails.find(e => e.number === num) || defaultEmailTemplate(num);
    const replyOptions = Array.from({ length: num - 1 }, (_, i) => i + 1)
      .map(n => `<option value="${n}"${emailData.replyTo === n ? " selected" : ""}>Reply to Email ${n}</option>`)
      .join("");
    const stageOptions = ["", ...ACCOUNT_STAGES]
      .map(s => `<option value="${esc(s)}"${emailData.stageOnSend === s ? " selected" : ""}>${s ? esc(s) : "No change"}</option>`)
      .join("");
    el.innerHTML = `
      <div class="drip-email-editor">
        <div class="drip-email-meta-row">
          <label class="drip-meta-field"><span>Send on Day</span>
            <input type="number" id="editorDayOffset" min="0" max="365" value="${emailData.dayOffset}" />
          </label>
          <label class="drip-meta-field"><span>Thread</span>
            <select id="editorReplyTo">
              <option value="">New thread</option>${replyOptions}
            </select>
          </label>
          <label class="drip-meta-field"><span>On Send → Move Stage To</span>
            <select id="editorStageOnSend">${stageOptions}</select>
          </label>
        </div>
        <label class="full-field"><span>Subject</span>
          <input type="text" id="editorSubject" value="${esc(emailData.subject)}" placeholder="Email subject line" />
        </label>
        <div class="drip-placeholder-toolbar">
          <span class="drip-placeholder-label">Insert:</span>
          ${PLACEHOLDERS.map(p => `<button class="placeholder-chip" type="button" data-insert-placeholder="${esc(p.value)}">${esc(p.label)}</button>`).join("")}
        </div>
        <label class="full-field"><span>Body</span>
          <textarea id="editorBody" class="note-box drip-editor-body" rows="12">${esc(emailData.body)}</textarea>
        </label>
      </div>`;

    document.querySelectorAll("[data-editor-email-tab]").forEach(btn => {
      btn.classList.toggle("is-active", parseInt(btn.dataset.editorEmailTab) === num);
    });
  }

  function saveCurrentEditorTab() {
    const num = _editorCurrentTab;
    const dayOffset = parseInt(document.getElementById("editorDayOffset")?.value || "0", 10);
    const replyToVal = document.getElementById("editorReplyTo")?.value;
    const replyTo = replyToVal ? parseInt(replyToVal, 10) : null;
    const subject      = document.getElementById("editorSubject")?.value || "";
    const body         = document.getElementById("editorBody")?.value || "";
    const stageOnSend  = document.getElementById("editorStageOnSend")?.value || "";
    const idx = _editorEmails.findIndex(e => e.number === num);
    const obj = { number: num, dayOffset, replyTo, subject, body, stageOnSend: stageOnSend || null };
    if (idx >= 0) _editorEmails[idx] = obj;
    else _editorEmails.push(obj);
    _editorEmails.sort((a, b) => a.number - b.number);
  }

  function handleEmailCountChange(newCount) {
    saveCurrentEditorTab();
    const oldCount = _editorEmails.length;
    if (newCount > oldCount) {
      for (let n = oldCount + 1; n <= newCount; n++) {
        _editorEmails.push(defaultEmailTemplate(n));
      }
    } else {
      _editorEmails = _editorEmails.filter(e => e.number <= newCount);
    }
    if (_editorCurrentTab > newCount) _editorCurrentTab = newCount;
    renderEditorEmailTabs(newCount);
    renderEditorEmailPanel(_editorCurrentTab);
  }

  // ── Dialogs ───────────────────────────────────────────────────────

  function openSwitchDialog() {
    const el = document.getElementById("dripSwitchList");
    if (el) {
      el.innerHTML = _data.campaigns.map(c => {
        const stats = campaignStats(c.id);
        const isActive = c.id === _activeCampaignId;
        return `<div class="outreach-campaign-item ${isActive ? "is-active" : ""}">
          <div>
            <strong>${esc(c.name)}</strong>
            <span class="muted-note">${stats.total} contacts · ${stats.replied} replied</span>
          </div>
          ${!isActive ? `<button class="secondary-button btn-sm" type="button" data-drip-activate="${esc(c.id)}">Activate</button>` : `<span class="outreach-active-label">Active</span>`}
        </div>`;
      }).join("") || `<p class="empty-state">No campaigns yet.</p>`;
    }
    document.getElementById("dripSwitchDialog")?.showModal();
  }

  function openDripAddContactDialog() {
    if (!activeCampaign()) { (window.showToast || alert)("Create a campaign first.", "warning"); return; }
    const sel = document.getElementById("dripAddEntitySelect");
    if (sel) {
      sel.innerHTML = allEntities().map(e => `<option>${esc(e)}</option>`).join("");
    }
    document.getElementById("dripAddContactForm")?.reset();
    document.getElementById("dripAddContactDialog")?.showModal();
  }

  function openDripImportDialog() {
    if (!activeCampaign()) { (window.showToast || alert)("Create a campaign first.", "warning"); return; }
    populateDripImportFilters();
    renderDripImportList();
    document.getElementById("dripImportDialog")?.showModal();
  }

  function populateDripImportFilters() {
    const stageEl = document.getElementById("dripImportStageFilter");
    if (stageEl) {
      stageEl.innerHTML = `<option value="">All stages</option>` +
        ACCOUNT_STAGES.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join("");
    }
    const entityEl = document.getElementById("dripImportEntityFilter");
    if (entityEl) {
      entityEl.innerHTML = `<option value="">All entities</option>` +
        allEntities().map(e => `<option value="${esc(e)}">${esc(e)}</option>`).join("");
    }
  }

  function renderDripImportList() {
    const el = document.getElementById("dripImportList");
    if (!el || typeof window.cleanAccounts !== "function") return;
    const existing = new Set(_data.contacts.filter(c => c.campaignId === _activeCampaignId).map(c => c.email.toLowerCase()));
    const entityFilter = document.getElementById("dripImportEntityFilter")?.value || "";
    const stageFilter  = document.getElementById("dripImportStageFilter")?.value  || "";
    const search = document.getElementById("dripImportSearch")?.value?.toLowerCase() || "";

    const accounts = window.cleanAccounts()
      .filter(a => a.email && !existing.has(a.email.toLowerCase()))
      .filter(a => !entityFilter || (a.entity || "") === entityFilter)
      .filter(a => !stageFilter  || (a.clientRanking || "") === stageFilter)
      .filter(a => !search || [a.client, a.email, a.poc, a.entity].join(" ").toLowerCase().includes(search));

    const countEl = document.getElementById("dripImportCount");
    if (countEl) countEl.textContent = accounts.length ? `${accounts.length} account${accounts.length === 1 ? "" : "s"}` : "";

    el.innerHTML = accounts.map(a => `
      <label class="import-grip-item">
        <input type="checkbox" value="${esc(a.id)}" />
        <div>
          <strong>${esc(a.client)}</strong>
          <span>${esc(a.poc || "")}${a.poc ? " · " : ""}${esc(a.email)}</span>
          <span class="import-grip-meta">
            ${a.entity ? `<span class="import-tag import-tag-entity">${esc(a.entity)}</span>` : ""}
            ${a.clientRanking ? `<span class="import-tag">${esc(a.clientRanking)}</span>` : ""}
          </span>
        </div>
      </label>`).join("") || `<p class="empty-state">No matching accounts.</p>`;
  }

  function openDripEmailDialog(contactId, emailNumber) {
    const contact = findContact(contactId);
    if (!contact) return;
    _pendingEmailContactId = contactId;
    _pendingEmailNumber = emailNumber;
    const email = buildDripEmail(contact, emailNumber);
    const campaign = _data.campaigns.find(c => c.id === contact.campaignId);
    const totalEmails = campaignEmailCount(campaign);
    const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.company;

    document.getElementById("dripEmailTitle").textContent = `Email ${emailNumber} of ${totalEmails} — ${name}`;
    document.getElementById("dripEmailTo").value = contact.email;
    document.getElementById("dripEmailSubject").value = email.subject;
    document.getElementById("dripEmailBody").value = email.body;
    const replyNote = document.getElementById("dripEmailReplyNote");
    if (replyNote) replyNote.textContent = email.isReplyTo ? `ℹ️  Send this as a reply to Email ${email.isReplyTo} in your email client.` : "";

    document.getElementById("dripEmailDialog")?.showModal();
  }

  // ── Event wiring ──────────────────────────────────────────────────

  function bindEvents() {
    const panel = document.getElementById("callListDripPanel");
    if (!panel) return;

    panel.addEventListener("click", (e) => {
      const tab = e.target.closest("[data-drip-view]");
      if (tab) { _viewMode = tab.dataset.dripView; renderDrip(); return; }

      const draft = e.target.closest("[data-drip-draft]");
      if (draft) { openDripEmailDialog(draft.dataset.dripDraft, parseInt(draft.dataset.dripNum, 10)); return; }

      const del = e.target.closest("[data-drip-delete]");
      if (del && confirm("Remove this contact from the sequence?")) { deleteContact(del.dataset.dripDelete); return; }

      const activate = e.target.closest("[data-drip-activate]");
      if (activate) { setCampaignActive(activate.dataset.dripActivate); document.getElementById("dripSwitchDialog")?.close(); return; }
    });

    panel.addEventListener("change", (e) => {
      const sel = e.target.closest("[data-drip-status]");
      if (sel) updateContactStatus(sel.dataset.dripStatus, sel.value);
    });

    // Campaign editor dialog
    const campaignDialog = document.getElementById("dripCampaignDialog");

    campaignDialog?.addEventListener("click", (e) => {
      // Email tab switching
      const tab = e.target.closest("[data-editor-email-tab]");
      if (tab) {
        saveCurrentEditorTab();
        renderEditorEmailPanel(parseInt(tab.dataset.editorEmailTab, 10));
        return;
      }
      // Placeholder insertion
      const ph = e.target.closest("[data-insert-placeholder]");
      if (ph) {
        const textarea = document.getElementById("editorBody");
        if (!textarea) return;
        const val = ph.dataset.insertPlaceholder;
        const start = textarea.selectionStart;
        const end   = textarea.selectionEnd;
        textarea.value = textarea.value.slice(0, start) + val + textarea.value.slice(end);
        textarea.selectionStart = textarea.selectionEnd = start + val.length;
        textarea.focus();
        return;
      }
    });

    document.getElementById("dripEmailCount")?.addEventListener("input", (e) => {
      const n = Math.max(1, Math.min(12, parseInt(e.target.value, 10) || 6));
      handleEmailCountChange(n);
    });

    document.getElementById("dripCampaignForm")?.addEventListener("submit", (e) => {
      e.preventDefault();
      saveCurrentEditorTab();
      const form = e.currentTarget;
      const name = (document.getElementById("dripCampaignName")?.value || "").trim();
      if (!name) return;
      const entities = [...form.querySelectorAll('[name="campaignEntities"]:checked')].map(i => i.value);
      const stages   = [...form.querySelectorAll('[name="campaignStages"]:checked')].map(i => i.value);
      const emails   = [..._editorEmails].sort((a, b) => a.number - b.number);
      if (_editingCampaignId) {
        updateCampaign(_editingCampaignId, name, entities, stages, emails);
        (window.showToast || alert)("Campaign updated.", "success");
      } else {
        createCampaign(name, entities, stages, emails);
        (window.showToast || alert)("Campaign created.", "success");
      }
      campaignDialog?.close();
    });

    document.getElementById("cancelDripCampaignBtn")?.addEventListener("click", () => campaignDialog?.close());
    document.getElementById("closeDripCampaignDialog")?.addEventListener("click", () => campaignDialog?.close());

    // Add contact form
    document.getElementById("dripAddContactForm")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const form = new FormData(e.currentTarget);
      addDripContact(_activeCampaignId, {
        firstName: form.get("dripFirstName"),
        lastName:  form.get("dripLastName"),
        company:   form.get("dripCompany"),
        email:     form.get("dripEmail"),
        entity:    form.get("dripEntity"),
      });
      document.getElementById("dripAddContactDialog")?.close();
      renderDrip();
      (window.showToast || alert)("Contact added to sequence.", "success");
    });
    document.getElementById("closeDripAddContactDialog")?.addEventListener("click", () => document.getElementById("dripAddContactDialog")?.close());

    // Switch campaign dialog
    document.getElementById("closeDripSwitchDialog")?.addEventListener("click", () => document.getElementById("dripSwitchDialog")?.close());

    // Import dialog
    document.getElementById("dripImportSearch")?.addEventListener("input", renderDripImportList);
    document.getElementById("dripImportEntityFilter")?.addEventListener("change", renderDripImportList);
    document.getElementById("dripImportStageFilter")?.addEventListener("change", renderDripImportList);
    document.getElementById("closeDripImportDialog")?.addEventListener("click", () => document.getElementById("dripImportDialog")?.close());
    document.getElementById("confirmDripImport")?.addEventListener("click", () => {
      if (typeof window.cleanAccounts !== "function") return;
      const checked = document.querySelectorAll("#dripImportList input:checked");
      if (!checked.length) return;
      const ids = new Set([...checked].map(i => i.value));
      const accts = window.cleanAccounts().filter(a => ids.has(a.id));
      accts.forEach(a => {
        const [firstName = "", ...rest] = (a.poc || a.client || "").trim().split(/\s+/);
        addDripContact(_activeCampaignId, {
          firstName, lastName: rest.join(" "), company: a.client || "",
          email: a.email || "", entity: a.entity || "Other", accountId: a.id,
        });
      });
      document.getElementById("dripImportDialog")?.close();
      renderDrip();
      (window.showToast || alert)(`${accts.length} contact${accts.length === 1 ? "" : "s"} added to sequence.`, "success");
    });

    // Email draft dialog
    document.getElementById("closeDripEmailDialog")?.addEventListener("click", () => document.getElementById("dripEmailDialog")?.close());
    document.getElementById("dripCopyEmailBtn")?.addEventListener("click", () => {
      const subject = document.getElementById("dripEmailSubject")?.value || "";
      const body    = document.getElementById("dripEmailBody")?.value    || "";
      navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`)
        .then(() => (window.showToast || alert)("Copied to clipboard.", "success"))
        .catch(() => (window.showToast || alert)("Copy failed — select manually.", "warning"));
    });
    document.getElementById("dripMarkSentBtn")?.addEventListener("click", () => {
      const subject = document.getElementById("dripEmailSubject")?.value || "";
      if (_pendingEmailContactId && _pendingEmailNumber) {
        markEmailSent(_pendingEmailContactId, _pendingEmailNumber, subject);
        document.getElementById("dripEmailDialog")?.close();
      }
    });
  }

  // ── Init ──────────────────────────────────────────────────────────

  function init() {
    _activeCampaignId = _data.campaigns.find(c => c.status === "active")?.id || null;
    bindEvents();
  }

  window.gripDrip = { render: renderDrip, init };

  window._gripHandleRemoteUpdate = (function (prev) {
    return function (key) {
      if (key === "garlandDrip") { _data = loadData(); renderDrip(); }
      if (prev) prev(key);
    };
  })(window._gripHandleRemoteUpdate);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
