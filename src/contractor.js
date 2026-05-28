// ─────────────────────────────────────────────────────────────────
// GRIP — Contractor Portal Logic  (Fieldwire-style)
// ─────────────────────────────────────────────────────────────────

(function () {

  let db = null;
  let tokenRecord = null;
  let punchList = null;
  const itemPhotos = {}; // itemId -> [{name,type,dataUrl}]

  function qs(id) { return document.getElementById(id); }

  function escHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function formatDate(str) {
    if (!str) return "—";
    const d = new Date(str);
    if (isNaN(d.getTime())) return str;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function severityBadge(sev) {
    const critical = ["Warranty Critical", "Leak Risk", "Safety Issue"];
    const warning  = ["Cosmetic"];
    const cls = critical.includes(sev) ? "sev-critical"
              : warning.includes(sev)  ? "sev-warning"
              :                          "sev-normal";
    return `<span class="severity-badge ${cls}">${escHtml(sev)}</span>`;
  }

  // ── Helpers ──────────────────────────────────────────────────────

  function showError(msg, detail) {
    qs("loadingState").hidden   = true;
    qs("punchContent").hidden   = true;
    qs("successState").hidden   = true;
    const errEl = qs("errorMessage");
    if (errEl) errEl.textContent = msg;
    const detailEl = qs("errorDetail");
    if (detailEl) detailEl.textContent = detail || "";
    qs("errorState").hidden = false;
    console.error("GRIP contractor portal error:", msg, detail || "");
  }

  // ── Progress tracking ────────────────────────────────────────────

  function updateProgress() {
    const items = (punchList?.items || []);
    const total = items.length;
    const done  = items.filter((item) => qs(`done_${item.punch_item_id}`)?.checked).length;
    const pct   = total ? Math.round((done / total) * 100) : 0;

    const fill = qs("progressFill");
    const text = qs("progressText");
    if (fill) fill.style.width = `${pct}%`;
    if (text) text.textContent = `${done} of ${total} item${total === 1 ? "" : "s"} confirmed`;

    const circumference = 106.8;
    const ring  = qs("ringFill");
    const label = qs("ringLabel");
    if (ring)  ring.style.strokeDashoffset = String(circumference - (pct / 100) * circumference);
    if (label) label.textContent = `${pct}%`;

    items.forEach((item) => {
      const checked = qs(`done_${item.punch_item_id}`)?.checked;
      const card = document.querySelector(`[data-item-id="${item.punch_item_id}"]`);
      if (card) card.classList.toggle("is-done", Boolean(checked));
    });
  }

  // ── Lightbox ─────────────────────────────────────────────────────

  function openLightbox(src) {
    const lb  = qs("lightbox");
    const img = qs("lightboxImg");
    if (!lb || !img) return;
    img.src = src;
    lb.classList.add("is-open");
  }

  function closeLightbox() {
    const lb = qs("lightbox");
    if (lb) lb.classList.remove("is-open");
  }

  // ── Render items ─────────────────────────────────────────────────

  function renderItems(items) {
    const container = qs("itemsList");
    if (!items.length) {
      container.innerHTML = `<p style="color:var(--muted);text-align:center;padding:30px 0">No punch items found in this list.</p>`;
      return;
    }

    container.innerHTML = items.map((item, idx) => {
      const beforePhotos = (item.original_photos || [])
        .filter((f) => String(f.file_type || "").startsWith("image/"))
        .slice(0, 6);
      const iid = escHtml(item.punch_item_id);

      return `
      <div class="punch-item" data-item-id="${iid}">

        <div class="item-header">
          <div class="item-num">${escHtml(String(item.item_number || idx + 1))}</div>
          <div class="item-meta">
            <div class="item-category">${escHtml(item.category || "Punch Item")}</div>
            <div class="item-location">${escHtml([item.roof_area, item.section, item.location].filter(Boolean).join(" · ") || "No location specified")}</div>
          </div>
          ${severityBadge(item.severity)}
        </div>

        <div class="item-body">

          ${item.description ? `
          <div class="item-issue">
            <strong>Issue Identified</strong>
            ${escHtml(item.description)}
          </div>` : ""}

          ${item.required_correction ? `
          <div class="item-correction">
            <strong>Required Correction</strong>
            ${escHtml(item.required_correction)}
          </div>` : ""}

          ${item.water_test_status && item.water_test_status !== "Not Required" ? `
          <div class="item-water-test">
            <strong>⚠ Verification Required</strong>
            ${escHtml(item.water_test_status)}
          </div>` : ""}

          ${beforePhotos.length ? `
          <div>
            <div class="photo-strip-label">Before Photos</div>
            <div class="photo-strip">
              ${beforePhotos.map((f) => `<img class="photo-thumb" src="${escHtml(f.dataUrl || f.thumbnail_url || f.url || "")}" alt="Before photo" />`).join("")}
            </div>
          </div>` : ""}

          <hr class="completion-divider" />
          <div class="completion-label-row">
            <div class="completion-dot"></div>
            <span>Your Completion</span>
          </div>

          <label class="field-label" for="notes_${iid}">
            Completion Notes <span style="color:#dc2626">*</span>
          </label>
          <textarea
            id="notes_${iid}"
            data-item-notes="${iid}"
            placeholder="Describe the work performed to correct this item…"
            rows="3"
          ></textarea>

          <span class="field-label">After Photos</span>
          <label class="photo-upload-zone" for="photo_${iid}">
            <div class="upload-icon">📷</div>
            <p>Tap to take or upload after photos</p>
            <small>JPEG, PNG — multiple photos allowed</small>
            <input
              class="photo-input"
              type="file"
              id="photo_${iid}"
              accept="image/*"
              capture="environment"
              multiple
              data-item-photo="${iid}"
            />
          </label>
          <div class="photo-thumbs" id="thumbs_${iid}"></div>

          <div class="confirm-row">
            <input
              type="checkbox"
              id="done_${iid}"
              data-item-done="${iid}"
            />
            <label for="done_${iid}">
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

    // Bind checkboxes → live progress update
    container.querySelectorAll("[data-item-done]").forEach((cb) => {
      cb.addEventListener("change", updateProgress);
    });

    // Bind before-photo lightbox
    container.querySelectorAll(".photo-thumb").forEach((img) => {
      img.addEventListener("click", () => openLightbox(img.src));
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
          img.addEventListener("click", () => openLightbox(img.src));
          thumbContainer.appendChild(img);
        }
      };
      reader.readAsDataURL(file);
    });
  }

  // ── Submit ───────────────────────────────────────────────────────

  async function handleSubmit() {
    const submitBtn = qs("submitButton");
    const progress  = qs("submitProgress");

    const items = (punchList.items || []).map((item) => {
      const id     = item.punch_item_id;
      const notes  = qs(`notes_${id}`)?.value?.trim() || "";
      const done   = qs(`done_${id}`)?.checked || false;
      const photos = itemPhotos[id] || [];
      return { item_id: id, item_number: item.item_number, completion_notes: notes, corrected: done, photos };
    });

    const overallNotes = qs("overallNotes")?.value?.trim() || "";
    if (!items.some((i) => i.completion_notes)) {
      alert("Please add completion notes for at least one punch item before submitting.");
      return;
    }

    submitBtn.disabled = true;
    if (progress) progress.style.display = "block";

    try {
      const { error } = await db.from("contractor_submissions").insert({
        token:           tokenRecord.token,
        punch_list_id:   punchList.punch_list_id,
        items,
        contractor_name: tokenRecord.contractor_name || "",
        overall_notes:   overallNotes,
      });
      if (error) throw error;

      qs("punchContent").hidden = true;
      qs("submitArea").hidden   = true;
      qs("successState").hidden = false;
    } catch (err) {
      console.error("Submission error:", err);
      alert(`Submission failed: ${err.message || "Check your connection and try again."}`);
      submitBtn.disabled = false;
      if (progress) progress.style.display = "none";
    }
  }

  // ── Load ─────────────────────────────────────────────────────────

  async function loadPortal() {
    const params = new URLSearchParams(window.location.search);
    const token  = params.get("token");

    if (!token) {
      showError("No contractor token found in this URL.", "Contact your Garland rep for a valid link.");
      return;
    }

    // Guard: Supabase SDK must be loaded
    if (!window.supabase?.createClient) {
      showError(
        "Supabase SDK failed to load.",
        "Check your internet connection and reload the page."
      );
      return;
    }

    // Guard: Supabase config must be present
    if (!window.GRIP_SUPABASE_URL || !window.GRIP_SUPABASE_URL.startsWith("https://")) {
      showError(
        "GRIP cloud sync is not configured.",
        "Contact your Garland rep — this contractor portal requires a Supabase connection."
      );
      return;
    }

    try {
      // Create the Supabase client here (not at module scope) so any errors are caught
      db = window.supabase.createClient(window.GRIP_SUPABASE_URL, window.GRIP_SUPABASE_ANON);

      const { data, error } = await db
        .from("contractor_tokens")
        .select("*")
        .eq("token", token)
        .single();

      if (error) {
        showError(
          "Could not load this punch list.",
          `Database error: ${error.message || error.code || "unknown"}`
        );
        return;
      }

      if (!data) {
        showError(
          "This link is invalid or has expired.",
          "Contact your Garland rep for a new link."
        );
        return;
      }

      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        showError(
          "This contractor link has expired.",
          "Contact your Garland rep for a refreshed link."
        );
        return;
      }

      tokenRecord = data;
      punchList   = data.punch_list_snapshot;

      if (!punchList || !(punchList.items || []).length) {
        showError(
          "No punch items found in this list.",
          "The rep may need to add items and re-generate the link."
        );
        return;
      }

      const itemCount = punchList.items.length;

      qs("headerTitle").textContent      = punchList.title || "Punch List";
      qs("punchTitle").textContent       = punchList.title || "Punch List";
      qs("punchStatusBadge").textContent = punchList.status || "Sent to Contractor";
      qs("punchProject").textContent     = punchList.project_name || "—";
      qs("punchClient").textContent      = punchList.client_name  || "—";
      qs("punchContractor").textContent  = punchList.assigned_contractor || "—";
      qs("punchDue").textContent         = formatDate(punchList.due_date);
      qs("itemsCountLabel").textContent  = `${itemCount} Punch Item${itemCount === 1 ? "" : "s"}`;

      qs("progressRingWrap").hidden = false;

      renderItems(punchList.items);
      updateProgress();

      qs("loadingState").hidden = true;
      qs("punchContent").hidden = false;
      qs("submitArea").hidden   = false;

      qs("submitButton").addEventListener("click", handleSubmit);

    } catch (err) {
      console.error("Portal load error:", err);
      showError(
        "Could not load the punch list.",
        `${err.message || "Check your connection and try again."}`
      );
    }
  }

  // ── Init ─────────────────────────────────────────────────────────

  document.addEventListener("DOMContentLoaded", () => {
    loadPortal();

    qs("lightboxClose")?.addEventListener("click", closeLightbox);
    qs("lightbox")?.addEventListener("click", (e) => {
      if (e.target === qs("lightbox")) closeLightbox();
    });
  });

})();
