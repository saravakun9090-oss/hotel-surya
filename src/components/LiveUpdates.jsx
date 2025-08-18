import React, { useEffect, useState, useRef } from 'react';
import { getBaseFolder, ensurePath, listFiles, readJSONFile } from '../utils/fsAccess';
import { ymd } from '../utils/dateUtils';

const STORAGE_KEY = 'hotel_demo_v2';

function safeParse(raw) {
  try { return JSON.parse(raw); } catch { return null; }
}

export default function LiveUpdates() {
  const [appState, setAppState] = useState(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    return safeParse(raw) || { floors: {}, reservations: [], guests: [] };
  });

  // Remote sync URL (user-provided). Stored in localStorage under 'live_sync_url'
  const [remoteUrl, setRemoteUrl] = useState(() => localStorage.getItem('live_sync_url') || '');
  const [syncStatus, setSyncStatus] = useState('idle');
  const clientIdRef = useRef(localStorage.getItem('live_client_id') || Math.random().toString(36).slice(2));
  useEffect(() => { localStorage.setItem('live_client_id', clientIdRef.current); }, []);

  const [todayRents, setTodayRents] = useState([]);
  const [todayExpenses, setTodayExpenses] = useState([]);
  const mounted = useRef(true);

  // reload localStorage state
  const reloadLocal = () => {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = safeParse(raw);
    if (parsed) setAppState(parsed);
  };

  useEffect(() => {
    mounted.current = true;
    // storage event from other tabs
    const onStorage = (e) => {
      if (e.key === STORAGE_KEY) reloadLocal();
    };
    window.addEventListener('storage', onStorage);

    // short polling fallback (in case some writes don't trigger storage event)
    const iv = setInterval(reloadLocal, 2000);

    return () => { mounted.current = false; window.removeEventListener('storage', onStorage); clearInterval(iv); };
  }, []);

  // Remote sync: poll remote JSON endpoint and push local changes (debounced)
  useEffect(() => {
    if (!remoteUrl) return;
    let running = true;
    let pushTimeout = null;

    const pollRemote = async () => {
      try {
        const res = await fetch(remoteUrl, { method: 'GET', cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        // Expect either { state, lastUpdated } or raw state
        const remoteState = data && data.state ? data.state : data;
        const remoteLast = data && data.lastUpdated ? Number(data.lastUpdated) : 0;

        const localRaw = localStorage.getItem(STORAGE_KEY);
        const localParsed = safeParse(localRaw) || {};

        // If remote has more recent timestamp, apply it locally
        const localLast = Number(localStorage.getItem('live_remote_last') || 0);
        if (remoteLast && remoteLast > localLast) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(remoteState));
          localStorage.setItem('live_remote_last', String(remoteLast));
          setAppState(remoteState);
        }
      } catch (err) {
        // ignore network errors
      }
    };

    // push local to remote (debounced)
    const pushLocal = async () => {
      if (!remoteUrl) return;
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const parsed = safeParse(raw) || {};
        const payload = { state: parsed, lastUpdated: Date.now(), source: clientIdRef.current };
        const res = await fetch(remoteUrl, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (res.ok) {
          const js = await res.json().catch(() => null);
          localStorage.setItem('live_remote_last', String(payload.lastUpdated));
          setSyncStatus('ok');
        } else {
          setSyncStatus('error');
        }
      } catch (err) {
        setSyncStatus('error');
      }
    };

    // immediate poll then interval
    pollRemote();
    const pv = setInterval(pollRemote, 2500);

    // listen to local storage changes and push after debounce
    const onLocalStorage = (e) => {
      if (e.key === STORAGE_KEY) {
        setSyncStatus('syncing');
        if (pushTimeout) clearTimeout(pushTimeout);
        pushTimeout = setTimeout(() => { pushLocal(); }, 500);
      }
    };
    window.addEventListener('storage', onLocalStorage);

    return () => { running = false; clearInterval(pv); window.removeEventListener('storage', onLocalStorage); if (pushTimeout) clearTimeout(pushTimeout); };
  }, [remoteUrl]);

  // Save remote URL to localStorage when changed
  useEffect(() => { localStorage.setItem('live_sync_url', remoteUrl || ''); }, [remoteUrl]);

  // Manual test and push helpers exposed to UI
  const testRemoteNow = async () => {
    if (!remoteUrl) return alert('Enter a remote JSON URL first');
    try {
      setSyncStatus('testing');
      const r = await fetch(remoteUrl, { method: 'GET', cache: 'no-store' });
      if (!r.ok) { setSyncStatus('error'); return alert('Remote test failed: ' + r.status); }
      const d = await r.json();
      alert('Remote reachable.');
      setSyncStatus('ok');
      // if remote has state, offer to load it
      const remoteState = d && d.state ? d.state : d;
      if (confirm('Load remote state into this browser? This will overwrite local view.')) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(remoteState));
        setAppState(remoteState);
      }
    } catch (err) {
      console.warn('Test remote failed', err);
      setSyncStatus('error');
      alert('Remote test failed: ' + (err?.message || String(err)));
    }
  };

  const pushNow = async () => {
    if (!remoteUrl) return alert('Enter a remote JSON URL first');
    try {
      setSyncStatus('syncing');
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = safeParse(raw) || {};
      const payload = { state: parsed, lastUpdated: Date.now(), source: clientIdRef.current };
      const res = await fetch(remoteUrl, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) { setSyncStatus('error'); return alert('Push failed: ' + res.status); }
      localStorage.setItem('live_remote_last', String(payload.lastUpdated));
      setSyncStatus('ok');
      alert('Pushed successfully');
    } catch (err) {
      console.warn('Push failed', err);
      setSyncStatus('error');
      alert('Push failed: ' + (err?.message || String(err)));
    }
  };

  // try to read today rents & expenses from connected storage (File System API)
  useEffect(() => {
    let running = true;
    (async () => {
      try {
        const base = await getBaseFolder();
        if (!base) return;
        const today = ymd(new Date());

        // RentCollections
        try {
          const rentDir = await ensurePath(base, ['RentCollections', today]);
          const files = await listFiles(rentDir, '.json');
          const arr = [];
          for (const f of files) {
            const d = await readJSONFile(f.handle);
            if (d) arr.push(d);
          }
          if (running && mounted.current) setTodayRents(arr.sort((a,b)=> (b._createdTime||0) - (a._createdTime||0)));
        } catch (e) { /* ignore */ }

        // Expenses
        try {
          const expDir = await ensurePath(base, ['Expenses', today]);
          const files = await listFiles(expDir, '.json');
          const arr = [];
          for (const f of files) {
            const d = await readJSONFile(f.handle);
            if (d) arr.push(d);
          }
          if (running && mounted.current) setTodayExpenses(arr.sort((a,b)=> (b._createdTime||0) - (a._createdTime||0)));
        } catch (e) { /* ignore */ }
      } catch (err) {
        console.warn('LiveUpdates: storage read failed', err);
      }
    })();

    return () => { running = false; };
  }, [appState]); // refresh when appState changes (so connected storage reloads after local changes)

  // derive counts and recent lists
  const floors = appState.floors || {};
  let total = 0, free = 0, reserved = 0, occupied = 0;
  for (const arr of Object.values(floors)) {
    for (const r of arr) {
      total++;
      if (r.status === 'occupied') occupied++; else if (r.status === 'reserved') reserved++; else free++;
    }
  }

  const recentCheckins = [];
  for (const arr of Object.values(floors)) {
    for (const r of arr) {
      if (r.status === 'occupied' && r.guest) {
        recentCheckins.push({ room: r.number, name: r.guest.name, time: r.guest.checkIn });
      }
    }
  }
  recentCheckins.sort((a,b) => (b.time||'') > (a.time||'') ? 1 : -1);

  const reservations = appState.reservations || [];

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div className="title">Live Updates</div>
          <div style={{ color: 'var(--muted)', marginTop: 6 }}>Live view of rooms, reservations, and today's collections</div>
        </div>
        <div style={{ minWidth: 360 }}>
          <div className="card" style={{ padding: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
            <input placeholder="Remote JSON URL (PUT/GET)" value={remoteUrl} onChange={(e) => setRemoteUrl(e.target.value)} style={{ flex: 1 }} />
            <button className="btn" onClick={testRemoteNow}>Test</button>
            <button className="btn primary" onClick={pushNow}>Push Now</button>
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: syncStatus === 'error' ? '#b91c1c' : syncStatus === 'ok' ? '#16a34a' : '#6b7280' }}>
            Sync: {syncStatus} {remoteUrl ? `(endpoint set)` : `(no endpoint)`}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 12 }}>
        <div className="stat"><div className="label">Total Rooms</div><div className="value">{total}</div></div>
        <div className="stat"><div className="label">Available</div><div className="value">{free}</div></div>
        <div className="stat"><div className="label">Reserved</div><div className="value">{reserved}</div></div>
        <div className="stat"><div className="label">Occupied</div><div className="value">{occupied}</div></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginTop: 16 }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Room Layout (live)</h3>
          {Object.keys(floors).map(floorNum => (
            <div key={floorNum} style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>Floor {floorNum}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
                {floors[floorNum].map(r => (
                  <div key={r.number} className={`room ${r.status}`} style={{ height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8 }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontWeight: 800 }}>{r.number}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{r.status}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card">
            <h4 style={{ marginTop: 0 }}>Recent Check-ins</h4>
            {recentCheckins.length === 0 ? <div style={{ color: 'var(--muted)' }}>No recent check-ins</div> : (
              recentCheckins.slice(0,8).map((c,i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                  <div><strong>{c.name}</strong> — Room {c.room}</div>
                  <div style={{ color: 'var(--muted)', fontSize: 12 }}>{c.time ? new Date(c.time).toLocaleString() : '-'}</div>
                </div>
              ))
            )}
          </div>

          <div className="card">
            <h4 style={{ marginTop: 0 }}>Today's Reservations</h4>
            {reservations.length === 0 ? <div style={{ color: 'var(--muted)' }}>No reservations</div> : (
              reservations.slice(0,8).map((r,i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                  <div>{r.name} — Room {r.room}</div>
                  <div style={{ color: 'var(--muted)' }}>{r.date}</div>
                </div>
              ))
            )}
          </div>

          <div className="card">
            <h4 style={{ marginTop: 0 }}>Today's Collections</h4>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>Rent</div>
            {todayRents.length === 0 ? <div style={{ color: 'var(--muted)' }}>No rent entries</div> : (
              todayRents.slice(0,6).map((r,i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                  <div>Rooms {Array.isArray(r.room) ? r.room.join(', ') : r.room} — {r.name}</div>
                  <div>₹{r.amount}</div>
                </div>
              ))
            )}
            <div style={{ height: 8 }} />
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>Expenses</div>
            {todayExpenses.length === 0 ? <div style={{ color: 'var(--muted)' }}>No expenses</div> : (
              todayExpenses.slice(0,6).map((e,i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                  <div>{e.description}</div>
                  <div>₹{e.amount}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
