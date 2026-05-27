// ─────────────────────────────────────────────────────────────────
// GRIP — Contractor Portal Logic
// ─────────────────────────────────────────────────────────────────

(function () {

  const { createClient } = window.supabase;
  let db = null;
  let tokenRecord = null;
  let punchList = null;
  const itemPhotos = {}; // itemId -> array of base64 data URLs

  function qs(id) { return document.getElementById(id); }

  function escHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatDate(str) {
    if (!str) return "—";
    const d = new Date(str);
    if (isNaN(d.getTime())) return str;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function severityBadge(sev) {
    const critical = ["Warranty Critical", "Leak Risk", "Safety Issue"];
    const warning = ["Cosmetic"];
    const cls = critical.includes(sev) ? "badge-critical" : warning.includes(sev) ? "badge-warning" : "badge-normal";
    return `<span class="badge ${cls}">${escHtml(sev)}</span>`;
  }

  // ── Render ──────────────────────────────────────────────────────

  function renderItems(items) {
    const container = qs("itemsList");
    container.innerHTML = items.map((item) => {
      const photos = (item.original_photos || [])
        .filter((f) => String(f.file_type || "").startsWith("image/"))
        .slice(0, 4);

      return `
        <div class="punch-item" data-item-id="${escHtml(item.punch_item_id)}">
          <div class="item-header">
            <div>
              <div class="item-number">Item ${escHtml(String(item.item_number || ""))} — ${escHtml(item.category || "Punch Item")}</div>
              <div style="font-size:0.8rem;color:#555;margin-top:2px">${escHtml([item.roof_area, item.section, item.location].filter(Boolean).join(" | ") || "No location")}</div>
            </div>
            ${severityBadge(item.severity)}
          </div>

          <div class="item-detail">
            ${item.description ? `<p><strong>Issue:</strong> ${escHtml(item.description)}</p>` : ""}
            ${item.required_correction ? `<p><strong>Required Correction:</strong> ${escHtml(item.required_correction)}</p>` : ""}
            ${item.water_test_status && item.water_test_status !== "Not Required" ? `<p><strong>Verification Required:</strong> ${escHtml(item.water_test_status)}</p>` : ""}
          </div>

          ${photos.length ? `<div class="item-photos">${photos.map((f) => `<img src="${f.dataUrl || f.thumbnail_url}" alt="Before photo" />`).join("")}</div>` : ""}

          <div class="completion-section">
            <label for="notes_${escHtml(item.punch_item_id)}">Completion Notes *</label>
            <textarea
              id="notes_${escHtml(item.punch_item_id)}"
              data-item-notes="${escHtml(item.punch_item_id)}"
              placeholder="Describe the work performed to correct this item…"
              rows="3"
            ></textarea>

            <label style="margin-top:10px">After Photos</label>
            <label class="photo-upload-area" for="photo_${escHtml(item.punch_item_id)}">
              📷 Tap to take or upload after photos
              <input
                class="photo-input"
                type="file"
                id="photo_${escHtml(item.punch_item_id)}"
                accept="image/*"
                capture="environment"
                multiple
                data-item-photo="${escHtml(item.punch_item_id)}"
              />
            </label>
            <div class="photo-thumbs" id="thumbs_${escHtml(item.punch_item_id)}"></div>

            <div class="check-row">
              <input
                type="checkbox"
                id="done_${escHtml(item.punch_item_id)}"
                data-item-done="${escHtml(item.punch_item_id)}"
              />
              <label for="done_${escHtml(item.punch_item_id)}">
                I confirm this item has been corrected per Garland specifications
              </label>
            </div>
          </div>
        </div>`;
    }).join("");

    // Bind photo inputs
    container.querySelectorAll("[data-item-photo]").forEach((input) => {
      input.addEventListener("change", (e) => handlePhotoInput(e.target));
    });
  }

  function handlePhotoInput(input) {
    const itemId = input.dataset.itemPhoto;
    if (!itemPhotos[itemId]) itemPhotos[itemId] = [];
    const thumbContainer = qs(`thumbs_${itemId}`);
    [...input.files].forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        itemPhotos[itemId].push({ name: file.name, type: file.type, dataUrl: e.target.result });
        if (thumbContainer) {
          const img = document.createElement("img");
          img.src = e.target.result;
          img.alt = "After photo";
          thumbContainer.appendChild(img);
        }
      };
      reader.readAsDataURL(file);
    });
  }

  // ── Submit ──────────────────────────────────────────────────────

  async function handleSubmit() {
    const submitBtn = qs("submitButton");
    const progress = qs("submitProgress");

    // Collect item data
    const items = (punchList.items || []).map((item) => {
      const id = item.punch_item_id;
      const notes = qs(`notes_${id}`)?.value?.trim() || "";
      const done = qs(`done_${id}`)?.checked || false;
      const photos = itemPhotos[id] || [];
      return { item_id: id, item_number: item.item_number, completion_notes: notes, corrected: done, photos };
    });

    const overallNotes = qs("overallNotes")?.value?.trim() || "";

    // Validate at least one item has notes
    const hasAnyNotes = items.some((i) => i.completion_notes);
    if (!hasAnyNotes) {
      alert("Please add completion notes for at least one punch item before submitting.");
      return;
    }

    submitBtn.disabled = true;
    progress.style.display = "block";

    try {
      const { error } = await db
        .from("contractor_submissions")
        .insert({
          token: tokenRecord.token,
          punch_list_id: punchList.punch_list_id,
          items,
          contractor_name: tokenRecord.contractor_name || "",
          overall_notes: overallNotes,
        });

      if (error) throw error;

      qs("punchContent").hidden = true;
      qs("successState").hidden = false;
    } catch (err) {
      console.error("Submission error:", err);
      alert("Submission failed. Please check your connection and try again.");
      submitBtn.disabled = false;
      progress.style.display = "none";
    }
  }

  // ── Load ────────────────────────────────────────────────────────

  async function loadPortal() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    if (!token) {
      showError("No contractor token found in this URL. Contact your Garland rep.");
      return;
    }

    if (!window.GRIP_SUPABASE_URL || !window.GRIP_SUPABASE_URL.startsWith("https://")) {
      showError("GRIP is not yet configured for cloud sync. Contact your Garland rep.");
      return;
    }

    try {
      db = createClient(window.GRIP_SUPABASE_URL, window.GRIP_SUPABASE_ANON);

      const { data, error } = await db
        .from("contractor_tokens")
        .select("*")
        .eq("token", token)
        .single();

      if (error || !data) {
        showError("This link is invalid or has expired. Contact your Garland rep for a new link.");
        return;
      }

      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        showError("This contractor link has expired. Contact your Garland rep for a new link.");
        return;
      }

      tokenRecord = data;
      punchList = data.punch_list_snapshot;

      if (!punchList || !(punchList.items || []).length) {
        showError("No punch items found in this list. Contact your Garland rep.");
        return;
      }

      // Populate header
      qs("punchTitle").textContent = punchList.title || "Punch List";
      qs("punchProject").textContent = punchList.project_name || "—";
      qs("punchClient").textContent = punchList.client_name || "—";
      qs("punchContractor").textContent = punchList.assigned_contractor || "—";
      qs("punchDue").textContent = formatDate(punchList.due_date);

      renderItems(punchList.items);

      qs("loadingState").hidden = true;
      qs("punchContent").hidden = false;

      qs("submitButton").addEventListener("click", handleSubmit);

    } catch (err) {
      console.error("Portal load error:", err);
      showError("Could not load the punch list. Check your connection and try again.");
    }
  }

  function showError(msg) {
    qs("loadingState").hidden = true;
    qs("errorMessage").textContent = msg;
    qs("errorState").hidden = false;
  }

  document.addEventListener("DOMContentLoaded", loadPortal);

})();
