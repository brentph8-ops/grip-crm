// ─────────────────────────────────────────────────────────────────
// GRIP Service Worker — offline caching + PWA support
// ─────────────────────────────────────────────────────────────────

const CACHE = 'grip-v43';

const PRECACHE = [
  '/',
  '/index.html',
  '/contractor.html',
  '/src/styles.css',
  '/src/app.js',
  '/src/data.js',
  '/src/grip-sync.js',
  '/src/supabase-client.js',
  '/src/contractor.js',
  '/src/outreach.js',
  '/src/today.js',
  '/src/pipeline.js',
  '/src/territory.js',
  '/src/map.js',
  '/src/leaflet.min.js',
  '/src/leaflet.min.css',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// ── Install: pre-cache all app shell assets ───────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(PRECACHE))
      .catch(err => console.warn('GRIP SW pre-cache partial fail:', err))
  );
  self.skipWaiting();
});

// ── Activate: remove old caches, then reload all open tabs ────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
      .then(clients => {
        clients.forEach(client => {
          // Tell each open tab to reload so it picks up the new code.
          client.postMessage({ type: 'GRIP_SW_UPDATED', version: CACHE });
        });
      })
  );
  self.clients.claim();
});

// ── Fetch: cache-first for app assets, network-first for API ─────
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Never intercept Supabase API, Google OAuth, map tiles, geocoder,
  // or non-HTTP schemes (chrome-extension://, data:, blob:, etc.)
  if (
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('google') ||
    url.hostname.includes('jsdelivr') ||
    url.hostname.includes('cloudflare') ||
    url.hostname.includes('tile.openstreetmap.org') ||
    url.hostname.includes('nominatim.openstreetmap.org') ||
    url.hostname.includes('arcgisonline.com') ||
    e.request.method !== 'GET' ||
    !url.protocol.startsWith('http')
  ) return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      const network = fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => cached || new Response('Offline', { status: 503 }));
      return cached || network;
    })
  );
});
