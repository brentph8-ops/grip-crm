// ─────────────────────────────────────────────────────────────────
// GRIP Service Worker — offline caching + PWA support
// ─────────────────────────────────────────────────────────────────

const CACHE = 'grip-v9';

const PRECACHE = [
  '/grip-crm/',
  '/grip-crm/index.html',
  '/grip-crm/contractor.html',
  '/grip-crm/src/styles.css',
  '/grip-crm/src/app.js',
  '/grip-crm/src/data.js',
  '/grip-crm/src/grip-sync.js',
  '/grip-crm/src/supabase-client.js',
  '/grip-crm/src/contractor.js',
  '/grip-crm/src/outreach.js',
  '/grip-crm/src/today.js',
  '/grip-crm/src/pipeline.js',
  '/grip-crm/src/territory.js',
  '/grip-crm/manifest.json',
  '/grip-crm/icons/icon-192.png',
  '/grip-crm/icons/icon-512.png',
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

// ── Activate: remove old caches ───────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch: cache-first for app assets, network-first for API ─────
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Never intercept Supabase API, Google OAuth, non-GET requests,
  // or non-HTTP schemes (chrome-extension://, data:, blob:, etc.)
  if (
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('google') ||
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
      // Serve cache instantly; update in background
      return cached || network;
    })
  );
});
