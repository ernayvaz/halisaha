const STATIC_CACHE = 'static-v2';
const RUNTIME_CACHE = 'runtime-v2';
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

  const isNavigation = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');

  if (isNavigation) {
    // Network-first for navigations to avoid stale HTML after deploys
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(RUNTIME_CACHE).then((c) => { try { c.put(req, copy); } catch (_) {} });
        return res;
      }).catch(async () => (await caches.match(req)) || caches.match(OFFLINE_URL))
    );
    return;
  }

  if (url.origin === self.location.origin) {
    // Stale-while-revalidate for same-origin static assets (css/js/img)
    event.respondWith((async () => {
      const cached = await caches.match(req);
      const fetchPromise = fetch(req).then((res) => {
        const resClone = res.clone();
        caches.open(RUNTIME_CACHE).then((c) => { try { c.put(req, resClone); } catch (_) {} });
        return res;
      }).catch(() => undefined);
      return cached || (await fetchPromise) || caches.match(OFFLINE_URL);
    })());
  } else {
    // Network-first for cross-origin (APIs)
    event.respondWith(
      fetch(req).then((res) => res).catch(() => caches.match(req))
    );
  }
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});


