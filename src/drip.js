// ─────────────────────────────────────────────────────────────────
// GRIP Drip — 6-email cold outreach sequence
// ─────────────────────────────────────────────────────────────────

(function () {

  const SEQUENCE_DAYS = { 1: 0, 2: 3, 3: 7, 4: 14, 5: 21, 6: 30 };
  const REPLY_TO = { 2: 1, 4: 3 };
  const ENTITIES = ["K-12", "Higher Education", "Healthcare", "Municipal", "Manufacturing", "Architects", "Other"];
  const ACCOUNT_STAGES = ["Prospecting", "In Progress", "Meeting", "C", "B", "A", "Unresponsive", "Dead End"];
  const STATUSES = ["Active", "Replied", "OOO Paused", "Unresponsive", "Graveyard", "Completed"];

  // ── State ─────────────────────────────────────────────────────────

  let _data = loadData();
  let _activeCampaignId = _data.campaigns.find(c => c.status === "active")?.id || null;
  let _viewMode = "queue";
  let _pendingEmailContactId = null;
  let _pendingEmailNumber = null;

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

  // ── Email Templates ───────────────────────────────────────────────

  function buildDripEmail(contact, emailNumber) {
    const first = contact.firstName || "there";
    const company = contact.company || "your organization";
    const entity = contact.entity || "Other";
    const isArchitect = entity === "Architects";

    if (emailNumber === 1) {
      const meetingTimes = generateMeetingTimes();
      let intro = "We assist facilities with roofing, waterproofing, and building envelope needs.";
      if (entity === "Healthcare") {
        intro = "We're a preferred supplier for GPOs like Vizient, Premier, Healthtrust, and Advantus, helping healthcare facilities with roofing, waterproofing, and building envelope needs.";
      } else if (entity === "K-12" || entity === "Higher Education") {
        intro = "We assist school districts with full-service capabilities through design and engineering services for roofing, waterproofing, and building envelope needs.";
      } else if (entity === "Municipal") {
        intro = "We work with municipalities on preventative maintenance, deferred maintenance, and budget forecasting for turnkey roofing and building envelope solutions.";
      } else if (entity === "Manufacturing") {
        intro = "We help facility teams with roofing, waterproofing, and building envelope needs.";
      } else if (isArchitect) {
        intro = "We're a building envelope manufacturer providing design assistance on roofing, waterproofing, and envelope specs. Happy to help with projects, custom details, or stop by for a quick intro or lunch and learn.";
      }
      return {
        subject: "Can we schedule a meeting? - Garland",
        body: `Hi ${first},\n\nBrent Phillips with The Garland Company. ${intro}\n\nI was going to initially stop by but wanted to try to schedule an appointment first. Would any of these work?\n\n${meetingTimes}\n\nOr just name a better time.`,
      };
    }

    if (emailNumber === 2) {
      return {
        subject: "Re: Can we schedule a meeting? - Garland",
        body: `Hi ${first},\n\nWanted to reach back out and see if you had anything available for a phone call or in person.`,
        isReplyTo: 1,
      };
    }

    if (emailNumber === 3) {
      if (isArchitect) {
        return {
          subject: "Design support for your projects",
          body: `Hi ${first},\n\nWe provide design assistance on roofing and envelope specs, including custom details for your projects. Worth 15 minutes to talk through how we can support your team? Happy to do a lunch and learn or CE course as well.`,
        };
      }
      return {
        subject: `Building budgets at ${company}?`,
        body: `Hi ${first},\n\nWe do building assessments that turn roof conditions into a phased capital plan. Worth 15 minutes to walk through what that looks like for ${company}? We could start with your worst building.`,
      };
    }

    if (emailNumber === 4) {
      const replySubject = isArchitect ? "Re: Design support for your projects" : `Re: Building budgets at ${company}?`;
      return {
        subject: replySubject,
        body: `Hi ${first},\n\nIf now's not a good time, is there a better time to connect?`,
        isReplyTo: 3,
      };
    }

    if (emailNumber === 5) {
      if (isArchitect) {
        return {
          subject: "Quick question",
          body: `Hi ${first},\n\nWorking on any projects where we could help with roofing or envelope specs? Happy to assist with details, a lunch and learn, or stop by for a quick intro.`,
        };
      }
      return {
        subject: "Quick question",
        body: `Hi ${first},\n\nDo you have any problems I can look at? Roof leaks or building envelope issues?`,
      };
    }

    if (emailNumber === 6) {
      return {
        subject: "Is there a better time to connect?",
        body: `Hi ${first},\n\nHaven't heard back but is there a better time to connect? If the timing changes, just reply and we can connect.`,
      };
    }

    return { subject: "", body: "" };
  }

  // ── Campaign CRUD ─────────────────────────────────────────────────

  function activeCampaign() {
    return _data.campaigns.find(c => c.id === _activeCampaignId) || null;
  }

  function createCampaign(name, entities, stages) {
    _data.campaigns.forEach(c => { if (c.status === "active") c.status = "paused"; });
    const c = {
      id: uid(),
      name: name.trim(),
      entities: entities || [],
      stages: stages || [],
      status: "active",
      createdAt: new Date().toISOString(),
    };
    _data.campaigns.push(c);
    _activeCampaignId = c.id;
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
      id: uid(),
      campaignId,
      accountId: accountId || null,
      firstName: (firstName || "").trim(),
      lastName:  (lastName  || "").trim(),
      company:   (company   || "").trim(),
      email:     (email     || "").trim(),
      entity:    (entity    || "Other").trim(),
      emailNumber: 0,
      status: "Active",
      sentDates: {},
      nextDueDate: todayIso(),
      log: [],
      notes: "",
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
    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    c.emailNumber = emailNumber;
    c.sentDates[emailNumber] = today;
    c.log.push({ emailNum: emailNumber, logLabel: `Email ${emailNumber} of 6 sent`, subject, sentAt: now });

    if (emailNumber < 6) {
      const nextNum = emailNumber + 1;
      c.nextDueDate = addDays(today, SEQUENCE_DAYS[nextNum] - SEQUENCE_DAYS[emailNumber]);
    } else {
      c.nextDueDate = null;
      c.status = "Unresponsive";
    }

    if (c.accountId && typeof window.addAccountActivity === "function") {
      const name = [c.firstName, c.lastName].filter(Boolean).join(" ") || c.company;
      window.addAccountActivity(c.accountId, `Email ${emailNumber} of 6 sent to ${name} (${c.email}) · "${subject}"`, false, { source: "Email List" });
    }

    saveData();
    renderDrip();
    (window.showToast || alert)(`Email ${emailNumber} of 6 marked as sent.`, "success");
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
    const next = c.emailNumber + 1;
    return [1, 2, 3, 4, 5, 6].map(n =>
      `<span class="drip-dot ${c.sentDates[n] ? "drip-dot-sent" : n === next && c.status === "Active" ? "drip-dot-next" : ""}" title="Email ${n}${c.sentDates[n] ? " · sent " + fmtDate(c.sentDates[n]) : n === next ? " · next" : ""}"></span>`
    ).join("");
  }

  function renderContactCard(c, isDue) {
    const nextNum = c.emailNumber + 1;
    const canDraft = nextNum <= 6 && ["Active", "OOO Paused"].includes(c.status);
    const isReply = REPLY_TO[nextNum];
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
      document.getElementById("dripCreateFirst")?.addEventListener("click", openDripCampaignDialog);
      return;
    }
    const stats = campaignStats(campaign.id);
    el.innerHTML = `
      <div class="drip-campaign-bar">
        <div class="drip-campaign-left">
          <div class="drip-campaign-name">${esc(campaign.name)}</div>
          ${campaign.entities?.length ? `<div class="drip-campaign-meta">${campaign.entities.map(e => `<span class="import-tag import-tag-entity">${esc(e)}</span>`).join("")}</div>` : ""}
        </div>
        <div class="payton-stat-row">
          <div class="payton-stat"><span class="payton-stat-num">${stats.total}</span><span class="payton-stat-label">Contacts</span></div>
          <div class="payton-stat"><span class="payton-stat-num">${stats.active}</span><span class="payton-stat-label">Active</span></div>
          <div class="payton-stat"><span class="payton-stat-num">${stats.replied}</span><span class="payton-stat-label">Replied</span></div>
          ${stats.dueToday ? `<div class="payton-stat payton-stat-warn"><span class="payton-stat-num">${stats.dueToday}</span><span class="payton-stat-label">Due Today</span></div>` : ""}
        </div>
        <div class="drip-header-actions">
          ${_data.campaigns.length > 1 ? `<button class="secondary-button btn-sm" id="dripSwitchBtn" type="button">Switch</button>` : ""}
          <button class="secondary-button btn-sm" id="dripNewCampaignBtn" type="button">+ Campaign</button>
          <button class="secondary-button btn-sm" id="dripImportBtn" type="button">Import</button>
          <button class="secondary-button btn-sm" id="dripAddContactBtn" type="button">+ Contact</button>
        </div>
      </div>`;
    document.getElementById("dripSwitchBtn")?.addEventListener("click", openSwitchDialog);
    document.getElementById("dripNewCampaignBtn")?.addEventListener("click", openDripCampaignDialog);
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

  function renderDripTemplates() {
    const el = document.getElementById("dripTemplatesContent");
    if (!el) return;
    const entity = document.getElementById("dripTemplateEntity")?.value || "K-12";
    const mock = { firstName: "John", company: "Sample Organization", entity };
    let html = `<div class="drip-template-grid">`;
    for (let n = 1; n <= 6; n++) {
      const tpl = buildDripEmail(mock, n);
      const isReply = REPLY_TO[n];
      html += `
        <div class="drip-template-card">
          <div class="drip-template-header">
            <span class="drip-template-num">Email ${n}</span>
            <span class="drip-template-day">Day ${SEQUENCE_DAYS[n]}${isReply ? " · ↩ reply to Email " + REPLY_TO[n] : ""}</span>
          </div>
          <div class="drip-template-subject">${esc(tpl.subject)}</div>
          <pre class="drip-template-body">${esc(tpl.body)}</pre>
        </div>`;
    }
    html += `</div>`;
    el.innerHTML = html;
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
    if (_viewMode === "queue") renderDripQueue();
    else if (_viewMode === "contacts") renderDripContacts();
    else if (_viewMode === "templates") renderDripTemplates();
  }

  // ── Dialogs ───────────────────────────────────────────────────────

  function openDripCampaignDialog() {
    document.getElementById("dripCampaignForm")?.reset();
    document.getElementById("dripCampaignDialog")?.showModal();
  }

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
    if (stageEl && stageEl.children.length <= 1) {
      stageEl.innerHTML = `<option value="">All stages</option>` +
        ACCOUNT_STAGES.map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join("");
    }
    const entityEl = document.getElementById("dripImportEntityFilter");
    if (entityEl && entityEl.children.length <= 1) {
      entityEl.innerHTML = `<option value="">All entities</option>` +
        ENTITIES.filter(e => e !== "Other").map(e => `<option value="${esc(e)}">${esc(e)}</option>`).join("");
    }
  }

  function renderDripImportList() {
    const el = document.getElementById("dripImportList");
    if (!el || typeof window.cleanAccounts !== "function") return;
    const existing = new Set(_data.contacts.filter(c => c.campaignId === _activeCampaignId).map(c => c.email.toLowerCase()));
    const entityFilter = document.getElementById("dripImportEntityFilter")?.value || "";
    const stageFilter  = document.getElementById("dripImportStageFilter")?.value || "";
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
    const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.company;

    document.getElementById("dripEmailTitle").textContent = `Email ${emailNumber} of 6 — ${name}`;
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

    // Sub-tab clicks
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

    // Campaign form
    document.getElementById("dripCampaignForm")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const form = new FormData(e.currentTarget);
      const name = (form.get("campaignName") || "").trim();
      if (!name) return;
      const entities = [...e.currentTarget.querySelectorAll('[name="campaignEntities"]:checked')].map(i => i.value);
      const stages   = [...e.currentTarget.querySelectorAll('[name="campaignStages"]:checked')].map(i => i.value);
      createCampaign(name, entities, stages);
      document.getElementById("dripCampaignDialog")?.close();
      (window.showToast || alert)("Campaign created.", "success");
    });
    document.getElementById("closeDripCampaignDialog")?.addEventListener("click", () => document.getElementById("dripCampaignDialog")?.close());

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

    // Template entity filter
    document.getElementById("dripTemplateEntity")?.addEventListener("change", renderDripTemplates);

    // Email dialog
    document.getElementById("closeDripEmailDialog")?.addEventListener("click", () => document.getElementById("dripEmailDialog")?.close());
    document.getElementById("dripCopyEmailBtn")?.addEventListener("click", () => {
      const subject = document.getElementById("dripEmailSubject")?.value || "";
      const body    = document.getElementById("dripEmailBody")?.value || "";
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
