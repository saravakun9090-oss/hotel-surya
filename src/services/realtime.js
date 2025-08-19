import Gun from 'gun';
import 'gun/sea';

let gun = null;
const listeners = {};

export function initGun({ peers = [] } = {}) {
  if (gun) return gun;
  try {
    gun = Gun({ peers });
  } catch (e) {
    console.warn('Failed to init Gun:', e);
    gun = Gun({ peers });
  }
  return gun;
}

export function isGunReady() {
  return !!gun;
}

export function subscribeCollection(collection, cb) {
  if (!gun) initGun();
  // keep a reference so we can .off later
  if (listeners[collection]) return;
  const node = gun.get(collection);
  const h = node.map().on((data, key) => {
    // Gun sometimes sends metadata; ignore empty
    if (!data) return;
    // deliver id as key and the object as data
    cb(String(key), data);
  });
  listeners[collection] = h;
}

export function putDoc(collection, id, doc) {
  if (!gun) initGun();
  const payload = { ...(doc || {}), updatedAt: new Date().toISOString() };
  try {
    gun.get(collection).get(id).put(payload);
  } catch (e) {
    console.warn('Gun put error', e);
  }
  return payload;
}

export function offCollection(collection) {
  if (!gun) return;
  try {
    gun.get(collection).off();
    delete listeners[collection];
  } catch (e) {
    console.warn('Gun off error', e);
  }
}

export function shutdown() {
  try {
    Object.keys(listeners).forEach(c => {
      try { gun.get(c).off(); } catch (e) {}
    });
  } catch (e) {}
  gun = null;
}
