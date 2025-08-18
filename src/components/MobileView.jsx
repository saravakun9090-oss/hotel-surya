import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getBaseFolder, ensurePath } from '../utils/fsAccess';
import { ymd } from '../utils/dateUtils';

function safeNameForSearch(name) {
  return String(name || '').replace(/[^\w\-]+/g, '_').toLowerCase();
}

export default function MobileView({ state }) {
  const navigate = useNavigate();
  const [rents, setRents] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [sharing, setSharing] = useState(false);
  const [shareLink, setShareLink] = useState('');
  const [shareError, setShareError] = useState('');
  const [permanentId, setPermanentId] = useState(() => localStorage.getItem('mobile_share_id') || '');
  const [shareToken, setShareToken] = useState(() => localStorage.getItem('mobile_share_token') || '');
  const [netlifyLink, setNetlifyLink] = useState('');
  const [publicLink, setPublicLink] = useState('');
  const [sseConnected, setSseConnected] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  // per-section searches / filters
  const [guestSearch, setGuestSearch] = useState('');
  const [guestFloorFilter, setGuestFloorFilter] = useState('all');
  const [checkoutSearch, setCheckoutSearch] = useState('');
  const [checkoutFloorFilter, setCheckoutFloorFilter] = useState('all');
  const [rentSearch, setRentSearch] = useState('');
  const [rentDateFilter, setRentDateFilter] = useState('');
  const [expenseSearch, setExpenseSearch] = useState('');
  const [expenseDateFilter, setExpenseDateFilter] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const base = await getBaseFolder();
        if (!base) { setLoading(false); return; }

        // load recent rent payments
        try {
          const rentRoot = await ensurePath(base, ['RentCollections']);
          const rows = [];
          for await (const [dateName, dateHandle] of rentRoot.entries()) {
            if (dateHandle.kind !== 'directory') continue;
            for await (const [fileName, fileHandle] of dateHandle.entries()) {
              if (!fileName.endsWith('.json')) continue;
              try {
                const file = await fileHandle.getFile();
                const data = JSON.parse(await file.text());
                rows.push({ ...data, _dateFolder: dateName });
              } catch (e) { continue; }
            }
          }
          rows.sort((a,b)=> (b._dateFolder||'').localeCompare(a._dateFolder||'' ) );
          setRents(rows.slice(0, 200));
        } catch (err) {
          // ignore
        }

        // load recent expenses
        try {
          const expRoot = await ensurePath(base, ['Expenses']);
          const rows = [];
          for await (const [dateName, dateHandle] of expRoot.entries()) {
            if (dateHandle.kind !== 'directory') continue;
            for await (const [fileName, fileHandle] of dateHandle.entries()) {
              if (!fileName.endsWith('.json')) continue;
              try {
                const file = await fileHandle.getFile();
                const data = JSON.parse(await file.text());
                rows.push({ ...data, _dateFolder: dateName });
              } catch (e) { continue; }
            }
          }
          rows.sort((a,b)=> (b._dateFolder||'').localeCompare(a._dateFolder||'' ) );
          setExpenses(rows.slice(0, 200));
        } catch (err) {
          // ignore
        }
      } catch (err) {
        console.warn('MobileView load failed', err);
      }
      setLoading(false);
    })();
  }, []);

  // build simple lists from in-memory state
  const currentGuests = [];
  for (const floorArr of Object.values(state.floors || {})) {
    for (const r of floorArr) {
      if (r.status === 'occupied' && r.guest) {
        const guest = r.guest;
        currentGuests.push({ name: guest.name, contact: guest.contact, id: guest.id || '', rooms: [r.number], checkIn: guest.checkIn || guest.checkInDate || '' });
      }
    }
  }

  // derive floors list for filters
  const floorKeys = Object.keys(state.floors || {}).sort((a,b)=>Number(a)-Number(b));

  // checkouts: treat any occupied room as a potential checkout
  const checkoutList = [];
  for (const floorArr of Object.values(state.floors || {})) {
    for (const r of floorArr) {
      if (r.status === 'occupied') {
        checkoutList.push({ room: r.number, guest: r.guest || {}, floor: Math.floor(r.number/100) });
      }
    }
  }

  const reservations = (state.reservations || []).map(r => ({ name: r.name, room: r.room, date: r.date, place: r.place }));

  const searchFilter = (item) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return Object.values(item).some(v => String(v || '').toLowerCase().includes(q));
  };

  async function openScannedForGuest(guest) {
    try {
      const base = await getBaseFolder();
      if (!base) return alert('Storage not connected');
      const scannedRoot = await ensurePath(base, ['ScannedDocuments']);
      const safe = safeNameForSearch(guest.name);
      let found = null;

      async function recurse(dir) {
        for await (const [name, handle] of dir.entries()) {
          if (found) return;
          if (handle.kind === 'directory') await recurse(handle);
          else if (handle.kind === 'file') {
            if (name.toLowerCase().includes(safe)) { found = { name, handle }; return; }
          }
        }
      }

      await recurse(scannedRoot);
      if (!found) return alert('No scanned ID found for ' + guest.name);
      const file = await found.handle.getFile();
      const url = URL.createObjectURL(file);
      window.open(url, '_blank');
    } catch (err) {
      console.warn('openScannedForGuest failed', err);
      alert('Failed to open scanned ID');
    }
  }

  async function shareSnapshot() {
    try {
      setShareError('');
      setSharing(true);
      setShareLink('');
  const server = (window?.SHARE_SERVER_URL) || null;
      // request a public snapshot so the link is usable from any device without token
      // include netlifyBase if configured so server can return a non-localhost public URL
      const netlifyBase = window.NETLIFY_VIEWER_BASE || localStorage.getItem('netlify_viewer_base') || (()=>{ const v = prompt('Enter public viewer base (Netlify site) for non-localhost links'); if(v){ localStorage.setItem('netlify_viewer_base', v); return v; } return null; })();
      const body = { state, rents, expenses, reservations: (state.reservations || []), public: true };
      if (netlifyBase) body.netlifyBase = netlifyBase;
      const resp = await fetch(`${server.replace(/\/$/, '')}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!resp.ok) throw new Error('Server error: ' + resp.status);
      const data = await resp.json();
  setShareLink(data.url || (server + '/s/' + (data.id || '')));
      if (data.id) {
        setPermanentId(data.id);
        localStorage.setItem('mobile_share_id', data.id);
  // public permanent link (no token) - prefer server-returned publicUrl
  try { setPublicLink(data.publicUrl || (window?.SHARE_SERVER_URL ? (window.SHARE_SERVER_URL.replace(/\/$/, '') + '/m/' + data.id) : null)); } catch (e) {}
      }
      if (data.token) {
        setShareToken(data.token);
        localStorage.setItem('mobile_share_token', data.token);
      }
      // build a Netlify-friendly viewer link (so static SPA on Netlify can point to this share server)
      try {
        const serverBase = server.replace(/\/$/, '');
        const netlifyBase = (window?.NETLIFY_VIEWER_BASE) || 'https://celebrated-trifle-323479.netlify.app';
        if (data.id) {
          const kPart = data.token ? ('?k=' + encodeURIComponent(data.token)) : '';
          const serverParam = data.token ? ('&server=' + encodeURIComponent(serverBase)) : ('?server=' + encodeURIComponent(serverBase));
          const nl = netlifyBase.replace(/\/$/, '') + '/s/' + data.id + kPart + serverParam;
          setNetlifyLink(nl);
        }
      } catch (e) { /* ignore */ }
    } catch (err) {
      console.warn('Share failed', err);
      setShareError(String(err?.message || err));
    } finally { setSharing(false); }
  }

  const copyLink = async () => {
    if (!shareLink) return;
    try { await navigator.clipboard.writeText(shareLink); } catch (e) { /* ignore */ }
  };

  // connect to SSE viewer to show connection status (optional for client)
  useEffect(() => {
  if (!permanentId) return;
  const server = (window?.SHARE_SERVER_URL) || null;
    try {
  if(!server) return setSseConnected(false);
  const url = `${server.replace(/\/$/, '')}/sse/${permanentId}` + (shareToken ? ('?k=' + encodeURIComponent(shareToken)) : '');
      const src = new EventSource(url);
      src.onopen = () => setSseConnected(true);
      src.onerror = () => setSseConnected(false);
      src.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'update' && msg.updated) setLastUpdated(msg.updated);
          if (msg.type === 'init' && msg.updated) setLastUpdated(msg.updated);
        } catch (e) { /* ignore */ }
      };
      return () => src.close();
    } catch (e) { setSseConnected(false); }
  }, [permanentId]);

  async function pushNow() {
    const id = permanentId || localStorage.getItem('mobile_share_id');
    if (!id) return alert('No permanent id registered');
    try {
  const server = (window?.SHARE_SERVER_URL) || null;
  if(!server) return alert('No share server configured');
  const url = `${server.replace(/\/$/, '')}/update/${id}` + (shareToken ? ('?k=' + encodeURIComponent(shareToken)) : '');
      const resp = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state, rents, expenses, reservations: (state.reservations || []) })
      });
      if (!resp.ok) throw new Error('update failed ' + resp.status);
      alert('Pushed update');
    } catch (err) {
      console.warn('pushNow failed', err);
      alert('Push failed: ' + String(err?.message || err));
    }
  }

  // expose extra payload globally so App.jsx can include it in debounced background pushes
  useEffect(() => {
    try { window.__MOBILE_SHARE_EXTRA__ = { rents, expenses, reservations: (state.reservations || []) }; } catch (e) { }
    return () => { try { delete window.__MOBILE_SHARE_EXTRA__; } catch (e) { } };
  }, [rents, expenses, state.reservations]);

  // filtering helpers for sections
  const matchText = (item, txt) => {
    const q = String(txt || '').trim().toLowerCase();
    if (!q) return true;
    return Object.values(item).some(v => String(v || '').toLowerCase().includes(q));
  };

  return (
    <div style={{ padding: 10, maxWidth: 920, margin: '0 auto' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
        <button className="btn" onClick={() => navigate(-1)}>Back</button>
        <h2 style={{ margin: 0, fontSize: 18, flex: 1 }}>Mobile View</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn primary" onClick={shareSnapshot} disabled={sharing} style={{ padding: '6px 10px' }}>
              {sharing ? 'Creating...' : (permanentId ? 'Recreate Permanent Link' : 'Create Permanent Link')}
            </button>
            {permanentId && (
              <>
                      {window?.SHARE_SERVER_URL ? (
                        <a className="btn" href={window.SHARE_SERVER_URL.replace(/\/$/, '') + '/s/' + permanentId} target="_blank" rel="noreferrer">Open Viewer</a>
                      ) : null}
                <button className="btn" onClick={copyLink}>Copy Link</button>
                <button className="btn" onClick={pushNow}>Push now</button>
              </>
            )}
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <input className="input" placeholder="Global search bookings, guest, room, date..." value={query} onChange={e=>setQuery(e.target.value)} />
      </div>

      {/* ROOM GRID */}
      <div style={{ marginBottom: 12 }}>
        <h3 style={{ margin: '8px 0' }}>Rooms</h3>
        <div className="card" style={{ padding: 10 }}>
          {floorKeys.map(f => (
            <div key={f} style={{ marginBottom: 10 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Floor {f}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                {state.floors[f].map(r => (
                  <div key={r.number} style={{
                    height: 56,
                    borderRadius: 8,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    color: '#fff',
                    background: r.status === 'occupied' ? 'green' : (r.status === 'reserved' ? 'orange' : '#e9ecef')
                  }}>{r.number}</div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {shareError && <div style={{ color: 'red', marginBottom: 8 }}>{shareError}</div>}
      {permanentId && (
        <div className="card" style={{ padding: 8, marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>{window?.SHARE_SERVER_URL ? (window.SHARE_SERVER_URL.replace(/\/$/, '') + '/s/' + permanentId + (shareToken ? ('?k=' + shareToken) : '')) : 'No server configured'}</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ fontSize: 12, color: sseConnected ? 'green' : 'orange' }}>{sseConnected ? 'Live' : 'Disconnected'}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{lastUpdated ? new Date(lastUpdated).toLocaleString() : ''}</div>
          </div>
        </div>
      )}

      {publicLink && (
        <div className="card" style={{ padding: 8, marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>{publicLink}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <a className="btn" href={publicLink} target="_blank" rel="noreferrer">Open Public View</a>
            <button className="btn" onClick={() => { try { navigator.clipboard.writeText(publicLink); } catch (e) {} }}>Copy</button>
          </div>
        </div>
      )}

      {netlifyLink && (
        <div className="card" style={{ padding: 8, marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>{netlifyLink}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <a className="btn" href={netlifyLink} target="_blank" rel="noreferrer">Open Netlify Viewer</a>
            <button className="btn" onClick={() => { try { navigator.clipboard.writeText(netlifyLink); } catch (e) {} }}>Copy</button>
          </div>
        </div>
      )}

      <section style={{ marginBottom: 18 }}>
        <h3 style={{ margin: '8px 0' }}>Current Guests</h3>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input className="input" placeholder="Search guests..." value={guestSearch} onChange={e=>setGuestSearch(e.target.value)} />
          <select className="input" value={guestFloorFilter} onChange={e=>setGuestFloorFilter(e.target.value)}>
            <option value="all">All floors</option>
            {floorKeys.map(f=> <option key={f} value={f}>Floor {f}</option>)}
          </select>
        </div>
        {currentGuests.filter(g => matchText(g, guestSearch) && (guestFloorFilter==='all' || String(Math.floor((g.rooms[0]||0)/100)) === String(guestFloorFilter))).length === 0 ? (
          <div style={{ color: 'var(--muted)' }}>No current guests</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {currentGuests.filter(g => matchText(g, guestSearch) && (guestFloorFilter==='all' || String(Math.floor((g.rooms[0]||0)/100)) === String(guestFloorFilter))).map((g, i) => (
              <div key={i} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{g.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>Rooms {g.rooms.join(', ')} — {g.contact}</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn" onClick={() => openScannedForGuest(g)}>Open ID</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={{ marginBottom: 18 }}>
        <h3 style={{ margin: '8px 0' }}>Checkouts</h3>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input className="input" placeholder="Search checkouts..." value={checkoutSearch} onChange={e=>setCheckoutSearch(e.target.value)} />
          <select className="input" value={checkoutFloorFilter} onChange={e=>setCheckoutFloorFilter(e.target.value)}>
            <option value="all">All floors</option>
            {floorKeys.map(f=> <option key={f} value={f}>Floor {f}</option>)}
          </select>
        </div>
        <div style={{ marginBottom: 8, color: 'var(--muted)' }}>Total checkouts: {checkoutList.length}</div>
        {checkoutList.filter(c => matchText(c, checkoutSearch) && (checkoutFloorFilter==='all' || String(c.floor) === String(checkoutFloorFilter))).length === 0 ? (
          <div style={{ color: 'var(--muted)' }}>No checkouts</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {checkoutList.filter(c => matchText(c, checkoutSearch) && (checkoutFloorFilter==='all' || String(c.floor) === String(checkoutFloorFilter))).map((c, i) => (
              <div key={i} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{c.guest?.name || 'Unknown'}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>Room {c.room}</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{c.guest?.contact || ''}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={{ marginBottom: 18 }}>
        <h3 style={{ margin: '8px 0' }}>Reservations</h3>
        {reservations.filter(searchFilter).length === 0 ? (
          <div style={{ color: 'var(--muted)' }}>No reservations</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {reservations.filter(searchFilter).map((r, i) => (
              <div key={i} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{r.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>Room {r.room} — {r.date}</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn primary" onClick={() => navigate('/checkin', { state: { prefName: r.name, prefRoom: r.room } })}>Check-In</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={{ marginBottom: 18 }}>
        <h3 style={{ margin: '8px 0' }}>Recent Rent Payments</h3>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input className="input" placeholder="Search rents..." value={rentSearch} onChange={e=>setRentSearch(e.target.value)} />
          <input className="input" placeholder="Filter by date (YYYY-MM-DD)" value={rentDateFilter} onChange={e=>setRentDateFilter(e.target.value)} />
        </div>
        {loading ? <div>Loading...</div> : rents.filter(r => matchText(r, rentSearch) && (!rentDateFilter || String(r._dateFolder||'').includes(rentDateFilter))).length === 0 ? (
          <div style={{ color: 'var(--muted)' }}>No rent records</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rents.filter(r => matchText(r, rentSearch) && (!rentDateFilter || String(r._dateFolder||'').includes(rentDateFilter))).slice(0,50).map((r, i) => (
              <div key={i} className="card" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>{r.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>Rooms {Array.isArray(r.room)? r.room.join(', '): r.room} — {r._dateFolder}</div>
                </div>
                <div style={{ fontWeight: 800 }}>₹{r.amount}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 style={{ margin: '8px 0' }}>Recent Expenses</h3>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input className="input" placeholder="Search expenses..." value={expenseSearch} onChange={e=>setExpenseSearch(e.target.value)} />
          <input className="input" placeholder="Filter by date (YYYY-MM-DD)" value={expenseDateFilter} onChange={e=>setExpenseDateFilter(e.target.value)} />
        </div>
        {loading ? <div>Loading...</div> : expenses.filter(e => matchText(e, expenseSearch) && (!expenseDateFilter || String(e._dateFolder||'').includes(expenseDateFilter))).length === 0 ? (
          <div style={{ color: 'var(--muted)' }}>No expense records</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {expenses.filter(e => matchText(e, expenseSearch) && (!expenseDateFilter || String(e._dateFolder||'').includes(expenseDateFilter))).slice(0,50).map((e, i) => (
              <div key={i} className="card" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>{e.description}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{e._dateFolder}</div>
                </div>
                <div style={{ fontWeight: 800 }}>₹{e.amount}</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
