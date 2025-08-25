import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

// If VITE_MONGO_API_BASE is defined, use it; else default to the Render API
const API_BASE =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_MONGO_API_BASE)
    ? import.meta.env.VITE_MONGO_API_BASE
    : 'https://hotel-app-backend-2gxi.onrender.com/api';

// -------- generic polling hook (backend-only) --------
function usePolling(url, intervalMs = 2500) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    let timer = null;

    const tick = async () => {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        const ct = (res.headers.get('content-type') || '').toLowerCase();
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        if (!ct.includes('application/json')) throw new Error('Non-JSON response');
        const json = await res.json();
        if (!mounted) return;
        setData(json?.state || null);
        setError('');
        setLoading(false);
      } catch (e) {
        if (!mounted) return;
        setError(String(e?.message || e));
        setLoading(false);
      }
    };

    tick();
    timer = setInterval(tick, intervalMs);
    return () => { mounted = false; if (timer) clearInterval(timer); };
  }, [url, intervalMs]);

  return { data, loading, error };
}

// -------- helpers (pure) --------
function normalizeCheckInYmd(guest) {
  if (guest?.checkIn) return new Date(guest.checkIn).toISOString().slice(0, 10);
  if (guest?.checkInDate) {
    const d = String(guest.checkInDate);
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(d)) {
      const [dd, mm, yyyy] = d.split('/');
      return `${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  }
  return '';
}

function buildPaymentsIndex(rentPayments) {
  const exact = new Map();
  const approx = new Map();
  for (const p of rentPayments || []) {
    const amount = Number(p.amount) || 0;
    const name = String(p.name || '').trim().toLowerCase();
    const cin = (p.checkInYmd || '').slice(0, 10);
    const date = (p.date || '').slice(0, 10);
    const roomsKey = Array.isArray(p.room)
      ? p.room.slice().sort((a,b)=>a-b).join('')
      : String(p.room || '').split(',').map(s=>Number(s.trim())).filter(Boolean).sort((a,b)=>a-b).join('');

    if (name && cin) {
      const k = `${name}::${cin}`;
      exact.set(k, (exact.get(k) || 0) + amount);
    } else if (name) {
      const k2 = `${name}::${roomsKey}::${date}`;
      approx.set(k2, (approx.get(k2) || 0) + amount);
    }
  }
  return { exact, approx };
}

const COLORS = {
  deep: '#0b3d2e',
  muted: '#6b7280',
  cream: '#f7f5ee',
  border: 'rgba(0,0,0,0.12)'
};

const legendDot = (bg) => ({
  display: 'inline-block',
  width: 8,
  height: 8,
  borderRadius: 2,
  background: bg,
  marginRight: 6,
  border: '1px solid rgba(0,0,0,0.1)',
  verticalAlign: 'middle'
});

const roomBoxStyle = (r) => {
  const base = {
    height: 44,
    borderRadius: 8,
    fontWeight: 800,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1px solid rgba(0,0,0,0.14)',
    userSelect: 'none',
    color: COLORS.deep
  };
  if (r.status === 'occupied') return { ...base, background: '#bfe8cb' };
  if (r.status === 'reserved') return { ...base, background: '#ffe3a6' };
  return { ...base, background: '#fff' };
};

// -------- subpages rendered from server state only --------
function ReservationsTab({ state }) {
  const list = state?.reservations || [];
  return (
    <div className="card" style={{ padding: 12 }}>
      <div style={{ fontWeight: 900, marginBottom: 8 }}>Reservations (server)</div>
      {list.length === 0 && <div style={{ color: COLORS.muted }}>No reservations</div>}
      {list.map((r, i) => (
        <div key={i} className="card" style={{ padding: 10, display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 700 }}>
              {r.name}{r.place ? ` – ${r.place}` : ''}
            </div>
            <div style={{ fontSize: 12, color: COLORS.muted }}>Room {r.room} — {r.date}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function CheckoutTab({ state }) {
  const list = (state?.checkouts || [])
    .slice()
    .sort((a,b)=> new Date(b.checkOutDateTime||b.createdAt||0) - new Date(a.checkOutDateTime||a.createdAt||0));
  return (
    <div className="card" style={{ padding: 12 }}>
      <div style={{ fontWeight: 900, marginBottom: 8 }}>Checked-Out (server)</div>
      {list.length === 0 && <div style={{ color: COLORS.muted }}>No checkouts</div>}
      {list.map((c,i)=>(
        <div key={c.id || i} className="card" style={{ padding: 10 }}>
          <div style={{ fontWeight: 700 }}>{c.name}</div>
          <div style={{ fontSize: 12, color: COLORS.muted }}>
            Rooms {Array.isArray(c.room) ? c.room.join(', ') : Array.isArray(c.rooms) ? c.rooms.join(', ') : (c.room ?? '—')}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 6, fontSize: 12, marginTop: 6 }}>
            <div>Check-In: {(c.checkInDate || '—')} {(c.checkInTime || '')}</div>
            <div>Check-Out: {(c.checkOutDate || '—')} {(c.checkOutTime || '')}</div>
            {'daysStayed' in c && <div>Days Stayed: {c.daysStayed}</div>}
            {'totalRent' in c && <div>Rent: ₹{c.totalRent}</div>}
            {'totalPaid' in c && <div>Total Paid: ₹{c.totalPaid}</div>}
            {'paymentTallyStatus' in c && (
              <div>Payment Status: {String(c.paymentTallyStatus).toLowerCase()==='tallied' ? '✅ Tallied' : '❌ Not Tallied'}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function RentPaymentTab({ state }) {
  const rows = state?.rentPayments || state?.rent_payments || [];
  const sorted = rows.slice().sort((a,b)=> new Date(b.createdAt||b.date||0) - new Date(a.createdAt||a.date||0));
  return (
    <div className="card" style={{ padding: 12 }}>
      <div style={{ fontWeight: 900, marginBottom: 8 }}>Rent Payments (server)</div>
      {sorted.length === 0 && <div style={{ color: COLORS.muted }}>No rent payments</div>}
      {sorted.map((r, i)=>(
        <div key={r.id || i} className="card" style={{ padding: 10, display: 'flex', justifyContent: 'space-between' }}>
          <div>Rooms {Array.isArray(r.room) ? r.room.join(', ') : r.room} — <strong>{r.name}</strong></div>
          <div>₹{r.amount} ({r.mode}) on {(r.date || '').slice(0,10)}</div>
        </div>
      ))}
    </div>
  );
}

function ExpensesTab({ state }) {
  const rows = state?.expenses || [];
  const sorted = rows.slice().sort((a,b)=> new Date(b.createdAt||b.date||0) - new Date(a.createdAt||a.date||0));
  return (
    <div className="card" style={{ padding: 12 }}>
      <div style={{ fontWeight: 900, marginBottom: 8 }}>Expenses (server)</div>
      {sorted.length === 0 && <div style={{ color: COLORS.muted }}>No expenses</div>}
      {sorted.map((e, i)=>(
        <div key={e.id || i} className="card" style={{ padding: 10, display: 'flex', justifyContent: 'space-between' }}>
          <div>{e.description}</div>
          <div>₹{e.amount} on {(e.date || '').slice(0,10)}</div>
        </div>
      ))}
    </div>
  );
}

export default function LiveUpdate() {
  const { data: remoteState, loading, error } = usePolling(`${API_BASE}/state`, 2000);
  const loc = useLocation();
  const sub = loc.pathname.split('/').pop();

  // floors and room layout
  const floors = useMemo(()=> remoteState?.floors || {}, [remoteState]);
  const roomsByFloor = useMemo(() => {
    const map = {};
    for (const [fnum, list] of Object.entries(floors)) {
      map[fnum] = (list || []).slice().sort((a,b)=>a.number - b.number);
    }
    return map;
  }, [floors]);

  // occupied groups
  const allRooms = useMemo(()=>{
    const arr = [];
    for (const fl of Object.values(floors)) for (const r of fl) arr.push(r);
    return arr.sort((a,b)=>a.number - b.number);
  }, [floors]);

  const occupiedGroups = useMemo(()=>{
    const map = new Map();
    for (const r of allRooms) {
      if (r.status !== 'occupied' || !r.guest) continue;
      const key = `${r.guest.name || ''}::${r.guest.checkIn || ''}`;
      if (!map.has(key)) map.set(key, { guest: r.guest, rooms: [], checkIn: r.guest.checkIn || r.guest.checkInDate || '' });
      map.get(key).rooms.push(r.number);
    }
    return Array.from(map.values())
      .map(x=>({ guest: x.guest, rooms: x.rooms.sort((a,b)=>a-b), _ts: x.checkIn ? (new Date(x.checkIn).getTime()||0) : 0 }))
      .sort((a,b)=> b._ts - a._ts);
  }, [allRooms]);

  const paymentsIndex = useMemo(
    ()=> buildPaymentsIndex(remoteState?.rentPayments || remoteState?.rent_payments || []),
    [remoteState]
  );

  const [guestSearch, setGuestSearch] = useState('');

  const CurrentGuestsCard = (
    <div
      className="card"
      style={{
        padding: 12,
        borderRadius: 10,
        background: COLORS.cream,
        border: `1px solid ${COLORS.border}`
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontWeight: 900 }}>Current Guests</div>
        <div style={{ fontSize: 13, color: COLORS.muted }}>{occupiedGroups.length} occupied</div>
      </div>

      <div style={{ marginBottom: 8 }}>
        <input
          className="input"
          placeholder="Search guest or room..."
          value={guestSearch}
          onChange={(e)=>setGuestSearch(e.target.value)}
          style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${COLORS.border}` }}
        />
      </div>

      {occupiedGroups.length === 0 && <div style={{ color: COLORS.muted }}>No rooms are occupied</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360, overflowY: 'auto', paddingRight: 6 }}>
        {occupiedGroups.filter(g=>{
          const q = guestSearch.trim().toLowerCase();
          if (!q) return true;
          const name = String(g.guest?.name || '').toLowerCase();
          const rooms = (g.rooms || []).map(String).join(', ');
          return name.includes(q) || rooms.includes(q);
        }).map((g, idx)=>{
          const name = g.guest?.name || 'Guest';
          const cinYmd = normalizeCheckInYmd(g.guest);
          const nameKey = String(name).trim().toLowerCase();
          const roomsKey = (g.rooms || []).slice().sort((a,b)=>a-b).join('_');

          let paidSoFar = cinYmd ? (paymentsIndex.exact.get(`${nameKey}::${cinYmd}`) || 0) : 0;
          if (!paidSoFar) {
            let sum = 0;
            for (const [k, v] of paymentsIndex.approx.entries()) {
              const [nm, rk] = k.split('::');
              if (nm === nameKey && rk === roomsKey) sum += v;
            }
            paidSoFar = sum;
          }

          const initials = (String(name).split(' ').map(n=>n).filter(Boolean).slice(0,2).join('') || name.slice(0,2)).toUpperCase();

          return (
            <div key={idx} className="card" style={{ padding: 10, display: 'flex', gap: 12, alignItems: 'center', background: '#fff', borderRadius: 10, border: `1px solid ${COLORS.border}` }}>
              <div style={{ width: 40, height: 40, borderRadius: 8, background: '#f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>
                {initials}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                <div style={{ fontSize: 12, color: COLORS.muted }}>Room {(g.rooms || []).join(', ')}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 6, fontSize: 12, marginTop: 6 }}>
                  <div>Phone no: {g.guest?.contact || '—'}</div>
                  <div>Price: ₹{g.guest?.rate || 0}/day</div>
                  <div>In: {g.guest?.checkInDate || (g.guest?.checkIn ? new Date(g.guest.checkIn).toLocaleDateString() : '—')} {g.guest?.checkInTime || ''}</div>
                  <div>Paid: ₹{paidSoFar}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const RoomLayoutCard = (
    <div
      className="card"
      style={{
        padding: 12,
        borderRadius: 10,
        background: COLORS.cream,
        border: `1px solid ${COLORS.border}`
      }}
    >
      <div style={{ fontWeight: 900, marginBottom: 8 }}>Room Layout (Today)</div>
      <div style={{ display: 'flex', gap: 12, color: COLORS.muted, fontSize: 12, marginBottom: 6, flexWrap: 'wrap' }}>
        <div><span style={legendDot('#fff')} /> Free</div>
        <div><span style={legendDot('#ffe3a6')} /> Reserved</div>
        <div><span style={legendDot('#bfe8cb')} /> Occupied</div>
      </div>
      {Object.keys(roomsByFloor).map(floorNum=>{
        const list = roomsByFloor[floorNum];
        if (!list || list.length === 0) return null;
        return (
          <div key={floorNum} style={{ marginBottom: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: COLORS.muted, marginBottom: 6 }}>Floor {floorNum}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {list.map(r=>(
                <div
                  key={r.number}
                  style={roomBoxStyle(r)}
                  title={
                    r.status === 'reserved'
                      ? `Reserved for: ${r.reservedFor?.name || 'Guest'}`
                      : r.status === 'occupied'
                      ? `Occupied by: ${r.guest?.name || 'Guest'}`
                      : 'Free'
                  }
                >
                  {String(r.number).padStart(2, '0')}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );

  // Subroute rendering (server-only views)
  let subView = null;
  if (sub === 'reservations') subView = <ReservationsTab state={remoteState} />;
  else if (sub === 'checkout') subView = <CheckoutTab state={remoteState} />;
  else if (sub === 'rentpayment') subView = <RentPaymentTab state={remoteState} />;
  else if (sub === 'expenses') subView = <ExpensesTab state={remoteState} />;

  const isRoot = loc.pathname === '/liveupdate' || loc.pathname === '/liveupdate/';

  return (
    <div className="p-3 md:p-4 max-w-7xl mx-auto">
      {isRoot && (
        <div className="flex gap-2 mb-3" style={{ overflowX: 'auto', paddingBottom: 2 }}>
          <Link to="/liveupdate/checkout" className="pill">Checkout</Link>
          <Link to="/liveupdate/reservations" className="pill">Reservations</Link>
          <Link to="/liveupdate/rentpayment" className="pill">Rent Payments</Link>
          <Link to="/liveupdate/expenses" className="pill">Expenses</Link>
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-4">
        {isRoot && <div style={{ flex: 1, minWidth: 280 }}>{RoomLayoutCard}</div>}
        <div className="flex-1">
          <div className="card" style={{ padding: 12, borderRadius: 10, border: `1px solid ${COLORS.border}` }}>
            {isRoot ? CurrentGuestsCard : subView}
          </div>
        </div>
      </div>

      {loading && <div style={{ color: COLORS.muted, marginTop: 8, fontSize: 13 }}>Loading…</div>}
      {error && <div style={{ color: '#b91c1c', marginTop: 8, fontSize: 13 }}>Error: {error}</div>}
    </div>
  );
}
