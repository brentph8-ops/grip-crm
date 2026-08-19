// ─────────────────────────────────────────────────────────────────
// GRIP — Pipeline Dashboard
// Proposal tracker · Kanban board · Win/Loss reporting
// ─────────────────────────────────────────────────────────────────

(function () {

  const STAGES = ["Client", "Meeting", "Bucket", "Follow-up Meeting", "Budget", "Project Planning", "Project Completed"];
  const STAGE_COLORS = {
    "Client":            { bg: "#f1f5f9", text: "#475569" },
    "Meeting":           { bg: "#dbeafe", text: "#1d4ed8" },
    "Bucket":            { bg: "#e0e7ff", text: "#4338ca" },
    "Follow-up Meeting": { bg: "#fef3c7", text: "#92400e" },
    "Budget":            { bg: "#fce7f3", text: "#9d174d" },
    "Project Planning":  { bg: "#d1fae5", text: "#065f46" },
    "Project Completed": { bg: "#bbf7d0", text: "#15803d" },
  };
  const GRAVEYARD_COLOR = { bg: "#1e293b", text: "#64748b" };
  const RANK_OPTIONS = ["Prospecting", "In Progress", "Meeting", "C", "B", "A", "Dead End"];
  const RANK_COLORS = {
    "A":           { bg: "#bbf7d0", text: "#15803d" },
    "B":           { bg: "#dbeafe", text: "#1d4ed8" },
    "C":           { bg: "#fef9c3", text: "#b45309" },
    "Dead End":    { bg: "#f1f5f9", text: "#94a3b8" },
    "Prospecting": { bg: "#f8fafc", text: "#94a3b8" },
    "In Progress": { bg: "#e0e7ff", text: "#4338ca" },
    "Meeting":     { bg: "#fce7f3", text: "#9d174d" },
  };

  // ── Data I/O ──────────────────────────────────────────────────────

  const STAGE_MIGRATE = { "Prospect": "Client", "Qualifying": "Meeting", "Proposal Sent": "Bucket", "Won": "Project Completed", "Lost": "Project Completed" };

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem("garlandPipeline") || "[]");
      let changed = false;
      const migrated = raw.map(d => {
        if (STAGE_MIGRATE[d.stage]) { changed = true; return { ...d, stage: STAGE_MIGRATE[d.stage] }; }
        return d;
      });
      if (changed) localStorage.setItem("garlandPipeline", JSON.stringify(migrated));
      return migrated;
    }
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
  let _dragId = null;
  let _showGraveyard = false;
  let _filterEntity = "";
  let _filterCounty = "";

  // ── Analytics ─────────────────────────────────────────────────────

  function analytics(deals) {
    const completed = deals.filter(d => d.stage === "Project Completed");
    const open      = deals.filter(d => d.stage !== "Project Completed" && d.stage !== "Graveyard");
    const winRate   = deals.length ? Math.round((completed.length / deals.length) * 100) : null;
    const avgWon    = completed.length ? completed.reduce((s, d) => s + (parseFloat(d.amount) || 0), 0) / completed.length : 0;
    const pipeline  = open.reduce((s, d) => s + (parseFloat(d.amount) || 0), 0);

    // By entity type
    const byEntity = {};
    for (const d of completed) {
      const e = d.entityType || "Unknown";
      byEntity[e] = (byEntity[e] || 0) + (parseFloat(d.amount) || 0);
    }
    const topEntity = Object.entries(byEntity).sort((a, b) => b[1] - a[1])[0];

    return { won: completed, closed: completed, open, winRate, avgWon, pipeline, topEntity, reasons: {} };
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

  function renderBoard(deals, acctMap) {
    const accts = accounts();
    const entityTypes = [...new Set(accts.map(a => a.entity).filter(Boolean))].sort();
    const counties    = [...new Set(accts.map(a => a.county).filter(Boolean))].sort();

    // Apply filters
    let filtered = deals;
    if (_filterEntity) filtered = filtered.filter(d => {
      const a = acctMap[d.accountId];
      return (a?.entity || d.entityType || "") === _filterEntity;
    });
    if (_filterCounty) filtered = filtered.filter(d => {
      const a = acctMap[d.accountId];
      return (a?.county || d.county || "") === _filterCounty;
    });

    const sortLabel = _sortBy === "amount" ? "$ " + (_sortDir < 0 ? "↓" : "↑")
      : _sortBy === "closeDate" ? "Date " + (_sortDir < 0 ? "↓" : "↑")
      : "Sort";

    const graveyardDeals = sortedDeals(filtered.filter(d => d.stage === "Graveyard"));
    const graveyardVal   = graveyardDeals.reduce((s, d) => s + (parseFloat(d.amount) || 0), 0);

    return buildValueBar(filtered.filter(d => d.stage !== "Graveyard")) +
      `<div class="pl-board-toolbar">
        <span class="pl-sort-label">Sort:</span>
        <button class="pl-sort-btn ${_sortBy === "amount" ? "pl-sort-btn--active" : ""}" data-pl-sort="amount" type="button">$ Value</button>
        <button class="pl-sort-btn ${_sortBy === "closeDate" ? "pl-sort-btn--active" : ""}" data-pl-sort="closeDate" type="button">Close Date</button>
        ${_sortBy !== "default" ? `<button class="pl-sort-btn pl-sort-btn--dir" data-pl-sort-dir type="button">${sortLabel}</button>
        <button class="pl-sort-btn pl-sort-btn--clear" data-pl-sort="default" type="button">✕</button>` : ""}
        <span class="pl-filter-sep">|</span>
        <select class="pl-filter-select" id="plFilterEntity" title="Filter by account type">
          <option value="">All Types</option>
          ${entityTypes.map(e => `<option value="${esc(e)}" ${_filterEntity === e ? "selected" : ""}>${esc(e)}</option>`).join("")}
        </select>
        <select class="pl-filter-select" id="plFilterCounty" title="Filter by county">
          <option value="">All Counties</option>
          ${counties.map(c => `<option value="${esc(c)}" ${_filterCounty === c ? "selected" : ""}>${esc(c)}</option>`).join("")}
        </select>
        <button class="pl-graveyard-toggle ${_showGraveyard ? "pl-graveyard-toggle--active" : ""}" data-pl-graveyard type="button" title="Show/hide Graveyard">⚰ Graveyard${graveyardDeals.length ? ` (${graveyardDeals.length})` : ""}</button>
      </div>` +
      `<div class="pl-board">` +
      STAGES.map(stage => {
        const cards = sortedDeals(filtered.filter(d => d.stage === stage));
        const val = cards.reduce((s, d) => s + (parseFloat(d.amount) || 0), 0);
        const col = STAGE_COLORS[stage] || {};
        return `
          <div class="pl-col" data-stage="${esc(stage)}" style="border-top:3px solid ${col.text || "#94a3b8"}">
            <div class="pl-col-header" style="background:${col.bg || "var(--surface)"}">
              <span class="pl-col-name" style="color:${col.text || "var(--muted)"}">${esc(stage)}</span>
              <span class="pl-col-meta" style="color:${col.text || "var(--muted)"};opacity:0.75">${cards.length} · ${fmtMoney(val)}</span>
            </div>
            <div class="pl-col-body">
              ${cards.map(d => dealCard(d, col, acctMap)).join("") || `<div class="pl-col-empty">No clients</div>`}
            </div>
          </div>`;
      }).join("") +
      (_showGraveyard ? `
        <div class="pl-col pl-col--graveyard" data-stage="Graveyard" style="border-top:3px solid ${GRAVEYARD_COLOR.text}">
          <div class="pl-col-header" style="background:${GRAVEYARD_COLOR.bg}">
            <span class="pl-col-name" style="color:${GRAVEYARD_COLOR.text}">⚰ Graveyard</span>
            <span class="pl-col-meta" style="color:${GRAVEYARD_COLOR.text};opacity:0.75">${graveyardDeals.length} · ${fmtMoney(graveyardVal)}</span>
            ${graveyardDeals.length ? `<button class="pl-restore-all-btn" data-restore-all type="button" title="Move all back to pipeline">↑ Restore All</button>` : ""}
          </div>
          <div class="pl-col-body">
            ${graveyardDeals.map(d => dealCard(d, GRAVEYARD_COLOR, acctMap)).join("") || `<div class="pl-col-empty" style="color:#64748b">No dead ends</div>`}
          </div>
        </div>` : "") +
    `</div>`;
  }

  function dealCard(d, col, acctMap) {
    const age = daysSince(d.createdAt);
    const displayName = (d.title && d.title !== d.accountName) ? d.title : d.accountName;
    // Look up by accountId first, fall back to name match
    const norm = s => String(s || "").toLowerCase().trim();
    const acct = acctMap?.[d.accountId]
      || (d.accountName ? Object.values(acctMap || {}).find(a => norm(a.client) === norm(d.accountName)) : null);
    const rank = acct?.clientRanking || "";
    const rankCol = RANK_COLORS[rank] || { bg: "#f1f5f9", text: "#94a3b8" };
    const rankBadge = rank
      ? `<span class="pl-rank-badge" data-rank-deal="${esc(d.id)}" data-rank-account="${esc(d.accountId || "")}" style="background:${rankCol.bg};color:${rankCol.text}" title="Click to change rank">${esc(rank)}</span>`
      : `<span class="pl-rank-badge pl-rank-badge--empty" data-rank-deal="${esc(d.id)}" data-rank-account="${esc(d.accountId || "")}" title="Click to set rank">Set rank</span>`;
    return `
      <div class="pl-deal-card" data-deal-id="${esc(d.id)}" data-account-id="${esc(d.accountId || "")}" draggable="true">
        <div class="pl-deal-name">${esc(displayName)}</div>
        <div class="pl-deal-rank-row">${rankBadge}</div>
        <div class="pl-deal-footer">
          <span class="pl-deal-amount">${d.amount ? fmtMoney(d.amount) : ""}</span>
          ${d.closeDate ? `<span class="pl-deal-close">${fmtDate(d.closeDate)}</span>` : `<span class="pl-deal-age">${age}d</span>`}
        </div>
        <div class="pl-deal-actions">
          <select class="pl-stage-select" data-deal-id="${esc(d.id)}" title="Move stage">
            ${STAGES.map(s => `<option ${s === d.stage ? "selected" : ""}>${esc(s)}</option>`).join("")}
          </select>
          <button class="pl-edit-btn" data-edit-deal="${esc(d.id)}" data-edit-account="${esc(d.accountId || "")}" type="button" title="Open account">↗</button>
          <button class="pl-del-btn" data-del-deal="${esc(d.id)}" type="button" title="Delete">✕</button>
        </div>
      </div>`;
  }

  // ── Analytics render ──────────────────────────────────────────────

  function renderAnalytics(deals) {
    const a = analytics(deals);
    const byCounty = {};
    for (const d of deals.filter(x => x.stage === "Project Completed")) {
      const c = d.county || "Unknown";
      byCounty[c] = (byCounty[c] || { count: 0, value: 0 });
      byCounty[c].count++;
      byCounty[c].value += parseFloat(d.amount) || 0;
    }
    const countyRows = Object.entries(byCounty).sort((x, y) => y[1].value - x[1].value);

    return `
      <div class="pl-analytics">
        <div class="pl-kpi-row">
          <div class="pl-kpi">
            <div class="pl-kpi-num">${a.winRate !== null ? a.winRate + "%" : "—"}</div>
            <div class="pl-kpi-label">Completion Rate</div>
          </div>
          <div class="pl-kpi pl-kpi--accent">
            <div class="pl-kpi-num">${fmtMoney(a.pipeline)}</div>
            <div class="pl-kpi-label">Open Pipeline</div>
          </div>
          <div class="pl-kpi">
            <div class="pl-kpi-num">${fmtMoney(a.avgWon)}</div>
            <div class="pl-kpi-label">Avg. Project Value</div>
          </div>
          <div class="pl-kpi pl-kpi--green">
            <div class="pl-kpi-num">${a.won.length}</div>
            <div class="pl-kpi-label">Projects Completed</div>
          </div>
          <div class="pl-kpi">
            <div class="pl-kpi-num">${a.open.length}</div>
            <div class="pl-kpi-label">Active Deals</div>
          </div>
        </div>

        <div class="pl-analytics-grid">
          <div class="pl-analytics-card">
            <h4 class="pl-analytics-title">Completed by County</h4>
            ${countyRows.length ? countyRows.map(([county, s]) => `
              <div class="pl-analytics-row">
                <span>${esc(county)}</span>
                <span>${s.count} deal${s.count !== 1 ? "s" : ""} · ${fmtMoney(s.value)}</span>
              </div>`).join("") : '<p class="pl-empty">No completed deals yet.</p>'}
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

  // ── Auto-seed all accounts into Client stage ──────────────────────

  function ensureAllClientsHaveDeals() {
    const accts = accounts();
    if (!accts.length) return;
    const deals = load();
    // Only count non-Graveyard deals as "existing" — Graveyard deals are hidden
    const activeAccountIds = new Set(deals.filter(d => d.stage !== "Graveyard").map(d => d.accountId).filter(Boolean));
    const activeNames = new Set(deals.filter(d => d.stage !== "Graveyard").map(d => String(d.accountName || "").toLowerCase().trim()).filter(Boolean));

    const newDeals = [];
    let anyRestored = false;
    for (const acct of accts) {
      if (!acct.client) continue;
      if (acct.clientRanking === "Dead End") continue;
      if (acct.id && activeAccountIds.has(acct.id)) continue;
      if (activeNames.has(String(acct.client).toLowerCase().trim())) continue;
      // If a Graveyard deal exists (rank changed away from Dead End externally), restore it
      const graveyardDeal = acct.id ? deals.find(d => d.accountId === acct.id && d.stage === "Graveyard") : null;
      if (graveyardDeal) {
        graveyardDeal.stage = "Client";
        graveyardDeal.updatedAt = new Date().toISOString();
        anyRestored = true;
        continue;
      }
      newDeals.push({
        id: uid(),
        accountId: acct.id || "",
        accountName: acct.client,
        county: acct.county || "",
        entityType: acct.entity || "",
        title: "",
        amount: "",
        stage: "Client",
        closeDate: "",
        probability: "",
        notes: "",
        linkedType: "",
        linkedId: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    if (newDeals.length || anyRestored) {
      save([...deals, ...newDeals]);
    }
  }

  // ── Main render ───────────────────────────────────────────────────

  function render() {
    const el = document.getElementById("pipelineView");
    if (!el) return;
    ensureAllClientsHaveDeals();
    const deals = load();
    const acctMap = {};
    for (const a of accounts()) { acctMap[a.id] = a; }
    const total = deals.filter(d => d.stage !== "Project Completed" && d.stage !== "Graveyard")
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
          ${_tab === "board" ? renderBoard(deals, acctMap) : renderAnalytics(deals)}
        </div>
      </div>`;

    wireEvents(el, deals, acctMap);
  }

  function wireEvents(el, deals, acctMap) {
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

    el.querySelector("[data-pl-graveyard]")?.addEventListener("click", () => {
      _showGraveyard = !_showGraveyard;
      render();
    });

    el.querySelector("[data-restore-all]")?.addEventListener("click", () => {
      if (!confirm("Move all Graveyard accounts back to the pipeline?")) return;
      const all = load();
      for (const deal of all) {
        if (deal.stage !== "Graveyard") continue;
        deal.stage = "Client";
        deal.updatedAt = new Date().toISOString();
        if (deal.accountId) {
          window.gripApp?.persistRecordEdit("account", deal.accountId, "clientRanking", "Prospecting", false);
        }
      }
      save(all);
      _showGraveyard = false;
      render();
    });

    el.querySelector("#plFilterEntity")?.addEventListener("change", e => {
      _filterEntity = e.target.value;
      render();
    });
    el.querySelector("#plFilterCounty")?.addEventListener("change", e => {
      _filterCounty = e.target.value;
      render();
    });

    el.querySelector("#plAddDealBtn")?.addEventListener("click", () => openDealDialog(null));

    el.querySelectorAll("[data-edit-deal]").forEach(btn => {
      btn.addEventListener("click", () => {
        const acctId = btn.dataset.editAccount;
        if (acctId && typeof window.showDetail === "function") {
          window.showDetail("account", acctId);
        } else {
          openDealDialog(btn.dataset.editDeal);
        }
      });
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
        if (newStage === "Project Completed") deal.completedAt = new Date().toISOString();
        if (newStage === "Graveyard" && deal.accountId) {
          window.gripApp?.persistRecordEdit("account", deal.accountId, "clientRanking", "Dead End", false);
        } else if (deal.stage === "Graveyard" && deal.accountId) {
          window.gripApp?.persistRecordEdit("account", deal.accountId, "clientRanking", "Prospecting", false);
        }
        deal.stage = newStage;
        deal.updatedAt = new Date().toISOString();
        save(all);
        render();
      });
    });

    // ── Rank badge click → floating popup ────────────────────────────
    el.querySelectorAll("[data-rank-deal]").forEach(badge => {
      badge.addEventListener("click", e => {
        e.stopPropagation();
        document.querySelector(".pl-rank-popup")?.remove();
        const dealId    = badge.dataset.rankDeal;
        const accountId = badge.dataset.rankAccount;
        const acct      = acctMap?.[accountId];
        const current   = acct?.clientRanking || "";

        const popup = document.createElement("div");
        popup.className = "pl-rank-popup";
        const rect = badge.getBoundingClientRect();
        popup.style.position = "fixed";
        popup.style.top  = (rect.bottom + 4) + "px";
        popup.style.left = rect.left + "px";
        popup.style.zIndex = "9999";

        RANK_OPTIONS.forEach(r => {
          const col = RANK_COLORS[r] || { bg: "#f1f5f9", text: "#94a3b8" };
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "pl-rank-popup-btn" + (r === current ? " pl-rank-popup-btn--active" : "");
          btn.style.background = col.bg;
          btn.style.color = col.text;
          btn.textContent = r;
          btn.addEventListener("click", () => {
            popup.remove();
            if (accountId) {
              window.gripApp?.persistRecordEdit("account", accountId, "clientRanking", r, false);
              if (r === "Dead End") {
                const all = load();
                const deal = all.find(d => d.id === dealId);
                if (deal && deal.stage !== "Graveyard") {
                  deal.stage = "Graveyard";
                  deal.updatedAt = new Date().toISOString();
                  save(all);
                  _showGraveyard = true;
                }
              } else if (current === "Dead End") {
                const all = load();
                const deal = all.find(d => d.id === dealId);
                if (deal && deal.stage === "Graveyard") {
                  deal.stage = "Client";
                  deal.updatedAt = new Date().toISOString();
                  save(all);
                }
              }
            }
            render();
          });
          popup.appendChild(btn);
        });

        document.body.appendChild(popup);
        const close = ev => { if (!popup.contains(ev.target)) { popup.remove(); document.removeEventListener("click", close, true); } };
        setTimeout(() => document.addEventListener("click", close, true), 0);
      });
    });

    // ── Drag-and-drop ─────────────────────────────────────────────────
    el.querySelectorAll(".pl-deal-card[draggable]").forEach(card => {
      card.addEventListener("dragstart", e => {
        _dragId = card.dataset.dealId;
        e.dataTransfer.effectAllowed = "move";
        setTimeout(() => card.classList.add("pl-drag-ghost"), 0);
      });
      card.addEventListener("dragend", () => {
        _dragId = null;
        card.classList.remove("pl-drag-ghost");
        el.querySelectorAll(".pl-col-drop-over").forEach(c => c.classList.remove("pl-col-drop-over"));
      });
    });

    el.querySelectorAll(".pl-col-body").forEach(body => {
      body.addEventListener("dragover", e => {
        if (!_dragId) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        body.classList.add("pl-col-drop-over");
      });
      body.addEventListener("dragleave", e => {
        if (!body.contains(e.relatedTarget)) body.classList.remove("pl-col-drop-over");
      });
      body.addEventListener("drop", e => {
        e.preventDefault();
        body.classList.remove("pl-col-drop-over");
        const targetStage = body.closest("[data-stage]")?.dataset.stage;
        if (!_dragId || !targetStage) return;
        const all = load();
        const deal = all.find(d => d.id === _dragId);
        if (!deal || deal.stage === targetStage) return;
        if (targetStage === "Project Completed") deal.completedAt = new Date().toISOString();
        if (targetStage === "Graveyard" && deal.accountId) {
          window.gripApp?.persistRecordEdit("account", deal.accountId, "clientRanking", "Dead End", false);
        } else if (deal.stage === "Graveyard" && deal.accountId) {
          window.gripApp?.persistRecordEdit("account", deal.accountId, "clientRanking", "Prospecting", false);
        }
        deal.stage = targetStage;
        deal.updatedAt = new Date().toISOString();
        save(all);
        render();
      });
    });

    // ── Fix board height so column headers stay sticky ─────────────────
    // overflow-x on the board prevents viewport-relative sticky; instead we
    // measure the board's actual top offset and give it an explicit pixel
    // height, then make each column fill + scroll within that height.
    function fitBoardHeight() {
      const board = el.querySelector(".pl-board");
      if (!board) return;
      const top = board.getBoundingClientRect().top;
      const h   = window.innerHeight - top - 10;
      if (h < 120) return;
      board.style.height    = h + "px";
      board.style.overflowY = "hidden";
      board.querySelectorAll(".pl-col").forEach(col => {
        col.style.height    = "100%";
        col.style.maxHeight = "none";
        col.style.overflowY = "auto";
      });
    }
    setTimeout(fitBoardHeight, 0);
    if (window._plResizeHandler) window.removeEventListener("resize", window._plResizeHandler);
    window._plResizeHandler = fitBoardHeight;
    window.addEventListener("resize", fitBoardHeight);
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
      form.elements.namedItem("stage").value = existing.stage || "Client";
      form.elements.namedItem("closeDate").value = existing.closeDate || "";
      form.elements.namedItem("probability").value = existing.probability || "";
      form.elements.namedItem("notes").value = existing.notes || "";
      const lostEl = form.elements.namedItem("lostReason");
      if (lostEl) lostEl.value = existing.lostReason || "";
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
          stage: formData.get("stage") || "Client",
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
        stage: formData.get("stage") || "Client",
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

  function promoteToBucket(proposal, proposalId) {
    const norm = s => String(s || "").toLowerCase().trim();
    const clientName = proposal?.client || "";
    if (!clientName) return;

    const accts = accounts();
    const acct = accts.find(a => norm(a.client) === norm(clientName));

    const deals = load();
    const BUCKET_IDX = STAGES.indexOf("Bucket");

    // Find existing deal for this account — prefer non-Graveyard deals
    const existing = acct
      ? deals.find(d => d.accountId === acct.id && d.stage !== "Graveyard") ?? deals.find(d => d.accountId === acct.id)
      : deals.find(d => norm(d.accountName) === norm(clientName) && d.stage !== "Graveyard") ?? deals.find(d => norm(d.accountName) === norm(clientName));

    if (existing) {
      const currentIdx = STAGES.indexOf(existing.stage);
      if (existing.stage === "Graveyard") return; // never auto-promote from graveyard
      if (currentIdx >= BUCKET_IDX) return; // already at Bucket or beyond
      existing.stage = "Bucket";
      existing.updatedAt = new Date().toISOString();
      save(deals);
    } else {
      deals.push({
        id: uid(),
        accountId: acct?.id || "",
        accountName: acct?.client || clientName,
        county: acct?.county || "",
        entityType: acct?.entity || "",
        title: proposal?.project || clientName,
        amount: "",
        stage: "Bucket",
        closeDate: "",
        probability: "",
        notes: "Auto-promoted from approved proposal.",
        linkedType: "proposal",
        linkedId: proposalId || "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      save(deals);
    }
    render();
  }

  function moveDealToGraveyardForAccount(accountId) {
    if (!accountId) return;
    const all = load();
    let changed = false;
    for (const deal of all) {
      if (deal.accountId === accountId && deal.stage !== "Graveyard" && deal.stage !== "Project Completed") {
        deal.stage = "Graveyard";
        deal.updatedAt = new Date().toISOString();
        changed = true;
      }
    }
    if (changed) { save(all); _showGraveyard = true; render(); }
  }

  window.gripPipeline = { render, openDealDialog, promoteToBucket, moveDealToGraveyardForAccount };

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
