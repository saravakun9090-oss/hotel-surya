// src/services/dualSync.js
import { loadStateFromMongo, saveStateToMongo, testConnection } from './mongoSync';

// detect API presence from mongoSync module (it exposes API_BASE indirectly by behavior)
let HAS_API = true;
try {
  // testConnection will return false if no API configured
  testConnection().then(ok => { HAS_API = ok; }).catch(() => { HAS_API = false; });
} catch (_e) { HAS_API = false; }

const OUTBOX_KEY = 'remote_outbox_state';
const FLUSH_INTERVAL = 5000; // try flush every 5s

function readOutbox() {
  try { return JSON.parse(localStorage.getItem(OUTBOX_KEY) || 'null'); } catch { return null; }
}
function writeOutbox(payload) {
  try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(payload)); } catch (_e) { console.warn('writeOutbox failed', _e); }
}
function clearOutbox() { localStorage.removeItem(OUTBOX_KEY); }

// Attempt to save current state to remote. On failure, store in outbox (only last state kept).
export async function saveAll(state) {
  if (!HAS_API) {
    // No remote API configured — skip remote write and don't queue
    return { ok: false, error: 'no-api-configured' };
  }
  try {
    const res = await saveStateToMongo(state);
    clearOutbox();
    return { ok: true, res };
  } catch (_e) {
    console.error('Dual sync run error', _e);
    return { ok: false };
  }
}

// Try to load remote and merge, same as before
export async function tryLoadRemoteAndMerge(localState) {
  try {
    const remote = await loadStateFromMongo();
    if (!remote) return null;
    const merged = { ...remote };
    if (localState?.floors && merged.floors) {
      for (const fnum of Object.keys(merged.floors)) {
        merged.floors[fnum] = merged.floors[fnum].map(r => {
          const old = localState.floors[fnum]?.find(x => x.number === r.number);
          return old ? { ...r, rate: old.rate ?? r.rate } : r;
        });
      }
    }
    return merged;
  } catch (_e) {
    console.warn('tryLoadRemoteAndMerge failed', _e?.message || _e);
    return null;
  }
}

export async function pingAll() {
  return await testConnection();
}

// Background flush loop: attempt to push outbox to remote periodically
let flushTimer = null;
async function flushOnce() {
  const item = readOutbox();
  if (!item || !item.state) return;
  try {
    await saveStateToMongo(item.state);
    clearOutbox();
    console.log('dualSync: flushed outbox to remote');
  } catch (_e) {
    // leave in outbox; will retry later
    //console.warn('dualSync: flush failed', _e?.message || _e);
  }
}

function startFlushLoop() {
  if (flushTimer) return;
  flushTimer = setInterval(flushOnce, FLUSH_INTERVAL);
}

// start on module load
startFlushLoop();
