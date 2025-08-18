import React, { useEffect, useState, useRef } from 'react';
import { ymd } from '../utils/dateUtils';

const STORAGE_KEY = 'hotel_demo_v2';

function safeParse(raw) { try { return JSON.parse(raw); } catch { return null; } }

export default function PublicLive({ id }) {
  const [remoteUrl, setRemoteUrl] = useState(null);
  const [state, setState] = useState(() => safeParse(localStorage.getItem(STORAGE_KEY)) || { floors: {}, reservations: [] });
  const mounted = useRef(true);

  // Resolve mapping from /live-mappings.json or localStorage
  useEffect(() => {
    mounted.current = true;
    (async () => {
      try {
        // try mapping file first
        const mapResp = await fetch('/live-mappings.json', { cache: 'no-store' }).catch(() => null);
        if (mapResp && mapResp.ok) {
          const mapping = await mapResp.json().catch(() => null);
          if (mapping && mapping[id]) { setRemoteUrl(mapping[id]); return; }
        }

        // fallback to localStorage mapping key
        const ls = localStorage.getItem('live_public_url_' + id);
        if (ls) { setRemoteUrl(ls); return; }

        // nothing found
        setRemoteUrl(null);
      } catch (err) {
        console.warn('PublicLive mapping error', err);
        setRemoteUrl(null);
      }
    })();
    return () => { mounted.current = false; };
  }, [id]);

  // Poll remote URL for state
  useEffect(() => {
    if (!remoteUrl) return;
    let running = true;
    const poll = async () => {
      try {
        const r = await fetch(remoteUrl, { cache: 'no-store' });
        if (!r.ok) return;
        const data = await r.json();
        const remoteState = data && data.state ? data.state : data;
        if (!running) return;
        if (remoteState) {
          setState(remoteState);
        }
      } catch (err) { /* ignore network errors */ }
    };
    poll();
    const iv = setInterval(poll, 2000);
    return () => { running = false; clearInterval(iv); };
  }, [remoteUrl]);

  // derive counts
  const floors = state.floors || {};
  let total = 0, free = 0, reserved = 0, occupied = 0;
  for (const arr of Object.values(floors)) {
    for (const r of arr) { total++; if (r.status === 'occupied') occupied++; else if (r.status === 'reserved') reserved++; else free++; }
  }

  const recent = [];
  for (const arr of Object.values(floors)) {
    for (const r of arr) { if (r.status === 'occupied' && r.guest) recent.push({ name: r.guest.name, room: r.number, time: r.guest.checkIn }); }
  }
  recent.sort((a,b) => (b.time||'') > (a.time||'') ? 1 : -1);

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div className="title">Live view — {id}</div>
          <div style={{ color: 'var(--muted)', marginTop: 6 }}>Read-only live activity (owner view)</div>
        </div>
        <div style={{ fontSize: 12, color: '#6b7280' }}>{remoteUrl ? 'Source: remote' : 'No remote URL configured'}</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 12 }}>
        <div className="stat"><div className="label">Total Rooms</div><div className="value">{total}</div></div>
        <div className="stat"><div className="label">Available</div><div className="value">{free}</div></div>
        <div className="stat"><div className="label">Reserved</div><div className="value">{reserved}</div></div>
        <div className="stat"><div className="label">Occupied</div><div className="value">{occupied}</div></div>
      </div>

      <div style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>Recent Check-ins</h3>
        {recent.length === 0 ? <div style={{ color: 'var(--muted)' }}>No recent check-ins</div> : (
          recent.slice(0,8).map((r,i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
              <div><strong>{r.name}</strong> — Room {r.room}</div>
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>{r.time ? new Date(r.time).toLocaleString() : '-'}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
