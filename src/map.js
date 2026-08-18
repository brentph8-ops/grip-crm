// ─────────────────────────────────────────────────────────────────
// GRIP — Live Account Map + Route Planner
// Leaflet.js + OpenStreetMap, Nominatim geocoding, color-coded pins,
// multi-stop route builder with Google Maps export
// ─────────────────────────────────────────────────────────────────

(function () {
  "use strict";

  // ── Constants ──────────────────────────────────────────────────────

  const ENTITY_PALETTE = [
    "#2a78d6", "#059669", "#d97706", "#7c3aed",
    "#dc2626", "#0891b2", "#c026d3", "#ea580c",
    "#16a34a", "#db2777", "#1e40af", "#0f766e",
  ];
  const UNRANKED_COLOR = "#898781";

  const _entityColorCache = {};
  function entityColor(entity) {
    if (!entity) return UNRANKED_COLOR;
    if (_entityColorCache[entity]) return _entityColorCache[entity];
    let h = 5381;
    for (let i = 0; i < entity.length; i++) h = ((h << 5) + h + entity.charCodeAt(i)) >>> 0;
    return (_entityColorCache[entity] = ENTITY_PALETTE[h % ENTITY_PALETTE.length]);
  }
  const MAP_CENTER     = [30.1, -95.6]; // Houston metro default
  const MAP_ZOOM       = 9;
  // Nominatim (OpenStreetMap) — CORS-enabled, free, no key
  const GEOCODE_URL    = "https://nominatim.openstreetmap.org/search";

  // ── Map/filter state ───────────────────────────────────────────────

  let _map            = null;
  let _markersGroup   = null;
  let _hiddenRankings = new Set();
  let _hiddenEntities = new Set();
  let _searchQuery    = "";
  let _geocoding      = false;
  let _countyLayer    = null;
  let _showCounty     = false;

  // ── Route state ────────────────────────────────────────────────────

  let _tab            = "legend";          // "legend" | "route"
  let _routeStops     = [];                // array of account objects
  let _startAddress   = "";               // typed start address
  let _endMode        = "last";           // "last" | "custom"
  let _endAddress     = "";               // custom end address
  let _countyOpen     = new Set();        // expanded counties in browser

  // ── Utility ────────────────────────────────────────────────────────

  function esc(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function fmtMoney(n) {
    const v = parseFloat(n) || 0;
    if (!v) return "";
    if (v >= 1_000_000) return "$" + (v / 1_000_000).toFixed(1) + "M";
    if (v >= 1_000)     return "$" + Math.round(v / 1_000) + "K";
    return "$" + Math.round(v).toLocaleString();
  }

  // ── Geo coordinate cache (isolated from Supabase sync) ────────────

  const GEO_KEY = "garlandGeocoords";

  function loadGeoCache() {
    try { return JSON.parse(localStorage.getItem(GEO_KEY) || "{}"); } catch { return {}; }
  }

  function saveGeoCoord(id, lat, lng, confidence, address) {
    try {
      const cache = loadGeoCache();
      cache[id] = { lat, lng, geocodeConfidence: confidence, geocodeAddress: address };
      localStorage.setItem(GEO_KEY, JSON.stringify(cache));
    } catch (e) {
      console.warn("GRIP geo cache write failed:", e);
    }
  }

  // ── Data ───────────────────────────────────────────────────────────

  function accounts() {
    const base = typeof window.cleanAccounts === "function" ? window.cleanAccounts() : [];
    const geo  = loadGeoCache();
    if (!Object.keys(geo).length) return base;
    return base.map(a => {
      const g = geo[a.id];
      if (!g) return a;
      // geo cache wins for coordinates; everything else stays from CRM
      return { ...a, lat: g.lat, lng: g.lng, geocodeConfidence: g.geocodeConfidence, geocodeAddress: g.geocodeAddress };
    });
  }

  function openPipelineByAccount() {
    try {
      const deals = JSON.parse(localStorage.getItem("garlandPipeline") || "[]");
      const by = {};
      for (const d of deals) {
        if (["Won", "Lost"].includes(d.stage) || !d.accountId) continue;
        by[d.accountId] = (by[d.accountId] || 0) + (parseFloat(d.amount) || 0);
      }
      return by;
    } catch { return {}; }
  }

  // ── Geocoding ──────────────────────────────────────────────────────

  async function geocodeAddress(address, _retry = 2) {
    if (!address || address.trim().length < 5) return null;
    try {
      const params = new URLSearchParams({
        format: "json", limit: "1",
        q:      address.trim(),
        countrycodes: "us",
        email:  "bphillips@garlandco.com",
      });
      const res = await fetch(`${GEOCODE_URL}?${params}`, {
        signal:  AbortSignal.timeout(12000),
        headers: { "Accept-Language": "en" },
      });
      if (res.status === 429 && _retry > 0) {
        await new Promise(r => setTimeout(r, 4000));
        return geocodeAddress(address, _retry - 1);
      }
      if (!res.ok) return null;
      const results = await res.json();
      if (Array.isArray(results) && results[0]?.lat && results[0]?.lon) {
        return { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon), confidence: "verified" };
      }
    } catch (_) {}
    return null;
  }

  function buildGeoQuery(account) {
    if (account.address && account.address.trim().length > 4) return account.address.trim();
    // Fallback: name + county + state so orgs without addresses can be found
    const parts = [account.client, account.county ? account.county + " County" : "", account.state || "TX"];
    return parts.filter(Boolean).join(" ");
  }

  async function geocodeAccountById(id, query, approximate = false) {
    if (!id || !query) return false;
    const result = await geocodeAddress(query);
    if (!result) return false;
    const confidence = approximate ? "unverified" : result.confidence;
    saveGeoCoord(id, result.lat, result.lng, confidence, query);
    if (_map && _markersGroup) refreshMarkers();
    return true;
  }

  async function geocodeAll(progressCallback) {
    const pending = accounts().filter(a => {
      const q = buildGeoQuery(a);
      return q && (!a.lat || !a.lng || a.geocodeAddress !== q);
    });
    let done = 0;
    for (const a of pending) {
      if (!_geocoding) break;
      try {
        const q           = buildGeoQuery(a);
        const approximate = !a.address || a.address.trim().length <= 4;
        await geocodeAccountById(a.id, q, approximate);
      } catch (e) {
        console.warn("GRIP geocode error for", a.client, e);
      }
      done++;
      progressCallback?.(done, pending.length);
      if (done < pending.length) await new Promise(r => setTimeout(r, 1100));
    }
    return done;
  }

  // ── Pin icons ──────────────────────────────────────────────────────

  function makePinIcon(color, confidence, inRoute) {
    const verified = confidence === "verified" || confidence === "manual";
    if (inRoute) {
      // Route stop: gold ring
      const svg = `<svg width="28" height="36" viewBox="0 0 28 36" xmlns="http://www.w3.org/2000/svg">
        <path d="M14 0C6.27 0 0 6.27 0 14c0 9.66 14 22 14 22S28 23.66 28 14C28 6.27 21.73 0 14 0z" fill="${color}" stroke="#f59e0b" stroke-width="3"/>
        <circle cx="14" cy="14" r="6" fill="white" opacity="0.95"/>
      </svg>`;
      return L.divIcon({ className: "", html: svg, iconSize: [28, 36], iconAnchor: [14, 36], popupAnchor: [0, -38] });
    }
    const svg = verified
      ? `<svg width="24" height="32" viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 0C5.37 0 0 5.37 0 12c0 8.28 12 20 12 20S24 20.28 24 12C24 5.37 18.63 0 12 0z" fill="${color}"/>
          <circle cx="12" cy="12" r="5" fill="white" opacity="0.9"/>
        </svg>`
      : `<svg width="24" height="32" viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 0C5.37 0 0 5.37 0 12c0 8.28 12 20 12 20S24 20.28 24 12C24 5.37 18.63 0 12 0z"
            fill="white" stroke="${color}" stroke-width="2.5" stroke-dasharray="5 3"/>
          <circle cx="12" cy="12" r="5" fill="${color}" opacity="0.85"/>
        </svg>`;
    return L.divIcon({ className: "", html: svg, iconSize: [24, 32], iconAnchor: [12, 32], popupAnchor: [0, -34] });
  }

  // ── Popup HTML ─────────────────────────────────────────────────────

  function buildPopup(account, plValue) {
    const activity = typeof accountActivityStatus === "function"
      ? accountActivityStatus(account) : { label: "Unknown" };
    const actColor = { green: "#1baf7a", yellow: "#eda100", red: "#e55353", dead: "#898781" }[activity.level] || "#898781";
    const mapsUrl  = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((account.address || account.client || "").trim())}`;
    const conf     = account.geocodeConfidence || "unverified";
    const confText = { verified: "📍 Verified", manual: "✏️ Manual", unverified: "⚠ Approximate" }[conf] || "⚠ Approximate";
    const color    = entityColor(account.entity);
    const inRoute  = _routeStops.some(s => s.id === account.id);

    return `<div class="gmp-popup">
      <div class="gmp-header" style="border-left:4px solid ${color}">
        <button class="gmp-name-link" data-account-id="${esc(account.id)}" type="button">${esc(account.client)}</button>
        ${account.clientRanking ? `<span class="gmp-rank" style="color:${color}">${esc(account.clientRanking)}</span>` : ""}
      </div>
      ${account.poc ? `<p class="gmp-contact">${esc(account.poc)}${account.title ? " · <em>" + esc(account.title) + "</em>" : ""}</p>` : ""}
      ${account.phone ? `<p class="gmp-field"><a href="tel:${esc(account.phone)}">${esc(account.phone)}</a></p>` : ""}
      ${account.email ? `<p class="gmp-field"><a href="mailto:${esc(account.email)}">${esc(account.email)}</a></p>` : ""}
      <hr class="gmp-divider">
      ${account.address ? `<p class="gmp-field gmp-address">${esc(account.address)}</p>` : ""}
      <p class="gmp-meta-row">
        ${account.entity ? `<span>${esc(account.entity)}</span>` : ""}
        ${account.county ? `<span>${esc(account.county)} Co.</span>` : ""}
      </p>
      <hr class="gmp-divider">
      <p class="gmp-activity" style="color:${actColor}">${esc(activity.label)}</p>
      ${plValue ? `<p class="gmp-pipeline">Pipeline: <strong>${fmtMoney(plValue)}</strong></p>` : ""}
      <p class="gmp-conf">${confText}</p>
      <div class="gmp-actions">
        <button class="gmp-route-btn ${inRoute ? "gmp-route-btn--active" : ""}" data-route-id="${esc(account.id)}" type="button">
          ${inRoute ? "✓ In Route" : "+ Add to Route"}
        </button>
        <a class="gmp-maps-link" href="${mapsUrl}" target="_blank" rel="noopener noreferrer">Maps ↗</a>
      </div>
      <div class="gmp-fix-wrap" data-fix-id="${esc(account.id)}">
        <button class="gmp-fix-btn" type="button">✏️ Fix Location</button>
        <div class="gmp-fix-form" style="display:none">
          <input class="gmp-fix-input" type="text" value="${esc(account.address || account.client || "")}" placeholder="Enter address or place name…">
          <button class="gmp-fix-go" type="button">Search</button>
          <p class="gmp-fix-status"></p>
        </div>
      </div>
    </div>`;
  }

  // ── Route logic ────────────────────────────────────────────────────

  function toggleRouteStop(account) {
    const idx = _routeStops.findIndex(s => s.id === account.id);
    if (idx >= 0) _routeStops.splice(idx, 1);
    else           _routeStops.push(account);
    refreshMarkers();
    if (_tab === "route") renderSidebar(accounts(), countMapped());
  }

  function removeRouteStop(id) {
    _routeStops = _routeStops.filter(s => s.id !== id);
    refreshMarkers();
    renderSidebar(accounts(), countMapped());
  }

  function moveRouteStop(id, dir) {
    const idx = _routeStops.findIndex(s => s.id === id);
    if (idx < 0) return;
    const target = idx + dir;
    if (target < 0 || target >= _routeStops.length) return;
    [_routeStops[idx], _routeStops[target]] = [_routeStops[target], _routeStops[idx]];
    renderSidebar(accounts(), countMapped());
  }

  // Nearest-neighbor heuristic: optimizes stop order given a start lat/lng
  function optimizeStops(stops, startLat, startLng) {
    if (stops.length <= 2) return [...stops];
    const dist = (a, bLat, bLng) => Math.hypot((a.lat || 0) - bLat, (a.lng || 0) - bLng);
    const remaining = [...stops];
    const ordered   = [];
    let curLat = startLat, curLng = startLng;
    while (remaining.length > 0) {
      let bestIdx = 0;
      let bestD   = dist(remaining[0], curLat, curLng);
      for (let i = 1; i < remaining.length; i++) {
        const d = dist(remaining[i], curLat, curLng);
        if (d < bestD) { bestD = d; bestIdx = i; }
      }
      ordered.push(remaining[bestIdx]);
      curLat = remaining[bestIdx].lat || curLat;
      curLng = remaining[bestIdx].lng || curLng;
      remaining.splice(bestIdx, 1);
    }
    return ordered;
  }

  function buildGoogleMapsUrl(startAddr, stopList, endAddr) {
    // Google Maps multi-stop URL: /dir/origin/stop1/stop2/.../destination
    const encode = a => encodeURIComponent(a.trim());
    const parts  = [startAddr, ...stopList.map(s => s.address || s.client), endAddr]
      .filter(Boolean)
      .map(encode);
    return `https://www.google.com/maps/dir/${parts.join("/")}`;
  }

  async function getMyLocation() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) { reject(new Error("Geolocation not supported")); return; }
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        err => reject(err),
        { timeout: 10000, maximumAge: 60000 }
      );
    });
  }

  // ── Filter ─────────────────────────────────────────────────────────

  function isVisible(account) {
    const ranking = account.clientRanking || "Unranked";
    if (_hiddenRankings.has(ranking)) return false;
    if (_hiddenEntities.size > 0 && _hiddenEntities.has(account.entity || "")) return false;
    if (_searchQuery) {
      const q   = _searchQuery.toLowerCase();
      const hay = [account.client, account.poc, account.county, account.entity].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }

  // ── Markers ────────────────────────────────────────────────────────

  function countMapped() {
    return accounts().filter(a => a.lat && a.lng).length;
  }

  async function applyCountyLayer() {
    if (!_map) return;
    if (_showCounty) {
      if (!_countyLayer) {
        // Load topojson-client if not already present
        if (!window.topojson) {
          await new Promise((res, rej) => {
            const s = Object.assign(document.createElement("script"), {
              src: "https://cdn.jsdelivr.net/npm/topojson-client@3/dist/topojson-client.min.js",
              onload: res, onerror: rej,
            });
            document.head.appendChild(s);
          });
        }
        // Fetch US Atlas county TopoJSON (~150 KB)
        const topo   = await fetch("https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json").then(r => r.json());
        const geojson = window.topojson.feature(topo, topo.objects.counties);
        _countyLayer  = L.geoJSON(geojson, {
          style: () => ({
            color:       "#1e3a5f",
            weight:      2.5,
            opacity:     0.75,
            fillColor:   "#3b82f6",
            fillOpacity: 0.06,
          }),
          attribution: "US Census TIGER",
        });
      }
      _countyLayer.addTo(_map);
    } else {
      if (_countyLayer) { _map.removeLayer(_countyLayer); _countyLayer = null; }
    }
  }

  function refreshMarkers() {
    if (!_map || !_markersGroup) return;
    _markersGroup.clearLayers();
    const accts = accounts();
    const plBy  = openPipelineByAccount();

    for (const a of accts) {
      const lat = parseFloat(a.lat);
      const lng = parseFloat(a.lng);
      if (!lat || !lng) continue;
      if (!isVisible(a)) continue;

      const inRoute = _routeStops.some(s => s.id === a.id);
      const icon    = makePinIcon(entityColor(a.entity), a.geocodeConfidence, inRoute);
      const marker  = L.marker([lat, lng], { icon, title: a.client });
      const popup   = buildPopup(a, plBy[a.id] || 0);
      marker.bindPopup(popup, { maxWidth: 300, className: "grip-map-popup" });

      // Wire buttons after popup opens
      marker.on("popupopen", () => {
        const btn = document.querySelector(`.gmp-route-btn[data-route-id="${a.id}"]`);
        if (btn) btn.addEventListener("click", () => { toggleRouteStop(a); marker.closePopup(); });

        const nameLink = document.querySelector(`.gmp-name-link[data-account-id="${a.id}"]`);
        nameLink?.addEventListener("click", () => {
          marker.closePopup();
          openDetailPanel(a);
        });

        const wrap    = document.querySelector(`.gmp-fix-wrap[data-fix-id="${a.id}"]`);
        if (!wrap) return;
        const fixBtn  = wrap.querySelector(".gmp-fix-btn");
        const fixForm = wrap.querySelector(".gmp-fix-form");
        const fixInp  = wrap.querySelector(".gmp-fix-input");
        const fixGo   = wrap.querySelector(".gmp-fix-go");
        const fixStat = wrap.querySelector(".gmp-fix-status");
        fixBtn?.addEventListener("click", () => {
          fixForm.style.display = fixForm.style.display === "none" ? "block" : "none";
          if (fixForm.style.display !== "none") fixInp?.focus();
        });
        fixGo?.addEventListener("click", async () => {
          const q = fixInp?.value.trim();
          if (!q) return;
          fixGo.textContent = "Searching…";
          fixGo.disabled = true;
          const result = await geocodeAddress(q);
          if (result) {
            saveGeoCoord(a.id, result.lat, result.lng, "manual", q);
            refreshMarkers();
            marker.closePopup();
          } else {
            if (fixStat) fixStat.textContent = "Not found — try a more specific address.";
            fixGo.textContent = "Search";
            fixGo.disabled = false;
          }
        });
        fixInp?.addEventListener("keydown", e => { if (e.key === "Enter") fixGo?.click(); });
      });

      _markersGroup.addLayer(marker);
    }
  }

  // ── Sidebar: Legend tab ────────────────────────────────────────────

  function renderLegendTab(accts, mapped) {
    const total   = accts.length;
    const unmapped = accts.filter(a => !a.lat || !a.lng).length;

    const entityCounts = {};
    for (const a of accts) {
      if (!a.lat || !a.lng) continue;
      if (a.entity) entityCounts[a.entity] = (entityCounts[a.entity] || 0) + 1;
    }

    const entityHtml = Object.entries(entityCounts).sort((a, b) => b[1] - a[1]).map(([entity, count]) => {
      const c      = entityColor(entity);
      const hidden = _hiddenEntities.has(entity);
      return `<button class="map-legend-row${hidden ? " map-legend-row--off" : ""}" data-leg-entity="${esc(entity)}" type="button">
        <span class="map-legend-dot" style="background:${c}"></span>
        <span class="map-legend-label">${esc(entity)}</span>
        <span class="map-legend-count">${count}</span>
      </button>`;
    }).join("");

    return `
      <div class="map-sidebar-header">
        <h2 class="map-sidebar-title">Live Account Map</h2>
        <p class="map-sidebar-sub">${mapped} of ${total} accounts mapped</p>
      </div>

      <div class="map-search-wrap">
        <input id="mapSearch" class="map-search-input" type="search"
          placeholder="Search by name, contact, county…"
          value="${esc(_searchQuery)}" autocomplete="off">
      </div>

      ${unmapped && !_geocoding ? `
        <div class="map-geocode-wrap">
          <button class="map-geocode-btn" id="mapGeocodeBtn" type="button">
            📍 Geocode ${unmapped} unmapped address${unmapped !== 1 ? "es" : ""}
          </button>
        </div>` : ""}
      ${_geocoding ? `<div class="map-geocode-wrap"><p id="mapGeocodeProgress" class="map-geocode-progress">Geocoding…</p></div>` : ""}

      ${entityHtml ? `<div class="map-legend-section">
        <h4 class="map-legend-section-title">Entity Type</h4>
        ${entityHtml}
      </div>` : ""}

      <div class="map-legend-section map-confidence-key">
        <h4 class="map-legend-section-title">Pin Key</h4>
        <div class="map-conf-row"><span class="map-conf-solid">●</span> Verified address</div>
        <div class="map-conf-row"><span class="map-conf-dashed">◌</span> Approximate / unverified</div>
        <div class="map-conf-row"><span class="map-conf-route">◉</span> Added to route</div>
      </div>

      <div class="map-legend-section">
        <h4 class="map-legend-section-title">Map Layers</h4>
        <label class="map-layer-toggle">
          <input type="checkbox" id="mapCountyToggle" ${_showCounty ? "checked" : ""}>
          County / Parish Lines
        </label>
      </div>
    `;
  }

  // ── Sidebar: Route tab ─────────────────────────────────────────────

  function renderRouteTab(accts) {
    // County/State browser
    const byCounty = {};
    for (const a of accts) {
      const key = [a.state || "TX", a.county || "Unknown"].join("||");
      if (!byCounty[key]) byCounty[key] = { state: a.state || "TX", county: a.county || "Unknown", accounts: [] };
      byCounty[key].accounts.push(a);
    }
    const countyEntries = Object.entries(byCounty)
      .sort(([ka], [kb]) => ka.localeCompare(kb));

    const countyHtml = countyEntries.map(([key, { state, county, accounts: ca }]) => {
      const open = _countyOpen.has(key);
      const inRouteCount = ca.filter(a => _routeStops.some(s => s.id === a.id)).length;
      const acctRows = !open ? "" : ca.map(a => {
        const inRoute = _routeStops.some(s => s.id === a.id);
        const color   = RANKING_COLORS[a.clientRanking] || UNRANKED_COLOR;
        return `<div class="map-county-acct">
          <span class="map-county-dot" style="background:${color}"></span>
          <span class="map-county-acct-name">${esc(a.client)}</span>
          <button class="map-county-add-btn ${inRoute ? "map-county-add-btn--active" : ""}"
            data-county-route-id="${esc(a.id)}" type="button"
            title="${inRoute ? "Remove from route" : "Add to route"}">
            ${inRoute ? "✓" : "+"}
          </button>
        </div>`;
      }).join("");

      return `<div class="map-county-group">
        <button class="map-county-header" data-county-key="${esc(key)}" type="button">
          <span class="map-county-toggle">${open ? "▾" : "▸"}</span>
          <span class="map-county-name">${esc(county)} Co. <small style="color:var(--muted)">${esc(state)}</small></span>
          <span class="map-county-meta">${ca.length}${inRouteCount ? ` · <strong>${inRouteCount} in route</strong>` : ""}</span>
        </button>
        ${open ? `<div class="map-county-accounts">${acctRows}</div>` : ""}
      </div>`;
    }).join("");

    // Stops list
    const stopsHtml = _routeStops.length === 0
      ? `<p class="map-route-empty">Click a pin on the map or use the county browser below to add stops.</p>`
      : _routeStops.map((s, i) => `<div class="map-route-stop">
          <span class="map-route-stop-num">${i + 1}</span>
          <div class="map-route-stop-info">
            <span class="map-route-stop-name">${esc(s.client)}</span>
            <span class="map-route-stop-addr">${esc(s.county || "")}${s.county && s.address ? " · " : ""}${esc((s.address || "").split(",").slice(0, 2).join(","))}</span>
          </div>
          <div class="map-route-stop-actions">
            ${i > 0 ? `<button class="map-route-move" data-move-id="${esc(s.id)}" data-dir="-1" title="Move up" type="button">↑</button>` : '<span></span>'}
            ${i < _routeStops.length - 1 ? `<button class="map-route-move" data-move-id="${esc(s.id)}" data-dir="1" title="Move down" type="button">↓</button>` : '<span></span>'}
            <button class="map-route-remove" data-remove-id="${esc(s.id)}" title="Remove" type="button">✕</button>
          </div>
        </div>`).join("");

    const canBuild = _routeStops.length >= 1;

    return `
      <div class="map-sidebar-header">
        <h2 class="map-sidebar-title">Route Planner</h2>
        <p class="map-sidebar-sub">${_routeStops.length} stop${_routeStops.length !== 1 ? "s" : ""} selected</p>
      </div>

      <!-- Stops list -->
      <div class="map-route-stops-section">
        ${stopsHtml}
        ${_routeStops.length > 1 ? `<button class="map-optimize-btn" id="mapOptimizeBtn" type="button">⚡ Optimize Order</button>` : ""}
      </div>

      <!-- Start / End -->
      ${canBuild ? `
      <div class="map-legend-section">
        <h4 class="map-legend-section-title">Start Address</h4>
        <button class="map-loc-btn" id="mapUseMyLoc" type="button">📍 Use My Location</button>
        <input id="mapStartInput" class="map-search-input" type="text"
          placeholder="Or type start address…"
          value="${esc(_startAddress)}" style="margin-top:6px">
      </div>

      <div class="map-legend-section">
        <h4 class="map-legend-section-title">End Point</h4>
        <label class="map-radio-row">
          <input type="radio" name="mapEndMode" value="last" ${_endMode === "last" ? "checked" : ""}> Last stop address
        </label>
        <label class="map-radio-row">
          <input type="radio" name="mapEndMode" value="custom" ${_endMode === "custom" ? "checked" : ""}> Custom address
        </label>
        ${_endMode === "custom" ? `
        <input id="mapEndInput" class="map-search-input" type="text"
          placeholder="End address…"
          value="${esc(_endAddress)}" style="margin-top:6px">` : ""}
      </div>

      <div class="map-route-actions-section">
        <button class="map-open-gmaps-btn" id="mapOpenGmaps" type="button">
          🗺 Open in Google Maps
        </button>
        <button class="map-email-route-btn" id="mapEmailRoute" type="button">
          ✉ Email Route
        </button>
        <button class="map-copy-btn" id="mapCopyLink" type="button">
          ⧉ Copy Link
        </button>
      </div>` : ""}

      <!-- County browser -->
      <div class="map-legend-section">
        <h4 class="map-legend-section-title">Add by County</h4>
        ${countyHtml || '<p class="map-route-empty">No accounts with addresses found.</p>'}
      </div>
    `;
  }

  // ── Sidebar (main) ─────────────────────────────────────────────────

  function renderSidebar(accts, mapped) {
    const sidebar = document.getElementById("mapLegend");
    if (!sidebar) return;

    const tabBar = `<div class="map-tab-bar">
      <button class="map-tab-btn ${_tab === "legend" ? "map-tab-btn--active" : ""}" data-tab="legend" type="button">Legend</button>
      <button class="map-tab-btn ${_tab === "route" ? "map-tab-btn--active" : ""}" data-tab="route" type="button">
        Route${_routeStops.length ? ` <span class="map-route-badge">${_routeStops.length}</span>` : ""}
      </button>
    </div>`;

    const body = _tab === "legend"
      ? renderLegendTab(accts, mapped)
      : renderRouteTab(accts);

    sidebar.innerHTML = tabBar + body;
    wireSidebarEvents(sidebar, accts, mapped);
  }

  function wireSidebarEvents(sidebar, accts, mapped) {
    // Tab switching
    sidebar.querySelectorAll("[data-tab]").forEach(btn => {
      btn.addEventListener("click", () => {
        _tab = btn.dataset.tab;
        renderSidebar(accts, mapped);
      });
    });

    // Legend tab events
    if (_tab === "legend") {
      sidebar.querySelector("#mapSearch")?.addEventListener("input", e => {
        _searchQuery = e.target.value;
        refreshMarkers();
      });
      sidebar.querySelectorAll("[data-leg-rank]").forEach(btn => {
        btn.addEventListener("click", () => {
          const r = btn.dataset.legRank;
          if (_hiddenRankings.has(r)) _hiddenRankings.delete(r); else _hiddenRankings.add(r);
          refreshMarkers();
          renderSidebar(accts, mapped);
        });
      });
      sidebar.querySelectorAll("[data-leg-entity]").forEach(btn => {
        btn.addEventListener("click", () => {
          const e = btn.dataset.legEntity;
          if (_hiddenEntities.has(e)) _hiddenEntities.delete(e); else _hiddenEntities.add(e);
          refreshMarkers();
          renderSidebar(accts, mapped);
        });
      });
      sidebar.querySelector("#mapGeocodeBtn")?.addEventListener("click", async () => {
        if (_geocoding) return;
        _geocoding = true;
        renderSidebar(accts, mapped);
        try {
          await geocodeAll((done, total) => {
            const el = document.getElementById("mapGeocodeProgress");
            if (el) el.textContent = `Geocoding… ${done}/${total}`;
          });
        } finally {
          _geocoding = false;
          refreshMarkers();
          renderSidebar(accounts(), countMapped());
        }
      });
      sidebar.querySelector("#mapCountyToggle")?.addEventListener("change", async e => {
        _showCounty = e.target.checked;
        await applyCountyLayer();
      });
    }

    // Route tab events
    if (_tab === "route") {
      // County toggles
      sidebar.querySelectorAll("[data-county-key]").forEach(btn => {
        btn.addEventListener("click", () => {
          const key = btn.dataset.countyKey;
          if (_countyOpen.has(key)) _countyOpen.delete(key); else _countyOpen.add(key);
          renderSidebar(accts, mapped);
        });
      });

      // County "+" buttons
      sidebar.querySelectorAll("[data-county-route-id]").forEach(btn => {
        btn.addEventListener("click", e => {
          e.stopPropagation();
          const id = btn.dataset.countyRouteId;
          const acct = accts.find(a => a.id === id);
          if (acct) toggleRouteStop(acct);
        });
      });

      // Stop move / remove
      sidebar.querySelectorAll("[data-move-id]").forEach(btn => {
        btn.addEventListener("click", () => moveRouteStop(btn.dataset.moveId, parseInt(btn.dataset.dir)));
      });
      sidebar.querySelectorAll("[data-remove-id]").forEach(btn => {
        btn.addEventListener("click", () => removeRouteStop(btn.dataset.removeId));
      });

      // Optimize button
      sidebar.querySelector("#mapOptimizeBtn")?.addEventListener("click", async () => {
        const btn = document.getElementById("mapOptimizeBtn");
        btn.textContent = "Optimizing…";
        btn.disabled = true;
        let startLat, startLng;
        if (_startAddress) {
          const loc = await geocodeAddress(_startAddress);
          if (loc) { startLat = loc.lat; startLng = loc.lng; }
        }
        if (!startLat) {
          try { const loc = await getMyLocation(); startLat = loc.lat; startLng = loc.lng; } catch {}
        }
        if (!startLat && _routeStops[0]?.lat) { startLat = _routeStops[0].lat; startLng = _routeStops[0].lng; }
        if (startLat) {
          _routeStops = optimizeStops(_routeStops, startLat, startLng);
          refreshMarkers();
        }
        renderSidebar(accts, mapped);
      });

      // Start address input
      sidebar.querySelector("#mapStartInput")?.addEventListener("input", e => { _startAddress = e.target.value; });

      // Use my location
      sidebar.querySelector("#mapUseMyLoc")?.addEventListener("click", async () => {
        const btn = document.getElementById("mapUseMyLoc");
        btn.textContent = "Getting location…";
        btn.disabled = true;
        try {
          const loc = await getMyLocation();
          _startAddress = `${loc.lat},${loc.lng}`;
          const inp = document.getElementById("mapStartInput");
          if (inp) inp.value = `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`;
          btn.textContent = "✓ Location set";
        } catch {
          btn.textContent = "Location unavailable";
          btn.disabled = false;
        }
      });

      // End mode radios
      sidebar.querySelectorAll("[name='mapEndMode']").forEach(radio => {
        radio.addEventListener("change", () => {
          _endMode = radio.value;
          renderSidebar(accts, mapped);
        });
      });
      sidebar.querySelector("#mapEndInput")?.addEventListener("input", e => { _endAddress = e.target.value; });

      // Google Maps button
      sidebar.querySelector("#mapOpenGmaps")?.addEventListener("click", () => {
        const url = buildRoute();
        if (url) window.open(url, "_blank", "noopener");
      });

      // Email Route button
      sidebar.querySelector("#mapEmailRoute")?.addEventListener("click", () => {
        const url = buildRoute();
        if (!url) return;
        const subject = encodeURIComponent("GRIP Route Plan — " + new Date().toLocaleDateString());
        const body    = encodeURIComponent(`Here is your route plan:\n\n${url}\n\nStops (${_routeStops.length}):\n${_routeStops.map((s, i) => `${i + 1}. ${s.client}${s.address ? " — " + s.address : ""}`).join("\n")}`);
        window.location.href = `mailto:?subject=${subject}&body=${body}`;
      });

      // Copy link button
      sidebar.querySelector("#mapCopyLink")?.addEventListener("click", async () => {
        const url = buildRoute();
        const btn = document.getElementById("mapCopyLink");
        if (!url || !btn) return;
        try {
          await navigator.clipboard.writeText(url);
          btn.textContent = "✓ Copied!";
          setTimeout(() => { btn.textContent = "⧉ Copy Link"; }, 2000);
        } catch {
          // Fallback: select a temporary textarea
          const ta = Object.assign(document.createElement("textarea"), { value: url, style: "position:fixed;opacity:0" });
          document.body.appendChild(ta);
          ta.select();
          try { document.execCommand("copy"); btn.textContent = "✓ Copied!"; setTimeout(() => { btn.textContent = "⧉ Copy Link"; }, 2000); } catch {}
          ta.remove();
        }
      });
    }
  }

  function buildRoute() {
    if (_routeStops.length === 0) { alert("Add at least one stop to your route."); return null; }
    const lastAddr = _routeStops[_routeStops.length - 1]?.address || "";
    const endAddr  = _endMode === "custom" && _endAddress ? _endAddress : lastAddr;

    if (_startAddress) {
      // Custom start: start → all stops → end
      const waypoints = _endMode === "custom" ? _routeStops : _routeStops.slice(0, -1);
      return buildGoogleMapsUrl(_startAddress, waypoints, endAddr);
    } else {
      // No custom start: first stop is origin, middle stops are waypoints, last is destination
      const start     = _routeStops[0]?.address || "";
      const waypoints = _routeStops.slice(1, _endMode === "custom" ? undefined : -1);
      return buildGoogleMapsUrl(start, waypoints, endAddr);
    }
  }

  // ── Account detail panel ───────────────────────────────────────────

  function openDetailPanel(account) {
    const panel   = document.getElementById("mapDetailPanel");
    const content = document.getElementById("mapDetailContent");
    if (!panel || !content) return;
    content.innerHTML = renderMapAccountDetail(account);
    panel.classList.add("map-detail-panel--open");
    content.querySelector(".map-detail-full-btn")?.addEventListener("click", () => {
      closeDetailPanel();
      if (typeof setView === "function") setView("accounts");
      if (typeof showAccountDetail === "function") showAccountDetail(account);
    });
  }

  function closeDetailPanel() {
    document.getElementById("mapDetailPanel")?.classList.remove("map-detail-panel--open");
  }

  function renderMapAccountDetail(account) {
    const activity = typeof accountActivityStatus === "function"
      ? accountActivityStatus(account) : { label: "No activity logged", level: "red" };
    const actColor = { green: "#1baf7a", yellow: "#eda100", red: "#e55353", dead: "#898781" }[activity.level] || "#898781";
    const color    = entityColor(account.entity);
    const plBy     = openPipelineByAccount();
    const plValue  = plBy[account.id] || 0;
    const latest   = typeof latestAccountActivity === "function" ? latestAccountActivity(account) : null;
    const mapsUrl  = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((account.address || account.client || "").trim())}`;

    const fieldRow = (label, val) => val
      ? `<div class="map-dp-row"><span class="map-dp-label">${label}</span><span class="map-dp-val">${val}</span></div>`
      : "";

    return `
      <div class="map-dp-header" style="border-left:4px solid ${color}">
        <div class="map-dp-name">${esc(account.client)}</div>
        ${account.clientRanking ? `<span class="map-dp-rank" style="color:${color}">${esc(account.clientRanking)}</span>` : ""}
      </div>
      <p class="map-dp-activity" style="color:${actColor}">● ${esc(activity.label)}</p>
      ${plValue ? `<p class="map-dp-pipeline">Pipeline: <strong>${fmtMoney(plValue)}</strong></p>` : ""}

      <div class="map-dp-section">
        ${fieldRow("Contact", esc(account.poc) + (account.title ? ` <em>· ${esc(account.title)}</em>` : ""))}
        ${account.phone ? `<div class="map-dp-row"><span class="map-dp-label">Phone</span><a href="tel:${esc(account.phone)}">${esc(account.phone)}</a></div>` : ""}
        ${account.email ? `<div class="map-dp-row"><span class="map-dp-label">Email</span><a href="mailto:${esc(account.email)}">${esc(account.email)}</a></div>` : ""}
        ${account.address ? `<div class="map-dp-row"><span class="map-dp-label">Address</span><a href="${mapsUrl}" target="_blank" rel="noopener noreferrer">${esc(account.address)}</a></div>` : ""}
        ${fieldRow("Type", esc(account.entity))}
        ${fieldRow("County", account.county ? esc(account.county) + " Co." : "")}
      </div>

      ${latest ? `<div class="map-dp-section">
        <div class="map-dp-section-title">Last Activity</div>
        <p class="map-dp-note">${esc(latest.note || "")}</p>
        ${latest.createdAt ? `<p class="map-dp-date">${new Date(latest.createdAt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</p>` : ""}
      </div>` : ""}

      <button class="map-detail-full-btn" type="button">Open Full Account →</button>
    `;
  }

  // ── Map init ───────────────────────────────────────────────────────

  function initMap() {
    const el = document.getElementById("leafletMap");
    if (!el || _map) return;

    _map = L.map("leafletMap", { center: MAP_CENTER, zoom: MAP_ZOOM, zoomControl: true });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(_map);

    _markersGroup = L.layerGroup().addTo(_map);
    refreshMarkers();
  }

  // ── Public API ─────────────────────────────────────────────────────

  function render() {
    const view = document.getElementById("liveMapView");
    if (!view) return;

    if (!view.querySelector("#mapLegend")) {
      view.innerHTML = `
        <div id="mapLegend" class="map-legend-sidebar"></div>
        <div id="leafletMap" class="map-leaflet"></div>
        <div id="mapDetailPanel" class="map-detail-panel">
          <div class="map-detail-topbar">
            <button id="mapDetailClose" class="map-detail-close" type="button" aria-label="Close">✕</button>
          </div>
          <div id="mapDetailContent" class="map-detail-content"></div>
        </div>
      `;
      document.getElementById("mapDetailClose")?.addEventListener("click", () => closeDetailPanel());
    }

    if (typeof L === "undefined") {
      view.innerHTML = `<p style="padding:2rem;color:var(--color-text-muted)">Map library not loaded. Reload the app.</p>`;
      return;
    }

    const accts  = accounts();
    const mapped = countMapped();
    renderSidebar(accts, mapped);

    if (!_map) {
      initMap();
    } else {
      setTimeout(() => _map.invalidateSize(), 50);
      refreshMarkers();
    }
  }

  function refresh() {
    if (_map && _markersGroup) {
      refreshMarkers();
      setTimeout(() => _map.invalidateSize(), 50);
    }
  }

  window.gripMap = { render, refresh, geocodeAccountById, geocodeAll };

})();
