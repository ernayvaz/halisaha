const STATIC_CACHE = 'static-v1';
const RUNTIME_CACHE = 'runtime-v1';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll([
      '/offline.html', '/manifest.webmanifest'
    ])).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => ![STATIC_CACHE, RUNTIME_CACHE].includes(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // Only handle HTTP(S) GET requests – ignore chrome-extension:, data:, etc.
  if (req.method !== 'GET') return;
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  if (url.origin === self.location.origin) {
    // Cache-first for same-origin static
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        const resClone = res.clone();
        // Best-effort cache; ignore failures (opaque responses, etc.)
        caches.open(RUNTIME_CACHE).then((c) => {
          try { c.put(req, resClone); } catch (_) { /* ignore */ }
        });
        return res;
      }).catch(() => caches.match(OFFLINE_URL)))
    );
  } else {
    // Network-first for cross-origin (APIs)
    event.respondWith(
      fetch(req).then((res) => res).catch(() => caches.match(req))
    );
  }
});


