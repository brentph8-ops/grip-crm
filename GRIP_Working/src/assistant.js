// ─────────────────────────────────────────────────────────────────
// GRIP Assistant — AI scheduling, prospecting, and calendar sync
// Requires: window.GRIP_SUPABASE_URL to call edge functions
// ─────────────────────────────────────────────────────────────────

window.GRIPAssistant = (() => {
  // ── Storage keys ────────────────────────────────────────────────
  const KEY_AVAIL   = "grip_assistant_availability";
  const KEY_BLOCKED = "grip_assistant_blocked";
  const KEY_MEETINGS = "grip_assistant_meetings";

  const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const TIMES = [];
  for (let h = 7; h <= 20; h++) {
    TIMES.push(`${String(h).padStart(2,"0")}:00`);
    TIMES.push(`${String(h).padStart(2,"0")}:30`);
  }

  // ── Local storage helpers ────────────────────────────────────────
  function loadAvailability() {
    try { return JSON.parse(localStorage.getItem(KEY_AVAIL) || "[]"); } catch { return []; }
  }
  function saveAvailability(blocks) { localStorage.setItem(KEY_AVAIL, JSON.stringify(blocks)); }
  function loadBlocked() {
    try { return JSON.parse(localStorage.getItem(KEY_BLOCKED) || "[]"); } catch { return []; }
  }
  function saveBlocked(blocks) { localStorage.setItem(KEY_BLOCKED, JSON.stringify(blocks)); }
  function loadMeetings() {
    try { return JSON.parse(localStorage.getItem(KEY_MEETINGS) || "[]"); } catch { return []; }
  }
  function saveMeetings(meetings) { localStorage.setItem(KEY_MEETINGS, JSON.stringify(meetings)); }

  // ── Edge function caller ─────────────────────────────────────────
  async function callEdge(fnName, payload) {
    const base = (window.GRIP_SUPABASE_URL || "").replace(/\/$/, "");
    if (!base) throw new Error("GRIP_SUPABASE_URL not configured");
    const res = await fetch(`${base}/functions/v1/${fnName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  }

  // ── Get Google token from Supabase session ───────────────────────
  async function getGoogleToken() {
    const client = window._gripSupabaseClient || window.gripSync?.getClient?.();
    if (!client) return null;
    const { data: { session } } = await client.auth.getSession();
    return session?.provider_token || null;
  }

  // ── Get accounts from GRIP's data layer ─────────────────────────
  function getAccounts() {
    try {
      const raw = localStorage.getItem("grip_accounts");
      return raw ? JSON.parse(raw) : (window.gripData?.accounts || []);
    } catch { return []; }
  }

  // ── Render helpers ───────────────────────────────────────────────
  function e(tag, cls, html) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (html !== undefined) el.innerHTML = html;
    return el;
  }

  function selectHtml(opts, selected, cls) {
    return `<select class="${cls}">${opts.map(o =>
      `<option value="${o}" ${o === selected ? "selected" : ""}>${o}</option>`
    ).join("")}</select>`;
  }

  // ── AVAILABILITY TAB ─────────────────────────────────────────────
  function renderAvailability(container) {
    let blocks = loadAvailability();
    let blocked = loadBlocked();

    container.innerHTML = `
      <div class="asst-section">
        <h3 class="asst-h3">Weekly Schedule</h3>
        <p class="asst-hint">Set your recurring available hours. The AI uses these when suggesting meeting times.</p>
        <div id="asstAvailList"></div>
        <div class="asst-add-row" id="asstAvailForm">
          <select id="asstDay" class="asst-select">${DAYS.map((d,i)=>`<option value="${i}"${i===1?" selected":""}>${d}</option>`).join("")}</select>
          <select id="asstFrom" class="asst-select">${TIMES.map(t=>`<option${t==="09:00"?" selected":""}>${t}</option>`).join("")}</select>
          <span class="asst-sep">–</span>
          <select id="asstTo" class="asst-select">${TIMES.map(t=>`<option${t==="17:00"?" selected":""}>${t}</option>`).join("")}</select>
          <input id="asstLabel" class="asst-input" placeholder="Label (optional)" style="flex:1;min-width:100px">
          <button class="asst-btn asst-btn-primary" id="asstAddAvail">+ Add</button>
        </div>
      </div>
      <div class="asst-section">
        <h3 class="asst-h3">Blocked Times</h3>
        <p class="asst-hint">Specific dates the AI should never schedule (travel, personal, etc.)</p>
        <div id="asstBlockedList"></div>
        <div class="asst-add-row" id="asstBlockedForm">
          <input type="date" id="asstBlockDate" class="asst-input">
          <select id="asstBlockFrom" class="asst-select">${TIMES.map(t=>`<option${t==="09:00"?" selected":""}>${t}</option>`).join("")}</select>
          <span class="asst-sep">–</span>
          <select id="asstBlockTo" class="asst-select">${TIMES.map(t=>`<option${t==="10:00"?" selected":""}>${t}</option>`).join("")}</select>
          <input id="asstBlockReason" class="asst-input" placeholder="Reason (optional)" style="flex:1;min-width:100px">
          <button class="asst-btn asst-btn-danger" id="asstAddBlocked">Block</button>
        </div>
      </div>
    `;

    function renderList() {
      const avList = container.querySelector("#asstAvailList");
      avList.innerHTML = blocks.length ? blocks.map((b,i) => `
        <div class="asst-list-row">
          <span class="asst-pill">${DAYS[b.day]}</span>
          <span>${b.start} – ${b.end}</span>
          ${b.label ? `<span class="asst-muted">${b.label}</span>` : ""}
          <button class="asst-icon-btn asst-del" data-i="${i}" data-type="avail">✕</button>
        </div>`) .join("") : `<p class="asst-empty">No schedule set — AI will default to Mon–Fri 9am–5pm.</p>`;

      const blList = container.querySelector("#asstBlockedList");
      blList.innerHTML = blocked.length ? blocked.map((b,i) => `
        <div class="asst-list-row asst-list-row-blocked">
          <span class="asst-pill asst-pill-red">${b.date}</span>
          <span>${b.start} – ${b.end}</span>
          ${b.reason ? `<span class="asst-muted">${b.reason}</span>` : ""}
          <button class="asst-icon-btn asst-del" data-i="${i}" data-type="blocked">✕</button>
        </div>`).join("") : `<p class="asst-empty">No blocked times.</p>`;

      container.querySelectorAll(".asst-del").forEach(btn => {
        btn.onclick = () => {
          const i = +btn.dataset.i;
          if (btn.dataset.type === "avail") { blocks.splice(i,1); saveAvailability(blocks); }
          else { blocked.splice(i,1); saveBlocked(blocked); }
          renderList();
        };
      });
    }

    renderList();

    container.querySelector("#asstAddAvail").onclick = () => {
      blocks.push({
        id: crypto.randomUUID(),
        day: +container.querySelector("#asstDay").value,
        start: container.querySelector("#asstFrom").value,
        end: container.querySelector("#asstTo").value,
        label: container.querySelector("#asstLabel").value.trim(),
      });
      saveAvailability(blocks);
      container.querySelector("#asstLabel").value = "";
      renderList();
    };

    container.querySelector("#asstAddBlocked").onclick = () => {
      const date = container.querySelector("#asstBlockDate").value;
      if (!date) return alert("Please select a date.");
      blocked.push({
        id: crypto.randomUUID(),
        date,
        start: container.querySelector("#asstBlockFrom").value,
        end: container.querySelector("#asstBlockTo").value,
        reason: container.querySelector("#asstBlockReason").value.trim(),
      });
      saveBlocked(blocked);
      container.querySelector("#asstBlockDate").value = "";
      container.querySelector("#asstBlockReason").value = "";
      renderList();
    };
  }

  // ── SCHEDULE TAB ─────────────────────────────────────────────────
  function renderSchedule(container) {
    const accounts = getAccounts();
    const meetings = loadMeetings();

    const upcoming = meetings
      .filter(m => m.status === "scheduled" && new Date(m.start) >= new Date())
      .sort((a,b) => new Date(a.start) - new Date(b.start));

    container.innerHTML = `
      <div class="asst-section">
        <h3 class="asst-h3">Schedule a Meeting</h3>
        <div class="asst-form-grid">
          <div class="asst-form-field">
            <label class="asst-label">Client / Account</label>
            <select id="asstClientSel" class="asst-select asst-select-wide">
              <option value="">— Select account —</option>
              ${accounts.map(a => `<option value="${a.id || a.name}">${a.name}${a.city ? ` · ${a.city}` : ""}</option>`).join("")}
            </select>
          </div>
          <div class="asst-form-field">
            <label class="asst-label">Meeting Type</label>
            <select id="asstMeetType" class="asst-select asst-select-wide">
              <option value="intro">Intro Call (30 min)</option>
              <option value="demo">Demo (60 min)</option>
              <option value="follow-up">Follow-up (30 min)</option>
              <option value="proposal">Proposal Review (60 min)</option>
              <option value="closing">Closing Call (45 min)</option>
            </select>
          </div>
          <div class="asst-form-field asst-form-field-full">
            <label class="asst-label">Notes / Agenda</label>
            <textarea id="asstMeetNotes" class="asst-textarea" rows="2" placeholder="Topics to cover..."></textarea>
          </div>
        </div>
        <button class="asst-btn asst-btn-primary asst-btn-wide" id="asstGetSlots">✦ Get AI-Suggested Times</button>
        <div id="asstSlotsResult"></div>
      </div>
      <div class="asst-section">
        <h3 class="asst-h3">Upcoming Meetings</h3>
        <div id="asstMeetingsList">
          ${upcoming.length === 0
            ? `<p class="asst-empty">No upcoming meetings scheduled yet.</p>`
            : upcoming.map(m => `
              <div class="asst-meeting-row">
                <div class="asst-meeting-info">
                  <strong>${m.clientName}</strong> <span class="asst-pill asst-pill-${m.type}">${m.type}</span>
                  <div class="asst-muted">${formatDateTime(m.start)} — ${formatTime(m.end)}</div>
                  ${m.notes ? `<div class="asst-muted">${m.notes}</div>` : ""}
                </div>
                <div class="asst-meeting-actions">
                  <button class="asst-btn asst-btn-sm asst-btn-success" data-id="${m.id}" data-action="complete">✓ Done</button>
                  <button class="asst-btn asst-btn-sm asst-btn-ghost" data-id="${m.id}" data-action="delete">✕</button>
                </div>
              </div>`).join("")}
        </div>
      </div>
    `;

    container.querySelector("#asstGetSlots").onclick = async () => {
      const accountId = container.querySelector("#asstClientSel").value;
      if (!accountId) return alert("Please select an account first.");
      const account = accounts.find(a => (a.id || a.name) === accountId) || { name: accountId };
      const meetingType = container.querySelector("#asstMeetType").value;
      const notes = container.querySelector("#asstMeetNotes").value;
      const result = container.querySelector("#asstSlotsResult");

      result.innerHTML = `<div class="asst-loading">✦ Finding best times for ${account.name}...</div>`;

      try {
        const avail = loadAvailability();
        const existing = loadMeetings().filter(m => m.status === "scheduled").map(m => ({
          start: m.start, end: m.end, name: m.clientName,
        }));

        const data = await callEdge("assistant-ai", {
          action: "schedule",
          client: {
            name: account.name,
            company: account.company || account.name,
            industry: account.type || account.industry || "unknown",
            timezone: account.timezone || "America/New_York",
            priority: account.priority || "warm",
          },
          availability: avail.map(b => ({ day: DAYS[b.day], start: b.start, end: b.end })),
          existingMeetings: existing,
          meetingType,
        });

        const slots = data.result || [];
        if (!slots.length) { result.innerHTML = `<p class="asst-empty">No suggestions returned. Try again.</p>`; return; }

        result.innerHTML = `
          <p class="asst-hint" style="margin-top:12px">Suggested times for <strong>${account.name}</strong>:</p>
          ${slots.map((s,i) => `
            <div class="asst-slot-row">
              <div class="asst-slot-info">
                <strong>${s.label}</strong>
                <div class="asst-muted">${s.reason}</div>
                <div class="asst-muted">${s.duration} min</div>
              </div>
              <button class="asst-btn asst-btn-primary asst-btn-sm" data-slot="${i}">Book</button>
            </div>`).join("")}`;

        result.querySelectorAll("[data-slot]").forEach(btn => {
          btn.onclick = async () => {
            const slot = slots[+btn.dataset.slot];
            const start = new Date(slot.dateTime);
            const end   = new Date(start.getTime() + slot.duration * 60000);
            const title = `${meetingType.charAt(0).toUpperCase() + meetingType.slice(1)} — ${account.name}`;

            btn.textContent = "Booking…";
            btn.disabled = true;

            try {
              let googleEventId;
              const token = await getGoogleToken();
              if (token) {
                const cal = await callEdge("assistant-calendar", {
                  action: "create",
                  googleToken: token,
                  title,
                  start: start.toISOString(),
                  end: end.toISOString(),
                  notes,
                  attendeeEmail: account.email || "",
                });
                googleEventId = cal.event?.id;
              }

              const meeting = {
                id: crypto.randomUUID(),
                clientId: account.id || account.name,
                clientName: account.name,
                type: meetingType,
                start: start.toISOString(),
                end: end.toISOString(),
                notes,
                googleEventId,
                status: "scheduled",
              };

              const all = loadMeetings();
              all.push(meeting);
              saveMeetings(all);

              btn.closest(".asst-slot-row").innerHTML = `<span class="asst-success">✓ Booked${googleEventId ? " & added to Google Calendar" : " (no calendar token — sign in with Google to sync)"}</span>`;
              renderSchedule(container);
            } catch (err) {
              btn.textContent = "Book";
              btn.disabled = false;
              alert("Booking failed: " + err.message);
            }
          };
        });

      } catch (err) {
        result.innerHTML = `<p class="asst-error">Error: ${err.message}</p>`;
      }
    };

    // Meeting action buttons
    container.querySelectorAll("[data-action]").forEach(btn => {
      btn.onclick = async () => {
        const id = btn.dataset.id;
        const action = btn.dataset.action;
        const all = loadMeetings();
        if (action === "complete") {
          const m = all.find(x => x.id === id);
          if (m) m.status = "completed";
          saveMeetings(all);
        } else if (action === "delete") {
          const m = all.find(x => x.id === id);
          if (m?.googleEventId) {
            const token = await getGoogleToken();
            if (token) {
              try { await callEdge("assistant-calendar", { action: "delete", googleToken: token, eventId: m.googleEventId }); } catch {}
            }
          }
          saveMeetings(all.filter(x => x.id !== id));
        }
        renderSchedule(container);
      };
    });
  }

  // ── PROSPECTS TAB ────────────────────────────────────────────────
  function renderProspects(container) {
    container.innerHTML = `
      <div class="asst-section">
        <h3 class="asst-h3">Find New Leads</h3>
        <p class="asst-hint">AI analyzes your existing accounts and surfaces similar prospects — or search by any criteria.</p>
        <div class="asst-search-row">
          <input id="asstProspectQuery" class="asst-input asst-input-wide" placeholder='e.g. "commercial GCs in Texas" or leave blank to match your accounts'>
          <button class="asst-btn asst-btn-primary" id="asstFindProspects">✦ Find Leads</button>
        </div>
        <div id="asstProspectsResult"></div>
      </div>
    `;

    container.querySelector("#asstFindProspects").onclick = async () => {
      const query = container.querySelector("#asstProspectQuery").value.trim();
      const result = container.querySelector("#asstProspectsResult");
      result.innerHTML = `<div class="asst-loading">✦ Analyzing your portfolio and finding leads...</div>`;

      try {
        const accounts = getAccounts();
        const data = await callEdge("assistant-ai", { action: "prospects", accounts, searchQuery: query });
        const prospects = data.result || [];

        if (!prospects.length) { result.innerHTML = `<p class="asst-empty">No prospects returned. Try a different search.</p>`; return; }

        result.innerHTML = prospects.map((p, i) => `
          <div class="asst-prospect-card" id="aprospect-${i}">
            <div class="asst-prospect-header">
              <div>
                <strong>${p.company}</strong>
                <span class="asst-pill asst-pill-blue">${p.industry}</span>
              </div>
              <button class="asst-btn asst-btn-sm asst-btn-primary" data-prospect="${i}">+ Add to GRIP</button>
            </div>
            <p class="asst-prospect-reason">${p.reason}</p>
            <div class="asst-prospect-meta">
              ${p.estimatedDealSize ? `<span>💰 ${p.estimatedDealSize}</span>` : ""}
              ${p.contactTitle ? `<span>🎯 ${p.contactTitle}</span>` : ""}
              ${p.meetingType ? `<span>📅 Open with: ${p.meetingType}</span>` : ""}
              ${p.website ? `<a href="https://${p.website}" target="_blank" rel="noopener" class="asst-link">↗ ${p.website}</a>` : ""}
            </div>
          </div>`).join("");

        result.querySelectorAll("[data-prospect]").forEach(btn => {
          btn.onclick = () => {
            const p = prospects[+btn.dataset.prospect];
            // Add to GRIP accounts via the app's existing addAccount flow if available
            if (typeof window.gripAddAccount === "function") {
              window.gripAddAccount({ name: p.company, type: p.industry, notes: p.reason, tags: ["ai-prospect"] });
              btn.textContent = "✓ Added";
              btn.disabled = true;
            } else {
              // Fallback: store in localStorage for import
              const pending = JSON.parse(localStorage.getItem("grip_pending_accounts") || "[]");
              pending.push({ name: p.company, type: p.industry, notes: p.reason, source: "ai-prospect", addedAt: new Date().toISOString() });
              localStorage.setItem("grip_pending_accounts", JSON.stringify(pending));
              btn.textContent = "✓ Queued";
              btn.disabled = true;
              btn.title = "Account saved — open Accounts view to import";
            }
          };
        });

      } catch (err) {
        result.innerHTML = `<p class="asst-error">Error: ${err.message}</p>`;
      }
    };
  }

  // ── CALENDAR TAB ─────────────────────────────────────────────────
  async function renderCalendar(container) {
    container.innerHTML = `<div class="asst-loading">Loading your Google Calendar events...</div>`;

    const token = await getGoogleToken();
    if (!token) {
      container.innerHTML = `
        <div class="asst-section asst-center">
          <p class="asst-hint">Connect your Google account to view calendar events here.</p>
          <p class="asst-hint">Sign out and sign back in with Google to grant calendar access.</p>
        </div>`;
      return;
    }

    try {
      const data = await callEdge("assistant-calendar", { action: "list", googleToken: token });
      const events = data.events || [];
      container.innerHTML = `
        <div class="asst-section">
          <h3 class="asst-h3">Your Google Calendar — Next 14 Days</h3>
          ${events.length === 0
            ? `<p class="asst-empty">No upcoming events found.</p>`
            : events.map(ev => {
                const start = ev.start?.dateTime || ev.start?.date || "";
                return `
                  <div class="asst-cal-row">
                    <div class="asst-cal-time">${start ? formatDateTime(start) : "All day"}</div>
                    <div class="asst-cal-title">${ev.summary || "(No title)"}</div>
                  </div>`;
              }).join("")}
        </div>`;
    } catch (err) {
      container.innerHTML = `<p class="asst-error">Calendar error: ${err.message}</p>`;
    }
  }

  // ── FORMAT HELPERS ───────────────────────────────────────────────
  function formatDateTime(iso) {
    try {
      return new Date(iso).toLocaleString("en-US", { weekday:"short", month:"short", day:"numeric", hour:"numeric", minute:"2-digit" });
    } catch { return iso; }
  }
  function formatTime(iso) {
    try { return new Date(iso).toLocaleTimeString("en-US", { hour:"numeric", minute:"2-digit" }); }
    catch { return iso; }
  }

  // ── MAIN RENDER ──────────────────────────────────────────────────
  function render(container) {
    container.innerHTML = `
      <div class="asst-tabs" id="asstTabBar">
        <button class="asst-tab is-active" data-tab="schedule">Schedule</button>
        <button class="asst-tab" data-tab="availability">Availability</button>
        <button class="asst-tab" data-tab="prospects">Find Leads</button>
        <button class="asst-tab" data-tab="calendar">Calendar</button>
      </div>
      <div id="asstTabContent" class="asst-tab-content"></div>
    `;

    const content = container.querySelector("#asstTabContent");

    function showTab(name) {
      container.querySelectorAll(".asst-tab").forEach(t => t.classList.toggle("is-active", t.dataset.tab === name));
      if (name === "schedule")     renderSchedule(content);
      else if (name === "availability") renderAvailability(content);
      else if (name === "prospects")    renderProspects(content);
      else if (name === "calendar")     renderCalendar(content);
    }

    container.querySelectorAll(".asst-tab").forEach(t => { t.onclick = () => showTab(t.dataset.tab); });
    showTab("schedule");
  }

  return { render };
})();
