// ─────────────────────────────────────────────────────────────────
// GRIP Edge Function — assistant-ai
// AI Chief of Staff + all specialized agents
// ─────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are the AI Chief of Staff for Brent Phillips, Territory Manager for The Garland Company — a commercial roofing manufacturer based in Cynthiana, Kentucky.

Brent's responsibilities: prospecting school districts, universities, cities, counties, and commercial accounts in Texas. Selling roofing systems, asset management programs, and OMNIA cooperative purchasing contracts. Managing contractor relationships, proposals, and project development.

You act as a world-class executive assistant, sales researcher, business analyst, and roofing consultant.

Always optimize for:
1. Revenue generation
2. Relationship building
3. Time savings
4. Professional communication (Chris Voss style — never pushy, always curious)
5. Follow-up discipline
6. Opportunity identification

Key context:
- Garland sells through OMNIA Partners cooperative purchasing (eliminates bid process for public entities)
- Key architects in territory: PBK, Parkhill, Stantec, Corgan, Jacobs
- Key consultants: Terracon, Alpha Testing
- Garland differentiators: asset management program, OMNIA contract, long-term warranties, Texas-based support
- Target contacts: Facilities Directors, Construction Managers, CFOs, Superintendents`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not set" }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const body = await req.json();
  const { action, messages, accountMemory } = body;

  // Append account memory to system prompt if provided
  const systemPromptWithMemory = accountMemory
    ? `${SYSTEM_PROMPT}\n\n── ACCOUNT MEMORY (what Brent has learned about this account) ──\n${accountMemory}\n\nUse this memory to personalize every response. Reference it naturally.`
    : SYSTEM_PROMPT;

  let prompt = "";
  let useMessages = false;

  // ── CHIEF OF STAFF CHAT ──────────────────────────────────────────
  if (action === "chat") {
    useMessages = true;

  // ── CUSTOMER INTELLIGENCE REPORT ────────────────────────────────
  } else if (action === "research") {
    const { accountName, pastedContent } = body;
    prompt = `You are the Prospect Research Agent. Analyze the following content about ${accountName} and produce a structured Customer Intelligence Report.

PASTED CONTENT:
${pastedContent}

Produce a Customer Intelligence Report in this exact format:

# Customer Intelligence Report

**Account:** ${accountName}

## Key People
List every person mentioned with their title and any relevant details.

## Facilities & Infrastructure
What facilities, buildings, campuses do they have? Any roofing mentions?

## Current Initiatives & Projects
Bond programs, capital projects, modernization efforts, construction activity.

## Pain Points & Opportunities
Leaks, aging roofs, deferred maintenance, budget concerns, compliance issues.

## Funding Sources
Bond funds, ESSER, FEMA, insurance, capital budget, OMNIA eligibility.

## Architect & Consultant Relationships
Any architects or consultants mentioned.

## Recommended Approach
Based on the research, what is the best entry point? OMNIA pitch, asset management, specific building?

## Suggested Questions to Ask
5 smart discovery questions for the first meeting.

## Opportunity Level
Rate: 🔴 Hot / 🟡 Warm / 🔵 Cold — and explain why in one sentence.`;

  // ── APPOINTMENT GENERATOR ────────────────────────────────────────
  } else if (action === "outreach") {
    const { accountName, contactName, contactTitle, context, outreachType } = body;
    const types: Record<string, string> = {
      email: "a cold outreach email",
      linkedin: "a LinkedIn connection message",
      call: "a phone call script",
      followup: "a follow-up email after no response",
      thankyou: "a thank-you email after a meeting",
    };
    prompt = `You are the Appointment Generator Agent for Brent Phillips at Garland Company.

Write ${types[outreachType] || "an outreach email"} to ${contactName}, ${contactTitle} at ${accountName}.

Context / Research Notes:
${context}

Guidelines:
- Chris Voss style: never pushy, lead with curiosity, make them feel heard
- Subject line must create curiosity without being clickbait
- Body: 3–4 short paragraphs max
- End with ONE easy yes/no question (not "let me know your thoughts")
- Sign as: Brent Phillips | The Garland Company | Territory Manager
- Reference OMNIA purchasing if they are a public entity (removes bid requirement)
- Never use: "I hope this email finds you well", "synergy", "circle back", "touch base"

${outreachType === "call" ? "Format as a call script with: Opening, Bridge, Discovery Question, If Yes path, If No path, Voicemail script." : ""}
${outreachType === "linkedin" ? "LinkedIn message must be under 300 characters for connection request, then a follow-up message after connecting." : ""}`;

  // ── MEETING PREP ─────────────────────────────────────────────────
  } else if (action === "meeting_prep") {
    const { accountName, contactNames, meetingType, gripNotes, pastedContent } = body;
    prompt = `You are the Meeting Prep Agent. Brent has a ${meetingType || "meeting"} with ${accountName} (${contactNames}).

GRIP Notes / History:
${gripNotes || "None provided"}

Additional Research / Context:
${pastedContent || "None provided"}

Produce a Meeting Briefing Package:

# Meeting Briefing Package
**Account:** ${accountName}
**Contacts:** ${contactNames}
**Meeting Type:** ${meetingType}

## Relationship Summary
What do we know about this account and these people?

## Current Situation
Where are they in their buying journey? What's the context?

## Our Objectives for This Meeting
3 specific outcomes Brent should aim to achieve.

## Smart Questions to Ask
7 discovery/relationship questions — mix of business and personal.

## Likely Objections & Responses
Top 3 objections and how to handle them using Chris Voss techniques.

## Value Propositions to Highlight
Which Garland differentiators are most relevant for this account.

## Cross-Sell Opportunities
Any adjacent products or services worth mentioning.

## Relationship Notes
Any personal details to reference (kids, sports teams, previous conversations).

## Suggested Next Step
The single best next action to propose at the end of the meeting.`;

  // ── OPPORTUNITY SCORING ──────────────────────────────────────────
  } else if (action === "score") {
    const { accountName, factors } = body;
    prompt = `You are the Opportunity Scoring Agent. Score this account for Garland Company.

Account: ${accountName}

Known Information:
${factors}

Score each factor (0–20 points each) and produce a final score out of 100:

| Factor | Points | Notes |
|--------|--------|-------|
| Roof age / condition | /20 | |
| Recent leaks or damage | /20 | |
| Bond money / capital funding available | /20 | |
| Architect / consultant relationship | /15 | |
| Existing Garland roof on site | /15 | |
| OMNIA eligible (public entity) | /10 | |

**Total: /100**

**Priority:** 🔴 HIGH (75+) / 🟡 MEDIUM (50-74) / 🔵 LOW (<50)

**Top 3 Reasons This Account is Worth Pursuing:**
1.
2.
3.

**Suggested Next Step:**
One specific action Brent should take this week.`;

  // ── SCHEDULE SUGGESTIONS ─────────────────────────────────────────
  } else if (action === "schedule") {
    const { client, availability, existingMeetings, meetingType } = body;
    const availStr = availability?.length
      ? availability.map((a: { day: string; start: string; end: string }) => `${a.day}: ${a.start}–${a.end}`).join(", ")
      : "Mon–Fri 8am–5pm";
    prompt = `Suggest the 5 best meeting times for a ${meetingType} with ${client.name} at ${client.company}.

Client timezone: ${client.timezone || "America/Chicago"}
Priority: ${client.priority || "warm"}
Your availability: ${availStr}
Already booked: ${existingMeetings?.map((m: { start: string; name: string }) => `${m.start} (${m.name})`).join(", ") || "None"}
Today: ${new Date().toISOString()}

Return a JSON array with 5 options: [{ "dateTime": "ISO string", "duration": minutes, "label": "human readable", "reason": "why this slot" }]
Return ONLY the JSON array.`;

  // ── PROSPECT FINDER ──────────────────────────────────────────────
  } else if (action === "prospects") {
    const { accounts, searchQuery } = body;
    const accountSummary = accounts?.length
      ? accounts.slice(0, 30).map((a: { client?: string; name?: string; type?: string; city?: string; state?: string }) =>
          `${a.client || a.name || "Unknown"} (${a.type || "unknown"}, ${a.city || ""} ${a.state || ""})`.trim()
        ).join("\n")
      : "No existing accounts.";
    prompt = searchQuery
      ? `Find 8 high-potential B2B prospects in Texas matching: "${searchQuery}" for Garland Company commercial roofing.

For each: company name, type (ISD/university/city/commercial), why they're a fit, estimated deal size, decision maker title, suggested opening approach.

Return JSON array: [{ "company": "", "industry": "", "reason": "", "estimatedDealSize": "", "contactTitle": "", "meetingType": "", "website": "" }]
Return ONLY the JSON array.`
      : `Analyze these existing Garland accounts and find 8 new similar prospects in Texas:

${accountSummary}

Return JSON array: [{ "company": "", "industry": "", "reason": "", "estimatedDealSize": "", "contactTitle": "", "meetingType": "", "website": "" }]
Return ONLY the JSON array.`;

  // ── VOICE DEBRIEF ────────────────────────────────────────────────
  } else if (action === "voice_debrief") {
    const { transcript, accountName } = body;
    prompt = `You are Brent's AI field assistant. He just finished a meeting with ${accountName} and recorded this voice debrief:

"${transcript}"

Extract and format a structured meeting note:

**Meeting Note — ${accountName}**
Date: ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}

**What happened:**
2-3 sentences summarizing the meeting.

**Key things they said / care about:**
Bullet list of direct intel — pain points, priorities, what resonated.

**Next steps:**
Numbered list of specific actions Brent needs to take, with suggested timing.

**Things to remember about this account:**
2-3 short facts worth storing as permanent memory about this account or contact (personality, preferences, context).

**Opportunity level after this meeting:** 🔴 Hot / 🟡 Warm / 🔵 Cold — one sentence why.`;

  // ── FOLLOW-UP SEQUENCE ───────────────────────────────────────────
  } else if (action === "followup_sequence") {
    const { accountName, contactName, contactTitle, originalEmail, daysOut } = body;
    prompt = `You are the Appointment Generator Agent. Brent sent an initial outreach email to ${contactName} (${contactTitle}) at ${accountName}. They haven't responded.

Original email:
${originalEmail}

Write follow-up email #${daysOut === 3 ? "2" : "3"} to send ${daysOut} days after the original.

Rules:
- Reference the original email subtly but don't copy it
- Chris Voss style — short, curious, zero pressure
- Follow-up #2 (day 3): Add one new piece of value or insight specific to their situation
- Follow-up #3 (day 7): The "permission to close the loop" — give them an easy out while leaving door open
- 3 paragraphs max, punchy subject line
- Sign as: Brent Phillips | The Garland Company | Territory Manager
- Never say: "just checking in", "following up", "circle back", "touch base"

Output format:
Subject: [subject line]

[email body]`;

  // ── WEB SEARCH ───────────────────────────────────────────────────
  } else if (action === "web_search") {
    const { accountName } = body;
    const SERPER_KEY = Deno.env.get("SERPER_API_KEY");
    if (!SERPER_KEY) {
      return new Response(JSON.stringify({ error: "SERPER_API_KEY not set — add it in Supabase Edge Function secrets" }), {
        status: 500, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
    const queries = [
      `${accountName} Texas roofing facilities bond program`,
      `${accountName} Texas capital improvement construction 2024 2025`,
      `${accountName} Texas news superintendent facilities director`,
    ];
    const results: string[] = [];
    await Promise.allSettled(queries.map(async (q) => {
      try {
        const r = await fetch("https://google.serper.dev/search", {
          method: "POST",
          headers: { "X-API-KEY": SERPER_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ q, num: 5 }),
        });
        const d = await r.json();
        const snippets = (d.organic || []).map((item: { title: string; snippet: string; link: string }) =>
          `Source: ${item.title}\n${item.snippet}\nURL: ${item.link}`
        ).join("\n\n");
        if (snippets) results.push(snippets);
      } catch { /* skip failed query, return partial results */ }
    }));
    const combined = results.join("\n\n---\n\n") || "No results found.";
    return new Response(JSON.stringify({ result: combined }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  // ── TERRITORY ANALYSIS ───────────────────────────────────────────
  } else if (action === "territory_analysis") {
    const { counties, summary } = body;
    prompt = `You are Brent's Territory Intelligence Agent. Analyze his Texas territory data:

${summary}

Produce a Territory Gap Analysis:

## Territory Health Summary
Overall assessment in 2 sentences.

## Hot Zones (most active, most opportunity)
Top 3 counties/areas — what's working and why.

## Cold Zones (needs attention)
3+ counties with stale or no activity — specific recommendations for each.

## Biggest Untapped Opportunities
Based on the data, where should Brent focus the next 30 days? Be specific — name account types, districts, or cities.

## Recommended Weekly Routing
Suggest how to structure a week of territory coverage to maximize coverage and momentum.

## One Bold Move
The single highest-leverage action Brent could take this month that he's probably not doing.`;

  } else {
    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  // ── Call Anthropic ───────────────────────────────────────────────
  // System prompt passed as array block to enable prompt caching
  const systemBlock = [{ type: "text", text: systemPromptWithMemory, cache_control: { type: "ephemeral" } }];
  const requestBody = useMessages
    ? {
        model: "claude-sonnet-4-6",
        max_tokens: 3000,
        system: systemBlock,
        messages: messages,
      }
    : {
        model: "claude-sonnet-4-6",
        max_tokens: 3000,
        system: systemBlock,
        messages: [{ role: "user", content: prompt }],
      };

  const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "prompt-caching-2024-07-31",
      "content-type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  const data = await anthropicRes.json();
  const text = data?.content?.[0]?.text || "";

  // For JSON-returning actions, parse the array
  if (["schedule", "prospects"].includes(action)) {
    try {
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      const result = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
      return new Response(JSON.stringify({ result }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    } catch {
      return new Response(JSON.stringify({ error: "Failed to parse AI response", raw: text }), {
        status: 500, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
  }

  return new Response(JSON.stringify({ result: text }), {
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});
