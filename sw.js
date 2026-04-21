const CACHE_NAME = 'sf-prep-v1368';
const ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.v1368.js',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=Plus+Jakarta+Sans:wght@400;600;700&display=swap',
  'https://cdn.jsdelivr.net/npm/marked/marked.min.js'
];

// Install Service Worker
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('📦 PWA: Caching Assets...');
      return cache.addAll(ASSETS);
    })
  );
});

// Activate & Cleanup Old Caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => {
        console.log('🧹 PWA: Cleaning old cache:', key);
        return caches.delete(key);
      })
    ))
  );
});

// Network First, Fallback to Cache
self.addEventListener('fetch', (event) => {
  // Skip API calls and non-GET requests
  if (event.request.url.includes('/api/') || event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Update cache with fresh version
        const resClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
