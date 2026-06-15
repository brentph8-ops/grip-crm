// ─────────────────────────────────────────────────────────────────
// GRIP Assistant — AI Chief of Staff + Specialized Agents
// ─────────────────────────────────────────────────────────────────

(function () {
  "use strict";

  // ── Helpers ─────────────────────────────────────────────────────

  function getAccounts() {
    try {
      const raw = localStorage.getItem("garlandCrmData");
      if (raw) {
        const data = JSON.parse(raw);
        return data.accounts || [];
      }
      return window.gripData?.accounts || [];
    } catch { return []; }
  }

  async function callEdge(action, payload) {
    const base = (window.GRIP_SUPABASE_URL || "").replace(/\/$/, "");
    const url = `${base}/functions/v1/assistant-ai`;
    const anon = window.GRIP_SUPABASE_ANON || "";
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(anon ? { "Authorization": `Bearer ${anon}` } : {}),
      },
      body: JSON.stringify({ action, ...payload }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
  }

  function getLastViewedAccount() {
    try {
      const raw = localStorage.getItem("garlandCrmData");
      if (!raw) return "";
      const data = JSON.parse(raw);
      return data._lastViewedAccount || "";
    } catch { return ""; }
  }

  function getAccountByName(name) {
    return getAccounts().find(a => a.client === name) || null;
  }

  function saveNoteToGrip(accountName, noteText) {
    try {
      const raw = localStorage.getItem("garlandCrmData");
      const data = raw ? JSON.parse(raw) : {};
      if (!data.notes) data.notes = {};
      const acct = getAccountByName(accountName);
      if (!acct) return false;
      const existing = data.notes[acct.id] || "";
      const ts = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      data.notes[acct.id] = existing ? `${existing}\n\n--- AI Note (${ts}) ---\n${noteText}` : `--- AI Note (${ts}) ---\n${noteText}`;
      localStorage.setItem("garlandCrmData", JSON.stringify(data));
      return true;
    } catch { return false; }
  }

  // Build searchable account picker HTML
  function accountPickerHtml(id, label = "Account") {
    const accounts = getAccounts().filter(a => a.client);
    const last = getLastViewedAccount();
    return `
      <label class="asst-label">${label}</label>
      <div class="asst-acct-picker" data-picker="${id}">
        <input class="asst-input asst-acct-search" id="${id}Search" placeholder="Search accounts..." autocomplete="off" value="${escAttr(last)}" />
        <div class="asst-acct-list" id="${id}List" style="display:none"></div>
        <input type="hidden" id="${id}" value="${escAttr(last)}" />
        ${last ? `<div class="asst-acct-selected" id="${id}Badge">✓ ${escHtml(last)}</div>` : ""}
      </div>
    `;
  }

  function initAccountPicker(container, pickerId) {
    const accounts = getAccounts().filter(a => a.client);
    const searchEl = container.querySelector(`#${pickerId}Search`);
    const listEl = container.querySelector(`#${pickerId}List`);
    const hiddenEl = container.querySelector(`#${pickerId}`);
    const badgeEl = container.querySelector(`#${pickerId}Badge`);
    if (!searchEl || !listEl || !hiddenEl) return;

    function showList(query) {
      const q = query.toLowerCase();
      const matches = accounts.filter(a => !q || a.client.toLowerCase().includes(q)).slice(0, 12);
      if (!matches.length) { listEl.style.display = "none"; return; }
      listEl.innerHTML = matches.map(a =>
        `<div class="asst-acct-opt" data-val="${escAttr(a.client)}">${escHtml(a.client)}${a.clientRanking ? `<span class="asst-acct-rank">${escHtml(a.clientRanking)}</span>` : ""}</div>`
      ).join("");
      listEl.style.display = "block";
      listEl.querySelectorAll(".asst-acct-opt").forEach(opt => {
        opt.addEventListener("mousedown", e => {
          e.preventDefault();
          const val = opt.dataset.val;
          hiddenEl.value = val;
          searchEl.value = val;
          if (badgeEl) { badgeEl.textContent = `✓ ${val}`; badgeEl.style.display = "block"; }
          listEl.style.display = "none";
        });
      });
    }

    searchEl.addEventListener("input", () => showList(searchEl.value));
    searchEl.addEventListener("focus", () => showList(searchEl.value));
    searchEl.addEventListener("blur", () => setTimeout(() => { listEl.style.display = "none"; }, 150));
  }

  // Simple markdown → HTML renderer
  function md(text) {
    if (!text) return "";
    return text
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/^#{3} (.+)$/gm, "<h4>$1</h4>")
      .replace(/^#{2} (.+)$/gm, "<h3>$1</h3>")
      .replace(/^# (.+)$/gm, "<h2>$1</h2>")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/`(.+?)`/g, "<code>$1</code>")
      .replace(/^\| (.+) \|$/gm, (_, row) => {
        const cells = row.split(" | ").map(c => `<td>${c}</td>`).join("");
        return `<tr>${cells}</tr>`;
      })
      .replace(/(<tr>.*<\/tr>\n?)+/g, m => `<table>${m}</table>`)
      .replace(/^[\|\-]+$/gm, "")
      .replace(/^- (.+)$/gm, "<li>$1</li>")
      .replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`)
      .replace(/^\d+\. (.+)$/gm, "<li>$1</li>")
      .replace(/\n\n/g, "<br><br>")
      .replace(/\n/g, "<br>");
  }

  // ── State ────────────────────────────────────────────────────────

  let chatMessages = [];
  let activeAgent = null;

  // ── Root render ──────────────────────────────────────────────────

  function switchAgent(container, agent) {
    container.querySelectorAll(".asst-agent-btn").forEach(b => b.classList.remove("active"));
    const btn = container.querySelector(`[data-agent="${agent}"]`);
    if (btn) btn.classList.add("active");
    activeAgent = agent;
    renderPanel(container.querySelector("#asstMain"), agent);
  }

  function render(container) {
    if (container.querySelector(".asst-root")) return;
    container.innerHTML = `
      <div class="asst-root">
        <div class="asst-sidebar">
          <div class="asst-logo">✦ GRIP AI</div>
          <div class="asst-agent-label">Chief of Staff</div>
          <button class="asst-agent-btn active" data-agent="chat">💬 Chat</button>
          <div class="asst-agent-label">Agents</div>
          <button class="asst-agent-btn" data-agent="research">🔍 Research</button>
          <button class="asst-agent-btn" data-agent="outreach">✉️ Outreach</button>
          <button class="asst-agent-btn" data-agent="meeting_prep">📋 Meeting Prep</button>
          <button class="asst-agent-btn" data-agent="score">📊 Score Account</button>
          <button class="asst-agent-btn" data-agent="schedule">📅 Schedule</button>
          <button class="asst-agent-btn" data-agent="prospects">🎯 Find Prospects</button>
        </div>
        <div class="asst-main" id="asstMain"></div>
        <div class="asst-bottom-nav">
          <button class="asst-bnav-btn active" data-agent="chat">💬<span>Chat</span></button>
          <button class="asst-bnav-btn" data-agent="research">🔍<span>Research</span></button>
          <button class="asst-bnav-btn" data-agent="outreach">✉️<span>Outreach</span></button>
          <button class="asst-bnav-btn" data-agent="meeting_prep">📋<span>Prep</span></button>
          <button class="asst-bnav-btn" data-agent="more">•••<span>More</span></button>
        </div>
        <div class="asst-more-menu" id="asstMoreMenu" style="display:none">
          <button class="asst-more-item" data-agent="score">📊 Score Account</button>
          <button class="asst-more-item" data-agent="schedule">📅 Schedule</button>
          <button class="asst-more-item" data-agent="prospects">🎯 Find Prospects</button>
        </div>
      </div>
    `;

    container.querySelectorAll(".asst-agent-btn").forEach(btn => {
      btn.addEventListener("click", () => switchAgent(container, btn.dataset.agent));
    });

    container.querySelectorAll(".asst-bnav-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const agent = btn.dataset.agent;
        if (agent === "more") {
          const menu = container.querySelector("#asstMoreMenu");
          menu.style.display = menu.style.display === "none" ? "block" : "none";
          return;
        }
        container.querySelector("#asstMoreMenu").style.display = "none";
        container.querySelectorAll(".asst-bnav-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        switchAgent(container, agent);
      });
    });

    container.querySelectorAll(".asst-more-item").forEach(btn => {
      btn.addEventListener("click", () => {
        container.querySelector("#asstMoreMenu").style.display = "none";
        container.querySelectorAll(".asst-bnav-btn").forEach(b => b.classList.remove("active"));
        switchAgent(container, btn.dataset.agent);
      });
    });

    activeAgent = "chat";
    renderPanel(container.querySelector("#asstMain"), "chat");
  }

  // ── Panel router ─────────────────────────────────────────────────

  function renderPanel(el, agent) {
    const panels = {
      chat: renderChat,
      research: renderResearch,
      outreach: renderOutreach,
      meeting_prep: renderMeetingPrep,
      score: renderScore,
      schedule: renderSchedule,
      prospects: renderProspects,
    };
    (panels[agent] || renderChat)(el);
  }

  // ── CHIEF OF STAFF CHAT ──────────────────────────────────────────

  function renderChat(el) {
    const last = getLastViewedAccount();
    const acct = last ? getAccountByName(last) : null;

    el.innerHTML = `
      <div class="asst-panel">
        <div class="asst-panel-header">
          <div>
            <div class="asst-panel-title">Chief of Staff</div>
            <div class="asst-panel-sub">Your AI executive assistant</div>
          </div>
          <button class="asst-clear-btn" id="asstClearChat">Clear</button>
        </div>

        ${acct ? renderAccountHub(acct) : ""}

        <div class="asst-chat-window" id="asstChatWindow">
          ${chatMessages.length === 0 ? renderChatWelcome() : chatMessages.map(renderChatBubble).join("")}
        </div>

        <div class="asst-quick-actions">
          <button class="asst-quick-btn" data-action="brief">📌 Daily Brief</button>
          <button class="asst-quick-btn" data-msg="Who should I call this week? Give me a prioritized call list.">📞 Call List</button>
          <button class="asst-quick-btn" data-msg="Draft a weekly activity recap email for my manager">📝 Weekly Recap</button>
          <button class="asst-quick-btn" data-msg="What OMNIA cooperative purchasing opportunities should I be working in Texas?">🏛️ OMNIA Opps</button>
        </div>

        <div class="asst-chat-input-row">
          <textarea class="asst-chat-input" id="asstChatInput" placeholder="Ask anything... or paste in research content to analyze" rows="2"></textarea>
          <button class="asst-send-btn" id="asstSendBtn">Send</button>
        </div>
      </div>
    `;

    const chatWindow = el.querySelector("#asstChatWindow");
    const input = el.querySelector("#asstChatInput");
    const sendBtn = el.querySelector("#asstSendBtn");

    el.querySelector("#asstClearChat").addEventListener("click", () => {
      chatMessages = [];
      renderChat(el);
    });

    // Account hub buttons
    el.querySelectorAll("[data-hub-agent]").forEach(btn => {
      btn.addEventListener("click", () => {
        const root = el.closest(".asst-root");
        if (root) {
          const container = root.parentElement;
          // Pre-fill the last account into the target agent's picker state
          switchAgent(container, btn.dataset.hubAgent);
        }
      });
    });

    // Quick action buttons
    el.querySelectorAll(".asst-quick-btn").forEach(btn => {
      if (btn.dataset.action === "brief") {
        btn.addEventListener("click", () => triggerDailyBrief(chatWindow, sendBtn));
      } else {
        btn.addEventListener("click", () => { input.value = btn.dataset.msg; input.focus(); });
      }
    });

    async function sendMessage(text) {
      const msg = (text || input.value).trim();
      if (!msg) return;
      input.value = "";

      chatMessages.push({ role: "user", content: msg });
      chatWindow.innerHTML = chatMessages.map(renderChatBubble).join("") + renderTypingIndicator();
      chatWindow.scrollTop = chatWindow.scrollHeight;
      sendBtn.disabled = true;

      try {
        const { result } = await callEdge("chat", { messages: chatMessages });
        chatMessages.push({ role: "assistant", content: result });
        chatWindow.innerHTML = chatMessages.map(renderChatBubble).join("");
        wireInlineDraftButtons(chatWindow, el);
      } catch (err) {
        chatMessages.push({ role: "assistant", content: `⚠️ Error: ${err.message}` });
        chatWindow.innerHTML = chatMessages.map(renderChatBubble).join("");
      }
      chatWindow.scrollTop = chatWindow.scrollHeight;
      sendBtn.disabled = false;
    }

    sendBtn.addEventListener("click", () => sendMessage());
    input.addEventListener("keydown", e => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });

    // Auto-trigger daily brief on first load
    if (chatMessages.length === 0) {
      setTimeout(() => triggerDailyBrief(chatWindow, sendBtn), 400);
    } else {
      wireInlineDraftButtons(chatWindow, el);
    }

    chatWindow.scrollTop = chatWindow.scrollHeight;
  }

  function renderAccountHub(acct) {
    const rankColors = {
      "A": "#16a34a", "B": "#0057a8", "C": "#d97706",
      "Meeting": "#7c3aed", "In Progress": "#0891b2",
      "Prospecting": "#64748b", "Dead End": "#dc2626",
    };
    const rank = acct.clientRanking || "Prospecting";
    const color = rankColors[rank] || "#64748b";
    return `
      <div class="asst-hub-card">
        <div class="asst-hub-header">
          <div class="asst-hub-name">${escHtml(acct.client)}</div>
          <span class="asst-hub-rank" style="background:${color}20;color:${color}">${escHtml(rank)}</span>
        </div>
        <div class="asst-hub-meta">${[acct.county, acct.entity, acct.poc ? `Contact: ${acct.poc}` : ""].filter(Boolean).map(escHtml).join(" · ")}</div>
        <div class="asst-hub-actions">
          <button class="asst-hub-btn" data-hub-agent="research">🔍 Research</button>
          <button class="asst-hub-btn" data-hub-agent="outreach">✉️ Outreach</button>
          <button class="asst-hub-btn" data-hub-agent="meeting_prep">📋 Prep</button>
          <button class="asst-hub-btn" data-hub-agent="score">📊 Score</button>
        </div>
      </div>
    `;
  }

  async function triggerDailyBrief(chatWindow, sendBtn) {
    const accounts = getAccounts().filter(a => a.client);
    const hot = accounts.filter(a => ["A", "Meeting", "In Progress"].includes(a.clientRanking)).slice(0, 5);
    const hotList = hot.map(a => `${a.client} (${a.clientRanking})`).join(", ") || "none flagged";
    const briefPrompt = `Generate a quick daily brief for Brent. Today is ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}.

Hot accounts right now: ${hotList}

Provide:
1. A 2-sentence motivational opener (brief, not cheesy)
2. Top 3 priorities for today based on the hot accounts
3. One OMNIA or strategic reminder
4. One outreach suggestion for the day

Keep it tight — 150 words max. No headers, just clean paragraphs.`;

    chatMessages.push({ role: "user", content: briefPrompt });
    chatWindow.innerHTML = `<div class="asst-brief-loading">✦ Building your daily brief...</div>`;
    if (sendBtn) sendBtn.disabled = true;

    try {
      const { result } = await callEdge("chat", { messages: chatMessages });
      chatMessages.push({ role: "assistant", content: result });
      chatWindow.innerHTML = chatMessages.map(renderChatBubble).join("");
    } catch {
      chatMessages = [];
      chatWindow.innerHTML = renderChatWelcome();
    }
    if (sendBtn) sendBtn.disabled = false;
    chatWindow.scrollTop = chatWindow.scrollHeight;
  }

  function wireInlineDraftButtons(chatWindow, panelEl) {
    chatWindow.querySelectorAll(".asst-bubble-ai").forEach(bubble => {
      if (bubble.querySelector(".asst-inline-draft")) return;
      const text = bubble.textContent || "";
      const accounts = getAccounts().filter(a => a.client);
      const mentioned = accounts.find(a => text.includes(a.client));
      if (!mentioned) return;
      const btn = document.createElement("button");
      btn.className = "asst-inline-draft";
      btn.textContent = `✉️ Draft email for ${mentioned.client}`;
      btn.addEventListener("click", () => {
        const root = panelEl.closest(".asst-root");
        if (root) {
          const container = root.parentElement;
          switchAgent(container, "outreach");
          setTimeout(() => {
            const search = document.querySelector("#oAcctSearch");
            const hidden = document.querySelector("#oAcct");
            if (search && hidden) {
              search.value = mentioned.client;
              hidden.value = mentioned.client;
            }
          }, 100);
        }
      });
      bubble.appendChild(btn);
    });
  }

  function renderChatWelcome() {
    return `
      <div class="asst-welcome">
        <div class="asst-welcome-icon">✦</div>
        <div class="asst-welcome-title">Good ${getTimeOfDay()}, Brent.</div>
        <div class="asst-welcome-sub">I'm your AI Chief of Staff. Loading your daily brief...</div>
      </div>
    `;
  }

  function renderChatBubble(msg) {
    const isUser = msg.role === "user";
    if (isUser && msg.content.includes("Generate a quick daily brief")) return "";
    return `
      <div class="asst-bubble ${isUser ? "asst-bubble-user" : "asst-bubble-ai"}">
        ${isUser ? "" : `<div class="asst-bubble-avatar">✦</div>`}
        <div class="asst-bubble-body">${isUser ? escHtml(msg.content) : md(msg.content)}</div>
      </div>
    `;
  }

  function renderTypingIndicator() {
    return `
      <div class="asst-bubble asst-bubble-ai">
        <div class="asst-bubble-avatar">✦</div>
        <div class="asst-bubble-body asst-typing"><span></span><span></span><span></span></div>
      </div>
    `;
  }

  // ── RESEARCH AGENT ───────────────────────────────────────────────

  function renderResearch(el) {
    el.innerHTML = `
      <div class="asst-panel">
        <div class="asst-panel-header">
          <div>
            <div class="asst-panel-title">🔍 Prospect Research Agent</div>
            <div class="asst-panel-sub">Paste in any content — district websites, board agendas, bond programs — and get a full Customer Intelligence Report</div>
          </div>
        </div>
        <div class="asst-form">
          ${accountPickerHtml("rAcct")}
          <label class="asst-label">Paste Research Content</label>
          <textarea class="asst-textarea asst-textarea-tall" id="rContent" placeholder="Paste anything here: board agenda, district website text, news article, bond election results, LinkedIn profile, EDGAR filing, etc."></textarea>
          <button class="asst-action-btn" id="rSubmit">Generate Intelligence Report</button>
        </div>
        <div class="asst-result" id="rResult"></div>
      </div>
    `;
    initAccountPicker(el, "rAcct");

    el.querySelector("#rSubmit").addEventListener("click", async () => {
      const accountName = el.querySelector("#rAcct").value.trim();
      const pastedContent = el.querySelector("#rContent").value.trim();
      if (!accountName) return showError(el, "#rResult", "Please select or enter an account name.");
      if (!pastedContent) return showError(el, "#rResult", "Please paste some research content.");
      const resultEl = el.querySelector("#rResult");
      resultEl.innerHTML = renderLoading("Analyzing content and building intelligence report...");
      try {
        const { result } = await callEdge("research", { accountName, pastedContent });
        resultEl.innerHTML = renderResult(`Customer Intelligence Report — ${escHtml(accountName)}`, result, accountName);
        wireResultCopy(resultEl, result, accountName);
      } catch (err) {
        resultEl.innerHTML = `<div class="asst-error">Error: ${escHtml(err.message)}</div>`;
      }
    });
  }

  // ── OUTREACH AGENT ───────────────────────────────────────────────

  function renderOutreach(el) {
    el.innerHTML = `
      <div class="asst-panel">
        <div class="asst-panel-header">
          <div>
            <div class="asst-panel-title">✉️ Appointment Generator</div>
            <div class="asst-panel-sub">Cold emails, LinkedIn messages, call scripts, and follow-ups — Chris Voss style</div>
          </div>
        </div>
        <div class="asst-form">
          <div class="asst-form-row">
            <div class="asst-form-col">
              ${accountPickerHtml("oAcct")}
            </div>
            <div class="asst-form-col">
              <label class="asst-label">Contact Name</label>
              <input class="asst-input" id="oContact" placeholder="e.g. John Smith" />
              <label class="asst-label asst-mt">Contact Title</label>
              <input class="asst-input" id="oTitle" placeholder="e.g. Director of Facilities" />
            </div>
          </div>
          <label class="asst-label">Outreach Type</label>
          <div class="asst-radio-group">
            <label class="asst-radio-label"><input type="radio" name="oType" value="email" checked/> 📧 Cold Email</label>
            <label class="asst-radio-label"><input type="radio" name="oType" value="linkedin" /> 💼 LinkedIn</label>
            <label class="asst-radio-label"><input type="radio" name="oType" value="call" /> 📞 Call Script</label>
            <label class="asst-radio-label"><input type="radio" name="oType" value="followup" /> 🔁 Follow-Up</label>
            <label class="asst-radio-label"><input type="radio" name="oType" value="thankyou" /> 🙏 Thank You</label>
          </div>
          <label class="asst-label">Context / Research Notes</label>
          <textarea class="asst-textarea" id="oContext" placeholder="What do you know about this person/account? Paste in research, notes, or anything relevant."></textarea>
          <button class="asst-action-btn" id="oSubmit">Generate Outreach</button>
        </div>
        <div class="asst-result" id="oResult"></div>
      </div>
    `;
    initAccountPicker(el, "oAcct");

    el.querySelector("#oSubmit").addEventListener("click", async () => {
      const accountName = el.querySelector("#oAcct").value.trim();
      const contactName = el.querySelector("#oContact").value.trim();
      const contactTitle = el.querySelector("#oTitle").value.trim();
      const context = el.querySelector("#oContext").value.trim();
      const outreachType = el.querySelector("input[name=oType]:checked")?.value || "email";
      if (!accountName || !contactName) return showError(el, "#oResult", "Please fill in Account and Contact Name.");
      const resultEl = el.querySelector("#oResult");
      resultEl.innerHTML = renderLoading("Crafting outreach...");
      const labels = { email: "Cold Email", linkedin: "LinkedIn Message", call: "Call Script", followup: "Follow-Up Email", thankyou: "Thank You Email" };
      try {
        const { result } = await callEdge("outreach", { accountName, contactName, contactTitle, context, outreachType });
        resultEl.innerHTML = renderResult(`${labels[outreachType] || "Outreach"} — ${escHtml(contactName)} at ${escHtml(accountName)}`, result);
        wireResultCopy(resultEl, result, accountName);
      } catch (err) {
        resultEl.innerHTML = `<div class="asst-error">Error: ${escHtml(err.message)}</div>`;
      }
    });
  }

  // ── MEETING PREP AGENT ───────────────────────────────────────────

  function renderMeetingPrep(el) {
    el.innerHTML = `
      <div class="asst-panel">
        <div class="asst-panel-header">
          <div>
            <div class="asst-panel-title">📋 Meeting Prep Agent</div>
            <div class="asst-panel-sub">Get a full briefing package before any meeting</div>
          </div>
        </div>
        <div class="asst-form">
          <div class="asst-form-row">
            <div class="asst-form-col">
              ${accountPickerHtml("mpAcct")}
            </div>
            <div class="asst-form-col">
              <label class="asst-label">Contacts in Meeting</label>
              <input class="asst-input" id="mpContacts" placeholder="e.g. John Smith, Jane Doe" />
              <label class="asst-label asst-mt">Meeting Type</label>
              <input class="asst-input" id="mpType" placeholder="e.g. Intro call, Site visit, Proposal review" />
            </div>
          </div>
          <label class="asst-label">GRIP Notes / History (optional)</label>
          <textarea class="asst-textarea" id="mpNotes" placeholder="Paste any notes or history from GRIP about this account..."></textarea>
          <label class="asst-label">Additional Research (optional)</label>
          <textarea class="asst-textarea" id="mpResearch" placeholder="Paste any additional research, recent news, or context..."></textarea>
          <button class="asst-action-btn" id="mpSubmit">Build Briefing Package</button>
        </div>
        <div class="asst-result" id="mpResult"></div>
      </div>
    `;
    initAccountPicker(el, "mpAcct");

    el.querySelector("#mpSubmit").addEventListener("click", async () => {
      const accountName = el.querySelector("#mpAcct").value.trim();
      const contactNames = el.querySelector("#mpContacts").value.trim();
      const meetingType = el.querySelector("#mpType").value.trim();
      const gripNotes = el.querySelector("#mpNotes").value.trim();
      const pastedContent = el.querySelector("#mpResearch").value.trim();
      if (!accountName) return showError(el, "#mpResult", "Please select or enter an account.");
      const resultEl = el.querySelector("#mpResult");
      resultEl.innerHTML = renderLoading("Building your meeting briefing package...");
      try {
        const { result } = await callEdge("meeting_prep", { accountName, contactNames, meetingType, gripNotes, pastedContent });
        resultEl.innerHTML = renderResult(`Briefing Package — ${escHtml(accountName)}`, result);
        wireResultCopy(resultEl, result, accountName);
      } catch (err) {
        resultEl.innerHTML = `<div class="asst-error">Error: ${escHtml(err.message)}</div>`;
      }
    });
  }

  // ── OPPORTUNITY SCORING ──────────────────────────────────────────

  function renderScore(el) {
    el.innerHTML = `
      <div class="asst-panel">
        <div class="asst-panel-header">
          <div>
            <div class="asst-panel-title">📊 Opportunity Scoring Agent</div>
            <div class="asst-panel-sub">Score accounts on 6 key factors and get a priority rating</div>
          </div>
        </div>
        <div class="asst-form">
          ${accountPickerHtml("scAcct")}
          <label class="asst-label">What do you know about this account?</label>
          <div class="asst-checklist">
            <label class="asst-check-label"><input type="checkbox" id="scOmnia" /> OMNIA eligible (public entity — school, city, county, university)</label>
            <label class="asst-check-label"><input type="checkbox" id="scGarland" /> Has existing Garland roof on site</label>
            <label class="asst-check-label"><input type="checkbox" id="scLeak" /> Has reported leaks or roof damage</label>
            <label class="asst-check-label"><input type="checkbox" id="scBond" /> Has bond money or capital budget available</label>
            <label class="asst-check-label"><input type="checkbox" id="scArch" /> Know the architect or consultant on the project</label>
          </div>
          <label class="asst-label">Additional Context</label>
          <textarea class="asst-textarea" id="scContext" placeholder="Paste in any notes, research, or intel about this account — roof age, recent projects, contacts, etc."></textarea>
          <button class="asst-action-btn" id="scSubmit">Score This Account</button>
        </div>
        <div class="asst-result" id="scResult"></div>
      </div>
    `;
    initAccountPicker(el, "scAcct");

    el.querySelector("#scSubmit").addEventListener("click", async () => {
      const accountName = el.querySelector("#scAcct").value.trim();
      const context = el.querySelector("#scContext").value.trim();
      const checks = {
        "OMNIA eligible (public entity)": el.querySelector("#scOmnia").checked,
        "Existing Garland roof on site": el.querySelector("#scGarland").checked,
        "Has reported leaks": el.querySelector("#scLeak").checked,
        "Bond money or capital budget available": el.querySelector("#scBond").checked,
        "Know the architect or consultant": el.querySelector("#scArch").checked,
      };
      const checkStr = Object.entries(checks).map(([k, v]) => `${k}: ${v ? "YES" : "Unknown"}`).join("\n");
      const factors = `${checkStr}\n\nAdditional context:\n${context || "None"}`;
      if (!accountName) return showError(el, "#scResult", "Please select or enter an account.");
      const resultEl = el.querySelector("#scResult");
      resultEl.innerHTML = renderLoading("Scoring opportunity...");
      try {
        const { result } = await callEdge("score", { accountName, factors });
        resultEl.innerHTML = renderResult(`Opportunity Score — ${escHtml(accountName)}`, result);
        wireResultCopy(resultEl, result, accountName);
      } catch (err) {
        resultEl.innerHTML = `<div class="asst-error">Error: ${escHtml(err.message)}</div>`;
      }
    });
  }

  // ── SCHEDULE AGENT ───────────────────────────────────────────────

  function renderSchedule(el) {
    el.innerHTML = `
      <div class="asst-panel">
        <div class="asst-panel-header">
          <div>
            <div class="asst-panel-title">📅 Schedule Agent</div>
            <div class="asst-panel-sub">Get smart meeting time suggestions based on client priority and your availability</div>
          </div>
        </div>
        <div class="asst-form">
          <div class="asst-form-row">
            <div class="asst-form-col">
              ${accountPickerHtml("schAcct", "Account / Client")}
            </div>
            <div class="asst-form-col">
              <label class="asst-label">Contact Name</label>
              <input class="asst-input" id="schContact" placeholder="e.g. John Smith" />
              <label class="asst-label asst-mt">Meeting Type</label>
              <select class="asst-select" id="schType">
                <option>Introductory Call</option>
                <option>Site Visit</option>
                <option>Proposal Review</option>
                <option>Follow-Up Call</option>
                <option>Lunch Meeting</option>
                <option>Demo / Presentation</option>
              </select>
            </div>
          </div>
          <label class="asst-label">Priority</label>
          <div class="asst-radio-group">
            <label class="asst-radio-label"><input type="radio" name="schPri" value="hot" /> 🔴 Hot</label>
            <label class="asst-radio-label"><input type="radio" name="schPri" value="warm" checked /> 🟡 Warm</label>
            <label class="asst-radio-label"><input type="radio" name="schPri" value="cold" /> 🔵 Cold</label>
          </div>
          <label class="asst-label">Your Availability This Week</label>
          <textarea class="asst-textarea" id="schAvail" placeholder="e.g. Monday free all day, Tuesday after 2pm, Wednesday morning only, Thursday out of office..."></textarea>
          <button class="asst-action-btn" id="schSubmit">Get Meeting Suggestions</button>
        </div>
        <div class="asst-result" id="schResult"></div>
      </div>
    `;
    initAccountPicker(el, "schAcct");

    el.querySelector("#schSubmit").addEventListener("click", async () => {
      const company = el.querySelector("#schAcct").value.trim();
      const name = el.querySelector("#schContact").value.trim() || company;
      const meetingType = el.querySelector("#schType").value;
      const priority = el.querySelector("input[name=schPri]:checked")?.value || "warm";
      const availText = el.querySelector("#schAvail").value.trim();
      if (!company) return showError(el, "#schResult", "Please select or enter an account.");
      const resultEl = el.querySelector("#schResult");
      resultEl.innerHTML = renderLoading("Finding the best meeting times...");
      try {
        const { result } = await callEdge("schedule", {
          client: { name, company, priority, timezone: "America/Chicago" },
          meetingType,
          availability: availText ? [{ day: "This week", start: "per notes", end: "", notes: availText }] : [],
        });
        if (Array.isArray(result) && result.length) {
          resultEl.innerHTML = `
            <div class="asst-result-header"><span>Meeting Suggestions — ${escHtml(company)}</span></div>
            <div class="asst-slots">
              ${result.map(slot => `
                <div class="asst-slot">
                  <div class="asst-slot-label">${escHtml(slot.label)}</div>
                  <div class="asst-slot-reason">${escHtml(slot.reason)}</div>
                </div>
              `).join("")}
            </div>
          `;
        } else {
          resultEl.innerHTML = `<div class="asst-result-body">${md(typeof result === "string" ? result : "No suggestions returned.")}</div>`;
        }
      } catch (err) {
        resultEl.innerHTML = `<div class="asst-error">Error: ${escHtml(err.message)}</div>`;
      }
    });
  }

  // ── PROSPECT FINDER ──────────────────────────────────────────────

  function renderProspects(el) {
    el.innerHTML = `
      <div class="asst-panel">
        <div class="asst-panel-header">
          <div>
            <div class="asst-panel-title">🎯 Prospect Finder</div>
            <div class="asst-panel-sub">Find high-potential new accounts in Texas — based on your existing accounts or a search query</div>
          </div>
        </div>
        <div class="asst-form">
          <label class="asst-label">Search for specific prospects (optional)</label>
          <input class="asst-input" id="prSearch" placeholder="e.g. large school districts with bond programs, medical campuses, municipality..." />

          <label class="asst-label" style="margin-top:12px">Or paste in a target list / content to analyze</label>
          <textarea class="asst-textarea" id="prContent" placeholder="Paste in any content: a list of companies, a bond election article, a district ranking list, etc."></textarea>

          <button class="asst-action-btn" id="prSubmit">Find Prospects</button>
        </div>
        <div class="asst-result" id="prResult"></div>
      </div>
    `;

    el.querySelector("#prSubmit").addEventListener("click", async () => {
      const searchQuery = el.querySelector("#prSearch").value.trim();
      const pastedContent = el.querySelector("#prContent").value.trim();
      const accounts = getAccounts();

      const resultEl = el.querySelector("#prResult");
      resultEl.innerHTML = renderLoading("Finding prospects...");

      try {
        const payload = { accounts, searchQuery: searchQuery || pastedContent };
        const { result } = await callEdge("prospects", payload);

        if (Array.isArray(result) && result.length) {
          resultEl.innerHTML = `
            <div class="asst-result-header"><span>Prospect Recommendations</span></div>
            <div class="asst-prospects">
              ${result.map(p => `
                <div class="asst-prospect-card">
                  <div class="asst-prospect-name">${escHtml(p.company)}</div>
                  <div class="asst-prospect-meta">${escHtml(p.industry || "")}${p.estimatedDealSize ? ` · Est. ${escHtml(p.estimatedDealSize)}` : ""}</div>
                  <div class="asst-prospect-reason">${escHtml(p.reason)}</div>
                  <div class="asst-prospect-action">Contact: ${escHtml(p.contactTitle || "Facilities Director")} · ${escHtml(p.meetingType || "Intro Call")}</div>
                </div>
              `).join("")}
            </div>
          `;
        } else {
          resultEl.innerHTML = `<div class="asst-result-body">${md(typeof result === "string" ? result : "No prospects returned.")}</div>`;
        }
      } catch (err) {
        resultEl.innerHTML = `<div class="asst-error">Error: ${escHtml(err.message)}</div>`;
      }
    });
  }

  // ── Utilities ────────────────────────────────────────────────────

  function renderLoading(msg) {
    return `<div class="asst-loading"><div class="asst-spinner"></div><span>${escHtml(msg)}</span></div>`;
  }

  function renderResult(title, result, accountName) {
    return `
      <div class="asst-result-header">
        <span>${title}</span>
        <div class="asst-result-actions">
          ${accountName ? `<button class="asst-save-btn" data-save="1">Save to GRIP</button>` : ""}
          <button class="asst-copy-btn" data-copy="1">Copy</button>
        </div>
      </div>
      <div class="asst-result-body">${md(result)}</div>
    `;
  }

  function wireResultCopy(resultEl, text, accountName) {
    const copyBtn = resultEl.querySelector("[data-copy]");
    if (copyBtn) {
      copyBtn.addEventListener("click", async () => {
        await copyToClipboard(text);
        copyBtn.textContent = "Copied!";
        setTimeout(() => { copyBtn.textContent = "Copy"; }, 2000);
      });
    }
    const saveBtn = resultEl.querySelector("[data-save]");
    if (saveBtn && accountName) {
      saveBtn.addEventListener("click", () => {
        const ok = saveNoteToGrip(accountName, text);
        saveBtn.textContent = ok ? "Saved ✓" : "Save failed";
        saveBtn.disabled = true;
      });
    }
  }

  function showError(el, selector, msg) {
    el.querySelector(selector).innerHTML = `<div class="asst-error">${escHtml(msg)}</div>`;
  }

  function escHtml(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function escAttr(s) {
    return String(s || "").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function getTimeOfDay() {
    const h = new Date().getHours();
    if (h < 12) return "morning";
    if (h < 17) return "afternoon";
    return "evening";
  }

  // ── Expose ───────────────────────────────────────────────────────

  window.GRIPAssistant = { render };
})();
