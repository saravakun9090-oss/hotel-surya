import React, { useEffect, useState } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';

function useQuery() {
  const { search } = useLocation();
  return React.useMemo(() => new URLSearchParams(search), [search]);
}

export default function SharedViewer() {
  const { id } = useParams();
  const query = useQuery();
  const token = query.get('k') || '';
  const serverParam = query.get('server') || '';
  const navigate = useNavigate();

  const [state, setState] = useState({});
  const [created, setCreated] = useState(null);
  const [updated, setUpdated] = useState(null);
  const [meta, setMeta] = useState('Connecting...');
  const [err, setErr] = useState('');

  useEffect(() => {
  // allow passing server base in query (useful when SPA hosted elsewhere like Netlify)
  const server = serverParam || (window.SHARE_SERVER_URL) || (window.SERVER_BASE) || 'http://localhost:4000';
  const base = server.replace(/\/$/, '');

    // quick status check to detect invalid token early
    (async () => {
      try {
        const res = await fetch(`${base}/s/${encodeURIComponent(id)}${token ? ('?k=' + encodeURIComponent(token)) : ''}`, { method: 'GET', mode: 'cors' });
        if (res.status === 403) {
          setErr('invalid-token');
          setMeta('Invalid token');
          return;
        }
        if (!res.ok) {
          setErr('server-error');
          setMeta('Server responded ' + res.status);
          return;
        }
        // now open SSE
        const sseUrl = `${base}/sse/${encodeURIComponent(id)}` + (token ? ('?k=' + encodeURIComponent(token)) : '');
        const src = new EventSource(sseUrl);
        src.onopen = () => setMeta('Connected');
        src.onerror = () => setMeta('Disconnected');
        src.onmessage = (ev) => {
          try {
            const msg = JSON.parse(ev.data);
            if (msg.type === 'init') {
              setCreated(msg.created || null);
              setUpdated(msg.updated || null);
              setState(msg.state || {});
            } else if (msg.type === 'update') {
              setUpdated(msg.updated || Date.now());
              setState(msg.state || {});
            }
          } catch (e) { /* ignore */ }
        };
      } catch (e) {
        setErr('connect-failed');
        setMeta('Connection failed');
      }
    })();
  }, [id, token]);

  if (err) {
    return (
      <div style={{ padding: 18 }}>
        <h2>Live Viewer — {id}</h2>
        <div style={{ color: 'red' }}>Error: {err}</div>
        <div style={{ marginTop: 8 }}>{meta}</div>
        <div style={{ marginTop: 12 }}>
          <button onClick={() => navigate(-1)}>Back</button>
        </div>
        <div style={{ marginTop: 18 }}>
          <div>Tip: Make sure you opened the URL with the token query parameter <strong>?k=TOKEN</strong> and that <code>window.SHARE_SERVER_URL</code> (or the server embedded in the returned link) points to your share server host.</div>
        </div>
      </div>
    );
  }

  // simple render of rooms and lists
  const floors = state.floors || {};
  const floorKeys = Object.keys(floors).sort((a,b) => Number(a)-Number(b));
  const reservations = state.reservations || [];
  const rents = state.rents || [];
  const expenses = state.expenses || [];

  return (
    <div style={{ padding: 12, maxWidth: 1100, margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0 }}>Live Viewer — {id}</h2>
          <div style={{ color: '#666' }}>{meta} {updated ? `· Last update ${new Date(updated).toLocaleString()}` : ''}</div>
        </div>
        <div>
          <a href={(window.SHARE_SERVER_URL || 'http://localhost:4000').replace(/\/$/, '') + '/s/' + id + (token ? ('?k=' + token) : '')} target="_blank" rel="noreferrer">Open server viewer</a>
        </div>
      </header>

      <section style={{ marginTop: 12 }}>
        <h3>Rooms</h3>
        <div style={{ display: 'grid', gap: 12 }}>
          {floorKeys.map(f => (
            <div key={f}>
              <div style={{ fontWeight: 700 }}>Floor {f}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginTop: 8 }}>
                {(floors[f]||[]).map(r => {
                  // mark reserved if reservation for today's date matches
                  const today = new Date().toISOString().slice(0,10);
                  const isReserved = (reservations||[]).some(rr => String(rr.date||'').slice(0,10) === today && Number(rr.room) === Number(r.number));
                  const cls = r.status === 'occupied' ? 'occupied' : (isReserved ? 'reserved' : 'free');
                  const bg = cls === 'occupied' ? '#2e8b57' : (cls === 'reserved' ? '#ff8c00' : '#e9ecef');
                  const color = cls === 'free' ? '#222' : '#fff';
                  return <div key={r.number} style={{ background: bg, color, padding: 12, borderRadius: 8, textAlign: 'center', fontWeight: 700 }}>{r.number}</div>;
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginTop: 18, display: 'flex', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <h4>Current Guests</h4>
          <div style={{ maxHeight: '40vh', overflow: 'auto' }}>
            {Object.values(floors).flat().filter(r => r.status === 'occupied' && r.guest).map((r, i) => (
              <div key={i} style={{ padding: 8, borderBottom: '1px solid #eee' }}>
                <div style={{ fontWeight: 700 }}>{r.guest?.name || 'Unknown'}</div>
                <div style={{ fontSize: 12, color: '#666' }}>Room {r.number} — {r.guest?.contact || ''}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ width: 360 }}>
          <h4>Rents</h4>
          <div style={{ maxHeight: '20vh', overflow: 'auto' }}>{rents.map((p, i) => <div key={i} style={{ padding: 8, borderBottom: '1px solid #eee' }}>{p.name || p.description} — ₹{p.amount}</div>)}</div>
          <h4 style={{ marginTop: 12 }}>Expenses</h4>
          <div style={{ maxHeight: '20vh', overflow: 'auto' }}>{expenses.map((e, i) => <div key={i} style={{ padding: 8, borderBottom: '1px solid #eee' }}>{e.description} — ₹{e.amount}</div>)}</div>
        </div>
      </section>
    </div>
  );
}
