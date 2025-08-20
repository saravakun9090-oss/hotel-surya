// src/services/mongoSync.js
// Small client to interact with a backend that proxies MongoDB (mongosbb)
const API_BASE = window.__MONGO_API_BASE__ || '/api';

async function expectJson(res) {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await res.text();
    // don't throw — return null so callers can handle missing JSON gracefully
    console.warn('Expected JSON but server returned (truncated):', text.slice(0, 100));
    return null;
  }
  try {
    return await res.json();
  } catch (e) {
    console.warn('Failed parsing JSON response', e);
    return null;
  }
}

export async function loadStateFromMongo() {
  const res = await fetch(`${API_BASE}/state`);
  if (!res.ok) {
    const t = await res.text();
    console.error('Failed to fetch state from server:', res.status, t);
    return null;
  }
  const body = await expectJson(res);
  if (!body) return null;
  return body.state || null;
}

export async function saveStateToMongo(state) {
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
    const res = await fetch(`${API_BASE}/ping`);
    if (!res.ok) {
      const t = await res.text();
      console.error('Ping failed:', res.status, t);
      return false;
    }
  const ct = res.headers.get('content-type') || '';
  // if ping returns HTML, treat as disconnected (dev server serving index.html)
  if (ct.includes('text/html')) return false;
  return true;
  } catch (e) {
    console.error('Ping error', e);
    return false;
  }
}
