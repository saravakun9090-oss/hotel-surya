// src/utils/cacheBus.ts
export function initCacheBus() {
  const onMsg = async (event) => {
    const data = event?.data;
    if (!data) return;

    // Workbox style
    if (data.meta === 'workbox-broadcast-update' && data.payload) {
      const { cacheName, updatedURL } = data.payload;
      const cache = await caches.open(cacheName);
      const resp = await cache.match(updatedURL);
      if (resp) {
        let json = null;
        try { json = await resp.json(); } catch {}
        window.dispatchEvent(new CustomEvent('hotel:cache-updated', {
          detail: { url: updatedURL, json, cacheName }
        }));
      }
      return;
    }

    // Our SW style
    if (data.type === 'DATA_UPDATED' && data.updatedUrl && data.cacheName) {
      const cache = await caches.open(data.cacheName);
      const resp = await cache.match(data.updatedUrl);
      if (resp) {
        let json = null;
        try { json = await resp.json(); } catch {}
        window.dispatchEvent(new CustomEvent('hotel:cache-updated', {
          detail: { url: data.updatedUrl, json, cacheName: data.cacheName }
        }));
      }
    }
  };

  // Prefer BroadcastChannel if available
  if ('BroadcastChannel' in window) {
    const bc = new BroadcastChannel('hotel-live');
    bc.onmessage = onMsg;
  }

  // Fallback to SW postMessage events
  if (navigator.serviceWorker) {
    navigator.serviceWorker.addEventListener('message', onMsg);
  }
}
