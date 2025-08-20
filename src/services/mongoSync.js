// src/services/mongoSync.js
// Small client to interact with a backend that proxies MongoDB (mongosbb)
const API_BASE = window.__MONGO_API_BASE__ || '/api';

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
    // ping may return non-json, but OK status is enough
    return true;
  } catch (e) {
    console.error('Ping error', e);
    return false;
  }
}
