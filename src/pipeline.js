// ─────────────────────────────────────────────────────────────────
// GRIP — Pipeline Dashboard
// Proposal tracker · Kanban board · Win/Loss reporting
// ─────────────────────────────────────────────────────────────────

(function () {

  const STAGES = ["Prospect", "Qualifying", "Proposal Sent", "Won", "Lost"];
  const STAGE_COLORS = {
    Prospect:      { bg: "#f1f5f9", text: "#475569" },
    Qualifying:    { bg: "#dbeafe", text: "#1d4ed8" },
    "Proposal Sent": { bg: "#fef9c3", text: "#92400e" },
    Won:           { bg: "#bbf7d0", text: "#15803d" },
    Lost:          { bg: "#fee2e2", text: "#991b1b" },
  };

  // ── Data I/O ──────────────────────────────────────────────────────

  function load() {
    try { return JSON.parse(localStorage.getItem("garlandPipeline") || "[]"); }
    catch (_) { return []; }
  }

  function save(deals) {
    localStorage.setItem("garlandPipeline", JSON.stringify(deals));
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // ── Helpers ───────────────────────────────────────────────────────

  function esc(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function fmtMoney(n) {
    const num = parseFloat(n) || 0;
    if (num >= 1_000_000) return "$" + (num / 1_000_000).toFixed(2).replace(/\.?0+$/, "") + "M";
    if (num >= 1_000) return "$" + (num / 1_000).toFixed(0) + "K";
    return "$" + Math.round(num).toLocaleString();
  }

  function fmtDate(iso) {
    if (!iso) return "";
    return new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  function daysSince(iso) {
    if (!iso) return 0;
    return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  }

  function accounts() {
    return typeof window.cleanAccounts === "function" ? window.cleanAccounts() : [];
  }

  function projects() {
    return typeof window.cleanProjects === "function" ? window.cleanProjects() : [];
  }

  function proposals() {
    return typeof window.cleanProposals === "function" ? window.cleanProposals() : [];
  }

  function linkedLabel(linkedType, linkedId) {
    if (!linkedType || !linkedId) return null;
    if (linkedType === "project") {
      const p = projects().find(p => p.id === linkedId);
      return p ? (p.projectName || p.client || "Project") : null;
    }
    if (linkedType === "proposal") {
      const p = proposals().find(p => p.id === linkedId);
      return p ? (p.project || p.client || "Proposal") : null;
    }
    return null;
  }

  function populateLinkedSelect(sel, accountId, selectedVal) {
    const norm = s => String(s || "").toLowerCase().trim();
    const acct = accounts().find(a => a.id === accountId);
    const clientName = acct?.client || "";
    const matchProjects = projects().filter(p => !clientName || norm(p.client) === norm(clientName));
    const matchProposals = proposals().filter(p => !clientName || norm(p.client) === norm(clientName));
    sel.innerHTML = `<option value="">None</option>` +
      (matchProjects.length ? `<optgroup label="Projects">${matchProjects.map(p =>
        `<option value="project:${esc(p.id)}" ${selectedVal === `project:${p.id}` ? "selected" : ""}>${esc(p.projectName || p.client)}</option>`).join("")}</optgroup>` : "") +
      (matchProposals.length ? `<optgroup label="Proposals">${matchProposals.map(p =>
        `<option value="proposal:${esc(p.id)}" ${selectedVal === `proposal:${p.id}` ? "selected" : ""}>${esc(p.project || p.client)}</option>`).join("")}</optgroup>` : "");
  }

  // ── State ─────────────────────────────────────────────────────────

  let _tab = "board"; // "board" | "analytics"
  let _editId = null;
  let _sortBy = "default"; // "default" | "amount" | "closeDate"
  let _sortDir = -1; // -1 = desc, 1 = asc

  // ── Analytics ─────────────────────────────────────────────────────

  function analytics(deals) {
    const closed = deals.filter(d => d.stage === "Won" || d.stage === "Lost");
    const won    = deals.filter(d => d.stage === "Won");
    const open   = deals.filter(d => d.stage !== "Won" && d.stage !== "Lost");
    const winRate = closed.length ? Math.round((won.length / closed.length) * 100) : null;
    const avgWon  = won.length ? won.reduce((s, d) => s + (parseFloat(d.amount) || 0), 0) / won.length : 0;
    const pipeline = open.reduce((s, d) => s + (parseFloat(d.amount) || 0), 0);

    // By entity type
    const byEntity = {};
    for (const d of won) {
      const e = d.entityType || "Unknown";
      byEntity[e] = (byEntity[e] || 0) + (parseFloat(d.amount) || 0);
    }
    const topEntity = Object.entries(byEntity).sort((a, b) => b[1] - a[1])[0];

    // Lost reasons
    const reasons = {};
    for (const d of deals.filter(d => d.stage === "Lost" && d.lostReason)) {
      reasons[d.lostReason] = (reasons[d.lostReason] || 0) + 1;
    }

    return { won, closed, open, winRate, avgWon, pipeline, topEntity, reasons };
  }

  // ── Board render ──────────────────────────────────────────────────

  function buildValueBar(deals) {
    const totalVal = deals.reduce((s, d) => s + (parseFloat(d.amount) || 0), 0);
    if (!totalVal) return "";
    const segments = STAGES.map(stage => {
      const val = deals.filter(d => d.stage === stage).reduce((s, d) => s + (parseFloat(d.amount) || 0), 0);
      return { stage, val, pct: Math.round(val / totalVal * 100) };
    }).filter(s => s.val > 0);
    return `<div class="pl-value-bar">
      ${segments.map(s => {
        const col = STAGE_COLORS[s.stage] || { bg: "#e2e8f0", text: "#475569" };
        return `<div class="pl-vb-seg" style="width:${s.pct}%;background:${col.bg};color:${col.text}" title="${esc(s.stage)}: ${fmtMoney(s.val)} (${s.pct}%)">
          <span class="pl-vb-stage">${esc(s.stage)}</span>
          <span class="pl-vb-amount">${fmtMoney(s.val)}</span>
        </div>`;
      }).join("")}
    </div>`;
  }

  function sortedDeals(cards) {
    if (_sortBy === "amount") {
      return [...cards].sort((a, b) => _sortDir * ((parseFloat(b.amount) || 0) - (parseFloat(a.amount) || 0)));
    }
    if (_sortBy === "closeDate") {
      return [...cards].sort((a, b) => {
        if (!a.closeDate && !b.closeDate) return 0;
        if (!a.closeDate) return 1;
        if (!b.closeDate) return -1;
        return _sortDir * a.closeDate.localeCompare(b.closeDate);
      });
    }
    return cards;
  }

  function renderBoard(deals) {
    const sortLabel = _sortBy === "amount" ? "$ " + (_sortDir < 0 ? "↓" : "↑")
      : _sortBy === "closeDate" ? "Date " + (_sortDir < 0 ? "↓" : "↑")
      : "Sort";
    return buildValueBar(deals) +
      `<div class="pl-board-toolbar">
        <span class="pl-sort-label">Sort columns:</span>
        <button class="pl-sort-btn ${_sortBy === "amount" ? "pl-sort-btn--active" : ""}" data-pl-sort="amount" type="button">$ Value</button>
        <button class="pl-sort-btn ${_sortBy === "closeDate" ? "pl-sort-btn--active" : ""}" data-pl-sort="closeDate" type="button">Close Date</button>
        ${_sortBy !== "default" ? `<button class="pl-sort-btn pl-sort-btn--dir" data-pl-sort-dir type="button">${sortLabel}</button>
        <button class="pl-sort-btn pl-sort-btn--clear" data-pl-sort="default" type="button">✕ Clear</button>` : ""}
      </div>` +
      `<div class="pl-board">` +
      STAGES.map(stage => {
        const cards = sortedDeals(deals.filter(d => d.stage === stage));
        const val = cards.reduce((s, d) => s + (parseFloat(d.amount) || 0), 0);
        const col = STAGE_COLORS[stage] || {};
        return `
          <div class="pl-col" data-stage="${esc(stage)}">
            <div class="pl-col-header">
              <span class="pl-col-name">${esc(stage)}</span>
              <span class="pl-col-meta">${cards.length} · ${fmtMoney(val)}</span>
            </div>
            <div class="pl-col-body">
              ${cards.map(d => dealCard(d, col)).join("") || `<div class="pl-col-empty">No deals</div>`}
            </div>
          </div>`;
      }).join("") +
    `</div>`;
  }

  function dealCard(d, col) {
    const age = daysSince(d.createdAt);
    const link = linkedLabel(d.linkedType, d.linkedId);
    return `
      <div class="pl-deal-card" data-deal-id="${esc(d.id)}">
        <div class="pl-deal-name">${esc(d.title || d.accountName)}</div>
        <div class="pl-deal-account">${esc(d.accountName)}</div>
        ${link ? `<div class="pl-linked-badge">↗ ${esc(link)}</div>` : ""}
        <div class="pl-deal-footer">
          <span class="pl-deal-amount">${d.amount ? fmtMoney(d.amount) : "—"}</span>
          <span class="pl-deal-age">${age}d</span>
        </div>
        ${d.closeDate ? `<div class="pl-deal-close">Close: ${fmtDate(d.closeDate)}</div>` : ""}
        <div class="pl-deal-actions">
          <select class="pl-stage-select" data-deal-id="${esc(d.id)}" title="Move stage">
            ${STAGES.map(s => `<option ${s === d.stage ? "selected" : ""}>${esc(s)}</option>`).join("")}
          </select>
          <button class="pl-edit-btn" data-edit-deal="${esc(d.id)}" type="button" title="Edit">✎</button>
          <button class="pl-del-btn" data-del-deal="${esc(d.id)}" type="button" title="Delete">✕</button>
        </div>
      </div>`;
  }

  // ── Analytics render ──────────────────────────────────────────────

  function renderAnalytics(deals) {
    const a = analytics(deals);
    const byCounty = {};
    for (const d of deals.filter(x => x.stage === "Won")) {
      const c = d.county || "Unknown";
      byCounty[c] = (byCounty[c] || { count: 0, value: 0 });
      byCounty[c].count++;
      byCounty[c].value += parseFloat(d.amount) || 0;
    }
    const countyRows = Object.entries(byCounty).sort((x, y) => y[1].value - x[1].value);

    const reasonRows = Object.entries(a.reasons).sort((x, y) => y[1] - x[1]);

    return `
      <div class="pl-analytics">
        <div class="pl-kpi-row">
          <div class="pl-kpi">
            <div class="pl-kpi-num">${a.winRate !== null ? a.winRate + "%" : "—"}</div>
            <div class="pl-kpi-label">Win Rate</div>
          </div>
          <div class="pl-kpi pl-kpi--accent">
            <div class="pl-kpi-num">${fmtMoney(a.pipeline)}</div>
            <div class="pl-kpi-label">Open Pipeline</div>
          </div>
          <div class="pl-kpi">
            <div class="pl-kpi-num">${fmtMoney(a.avgWon)}</div>
            <div class="pl-kpi-label">Avg. Deal Won</div>
          </div>
          <div class="pl-kpi pl-kpi--green">
            <div class="pl-kpi-num">${a.won.length}</div>
            <div class="pl-kpi-label">Deals Won</div>
          </div>
          <div class="pl-kpi">
            <div class="pl-kpi-num">${a.closed.length - a.won.length}</div>
            <div class="pl-kpi-label">Deals Lost</div>
          </div>
        </div>

        <div class="pl-analytics-grid">
          <div class="pl-analytics-card">
            <h4 class="pl-analytics-title">Won by County</h4>
            ${countyRows.length ? countyRows.map(([county, s]) => `
              <div class="pl-analytics-row">
                <span>${esc(county)}</span>
                <span>${s.count} deal${s.count !== 1 ? "s" : ""} · ${fmtMoney(s.value)}</span>
              </div>`).join("") : '<p class="pl-empty">No won deals yet.</p>'}
          </div>

          <div class="pl-analytics-card">
            <h4 class="pl-analytics-title">Loss Reasons</h4>
            ${reasonRows.length ? reasonRows.map(([reason, count]) => `
              <div class="pl-analytics-row">
                <span>${esc(reason)}</span>
                <span>${count}×</span>
              </div>`).join("") : '<p class="pl-empty">No lost deals with reasons yet.</p>'}
          </div>

          <div class="pl-analytics-card">
            <h4 class="pl-analytics-title">All Deals</h4>
            <div class="pl-deal-table">
              ${deals.length ? deals.map(d => `
                <div class="pl-deal-table-row">
                  <div>
                    <span class="pl-deal-table-name">${esc(d.title || d.accountName)}</span>
                    <span class="pl-deal-table-account">${esc(d.accountName)}</span>
                  </div>
                  <div class="pl-deal-table-right">
                    <span class="pl-stage-pill" style="background:${(STAGE_COLORS[d.stage] || {}).bg || "#f1f5f9"};color:${(STAGE_COLORS[d.stage] || {}).text || "#475569"}">${esc(d.stage)}</span>
                    <span>${d.amount ? fmtMoney(d.amount) : "—"}</span>
                  </div>
                </div>`).join("") : '<p class="pl-empty">No deals yet.</p>'}
            </div>
          </div>
        </div>
      </div>`;
  }

  // ── Main render ───────────────────────────────────────────────────

  function render() {
    const el = document.getElementById("pipelineView");
    if (!el) return;
    const deals = load();
    const total = deals.filter(d => !["Won", "Lost"].includes(d.stage))
      .reduce((s, d) => s + (parseFloat(d.amount) || 0), 0);

    el.innerHTML = `
      <div class="pl-page">
        <div class="pl-topbar">
          <div class="pl-topbar-left">
            <h2 class="pl-headline">Pipeline</h2>
            <span class="pl-pipeline-value">${fmtMoney(total)} open</span>
          </div>
          <div class="pl-topbar-right">
            <div class="pl-tab-group">
              <button class="pl-tab ${_tab === "board" ? "pl-tab--active" : ""}" data-tab="board" type="button">Board</button>
              <button class="pl-tab ${_tab === "analytics" ? "pl-tab--active" : ""}" data-tab="analytics" type="button">Analytics</button>
            </div>
            <button class="pl-add-btn" id="plAddDealBtn" type="button">+ Add Deal</button>
          </div>
        </div>
        <div class="pl-content">
          ${_tab === "board" ? renderBoard(deals) : renderAnalytics(deals)}
        </div>
      </div>`;

    wireEvents(el, deals);
  }

  function wireEvents(el, deals) {
    el.querySelectorAll("[data-tab]").forEach(btn => {
      btn.addEventListener("click", () => { _tab = btn.dataset.tab; render(); });
    });

    el.querySelectorAll("[data-pl-sort]").forEach(btn => {
      btn.addEventListener("click", () => {
        const val = btn.dataset.plSort;
        if (val === _sortBy) { _sortDir *= -1; } else { _sortBy = val; _sortDir = -1; }
        render();
      });
    });
    el.querySelector("[data-pl-sort-dir]")?.addEventListener("click", () => { _sortDir *= -1; render(); });

    el.querySelector("#plAddDealBtn")?.addEventListener("click", () => openDealDialog(null));

    el.querySelectorAll("[data-edit-deal]").forEach(btn => {
      btn.addEventListener("click", () => openDealDialog(btn.dataset.editDeal));
    });

    el.querySelectorAll("[data-del-deal]").forEach(btn => {
      btn.addEventListener("click", () => {
        if (confirm("Delete this deal?")) {
          const all = load().filter(d => d.id !== btn.dataset.delDeal);
          save(all);
          render();
        }
      });
    });

    el.querySelectorAll(".pl-stage-select").forEach(sel => {
      sel.addEventListener("change", () => {
        const all = load();
        const deal = all.find(d => d.id === sel.dataset.dealId);
        if (!deal) return;
        const newStage = sel.value;
        const needsReason = newStage === "Lost" && !deal.lostReason;
        if (needsReason) {
          const reason = prompt("Reason for loss (optional):");
          if (reason !== null) deal.lostReason = reason.trim();
        }
        if (newStage === "Won") deal.wonAt = new Date().toISOString();
        if (newStage === "Lost") deal.lostAt = new Date().toISOString();
        deal.stage = newStage;
        deal.updatedAt = new Date().toISOString();
        save(all);
        render();
      });
    });
  }

  // ── Deal dialog ───────────────────────────────────────────────────

  function openDealDialog(editId, preAccountId) {
    _editId = editId || null;
    const dlg = document.getElementById("pipelineDealDialog");
    if (!dlg) return;

    const deals = load();
    const existing = editId ? deals.find(d => d.id === editId) : null;
    const selectId = existing?.accountId || preAccountId || "";

    // Populate account select
    const acctSel = document.getElementById("plDealAccount");
    if (acctSel) {
      const accts = accounts();
      acctSel.innerHTML = `<option value="">Select account…</option>` +
        accts.map(a => `<option value="${esc(a.id)}" data-county="${esc(a.county || "")}" data-entity="${esc(a.entity || "")}" ${selectId === a.id ? "selected" : ""}>${esc(a.client)}</option>`).join("");
    }

    // Populate linked record select
    const linkedSel = document.getElementById("plLinkedRecord");
    if (linkedSel) {
      const existingLinked = existing?.linkedType && existing?.linkedId ? `${existing.linkedType}:${existing.linkedId}` : "";
      populateLinkedSelect(linkedSel, selectId, existingLinked);
      // Re-populate when account changes
      acctSel?.removeEventListener("change", acctSel._linkedHandler);
      acctSel._linkedHandler = () => populateLinkedSelect(linkedSel, acctSel.value, "");
      acctSel?.addEventListener("change", acctSel._linkedHandler);
    }

    // Fill form
    const form = document.getElementById("plDealForm");
    if (form && existing) {
      form.elements.namedItem("title").value = existing.title || "";
      form.elements.namedItem("amount").value = existing.amount || "";
      form.elements.namedItem("stage").value = existing.stage || "Prospect";
      form.elements.namedItem("closeDate").value = existing.closeDate || "";
      form.elements.namedItem("probability").value = existing.probability || "";
      form.elements.namedItem("notes").value = existing.notes || "";
      form.elements.namedItem("lostReason").value = existing.lostReason || "";
    } else if (form) {
      form.reset();
      // Re-populate linked select after reset (reset clears it)
      if (linkedSel) populateLinkedSelect(linkedSel, selectId, "");
    }

    document.getElementById("plDealDialogTitle").textContent = editId ? "Edit Deal" : "New Deal";
    dlg.showModal();
  }

  function submitDeal(formData) {
    const accountId = formData.get("accountId") || "";
    const title = (formData.get("title") || "").trim();
    if (!accountId && !title) return;

    const accts = accounts();
    const acct = accts.find(a => a.id === accountId);

    const linkedRaw = formData.get("linkedRecord") || "";
    const colonIdx = linkedRaw.indexOf(":");
    const linkedType = colonIdx > -1 ? linkedRaw.slice(0, colonIdx) : "";
    const linkedId   = colonIdx > -1 ? linkedRaw.slice(colonIdx + 1) : "";

    const deals = load();
    if (_editId) {
      const idx = deals.findIndex(d => d.id === _editId);
      if (idx !== -1) {
        deals[idx] = {
          ...deals[idx],
          accountId,
          accountName: acct?.client || deals[idx].accountName,
          county: acct?.county || deals[idx].county,
          entityType: acct?.entity || deals[idx].entityType,
          title,
          amount: formData.get("amount") || "",
          stage: formData.get("stage") || "Prospect",
          closeDate: formData.get("closeDate") || "",
          probability: formData.get("probability") || "",
          notes: formData.get("notes") || "",
          lostReason: formData.get("lostReason") || "",
          linkedType,
          linkedId,
          updatedAt: new Date().toISOString(),
        };
      }
    } else {
      deals.push({
        id: uid(),
        accountId,
        accountName: acct?.client || title,
        county: acct?.county || "",
        entityType: acct?.entity || "",
        title,
        amount: formData.get("amount") || "",
        stage: formData.get("stage") || "Prospect",
        closeDate: formData.get("closeDate") || "",
        probability: formData.get("probability") || "",
        notes: formData.get("notes") || "",
        lostReason: "",
        linkedType,
        linkedId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    save(deals);
    document.getElementById("pipelineDealDialog")?.close();
    render();
    // Refresh account detail panel if it's currently showing this deal's account
    if (accountId && typeof window.showDetail === "function") {
      const openId = document.getElementById("detailContent")
        ?.querySelector("[data-quick-deal-account]")?.dataset?.quickDealAccount;
      if (openId === accountId) window.showDetail("account", accountId);
    }
  }

  // ── Public API ────────────────────────────────────────────────────

  window.gripPipeline = { render, openDealDialog };

  function initListeners() {
    document.getElementById("plDealForm")?.addEventListener("submit", e => {
      e.preventDefault();
      submitDeal(new FormData(e.target));
    });
    document.getElementById("closePipelineDealDialog")?.addEventListener("click", () => {
      document.getElementById("pipelineDealDialog")?.close();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initListeners);
  } else {
    initListeners();
  }

})();
