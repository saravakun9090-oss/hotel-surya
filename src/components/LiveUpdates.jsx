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
