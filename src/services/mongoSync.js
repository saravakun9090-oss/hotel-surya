// src/services/mongoSync.js
// Small client to interact with a backend that proxies MongoDB (mongosbb)
// Prefer a build-time variable (VITE_MONGO_API_BASE). In dev fall back to '/api'.
const BUILD_BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_MONGO_API_BASE)
  ? import.meta.env.VITE_MONGO_API_BASE
  : null;
const API_BASE = BUILD_BASE || (window.__MONGO_API_BASE__ || ((typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV) ? '/api' : null));

async function expectJson(res) {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await res.text();
    console.error('Expected JSON but server returned:', text);
    throw new Error('Server returned non-JSON response (see console)');
  }
  return await res.json();
}

export async function loadStateFromMongo() {
  if (!API_BASE) throw new Error('No remote API configured (API_BASE is null)');
  const res = await fetch(`${API_BASE}/state`);
  if (!res.ok) {
    const t = await res.text();
    console.error('Failed to fetch state from server:', res.status, t);
    throw new Error('Failed to fetch state from server');
  }
  const body = await expectJson(res);
  return body.state || null;
}

export async function saveStateToMongo(state) {
  if (!API_BASE) throw new Error('No remote API configured (API_BASE is null)');
  const res = await fetch(`${API_BASE}/state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state })
  });
  if (!res.ok) {
    const t = await res.text();
    console.error('Failed to save state to server:', res.status, t);
    throw new Error('Failed to save state to server');
  }
  return await expectJson(res);
}

export async function testConnection() {
  try {
    if (!API_BASE) return false;
    const res = await fetch(`${API_BASE}/ping`);
    if (!res.ok) {
      const t = await res.text();
      console.error('Ping failed:', res.status, t);
      return false;
    }
    // ping may return non-json, but OK status is enough
    return true;
  } catch (_e) {
    console.error('mongoSync error', _e);
    return { ok: false };
  }
}
