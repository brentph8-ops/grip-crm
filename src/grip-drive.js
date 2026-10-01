// ─────────────────────────────────────────────────────────────────
// GRIP — Google Drive Integration
// Saves files per account into GRIP/Accounts/{name}/ in Google Drive.
// Token is captured from the Supabase Google OAuth provider_token.
// ─────────────────────────────────────────────────────────────────

(function () {

  const TOKEN_KEY   = 'grip_drive_token';
  const EXP_KEY     = 'grip_drive_token_exp';
  const FOLDER_KEY  = 'grip_drive_folders';
  const API_BASE    = 'https://www.googleapis.com/drive/v3';
  const UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

  // ── Token management ─────────────────────────────────────────────

  function saveToken(token, expiresIn) {
    if (!token) return;
    try {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(EXP_KEY, String(Date.now() + (expiresIn || 3500) * 1000));
    } catch (_) {}
  }

  function getToken() {
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      const exp   = Number(localStorage.getItem(EXP_KEY) || 0);
      if (!token || Date.now() > exp - 60_000) return null;
      return token;
    } catch (_) {
      return null;
    }
  }

  function clearToken() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(EXP_KEY);
      localStorage.removeItem(FOLDER_KEY);
    } catch (_) {}
  }

  // ── Drive API helpers ────────────────────────────────────────────

  async function driveGet(path, token) {
    const resp = await fetch(`${API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (resp.status === 401) throw Object.assign(new Error('Drive token expired'), { code: 401 });
    if (!resp.ok) throw new Error(`Drive error ${resp.status}`);
    return resp.json();
  }

  async function drivePost(path, body, token) {
    const resp = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (resp.status === 401) throw Object.assign(new Error('Drive token expired'), { code: 401 });
    if (!resp.ok) throw new Error(`Drive create error ${resp.status}`);
    return resp.json();
  }

  async function ensureFolder(token, name, parentId = null) {
    let q = `name='${name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    if (parentId) q += ` and '${parentId}' in parents`;

    const { files } = await driveGet(
      `/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=5`,
      token
    );
    if (files?.length) return files[0].id;

    const body = { name, mimeType: 'application/vnd.google-apps.folder' };
    if (parentId) body.parents = [parentId];
    const created = await drivePost('/files', body, token);
    return created.id;
  }

  async function getAccountFolderId(token, accountName) {
    let cache = {};
    try { cache = JSON.parse(localStorage.getItem(FOLDER_KEY) || '{}'); } catch (_) {}
    if (cache[accountName]) return cache[accountName];

    const rootId     = await ensureFolder(token, 'GRIP');
    const accountsId = await ensureFolder(token, 'Accounts', rootId);
    const acctId     = await ensureFolder(token, accountName, accountsId);

    cache[accountName] = acctId;
    try { localStorage.setItem(FOLDER_KEY, JSON.stringify(cache)); } catch (_) {}
    return acctId;
  }

  // ── File icon helper ─────────────────────────────────────────────

  function mimeIcon(mimeType = '') {
    if (mimeType.includes('pdf'))          return '📄';
    if (mimeType.includes('image'))        return '🖼';
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('csv')) return '📊';
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return '📊';
    if (mimeType.includes('document') || mimeType.includes('word')) return '📝';
    if (mimeType.includes('video'))        return '🎥';
    if (mimeType.includes('audio'))        return '🎵';
    if (mimeType.includes('zip') || mimeType.includes('archive')) return '🗜';
    return '📎';
  }

  // ── Public API ───────────────────────────────────────────────────

  window.GripDrive = {

    saveToken,
    getToken,
    clearToken,

    isConnected() {
      return !!getToken();
    },

    async uploadFile(file, accountName) {
      const token = getToken();
      if (!token) throw Object.assign(new Error('Not connected'), { code: 401 });
      const folderId = await getAccountFolderId(token, accountName);
      const metadata = { name: file.name, parents: [folderId] };
      const form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
      form.append('file', file);
      const resp = await fetch(
        `${UPLOAD_BASE}/files?uploadType=multipart&fields=id,name,webViewLink,mimeType`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form }
      );
      if (resp.status === 401) throw Object.assign(new Error('Drive token expired'), { code: 401 });
      if (!resp.ok) throw new Error(`Upload failed: ${resp.status}`);
      return resp.json();
    },

    async listFiles(accountName) {
      const token = getToken();
      if (!token) return null; // null means "not connected"
      try {
        const folderId = await getAccountFolderId(token, accountName);
        const { files } = await driveGet(
          `/files?q=${encodeURIComponent(`'${folderId}' in parents and trashed=false`)}&fields=files(id,name,mimeType,webViewLink,modifiedTime)&orderBy=name`,
          token
        );
        return files || [];
      } catch (err) {
        if (err.code === 401) { clearToken(); return null; }
        return [];
      }
    },

    async deleteFile(fileId) {
      const token = getToken();
      if (!token) throw Object.assign(new Error('Not connected'), { code: 401 });
      const resp = await fetch(`${API_BASE}/files/${fileId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (resp.status === 401) { clearToken(); throw Object.assign(new Error('Token expired'), { code: 401 }); }
    },

    // Build the Drive section HTML (call before inserting into DOM)
    renderSection(accountId, accountName) {
      const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
      const connected = this.isConnected();
      return `<section class="detail-section drive-section" id="drive-section-${esc(accountId)}">
        <div class="drive-section-header">
          <h4>Drive Files</h4>
          ${connected ? `<a class="drive-open-folder" href="https://drive.google.com/drive/search?q=GRIP" target="_blank" rel="noopener">Open in Drive ↗</a>` : ''}
        </div>
        ${connected ? `
          <div class="drive-file-list" id="drive-files-${esc(accountId)}">
            <p class="empty-state">Loading…</p>
          </div>
          <div class="drive-upload-row">
            <label class="mini-button drive-upload-label">
              + Upload
              <input type="file" multiple style="display:none"
                data-drive-upload-account="${esc(accountId)}"
                data-drive-upload-name="${esc(accountName)}">
            </label>
          </div>
        ` : `
          <p class="empty-state">Connect Google Drive to save files per account.</p>
          <button class="mini-button" id="drive-connect-btn" onclick="window.gripSync.signInWithGoogle()">Connect Google Drive</button>
        `}
      </section>`;
    },

    // Populate the file list container for a given account
    async refreshFileList(accountId, accountName) {
      const el = document.getElementById(`drive-files-${accountId}`);
      if (!el) return;
      el.innerHTML = '<p class="empty-state">Loading…</p>';
      const files = await this.listFiles(accountName);
      if (files === null) {
        el.innerHTML = `<p class="empty-state">Drive disconnected. <button class="mini-button" onclick="window.gripSync.signInWithGoogle()">Reconnect</button></p>`;
        return;
      }
      if (!files.length) {
        el.innerHTML = `<p class="empty-state">No files yet.</p>`;
        return;
      }
      const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
      el.innerHTML = files.map(f => {
        const date = f.modifiedTime ? new Date(f.modifiedTime).toLocaleDateString() : '';
        return `<div class="drive-file-row">
          <span class="drive-file-icon">${mimeIcon(f.mimeType)}</span>
          <a class="drive-file-name" href="${esc(f.webViewLink || '#')}" target="_blank" rel="noopener">${esc(f.name)}</a>
          <span class="drive-file-date">${esc(date)}</span>
          <button class="drive-file-delete"
            data-drive-delete-id="${esc(f.id)}"
            data-drive-acct-id="${esc(accountId)}"
            data-drive-acct-name="${esc(accountName)}"
            title="Delete from Drive">✕</button>
        </div>`;
      }).join('');
    },
  };

  // ── Event delegation ─────────────────────────────────────────────

  document.addEventListener('change', async (e) => {
    const input = e.target.closest('[data-drive-upload-account]');
    if (!input?.files?.length) return;
    const accountId   = input.dataset.driveUploadAccount;
    const accountName = input.dataset.driveUploadName;
    const listEl = document.getElementById(`drive-files-${accountId}`);

    if (listEl) listEl.innerHTML = '<p class="empty-state">Uploading…</p>';
    try {
      for (const file of [...input.files]) {
        await window.GripDrive.uploadFile(file, accountName);
      }
      await window.GripDrive.refreshFileList(accountId, accountName);
    } catch (err) {
      const msg = err.code === 401
        ? `Drive disconnected. <button class="mini-button" onclick="window.gripSync.signInWithGoogle()">Reconnect</button>`
        : `Upload failed: ${err.message}`;
      if (listEl) listEl.innerHTML = `<p class="empty-state">${msg}</p>`;
    }
    input.value = '';
  });

  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-drive-delete-id]');
    if (!btn) return;
    if (!confirm('Delete this file from Google Drive?')) return;
    const fileId      = btn.dataset.driveDeleteId;
    const accountId   = btn.dataset.driveAcctId;
    const accountName = btn.dataset.driveAcctName;
    try {
      await window.GripDrive.deleteFile(fileId);
      await window.GripDrive.refreshFileList(accountId, accountName);
    } catch {
      alert('Could not delete. Check your Drive connection.');
    }
  });

})();
