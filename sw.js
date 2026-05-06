// Service Worker v1413 — Enhanced caching with auto-versioning
const SW_VERSION = '1413';
const CACHE_NAME = `sf-prep-v${SW_VERSION}-${new Date().toISOString().slice(0,10).replace(/-/g,'')}`;

const CORE_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/responsive.css',
  '/src/components.js',
  '/app.js',
  '/src/ui-shell.js',
  '/code-practice.js',
  '/manifest.json'
];

const FONT_ASSETS = [
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=Plus+Jakarta+Sans:wght@400;600;700&family=Syne:wght@400;600;700;800&family=JetBrains+Mono:wght@400;500&family=Outfit:wght@300;400;500;600&display=swap'
];

// Install: Cache core assets
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log(`📦 PWA v${SW_VERSION}: Caching core assets...`);
      // Cache core assets, but don't fail install if fonts are blocked
      return cache.addAll(CORE_ASSETS).then(() => {
        return Promise.allSettled(
          FONT_ASSETS.map(url => cache.add(url).catch(() => {
            console.warn(`⚠️ PWA: Could not cache external asset: ${url}`);
          }))
        );
      });
    })
  );
});

// Activate: Cleanup old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key.startsWith('sf-prep-') && key !== CACHE_NAME)
        .map((key) => {
          console.log(`🧹 PWA: Cleaning old cache: ${key}`);
          return caches.delete(key);
        })
    )).then(() => {
      console.log(`✅ PWA v${SW_VERSION}: Activated`);
      return self.clients.claim();
    })
  );
});

// Fetch: Network-first for HTML/API, Cache-first for static assets
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip API calls and non-GET requests entirely
  if (url.pathname.startsWith('/api/') || request.method !== 'GET') {
    return;
  }

  // Cache-first for static assets (CSS, JS, fonts, images)
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        }).catch(() => cached);
      })
    );
    return;
  }

  // Network-first for HTML pages
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});

function isStaticAsset(url) {
  const ext = url.pathname.split('.').pop().toLowerCase();
  return ['css', 'js', 'woff', 'woff2', 'ttf', 'otf', 'png', 'jpg', 'jpeg', 'webp', 'svg', 'ico', 'json'].includes(ext) ||
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com';
}
