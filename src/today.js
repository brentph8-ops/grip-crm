// ─────────────────────────────────────────────────────────────────
// GRIP — Today Dashboard
// Daily briefing: follow-ups, tasks, cold accounts, upcoming visits
// ─────────────────────────────────────────────────────────────────

(function () {

  // ── Helpers ───────────────────────────────────────────────────────

  function esc(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function todayIso() { return new Date().toISOString().slice(0, 10); }

  function fmtShort(iso) {
    if (!iso) return "";
    const d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  function fmtMoney(n) {
    const num = parseFloat(n) || 0;
    if (num >= 1_000_000) return "$" + (num / 1_000_000).toFixed(1) + "M";
    if (num >= 1_000) return "$" + Math.round(num / 1_000) + "K";
    return "$" + Math.round(num);
  }

  function daysSince(iso) {
    if (!iso) return 999;
    return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  }

  function greeting() {
    const h = new Date().getHours();
    if (h < 12) return "Good morning, Brent";
    if (h < 17) return "Good afternoon, Brent";
    return "Good evening, Brent";
  }

  // ── Data readers ──────────────────────────────────────────────────

  function accounts() {
    return typeof window.cleanAccounts === "function" ? window.cleanAccounts() : [];
  }

  function activities() {
    try { return JSON.parse(localStorage.getItem("garlandAccountActivities") || "{}"); }
    catch (_) { return {}; }
  }

  function tasks() {
    try { return JSON.parse(localStorage.getItem("garlandTasks") || "[]"); }
    catch (_) { return []; }
  }

  function outreach() {
    try { return JSON.parse(localStorage.getItem("garlandOutreach") || "{}"); }
    catch (_) { return {}; }
  }

  function pipeline() {
    try { return JSON.parse(localStorage.getItem("garlandPipeline") || "[]"); }
    catch (_) { return []; }
  }

  // ── Computed data ─────────────────────────────────────────────────

  function paytonDue() {
    const o = outreach();
    const today = todayIso();
    const contacts = o.contacts || [];
    const activeCampaign = (o.campaigns || []).find(c => c.status === "active");
    if (!activeCampaign) return [];
    return contacts.filter(c => {
      if (c.campaignId !== activeCampaign.id) return false;
      if (c.doNotContact || c.status === "Unsubscribed") return false;
      const { day3Due, day3Sent, day7Due, day7Sent, day14Due, day14Sent } = c.followUp || {};
      return (
        (day3Due  && day3Due  <= today && !day3Sent)  ||
        (day7Due  && day7Due  <= today && !day7Sent)  ||
        (day14Due && day14Due <= today && !day14Sent)
      );
    });
  }

  function tasksDue() {
    const today = todayIso();
    return tasks().filter(t => !t.done && t.dueDate && t.dueDate <= today);
  }

  function coldAccounts() {
    const acts = activities();
    return accounts()
      .map(a => {
        const log = acts[a.id] || [];
        const lastDate = log.length ? log[log.length - 1]?.date || log[log.length - 1]?.at : null;
        return { ...a, daysSince: daysSince(lastDate), lastDate };
      })
      .filter(a => a.daysSince >= 30)
      .sort((a, b) => b.daysSince - a.daysSince)
      .slice(0, 10);
  }

  function upcomingVisits() {
    const o = outreach();
    const today = todayIso();
    return (o.campaigns || [])
      .filter(c => c.visitDate && c.visitDate >= today)
      .sort((a, b) => a.visitDate.localeCompare(b.visitDate))
      .slice(0, 5);
  }

  function pipelineStats() {
    const deals = pipeline();
    const open = deals.filter(d => !["Won", "Lost"].includes(d.stage));
    const won = deals.filter(d => d.stage === "Won");
    const total = deals.filter(d => ["Won", "Lost"].includes(d.stage));
    return {
      openCount: open.length,
      openValue: open.reduce((s, d) => s + (parseFloat(d.amount) || 0), 0),
      winRate: total.length ? Math.round((won.length / total.length) * 100) : null,
    };
  }

  function overdueDeals() {
    const today = todayIso();
    return pipeline().filter(d =>
      !["Won", "Lost"].includes(d.stage) && d.closeDate && d.closeDate < today
    ).sort((a, b) => a.closeDate.localeCompare(b.closeDate));
  }

  function renderOverdueDeals(deals) {
    if (!deals.length) return "";
    const todayMs = new Date(todayIso() + "T12:00:00").getTime();
    return deals.map(d => {
      const days = Math.floor((todayMs - new Date(d.closeDate + "T12:00:00").getTime()) / 86400000);
      return `<div class="td-overdue-deal" data-pl-overdue="${esc(d.id)}">
        <div>
          <span class="td-overdue-name">${esc(d.title || d.accountName)}</span>
          <span class="td-overdue-meta">${esc(d.accountName)} · ${esc(d.stage)}</span>
        </div>
        <span class="td-overdue-age">${days}d past close</span>
      </div>`;
    }).join("");
  }

  // ── Render helpers ────────────────────────────────────────────────

  function card(title, count, body, subtitle = "") {
    const badge = count > 0
      ? `<span class="td-card-badge ${count > 0 ? "td-card-badge--active" : ""}">${count}</span>`
      : "";
    return `
      <div class="td-card">
        <div class="td-card-header">
          <span class="td-card-title">${esc(title)}</span>
          ${badge}
          ${subtitle ? `<span class="td-card-subtitle">${esc(subtitle)}</span>` : ""}
        </div>
        <div class="td-card-body">${body || '<p class="td-empty">Nothing here — you\'re all caught up.</p>'}</div>
      </div>`;
  }

  function renderFollowUps(items) {
    if (!items.length) return "";
    return items.map(c => {
      const name = [c.firstName, c.lastName].filter(Boolean).join(" ") || c.company;
      const typeMap = { followup1: "Day 3", followup2: "Day 7", final: "Final" };
      const { day3Due, day3Sent, day7Due, day7Sent, day14Due, day14Sent } = c.followUp || {};
      const today = todayIso();
      let type = "";
      if (day3Due && day3Due <= today && !day3Sent) type = "followup1";
      else if (day7Due && day7Due <= today && !day7Sent) type = "followup2";
      else if (day14Due && day14Due <= today && !day14Sent) type = "final";
      return `
        <div class="td-row">
          <div class="td-row-main">
            <span class="td-row-name">${esc(name)}</span>
            <span class="td-row-meta">${esc(c.company || "")}</span>
          </div>
          <span class="td-badge td-badge--warn">${typeMap[type] || "Follow-up"}</span>
        </div>`;
    }).join("");
  }

  function renderTasks(items) {
    if (!items.length) return "";
    return items.map(t => `
      <div class="td-row">
        <div class="td-row-main">
          <span class="td-row-name">${esc(t.title || t.task || "Task")}</span>
          <span class="td-row-meta">${t.dueDate ? "Due " + fmtShort(t.dueDate) : ""}</span>
        </div>
        <span class="td-badge td-badge--blue">Task</span>
      </div>`).join("");
  }

  function renderColdAccounts(items) {
    if (!items.length) return "";
    return items.map(a => `
      <div class="td-row" data-open-account="${esc(a.id)}" style="cursor:pointer">
        <div class="td-row-main">
          <span class="td-row-name">${esc(a.client)}</span>
          <span class="td-row-meta">${esc(a.county || "")}${a.entity ? " · " + esc(a.entity) : ""}</span>
        </div>
        <span class="td-badge td-badge--muted">${a.daysSince}d ago</span>
      </div>`).join("");
  }

  function renderVisits(items) {
    if (!items.length) return "";
    return items.map(v => {
      const o = outreach();
      const contacts = (o.contacts || []).filter(c => c.campaignId === v.id);
      return `
        <div class="td-row">
          <div class="td-row-main">
            <span class="td-row-name">${esc(v.city)}${v.state ? ", " + esc(v.state) : ""}</span>
            <span class="td-row-meta">${fmtShort(v.visitDate)} · ${contacts.length} prospects</span>
          </div>
          <button class="td-link-btn" data-view="outreach">Open</button>
        </div>`;
    }).join("");
  }

  // ── Main render ───────────────────────────────────────────────────

  function render() {
    const el = document.getElementById("todayView");
    if (!el) return;

    const fups = paytonDue();
    const tdue = tasksDue();
    const cold = coldAccounts();
    const visits = upcomingVisits();
    const ps = pipelineStats();
    const overdue = overdueDeals();
    const accts = accounts();

    const now = new Date();
    const dateStr = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

    el.innerHTML = `
      <div class="td-page">

        <div class="td-topbar">
          <div>
            <h1 class="td-greeting">${esc(greeting())}</h1>
            <p class="td-date">${esc(dateStr)}</p>
          </div>
          <div class="td-topbar-actions">
            <button class="td-quicklog-btn" id="tdQuickLogBtn" type="button">+ Quick Visit Log</button>
          </div>
        </div>

        <div class="td-kpi-row">
          <div class="td-kpi">
            <div class="td-kpi-num">${accts.length}</div>
            <div class="td-kpi-label">Accounts</div>
          </div>
          <div class="td-kpi">
            <div class="td-kpi-num">${ps.openCount}</div>
            <div class="td-kpi-label">Open Deals</div>
          </div>
          <div class="td-kpi td-kpi--accent">
            <div class="td-kpi-num">${fmtMoney(ps.openValue)}</div>
            <div class="td-kpi-label">Pipeline Value</div>
          </div>
          <div class="td-kpi ${(fups.length + tdue.length) > 0 ? "td-kpi--warn" : ""}">
            <div class="td-kpi-num">${fups.length + tdue.length}</div>
            <div class="td-kpi-label">Due Today</div>
          </div>
          ${ps.winRate !== null ? `
          <div class="td-kpi td-kpi--green">
            <div class="td-kpi-num">${ps.winRate}%</div>
            <div class="td-kpi-label">Win Rate</div>
          </div>` : ""}
        </div>

        ${overdue.length ? `<div class="td-overdue-alert">
          <span class="td-overdue-alert-label">⚠ ${overdue.length} deal${overdue.length !== 1 ? "s" : ""} past close date</span>
          <button class="td-overdue-view-btn" data-view="pipeline" type="button">View Pipeline →</button>
        </div>
        <div class="td-overdue-list">${renderOverdueDeals(overdue)}</div>` : ""}

        <div class="td-grid">
          ${card("Follow-Ups Due", fups.length, renderFollowUps(fups))}
          ${card("Tasks Due Today", tdue.length, renderTasks(tdue))}
          ${card("Upcoming Visits", visits.length, renderVisits(visits))}
          ${card("Cold Accounts", cold.length, renderColdAccounts(cold), "30+ days no contact")}
        </div>

      </div>
    `;

    // Wire events
    el.querySelectorAll("[data-open-account]").forEach(row => {
      row.addEventListener("click", () => {
        if (typeof window.showDetail === "function")
          window.showDetail("account", row.dataset.openAccount);
      });
    });

    el.querySelectorAll("[data-view]").forEach(btn => {
      btn.addEventListener("click", () => {
        if (typeof window.setView === "function") window.setView(btn.dataset.view);
      });
    });

    el.querySelectorAll("[data-pl-overdue]").forEach(row => {
      row.addEventListener("click", () => {
        if (typeof window.setView === "function") window.setView("pipeline");
      });
    });

    el.querySelector("#tdQuickLogBtn")?.addEventListener("click", openQuickLog);
  }

  // ── Quick Visit Log dialog ────────────────────────────────────────

  function openQuickLog() {
    const dlg = document.getElementById("quickVisitLogDialog");
    if (!dlg) return;
    // Populate account select
    const sel = document.getElementById("qlAccountSelect");
    if (sel) {
      const accts = accounts();
      sel.innerHTML = `<option value="">Select account…</option>` +
        accts.map(a => `<option value="${esc(a.id)}">${esc(a.client)}${a.county ? " · " + esc(a.county) : ""}</option>`).join("");
    }
    document.getElementById("qlForm")?.reset();
    dlg.showModal();
  }

  function submitQuickLog(form) {
    const accountId = form.get("accountId");
    const notes = (form.get("notes") || "").trim();
    const type = form.get("type") || "Site Visit";
    if (!accountId || !notes) return;
    if (typeof window.addAccountActivity === "function") {
      window.addAccountActivity(accountId, `${type}: ${notes}`, false, { source: "Quick Log" });
    }
    document.getElementById("quickVisitLogDialog")?.close();
    render();
  }

  // ── Public API ────────────────────────────────────────────────────

  window.gripToday = { render, openQuickLog, submitQuickLog };

  // Activate Today as the landing view now that this module is ready
  if (typeof window.setView === "function") {
    window.setView("today");
  }

  // Wire dialog form on DOM ready
  function initDialogListeners() {
    document.getElementById("qlForm")?.addEventListener("submit", e => {
      e.preventDefault();
      submitQuickLog(new FormData(e.target));
    });
    document.getElementById("closeQuickVisitLogDialog")?.addEventListener("click", () => {
      document.getElementById("quickVisitLogDialog")?.close();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initDialogListeners);
  } else {
    initDialogListeners();
  }

})();
