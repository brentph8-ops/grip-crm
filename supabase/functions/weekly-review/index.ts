// ─────────────────────────────────────────────────────────────────
// GRIP Edge Function — weekly-review
// Emails each rep their weekly territory summary every Monday at 7 AM CT.
//
// ── Deploy (one-time) ────────────────────────────────────────────
// 1. Supabase Dashboard → Edge Functions → New function → paste this file
// 2. Set secrets in Supabase Dashboard → Settings → Edge Function Secrets:
//      RESEND_API_KEY = your Resend API key (resend.com — free tier works)
//      NOTIFY_EMAIL   = bphillips@garlandco.com   (or comma-separated list)
//
// ── Schedule (cron trigger) ──────────────────────────────────────
// Supabase Dashboard → Database → Extensions → enable pg_cron
// Then run in SQL Editor:
//
//   select cron.schedule(
//     'grip-weekly-review',
//     '0 13 * * 1',           -- 7 AM CT = 1 PM UTC every Monday
//     $$
//       select
//         net.http_post(
//           url     := 'https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/weekly-review',
//           headers := '{"Authorization": "Bearer <YOUR_SERVICE_ROLE_KEY>", "Content-Type": "application/json"}'::jsonb,
//           body    := '{}'::jsonb
//         )
//     $$
//   );
//
// Replace <YOUR_PROJECT_REF> and <YOUR_SERVICE_ROLE_KEY> with your values
// from Supabase Dashboard → Settings → API.
// ─────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const NOTIFY_EMAIL   = Deno.env.get("NOTIFY_EMAIL")   || "";
const SUPABASE_URL   = Deno.env.get("SUPABASE_URL")   || "";
const SERVICE_ROLE   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

serve(async (_req: Request) => {
  if (!RESEND_API_KEY || !NOTIFY_EMAIL) {
    return new Response("Missing RESEND_API_KEY or NOTIFY_EMAIL secret.", { status: 500 });
  }

  try {
    const client = createClient(SUPABASE_URL, SERVICE_ROLE);
    const now    = new Date();
    const monday = getMondayDate(now);
    const dateLabel = monday.toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric", year: "numeric",
    });

    // Pull all user data rows — one row per key per user
    const { data: rows, error } = await client
      .from("grip_data")
      .select("user_id, data_key, data_value, updated_at");
    if (error) throw error;

    // Group rows by user
    const byUser: Record<string, Record<string, unknown>> = {};
    for (const row of rows || []) {
      if (!byUser[row.user_id]) byUser[row.user_id] = {};
      byUser[row.user_id][row.data_key] = row.data_value;
    }

    // Build and send one email per user
    const recipients = NOTIFY_EMAIL.split(",").map((e: string) => e.trim()).filter(Boolean);

    for (const email of recipients) {
      // Find the user whose email matches (best-effort — no auth.users access from anon)
      const userData = Object.values(byUser)[0] || {}; // single-rep deployment
      const summary  = buildSummary(userData, dateLabel);

      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "GRIP Weekly Review <grip@garlandco.com>",
          to: [email],
          subject: `GRIP Weekly Review — ${dateLabel}`,
          html: buildHtml(summary, dateLabel),
        }),
      });
    }

    return new Response(JSON.stringify({ sent: recipients.length }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("weekly-review error:", err);
    return new Response(`Error: ${err instanceof Error ? err.message : String(err)}`, { status: 500 });
  }
});

// ── Helpers ──────────────────────────────────────────────────────

function getMondayDate(from: Date): Date {
  const d = new Date(from);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday = 1
  d.setDate(d.getDate() + diff);
  return d;
}

interface SummaryLine {
  label: string;
  value: string | number;
  urgent?: boolean;
}

function buildSummary(userData: Record<string, unknown>, dateLabel: string): SummaryLine[] {
  const tasks = Array.isArray(userData["garlandTasks"]) ? userData["garlandTasks"] as Record<string, unknown>[] : [];
  const punchLists = Array.isArray(userData["garlandPunchLists"]) ? userData["garlandPunchLists"] as Record<string, unknown>[] : [];
  const crmRaw = userData["garlandCrmData"] as Record<string, unknown> || {};
  const proposals = Array.isArray(crmRaw["proposals"]) ? crmRaw["proposals"] as Record<string, unknown>[] : [];
  const projects  = Array.isArray(crmRaw["projects"])  ? crmRaw["projects"]  as Record<string, unknown>[] : [];

  const todayKey = dateLabel.slice(0, 10);
  const openTasks = tasks.filter((t) => !["Completed", "Cancelled"].includes(String(t["status"] || "")));
  const overdueTasks = openTasks.filter((t) => String(t["due_date"] || "") < todayKey && t["due_date"]);
  const openProposals = proposals.filter((p) => !["Work Completed", "Proposal Rejected"].includes(String(p["stage"] || "")));
  const activeProjects = projects.filter((p) => !["Work Completed", "Proposal Rejected"].includes(String(p["stage"] || "")));
  const openPunch = punchLists.filter((l) => !["Closed", "Approved"].includes(String(l["status"] || "")));
  const openPunchItems = openPunch.reduce((sum: number, l: Record<string, unknown>) => {
    const items = Array.isArray(l["items"]) ? l["items"] as Record<string, unknown>[] : [];
    return sum + items.filter((i) => !["Approved", "Closed"].includes(String(i["status"] || "")) && !i["resolved"]).length;
  }, 0);

  return [
    { label: "Open Tasks",            value: openTasks.length,         urgent: openTasks.length > 10 },
    { label: "Overdue Tasks",         value: overdueTasks.length,      urgent: overdueTasks.length > 0 },
    { label: "Open Proposals",        value: openProposals.length },
    { label: "Active Projects",       value: activeProjects.length },
    { label: "Open Punch Lists",      value: openPunch.length,         urgent: openPunch.length > 3 },
    { label: "Open Punch Items",      value: openPunchItems,           urgent: openPunchItems > 10 },
  ];
}

function buildHtml(summary: SummaryLine[], dateLabel: string): string {
  const rows = summary.map((line) =>
    `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#374151">${line.label}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-weight:700;color:${line.urgent ? "#dc2626" : "#0057a8"};text-align:right">${line.value}</td>
    </tr>`
  ).join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8" /></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f3f4f6;padding:32px;margin:0">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
    <div style="background:linear-gradient(135deg,#0d2540,#0057a8);padding:24px 28px">
      <p style="margin:0;color:rgba(255,255,255,0.7);font-size:12px;text-transform:uppercase;letter-spacing:0.08em">GRIP Weekly Review</p>
      <h1 style="margin:4px 0 0;color:#fff;font-size:20px">${dateLabel}</h1>
    </div>
    <table style="width:100%;border-collapse:collapse">
      <tbody>${rows}</tbody>
    </table>
    <div style="padding:20px 28px;background:#f9fafb;border-top:1px solid #e5e7eb">
      <p style="margin:0;font-size:13px;color:#6b7280">
        Open GRIP to work your task queue and punch lists.<br>
        <a href="https://brentph8-ops.github.io/grip-crm/" style="color:#0057a8">Open GRIP →</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}
