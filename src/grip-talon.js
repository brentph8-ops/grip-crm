// ─────────────────────────────────────────────────────────────────
// Talon — GRIP's floating AI assistant, powered by Groq / Llama 3
// ─────────────────────────────────────────────────────────────────

(function () {
  'use strict';

  const KEY_STORAGE  = 'grip_talon_key';
  const GROQ_URL     = 'https://api.groq.com/openai/v1/chat/completions';
  const GROQ_MODEL   = 'llama-3.3-70b-versatile';

  // ── Groq tools ───────────────────────────────────────────────────
  const TOOLS = [
    {
      type: 'function',
      function: {
        name: 'navigate',
        description: 'Navigate the GRIP app to a specific section',
        parameters: {
          type: 'object',
          properties: {
            section: {
              type: 'string',
              enum: ['today', 'dashboard', 'tasks', 'pipeline', 'territory', 'accounts', 'proposals', 'assistant'],
              description: 'Which section to open',
            },
          },
          required: ['section'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'mark_call_done',
        description: 'Mark a call-list entry as complete for a specific day',
        parameters: {
          type: 'object',
          properties: {
            account_id:   { type: 'string', description: 'The account ID' },
            account_name: { type: 'string', description: 'Account name (for confirmation message)' },
            day:          { type: 'string', enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] },
          },
          required: ['account_id', 'day'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'mark_day_done',
        description: 'Mark ALL call-list entries for a given day as complete',
        parameters: {
          type: 'object',
          properties: {
            day: { type: 'string', enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'today'] },
          },
          required: ['day'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'open_account',
        description: 'Open the detail view for a specific account',
        parameters: {
          type: 'object',
          properties: {
            account_name: { type: 'string', description: 'Exact account name as it appears in GRIP' },
          },
          required: ['account_name'],
        },
      },
    },
  ];

  // ── Read live GRIP data ──────────────────────────────────────────
  function buildContext() {
    try {
      const crm       = JSON.parse(localStorage.getItem('garlandCrmData') || '{}');
      const callLists = JSON.parse(localStorage.getItem('garlandCallLists') || '{}');
      const accounts  = (crm.accounts || []).map(a => ({
        id:    a.id || a.client,
        name:  a.client || '',
        stage: a.stage || a.clientRanking || '',
        poc:   a.poc || '',
        phone: a.phone || '',
        city:  a.city || '',
      }));

      const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });
      const days      = callLists.days || {};
      const completed = callLists.completed || {};

      const callList = {};
      for (const [day, ids] of Object.entries(days)) {
        callList[day] = (ids || []).map(id => {
          const acct = accounts.find(a => a.id === id || a.name === id);
          const done = !!completed[`${day}-${id}`] || !!completed[id];
          return { id, name: acct?.name || id, done };
        });
      }

      const hotAccounts = accounts.filter(a =>
        ['A', 'Meeting', 'In Progress'].includes(a.stage)
      ).slice(0, 8);

      return { todayName, accounts, callList, hotAccounts };
    } catch {
      return { todayName: 'Unknown', accounts: [], callList: {}, hotAccounts: [] };
    }
  }

  function buildSystemPrompt() {
    const ctx = buildContext();
    const todaysCalls = ctx.callList[ctx.todayName] || [];
    const pending     = todaysCalls.filter(c => !c.done);
    const done        = todaysCalls.filter(c => c.done);

    return `You are Talon — the AI assistant built into GRIP, a building envelope CRM used by a Garland Company building envelope representative in Texas.

Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}.

**GRIP data snapshot:**
- Total accounts: ${ctx.accounts.length}
- Hot accounts: ${ctx.hotAccounts.map(a => `${a.name} (${a.stage})`).join(', ') || 'none'}
- Today's call list (${ctx.todayName}): ${pending.length} pending${pending.length ? ' — ' + pending.map(c => c.name).join(', ') : ''}, ${done.length} done

**Your role:** Answer questions, give quick intel on accounts, and take actions using the tools provided. Keep responses short — 1–3 sentences max unless asked for more. Be direct and confident. When you take an action, confirm it in one sentence.

**You must NEVER:**
- Make up account details not in the data
- Discuss competitors by name
- Reference "bid review" or call the user a "consultant"`;
  }

  // ── Execute tool calls returned by Groq ──────────────────────────
  function executeTool(name, args) {
    if (name === 'navigate') {
      const map = {
        today: '#today', dashboard: '#dashboard', tasks: '#tasks',
        pipeline: '#pipeline', territory: '#territory',
        accounts: '#accounts', proposals: '#proposals', assistant: '#assistant',
      };
      const sel   = map[args.section];
      const navEl = sel && (document.querySelector(`[data-nav="${args.section}"]`)
                         || document.querySelector(`[href="${sel}"]`)
                         || document.getElementById(args.section));
      if (navEl) { navEl.click(); return `Opened ${args.section}.`; }
      return `Couldn't find the ${args.section} section — try tapping it in the nav.`;
    }

    if (name === 'mark_call_done') {
      const { account_id, account_name, day } = args;
      const selectors = [
        `[data-call-account="${account_id}"][data-call-day="${day}"]`,
        `[data-call-id="${account_id}"]`,
      ];
      for (const sel of selectors) {
        const cb = document.querySelector(sel);
        if (cb) {
          if (!cb.checked) cb.click();
          return `Marked ${account_name || account_id} done for ${day}.`;
        }
      }
      return `Couldn't find the checkbox for ${account_name || account_id} on ${day} — mark it manually.`;
    }

    if (name === 'mark_day_done') {
      const day = args.day === 'today'
        ? new Date().toLocaleDateString('en-US', { weekday: 'long' })
        : args.day;
      const boxes = document.querySelectorAll(`[data-call-day="${day}"]`);
      let n = 0;
      boxes.forEach(cb => { if (cb.type === 'checkbox' && !cb.checked) { cb.click(); n++; } });
      return n > 0 ? `Marked ${n} call${n !== 1 ? 's' : ''} done for ${day}.`
                   : `All ${day} calls were already done.`;
    }

    if (name === 'open_account') {
      const name = args.account_name;
      const btn  = document.querySelector(`[data-open-account="${CSS.escape(name)}"]`)
                || document.querySelector(`[data-client="${CSS.escape(name)}"]`);
      if (btn) { btn.click(); return `Opened ${name}.`; }
      // Try to match via crm link text
      const links = Array.from(document.querySelectorAll('[data-account-name]'));
      const match = links.find(el => el.dataset.accountName?.toLowerCase() === name.toLowerCase());
      if (match) { match.click(); return `Opened ${name}.`; }
      return `Couldn't open ${name} directly — try searching in Accounts.`;
    }

    return `Unknown action: ${name}`;
  }

  // ── Chat state ───────────────────────────────────────────────────
  const history = [];
  let isOpen    = false;
  let thinking  = false;

  // ── Groq API call ────────────────────────────────────────────────
  async function callGroq(userText) {
    const key = localStorage.getItem(KEY_STORAGE);
    if (!key) throw new Error('No API key — click the ⚙ icon to add your Groq key.');

    history.push({ role: 'user', content: userText });
    addMsg('user', userText);
    setThinking(true);

    try {
      const resp = await fetch(GROQ_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`,
        },
        body: JSON.stringify({
          model:       GROQ_MODEL,
          messages:    [{ role: 'system', content: buildSystemPrompt() }, ...history.slice(-16)],
          tools:       TOOLS,
          tool_choice: 'auto',
          max_tokens:  600,
          temperature: 0.3,
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error?.message || `Groq error ${resp.status}`);
      }

      const data    = await resp.json();
      const message = data.choices?.[0]?.message;
      if (!message) throw new Error('Empty response from Groq');

      history.push(message);

      // Execute any tool calls
      if (message.tool_calls?.length) {
        const toolResults = [];
        for (const tc of message.tool_calls) {
          try {
            const args   = JSON.parse(tc.function.arguments || '{}');
            const result = executeTool(tc.function.name, args);
            addMsg('action', result);
            toolResults.push({ tool_call_id: tc.id, role: 'tool', content: result });
          } catch (e) {
            toolResults.push({ tool_call_id: tc.id, role: 'tool', content: `Error: ${e.message}` });
          }
        }
        history.push(...toolResults);
      }

      if (message.content) addMsg('ai', message.content);
    } finally {
      setThinking(false);
    }
  }

  // ── DOM helpers ──────────────────────────────────────────────────
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function addMsg(role, text) {
    const list = document.getElementById('talon-msgs');
    if (!list) return;
    const div = document.createElement('div');
    div.className = `talon-msg talon-msg--${role}`;
    div.innerHTML = role === 'action'
      ? `<span class="talon-action-text">✓ ${esc(text)}</span>`
      : `<p>${esc(text).replace(/\n/g, '<br>')}</p>`;
    list.appendChild(div);
    list.scrollTop = list.scrollHeight;
  }

  function setThinking(on) {
    thinking = on;
    const btn   = document.getElementById('talon-send');
    const input = document.getElementById('talon-input');
    const dots  = document.getElementById('talon-dots');
    if (btn)   btn.disabled   = on;
    if (input) input.disabled = on;
    if (dots)  dots.hidden    = !on;
  }

  // ── Avatar SVG (Talon — bald eagle head) ─────────────────────────
  let _eid = 0;
  function eagleSvg(size) {
    const u = ++_eid;
    return `<svg width="${size}" height="${size}" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <clipPath id="ec${u}"><circle cx="24" cy="24" r="22"/></clipPath>
      </defs>
      <!-- Dark navy bg -->
      <circle cx="24" cy="24" r="23" fill="#16213e"/>
      <g clip-path="url(#ec${u})">
        <!-- Brown feathered body/neck fanning down -->
        <path d="M6 50 C10 28 18 20 26 18 C34 16 42 20 50 28 L50 50Z" fill="#7a5010"/>
        <!-- Darker under-feather layer -->
        <path d="M4 50 C8 33 16 25 22 23 C20 28 18 35 16 44Z" fill="#5a3808"/>
        <!-- Feather V-marks (like in reference image) -->
        <path d="M12 34 L17 26 L22 34" stroke="#4a2a04" stroke-width="1.3" fill="none" stroke-linejoin="round"/>
        <path d="M19 42 L24 32 L29 42" stroke="#4a2a04" stroke-width="1.2" fill="none" stroke-linejoin="round"/>
        <path d="M26 50 L31 40 L36 50" stroke="#4a2a04" stroke-width="1.1" fill="none" stroke-linejoin="round"/>
        <path d="M6 44 L11 36 L16 44" stroke="#4a2a04" stroke-width="1" fill="none" stroke-linejoin="round"/>
        <!-- Feather highlight lines -->
        <path d="M10 38 Q16 29 24 24" stroke="#9a6c20" stroke-width="0.9" fill="none" opacity="0.7"/>
        <path d="M16 44 Q21 34 28 28" stroke="#9a6c20" stroke-width="0.8" fill="none" opacity="0.6"/>
        <!-- WHITE HEAD -->
        <path d="M13 4 C21 2 36 6 39 16 C41 24 37 35 30 37 C23 39 15 34 11 26 C7 18 7 8 13 4Z" fill="#eae4d2"/>
        <!-- Brown crown / top of head -->
        <path d="M13 4 C21 2 36 6 39 16 C35 8 26 4 18 6 C13 7 11 11 11 15 C10 10 11 6 13 4Z" fill="#7a5010"/>
        <!-- Subtle brown streaks on white head -->
        <path d="M20 11 C23 9 27 9 30 11" stroke="#b08030" stroke-width="0.9" fill="none" opacity="0.4"/>
        <path d="M16 16 C19 13 24 12 28 14" stroke="#b08030" stroke-width="0.8" fill="none" opacity="0.35"/>
        <!-- BROW RIDGE — angry dark V above eye -->
        <path d="M10 20 C14 13 21 12 27 15 C21 15 14 17 10 20Z" fill="#5a3808"/>
        <path d="M10 20 C15 12 22 11 28 15" stroke="#3a2004" stroke-width="2.2" fill="none" stroke-linecap="round"/>
        <!-- EYE: fierce amber -->
        <circle cx="26" cy="23" r="5.2" fill="#c87808"/>
        <circle cx="26" cy="23" r="3.1" fill="#0c0802"/>
        <circle cx="27.8" cy="21.4" r="1.3" fill="rgba(255,255,255,0.88)"/>
        <circle cx="26" cy="23" r="5" fill="none" stroke="#e8a018" stroke-width="0.7"/>
        <!-- BEAK: hooked, facing left -->
        <!-- Upper mandible -->
        <path d="M12 19 C8 18 4 19 2 21 C3.5 21 7 21.5 11 22 L12 21Z" fill="#e09010"/>
        <!-- Hooked tip -->
        <path d="M2 21 C0 21.5 -0.5 23.5 1 25 C2.5 25.5 5 24.5 5.5 23 C4 23.5 2.5 22.5 2 21Z" fill="#c07008"/>
        <!-- Lower mandible -->
        <path d="M12 21.5 L8 23 L5.5 24" stroke="#d08010" stroke-width="1.9" fill="none" stroke-linecap="round"/>
        <!-- Beak highlight ridge -->
        <path d="M12 19 C8 18.2 4.5 19.2 2.5 20.5" stroke="#f0b828" stroke-width="0.8" fill="none"/>
        <!-- Nostril -->
        <ellipse cx="8" cy="19.5" rx="1.8" ry="0.9" fill="#8a5508" opacity="0.75"/>
        <!-- Mouth line -->
        <path d="M12 20.5 C9.5 21 7 22.5 5.5 23.5" stroke="#9a6508" stroke-width="0.7" fill="none"/>
      </g>
      <!-- Gold border ring -->
      <circle cx="24" cy="24" r="22" fill="none" stroke="rgba(210,165,40,0.3)" stroke-width="1.2"/>
    </svg>`;
  }

  // ── Build UI ─────────────────────────────────────────────────────
  function buildUI() {
    const root = document.getElementById('talon-root');
    if (!root || root.children.length > 0) return;

    const hasKey = !!localStorage.getItem(KEY_STORAGE);

    root.innerHTML = `
      <button id="talon-btn" class="talon-btn" aria-label="Open Talon AI assistant">
        ${eagleSvg(40)}
        ${!hasKey ? '<span class="talon-pulse"></span>' : ''}
      </button>
      <div id="talon-panel" class="talon-panel" hidden>
        <div class="talon-header">
          <div class="talon-header-left">
            <div class="talon-logo">${eagleSvg(30)}</div>
            <div class="talon-title-block">
              <strong class="talon-name">Talon</strong>
              <span class="talon-sub">GRIP AI · Llama 3</span>
            </div>
          </div>
          <div class="talon-header-right">
            <button class="talon-icon-btn" id="talon-settings" title="API key settings">⚙</button>
            <button class="talon-icon-btn" id="talon-close" title="Close">✕</button>
          </div>
        </div>

        <div id="talon-setup" class="talon-setup" ${hasKey ? 'hidden' : ''}>
          <div class="talon-setup-eagle">${eagleSvg(56)}</div>
          <p class="talon-setup-title">Hey, I'm Talon.</p>
          <p class="talon-setup-body">I'm your AI assistant for GRIP. To get started, paste your free Groq API key below.</p>
          <a class="talon-setup-link" href="https://console.groq.com/keys" target="_blank" rel="noopener">Get a free key at console.groq.com →</a>
          <input id="talon-key-input" class="talon-key-input" type="password" placeholder="gsk_…" autocomplete="off" />
          <button id="talon-key-save" class="talon-key-save">Save key &amp; start</button>
          <p class="talon-setup-note">Your key is saved only on this device — never sent anywhere except Groq.</p>
        </div>

        <div id="talon-chat" class="talon-chat" ${hasKey ? '' : 'hidden'}>
          <div id="talon-msgs" class="talon-msgs">
            <div class="talon-msg talon-msg--ai">
              <p>What's up? Ask me anything — accounts, call list, pipeline — or tell me to take an action.</p>
            </div>
          </div>
          <div id="talon-dots" class="talon-dots" hidden>
            <span></span><span></span><span></span>
          </div>
          <div class="talon-chips" id="talon-chips">
            <button class="talon-chip" data-msg="What are my hot accounts right now?">Hot accounts</button>
            <button class="talon-chip" data-msg="Who should I call today?">Today's calls</button>
            <button class="talon-chip" data-msg="Give me a quick pipeline summary.">Pipeline</button>
          </div>
          <div class="talon-input-row">
            <input id="talon-input" class="talon-input" type="text" placeholder="Ask Talon…" autocomplete="off" />
            <button id="talon-send" class="talon-send">↑</button>
          </div>
        </div>

        <div id="talon-key-panel" class="talon-key-panel" hidden>
          <p class="talon-kp-title">Update Groq API key</p>
          <input id="talon-key-update" class="talon-key-input" type="password" placeholder="gsk_…" autocomplete="off" />
          <button id="talon-key-update-save" class="talon-key-save">Update key</button>
          <button id="talon-key-clear" class="talon-key-clear">Remove key</button>
        </div>
      </div>
    `;

    // ── Wire events ────────────────────────────────────────────────
    document.getElementById('talon-btn').addEventListener('click', togglePanel);
    document.getElementById('talon-close').addEventListener('click', togglePanel);

    document.getElementById('talon-settings').addEventListener('click', () => {
      const kp = document.getElementById('talon-key-panel');
      kp.hidden = !kp.hidden;
    });

    // Setup — save key on first run
    document.getElementById('talon-key-save').addEventListener('click', saveKey);
    document.getElementById('talon-key-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') saveKey();
    });

    // Settings panel — update / clear key
    document.getElementById('talon-key-update-save').addEventListener('click', () => {
      const v = document.getElementById('talon-key-update').value.trim();
      if (v) {
        localStorage.setItem(KEY_STORAGE, v);
        showChat();
        document.getElementById('talon-key-panel').hidden = true;
        document.getElementById('talon-key-update').value = '';
      }
    });
    document.getElementById('talon-key-clear').addEventListener('click', () => {
      localStorage.removeItem(KEY_STORAGE);
      document.getElementById('talon-key-panel').hidden = true;
      document.getElementById('talon-setup').hidden = false;
      document.getElementById('talon-chat').hidden = true;
    });

    // Send message
    document.getElementById('talon-send').addEventListener('click', doSend);
    document.getElementById('talon-input').addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) doSend();
    });

    // Quick chips
    document.getElementById('talon-chips').addEventListener('click', e => {
      const chip = e.target.closest('.talon-chip');
      if (chip?.dataset.msg && !thinking) {
        callGroq(chip.dataset.msg).catch(handleError);
      }
    });
  }

  function saveKey() {
    const v = document.getElementById('talon-key-input').value.trim();
    if (!v) return;
    localStorage.setItem(KEY_STORAGE, v);
    showChat();
  }

  function showChat() {
    document.getElementById('talon-setup').hidden = true;
    document.getElementById('talon-chat').hidden  = false;
    // Remove pulse from button once key is set
    const pulse = document.querySelector('#talon-btn .talon-pulse');
    if (pulse) pulse.remove();
    document.getElementById('talon-input')?.focus();
  }

  function doSend() {
    const input = document.getElementById('talon-input');
    const text  = input?.value?.trim();
    if (!text || thinking) return;
    if (input) input.value = '';
    callGroq(text).catch(handleError);
  }

  function handleError(err) {
    addMsg('ai', `⚠ ${err.message}`);
    setThinking(false);
  }

  function togglePanel() {
    isOpen = !isOpen;
    const panel = document.getElementById('talon-panel');
    if (panel) panel.hidden = !isOpen;
    if (isOpen && localStorage.getItem(KEY_STORAGE)) {
      document.getElementById('talon-input')?.focus();
    }
  }

  // Init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildUI);
  } else {
    buildUI();
  }
})();
