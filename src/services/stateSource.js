// services/stateSource.js
import { getBaseFolder } from '../utils/fsAccess';
import { hydrateStateFromDisk } from './diskSync';

const STORAGE_KEY = 'hotel_demo_v2';

export function generateDefault() {
  // import or duplicate generateDefault if needed
}

export function loadStateFromLocal() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export async function getAuthoritativeState(preloadedState) {
  // 1) disk
  try {
    const base = await getBaseFolder();
    if (base) {
      const synced = await hydrateStateFromDisk(preloadedState || loadStateFromLocal() || generateDefault());
      if (synced) return synced;
    }
  } catch {}
  // 2) localStorage
  const local = loadStateFromLocal();
  if (local) return local;

  // 3) remote API (only if configured)
  try {
    const API_BASE =
      window.__MONGO_API_BASE__ ||
      (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_MONGO_API_BASE) ||
      '/api';
    // If API_BASE is a relative '/api' but no server exists (file:// or plain file hosting), fetch will fail and we catch below
    const res = await fetch(`${API_BASE}/state`, { cache: 'no-store' });
    if (res.ok) {
      const json = await res.json();
      return normalizeServerState(json?.state);
    }
  } catch {}

  // 4) default
  return generateDefault();
}

function normalizeServerState(server) {
  // Ensure the shape matches local “state” used by App (floors, reservations, etc.)
  if (!server) return generateDefault();
  // Floors
  const floors = server.floors || {};
  // Guests list may need to be merged into rooms (if server does not embed into rooms)
  // Assuming server already provides the same shape as pasted.
  const out = {
    floors: floors,
    guests: server.guests || [],
    reservations: server.reservations || [],
    checkouts: server.checkouts || [],
    rentPayments: server.rentPayments || [],
    expenses: server.expenses || [],
  };
  return out;
}
