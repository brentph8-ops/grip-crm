// ─────────────────────────────────────────────────────────────────
// GRIP — Territory Map
// Leaflet + OpenStreetMap — no API key needed
// Drops pins for accounts, color-coded by entity type or status
// ─────────────────────────────────────────────────────────────────

(function () {

  // Texas county center coordinates (lat/lng)
  const COUNTY_COORDS = {
    "Anderson": [31.816, -95.654], "Andrews": [32.305, -102.638], "Angelina": [31.254, -94.611],
    "Aransas": [28.068, -97.039], "Archer": [33.616, -98.688], "Armstrong": [34.966, -101.357],
    "Atascosa": [28.895, -98.529], "Austin": [29.888, -96.272], "Bailey": [34.068, -102.830],
    "Bandera": [29.750, -99.245], "Bastrop": [30.103, -97.312], "Baylor": [33.617, -99.218],
    "Bee": [28.418, -97.741], "Bell": [31.037, -97.479], "Bexar": [29.449, -98.520],
    "Blanco": [30.261, -98.401], "Borden": [32.744, -101.430], "Bosque": [31.898, -97.637],
    "Bowie": [33.448, -94.421], "Brazoria": [29.168, -95.434], "Brazos": [30.661, -96.302],
    "Brewster": [29.858, -103.253], "Briscoe": [34.530, -100.718], "Brooks": [27.033, -98.218],
    "Brown": [31.774, -98.999], "Burleson": [30.491, -96.614], "Burnet": [30.791, -98.229],
    "Caldwell": [29.837, -97.621], "Calhoun": [28.445, -96.579], "Callahan": [32.298, -99.369],
    "Cameron": [26.145, -97.544], "Camp": [32.974, -94.978], "Carson": [35.403, -101.355],
    "Cass": [33.077, -94.347], "Castro": [34.528, -102.264], "Chambers": [29.706, -94.679],
    "Cherokee": [31.844, -95.163], "Childress": [34.530, -100.213], "Clay": [33.785, -98.207],
    "Cochran": [33.603, -102.839], "Coke": [31.887, -100.531], "Coleman": [31.774, -99.459],
    "Collin": [33.193, -96.572], "Collingsworth": [34.964, -100.267], "Colorado": [29.622, -96.530],
    "Comal": [29.825, -98.258], "Comanche": [31.950, -98.590], "Concho": [31.322, -99.873],
    "Cooke": [33.639, -97.213], "Coryell": [31.390, -97.799], "Cottle": [34.078, -100.276],
    "Crane": [31.426, -102.351], "Crockett": [30.722, -101.409], "Crosby": [33.609, -101.300],
    "Culberson": [30.797, -104.516], "Dallam": [36.278, -102.602], "Dallas": [32.766, -96.778],
    "Dawson": [32.744, -101.948], "Deaf Smith": [34.966, -102.604], "Delta": [33.389, -95.676],
    "Denton": [33.213, -97.133], "DeWitt": [29.088, -97.350], "Dickens": [33.617, -100.787],
    "Dimmit": [28.423, -99.756], "Donley": [34.966, -100.817], "Duval": [27.676, -98.508],
    "Eastland": [32.298, -98.815], "Ector": [31.870, -102.538], "Edwards": [29.982, -100.305],
    "Ellis": [32.349, -96.795], "El Paso": [31.770, -106.434], "Erath": [32.236, -98.225],
    "Falls": [31.253, -96.934], "Fannin": [33.593, -96.107], "Fayette": [29.878, -96.920],
    "Fisher": [32.744, -100.402], "Floyd": [33.969, -101.306], "Foard": [33.980, -99.778],
    "Fort Bend": [29.527, -95.771], "Franklin": [33.177, -95.222], "Freestone": [31.704, -96.149],
    "Frio": [28.867, -99.109], "Gaines": [32.744, -102.636], "Galveston": [29.346, -94.857],
    "Garza": [33.178, -101.297], "Gillespie": [30.316, -98.946], "Glasscock": [31.869, -101.522],
    "Goliad": [28.659, -97.396], "Gonzales": [29.454, -97.496], "Gray": [35.403, -100.807],
    "Grayson": [33.639, -96.679], "Gregg": [32.481, -94.822], "Grimes": [30.546, -95.984],
    "Guadalupe": [29.575, -97.943], "Hale": [34.068, -101.824], "Hall": [34.530, -100.681],
    "Hamilton": [31.706, -98.115], "Hansford": [36.278, -101.356], "Hardeman": [34.290, -99.749],
    "Hardin": [30.335, -94.376], "Harris": [29.847, -95.397], "Harrison": [32.549, -94.369],
    "Hartley": [35.840, -102.600], "Haskell": [33.159, -99.729], "Hays": [30.062, -98.030],
    "Hemphill": [35.840, -100.271], "Henderson": [32.215, -95.855], "Hidalgo": [26.390, -98.187],
    "Hill": [31.986, -97.135], "Hockley": [33.605, -102.344], "Hood": [32.433, -97.822],
    "Hopkins": [33.148, -95.564], "Houston": [31.316, -95.421], "Howard": [32.297, -101.440],
    "Hudspeth": [31.454, -105.395], "Hunt": [33.124, -96.087], "Hutchinson": [35.840, -101.354],
    "Irion": [31.302, -100.985], "Jack": [33.233, -98.170], "Jackson": [28.959, -96.578],
    "Jasper": [30.744, -94.012], "Jeff Davis": [30.709, -104.127], "Jefferson": [29.837, -94.155],
    "Jim Hogg": [27.045, -98.699], "Jim Wells": [27.727, -98.089], "Johnson": [32.381, -97.367],
    "Jones": [32.736, -99.877], "Karnes": [28.889, -97.857], "Kaufman": [32.597, -96.283],
    "Kendall": [29.943, -98.701], "Kenedy": [26.926, -97.640], "Kent": [33.178, -100.773],
    "Kerr": [30.063, -99.352], "Kimble": [30.483, -99.741], "King": [33.617, -100.257],
    "Kinney": [29.350, -100.419], "Kleberg": [27.433, -97.695], "Knox": [33.608, -99.743],
    "Lamar": [33.665, -95.570], "Lamb": [34.068, -102.350], "Lampasas": [31.196, -98.239],
    "La Salle": [28.341, -99.098], "Lavaca": [29.384, -96.929], "Lee": [30.317, -96.974],
    "Leon": [31.294, -95.984], "Liberty": [30.151, -94.789], "Limestone": [31.549, -96.578],
    "Lipscomb": [36.278, -100.271], "Live Oak": [28.350, -98.113], "Llano": [30.702, -98.692],
    "Loving": [31.839, -103.604], "Lubbock": [33.610, -101.820], "Lynn": [33.178, -101.826],
    "Madison": [30.961, -95.917], "Marion": [32.797, -94.357], "Martin": [32.297, -101.951],
    "Mason": [30.717, -99.233], "Matagorda": [28.790, -96.004], "Maverick": [28.738, -100.317],
    "McCulloch": [31.197, -99.349], "McLennan": [31.549, -97.200], "McMullen": [28.353, -98.564],
    "Medina": [29.356, -99.109], "Menard": [30.884, -99.816], "Midland": [31.869, -102.029],
    "Milam": [30.792, -96.973], "Mills": [31.493, -98.598], "Mitchell": [32.298, -100.919],
    "Montague": [33.679, -97.728], "Montgomery": [30.299, -95.504], "Moore": [35.840, -101.893],
    "Morris": [33.110, -94.724], "Motley": [34.068, -100.782], "Nacogdoches": [31.618, -94.656],
    "Navarro": [32.045, -96.473], "Newton": [30.782, -93.744], "Nolan": [32.297, -100.399],
    "Nueces": [27.720, -97.557], "Ochiltree": [36.278, -100.817], "Oldham": [35.403, -102.601],
    "Orange": [30.118, -93.898], "Palo Pinto": [32.748, -98.311], "Panola": [32.162, -94.303],
    "Parker": [32.776, -97.804], "Parmer": [34.528, -102.784], "Pecos": [30.787, -102.722],
    "Polk": [30.791, -94.832], "Potter": [35.397, -101.896], "Presidio": [29.888, -104.290],
    "Rains": [32.870, -95.793], "Randall": [34.966, -101.893], "Reagan": [31.369, -101.522],
    "Real": [29.833, -99.816], "Red River": [33.621, -94.706], "Reeves": [31.320, -103.693],
    "Refugio": [28.307, -97.158], "Roberts": [35.840, -100.814], "Robertson": [31.026, -96.516],
    "Rockwall": [32.900, -96.411], "Runnels": [31.832, -99.977], "Rusk": [32.109, -94.769],
    "Sabine": [31.345, -93.851], "San Augustine": [31.390, -94.169], "San Jacinto": [30.574, -95.154],
    "San Patricio": [28.007, -97.517], "San Saba": [31.164, -98.722], "Schleicher": [30.900, -100.537],
    "Scurry": [32.745, -100.917], "Shackelford": [32.736, -99.352], "Shelby": [31.793, -94.143],
    "Sherman": [36.278, -101.892], "Smith": [32.375, -95.268], "Somervell": [32.221, -97.773],
    "Starr": [26.555, -98.739], "Stephens": [32.736, -98.816], "Sterling": [31.832, -101.053],
    "Stonewall": [33.178, -100.253], "Sutton": [30.491, -100.523], "Swisher": [34.528, -101.736],
    "Tarrant": [32.771, -97.291], "Taylor": [32.298, -99.891], "Terrell": [30.231, -102.075],
    "Terry": [33.173, -102.339], "Throckmorton": [33.179, -99.213], "Titus": [33.218, -94.964],
    "Tom Green": [31.404, -100.460], "Travis": [30.335, -97.779], "Trinity": [30.973, -95.145],
    "Tyler": [30.773, -94.378], "Upshur": [32.735, -94.933], "Upton": [31.369, -102.037],
    "Uvalde": [29.346, -99.766], "Val Verde": [29.888, -101.149], "Van Zandt": [32.559, -95.835],
    "Victoria": [28.845, -96.981], "Walker": [30.732, -95.570], "Waller": [29.993, -95.989],
    "Ward": [31.508, -103.102], "Washington": [30.214, -96.403], "Webb": [27.761, -99.473],
    "Wharton": [29.279, -96.175], "Wheeler": [35.403, -100.270], "Wichita": [33.990, -98.693],
    "Wilbarger": [34.106, -99.248], "Willacy": [26.478, -97.754], "Williamson": [30.648, -97.601],
    "Wilson": [29.179, -98.093], "Winkler": [31.839, -103.053], "Wise": [33.214, -97.656],
    "Wood": [32.781, -95.376], "Yoakum": [33.173, -102.827], "Young": [33.178, -98.688],
    "Zapata": [26.902, -99.174], "Zavala": [28.867, -99.760],
  };

  const ENTITY_COLORS = {
    "K-12":            "#3b82f6",
    "Higher Education":"#8b5cf6",
    "Healthcare":      "#ec4899",
    "Manufacturing":   "#f59e0b",
    "Municipal":       "#10b981",
    "Religious":       "#6366f1",
    "Private":         "#64748b",
    "Private School":  "#0ea5e9",
    "Architect":       "#f97316",
    "Financial":       "#84cc16",
  };

  let _map = null;
  let _markers = [];
  let _colorBy = "entity";
  let _filterEntity = "";

  function esc(s) {
    return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function accounts() {
    return typeof window.cleanAccounts === "function" ? window.cleanAccounts() : [];
  }

  function getCoords(account) {
    const county = (account.county || "").replace(/ County$/i, "").trim();
    return COUNTY_COORDS[county] || null;
  }

  function pinColor(account) {
    if (_colorBy === "entity") {
      return ENTITY_COLORS[account.entity] || "#94a3b8";
    }
    if (_colorBy === "pipeline") {
      const deals = (() => { try { return JSON.parse(localStorage.getItem("garlandPipeline") || "[]"); } catch (_) { return []; } })();
      const deal = deals.find(d => d.accountId === account.id);
      if (!deal) return "#94a3b8";
      const stageColors = { Prospect: "#94a3b8", Qualifying: "#3b82f6", "Proposal Sent": "#f59e0b", Won: "#10b981", Lost: "#ef4444" };
      return stageColors[deal.stage] || "#94a3b8";
    }
    return "#94a3b8";
  }

  function makeIcon(color) {
    return L.divIcon({
      className: "",
      html: `<svg width="24" height="32" viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 0C5.4 0 0 5.4 0 12c0 8.4 12 20 12 20s12-11.6 12-20C24 5.4 18.6 0 12 0z" fill="${color}" stroke="white" stroke-width="1.5"/>
        <circle cx="12" cy="12" r="4.5" fill="white"/>
      </svg>`,
      iconSize: [24, 32],
      iconAnchor: [12, 32],
      popupAnchor: [0, -32],
    });
  }

  function buildPopup(account) {
    const acts = (() => { try { return JSON.parse(localStorage.getItem("garlandAccountActivities") || "{}"); } catch (_) { return {}; } })();
    const log = acts[account.id] || [];
    const last = log.length ? log[log.length - 1] : null;
    const lastStr = last ? (last.date || last.at || "").slice(0, 10) : "Never";
    return `
      <div class="territory-popup">
        <strong>${esc(account.client)}</strong>
        <div class="territory-popup-meta">${esc(account.entity || "")} · ${esc(account.county || "")}</div>
        ${account.poc ? `<div class="territory-popup-poc">${esc(account.poc)}</div>` : ""}
        <div class="territory-popup-last">Last contact: ${lastStr}</div>
        <button class="territory-popup-btn" onclick="if(window.setView)window.setView('accounts')">Open Account</button>
      </div>`;
  }

  function loadMap() {
    if (!window.L) return;
    const container = document.getElementById("territoryMapContainer");
    if (!container) return;

    if (!_map) {
      _map = L.map("territoryMapContainer").setView([31.5, -99.5], 6);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18,
      }).addTo(_map);
    }

    // Clear existing markers
    _markers.forEach(m => m.remove());
    _markers = [];

    const accts = accounts().filter(a => !_filterEntity || a.entity === _filterEntity);

    accts.forEach(account => {
      const coords = getCoords(account);
      if (!coords) return;
      const color = pinColor(account);
      const marker = L.marker(coords, { icon: makeIcon(color) })
        .addTo(_map)
        .bindPopup(buildPopup(account));
      _markers.push(marker);
    });

    // Fit bounds if markers exist
    if (_markers.length > 1) {
      const group = L.featureGroup(_markers);
      _map.fitBounds(group.getBounds().pad(0.1));
    }
  }

  function render() {
    const el = document.getElementById("territoryView");
    if (!el) return;

    const accts = accounts();
    const entityTypes = [...new Set(accts.map(a => a.entity).filter(Boolean))].sort();
    const placed = accts.filter(a => getCoords(a)).length;

    el.innerHTML = `
      <div class="territory-page">
        <div class="territory-toolbar">
          <div class="territory-toolbar-left">
            <span class="territory-count">${placed} of ${accts.length} accounts mapped</span>
          </div>
          <div class="territory-toolbar-right">
            <label class="territory-control-label">Color by
              <select id="territoryColorBy" class="territory-select">
                <option value="entity" ${_colorBy === "entity" ? "selected" : ""}>Entity Type</option>
                <option value="pipeline" ${_colorBy === "pipeline" ? "selected" : ""}>Deal Stage</option>
              </select>
            </label>
            <select id="territoryEntityFilter" class="territory-select">
              <option value="">All types</option>
              ${entityTypes.map(e => `<option value="${esc(e)}" ${_filterEntity === e ? "selected" : ""}>${esc(e)}</option>`).join("")}
            </select>
          </div>
        </div>
        <div id="territoryMapContainer" class="territory-map-container"></div>
        <div class="territory-legend">
          ${Object.entries(ENTITY_COLORS).filter(([e]) => entityTypes.includes(e)).map(([e, c]) =>
            `<span class="territory-legend-item"><span class="territory-legend-dot" style="background:${c}"></span>${esc(e)}</span>`
          ).join("")}
        </div>
      </div>`;

    // Wire controls
    document.getElementById("territoryColorBy")?.addEventListener("change", e => {
      _colorBy = e.target.value;
      loadMap();
    });
    document.getElementById("territoryEntityFilter")?.addEventListener("change", e => {
      _filterEntity = e.target.value;
      loadMap();
    });

    // Load Leaflet CSS/JS if not already loaded
    if (!window.L) {
      if (!document.getElementById("leafletCss")) {
        const link = document.createElement("link");
        link.id = "leafletCss";
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);
      }
      if (!document.getElementById("leafletJs")) {
        const script = document.createElement("script");
        script.id = "leafletJs";
        script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
        script.onload = () => { if (_map) { _map.remove(); } _map = null; loadMap(); };
        document.head.appendChild(script);
      }
    } else {
      if (_map) { _map.remove(); }
      _map = null;
      loadMap();
    }
  }

  window.gripTerritory = { render };

})();
