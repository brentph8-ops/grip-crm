// ─────────────────────────────────────────────────────────────────
// GRIP Edge Function — notify-submission
// Triggered by a Supabase Database Webhook whenever a contractor
// submits a punch list response. Sends an email via Resend.
//
// Deploy: Supabase Dashboard → Edge Functions → New function → paste this
// Set secret: RESEND_API_KEY = your Resend API key (resend.com, free)
// Set secret: NOTIFY_EMAIL   = bphillips@garlandco.com
// ─────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req: Request) => {
  try {
    const body = await req.json();

    // Supabase webhook payload: { type, table, record, old_record }
    const record = body?.record;
    if (!record) return new Response("No record", { status: 200 });

    const contractorName = record.contractor_name || "Unknown contractor";
    const punchListId    = record.punch_list_id   || "";
    const submittedAt    = record.submitted_at
      ? new Date(record.submitted_at).toLocaleString("en-US", { timeZone: "America/Chicago" })
      : "just now";
    const overallNotes = record.overall_notes || "No overall notes";
    const items: Array<{ item_number?: number; completion_note?: string; resolved?: boolean }> =
      record.items || [];

    const itemRows = items.map((item) =>
      `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #eee">#${item.item_number ?? "?"}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee">${item.resolved ? "✅ Done" : "⬜ Not resolved"}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee">${item.completion_note || "—"}</td>
      </tr>`
    ).join("");

    const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#e8600a;padding:20px 24px;border-radius:8px 8px 0 0">
        <h1 style="color:#fff;margin:0;font-size:1.4rem">🔔 GRIP — Contractor Submission</h1>
      </div>
      <div style="background:#fff;padding:24px;border:1px solid #eee;border-top:none;border-radius:0 0 8px 8px">
        <p><strong>${contractorName}</strong> submitted a punch list response.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr style="background:#f5f5f5">
            <th style="padding:8px 10px;text-align:left">Item</th>
            <th style="padding:8px 10px;text-align:left">Status</th>
            <th style="padding:8px 10px;text-align:left">Note</th>
          </tr>
          ${itemRows || '<tr><td colspan="3" style="padding:10px">No items reported.</td></tr>'}
        </table>
        <p><strong>Overall notes:</strong> ${overallNotes}</p>
        <p style="color:#888;font-size:0.85rem">Submitted ${submittedAt} · Punch list: ${punchListId}</p>
        <a href="https://brentph8-ops.github.io/grip-crm/" style="display:inline-block;margin-top:16px;background:#e8600a;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600">Open GRIP →</a>
      </div>
    </div>`;

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
    const NOTIFY_EMAIL   = Deno.env.get("NOTIFY_EMAIL")   ?? "bphillips@garlandco.com";

    if (!RESEND_API_KEY) {
      console.warn("RESEND_API_KEY not set — skipping email");
      return new Response("No API key", { status: 200 });
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from:    "GRIP Notifications <onboarding@resend.dev>",
        to:      [NOTIFY_EMAIL],
        subject: `Contractor submission from ${contractorName}`,
        html,
      }),
    });

    const data = await res.json();
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" },
      status: res.ok ? 200 : 500,
    });
  } catch (err) {
    console.error("notify-submission error:", err);
    return new Response(String(err), { status: 500 });
  }
});
