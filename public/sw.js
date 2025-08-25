/* public/sw.js */
const APP_SHELL_CACHE = 'app-shell-v1';
const DATA_CACHE = 'hotel-data-v1';

// Adjust these to your built asset paths if using Vite/CRA. Include the LiveUpdate route shell.
const SHELL_URLS = [
  '/', '/index.html',
  '/manifest.webmanifest',
  // add your built bundles:
  // '/assets/index-<hash>.js', '/assets/index-<hash>.css'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const c = await caches.open(APP_SHELL_CACHE);
    await c.addAll(SHELL_URLS);
  })());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([APP_SHELL_CACHE, DATA_CACHE]);
    const names = await caches.keys();
    await Promise.all(names.map(n => keep.has(n) ? null : caches.delete(n)));
    await self.clients.claim();
  })());
});

// Decide if a GET request is "data" JSON under your folders
function isDataRequest(url) {
  return url.origin === self.location.origin &&
    (/\/(Checkins|Checkouts|Reservations|RentCollections|Expenses)\//.test(url.pathname)
      || url.pathname.endsWith('.json'));
}

// Broadcast helper: BroadcastChannel if available, else postMessage to clients
const bc = ('BroadcastChannel' in self) ? new BroadcastChannel('hotel-live') : null;
async function broadcast(msg) {
  if (bc) { bc.postMessage(msg); return; }
  const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clientsList) client.postMessage(msg);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // App shell: cache-first
  if (SHELL_URLS.includes(url.pathname) || url.pathname.startsWith('/assets/')) {
    event.respondWith((async () => {
      const cache = await caches.open(APP_SHELL_CACHE);
      const cached = await cache.match(req);
      if (cached) return cached;
      const resp = await fetch(req);
      if (resp && resp.ok) cache.put(req, resp.clone());
      return resp;
    })());
    return;
  }

  // Data: stale-while-revalidate and broadcast on update
  if (isDataRequest(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(DATA_CACHE);
      const cached = await cache.match(req);

      const networkPromise = (async () => {
        try {
          const resp = await fetch(req, { cache: 'no-store' });
          if (resp && resp.ok) {
            await cache.put(req, resp.clone());
            await broadcast({ type: 'DATA_UPDATED', cacheName: DATA_CACHE, updatedUrl: req.url });
          }
          return resp;
        } catch (e) {
          return null;
        }
      })();

      // return cached immediately if present; otherwise wait for network
      return cached || networkPromise;
    })());
  }
});
