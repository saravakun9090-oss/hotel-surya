// src/LiveUpdate.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import ReservationsPage from './liveupdate/ReservationsPage';
import CheckoutPage from './liveupdate/CheckoutPage';
import RentPaymentPage from './liveupdate/RentPaymentPage';
import ExpensesPage from './liveupdate/ExpensesPage';

const API_BASE =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_MONGO_API_BASE)
    ? import.meta.env.VITE_MONGO_API_BASE
    : (window.__MONGO_API_BASE__ || '/api');

// Theme tokens (compact, high-contrast)
const COLORS = {
  deep: '#2c3f34',
  cream: '#f7f5ee',
  muted: '#2c3d34ff',
  border: 'rgba(0,0,0,0.12)',
  btn: '#313e35',        // unified button color
  btnText: '#f5f7f4'
};

// Polling helper
function usePolling(url, interval = 2500) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  useEffect(() => {
    let mounted = true;
    let timer = null;
    const once = async () => {
      try {
        if (!url) throw new Error('No API URL configured');
        const res = await fetch(url);
        const ct = (res.headers.get('content-type') || '').toLowerCase();
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
        if (!ct.includes('application/json')) throw new Error('Server returned non-JSON response');
        const json = await res.json();
        if (!mounted) return;
        setData(json.state || null);
        setLoading(false);
        setError(null);
      } catch (e) {
        if (!mounted) return;
        setError(String(e));
        setLoading(false);
      }
    };
    once();
    timer = setInterval(once, interval);
    return () => { mounted = false; if (timer) clearInterval(timer); };
  }, [url, interval]);
  return { data, loading, error };
}

// Unified pill (tab) style with single color 313e35
const PILL_COLOR = COLORS.btn;
const Pill = ({ to, active, children }) => (
  <Link
    to={to}
    className="px-3 py-2 rounded-md text-sm whitespace-nowrap"
    style={{
      color: COLORS.btnText,
      background: PILL_COLOR,
      border: '1px solid rgba(0,0,0,0.18)',
      boxShadow: active ? '0 2px 6px rgba(0,0,0,0.18)' : '0 1px 3px rgba(0,0,0,0.10)',
      opacity: active ? 1 : 0.95,
      transition: 'opacity 120ms ease'
    }}
    onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
    onMouseLeave={(e) => { e.currentTarget.style.opacity = active ? '1' : '0.95'; }}
  >
    {children}
  </Link>
);

// Small legend dot
const legendDot = (bg) => ({
  display: 'inline-block',
  width: 8,
  height: 8,
  borderRadius: 2,
  background: bg,
  verticalAlign: 'middle',
  marginRight: 5,
  border: '1px solid rgba(0,0,0,0.08)'
});

// Compact room tile
const roomBoxStyle = (r) => {
  const base = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,                 // fixed height to remove vertical jitter
    borderRadius: 8,
    fontWeight: 700,
    fontSize: 13,
    cursor: 'default',
    border: '1px solid rgba(0,0,0,0.14)',
    userSelect: 'none',
    boxShadow: '0 1px 1px rgba(0,0,0,0.04)',
    color: COLORS.deep
  };
  if (r.status === 'occupied') return { ...base, background: '#bfe8cb' };
  if (r.status === 'reserved') return { ...base, background: '#ffe3a6' };
  return { ...base, background: '#ffffff' };
};

// Normalize check-in date to yyyy-mm-dd
function normalizeCheckInYmd(guest) {
  if (guest?.checkIn) return new Date(guest.checkIn).toISOString().slice(0, 10);
  if (guest?.checkInDate) {
    const d = guest.checkInDate;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(d)) { const [dd, mm, yyyy] = d.split('/'); return `${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`; }
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  }
  return '';
}

export default function LiveUpdate() {
  const loc = useLocation();
  const path = loc.pathname;
  const isRootLiveUpdate = path === '/liveupdate' || path === '/liveupdate/';

  const { data: remoteState, loading, error } = usePolling(`${API_BASE}/state`, 2500);

  // Search lives inside Current Guests card
  const [guestSearch, setGuestSearch] = useState('');

  const floors = useMemo(() => (remoteState?.floors || {}), [remoteState]);
  const rentPayments = remoteState?.rentPayments || remoteState?.rent_payments || [];

  const allRooms = useMemo(() => {
    const arr = [];
    for (const fl of Object.values(floors)) for (const r of fl) arr.push(r);
    return arr.sort((a, b) => a.number - b.number);
  }, [floors]);

  const roomsByFloor = useMemo(() => {
    const map = {};
    for (const [fnum, list] of Object.entries(floors)) {
      map[fnum] = list.slice().sort((a, b) => a.number - b.number);
    }
    return map;
  }, [floors]);

  // Group occupied by guest
  const occupiedGroups = useMemo(() => {
const map = new Map();
for (const r of allRooms) {
if (r.status !== 'occupied' || !r.guest) continue;
const key = `${r.guest.name || ''}::${r.guest.checkIn || ''}`;
if (!map.has(key)) map.set(key, { guest: r.guest, rooms: [], checkIn: r.guest.checkIn || r.guest.checkInDate || '' });
map.get(key).rooms.push(r.number);
}
const list = Array.from(map.values()).map(x => ({
guest: x.guest,
rooms: x.rooms.sort((a,b)=>a-b),
_checkInTs: x.checkIn ? new Date(x.checkIn).getTime() || 0 : 0
}));
// recent (latest check-in) first
list.sort((a,b)=>b._checkInTs - a._checkInTs);
return list;
}, [allRooms]);

  // Exact stay-matched payments: name::checkInYmd
  const paymentsByStayKey = useMemo(() => {
    const sums = new Map();
    for (const p of rentPayments) {
      const name = (p.name || '').trim().toLowerCase();
      const cin = (p.checkInYmd || '').slice(0, 10);
      if (!name || !cin) continue;
      const key = `${name}::${cin}`;
      sums.set(key, (sums.get(key) || 0) + (Number(p.amount) || 0));
    }
    return sums;
  }, [rentPayments]);

  // Current Guests card
  const currentGuestsCard = useMemo(() => {
    const filtered = occupiedGroups.filter(g => {
      const q = guestSearch.trim().toLowerCase();
      if (!q) return true;
      const name = String(g.guest?.name || '').toLowerCase();
      const rooms = (g.rooms || []).map(String).join(', ');
      return name.includes(q) || rooms.includes(q);
    });

    return (
      <div
        className="card"
        style={{
          padding: 12,
          marginBottom: 10,
          borderRadius: 10,
          boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
          background: COLORS.cream,
          border: `1px solid ${COLORS.border}`
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontWeight: 900, fontSize: 16, color: COLORS.deep }}>Current Guests</div>
          <div style={{ fontSize: 13, color: COLORS.muted }}>{occupiedGroups.length} occupied</div>
        </div>

        <div style={{ marginBottom: 10 }}>
          <input
            className="input"
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 10,
              border: `1px solid ${COLORS.border}`,
              background: '#fff'
            }}
            placeholder="Search guest or room..."
            value={guestSearch}
            onChange={(e) => setGuestSearch(e.target.value)}
          />
        </div>

        {occupiedGroups.length === 0 && <div style={{ color: COLORS.muted }}>No rooms are occupied</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, paddingRight: 6 }}>
            {filtered.map((g, idx) => {
              const name = g.guest?.name || 'Guest';
              const initials =
                (String(name).split(' ').map(n => n[0]).filter(Boolean).slice(0, 2).join('') || name.slice(0, 2)).toUpperCase();
              const cinYmd = normalizeCheckInYmd(g.guest);
              const paidKey = `${(name || '').trim().toLowerCase()}::${cinYmd}`;
              const paidSoFar = paymentsByStayKey.get(paidKey) || 0;

              return (
                <div
                  key={idx}
                  className="card"
                  style={{
                    display: 'flex',
                    gap: 12,
                    alignItems: 'center',
                    padding: 10,
                    borderRadius: 12,
                    border: `1px solid ${COLORS.border}`,
                    background: '#fff'
                  }}
                >
                  <div style={{
                    width: 44, height: 44, borderRadius: 10, background: COLORS.cream,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 14, color: COLORS.deep
                  }}>
                    {initials}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: COLORS.deep }}>
                        {name}
                      </div>
                      <div style={{ fontSize: 12, color: COLORS.muted }}>
                        Room {(g.rooms || []).join(', ')}
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8, marginTop: 8, fontSize: 12, color: COLORS.deep }}>
                      <div>Phone no: {g.guest?.contact || '—'}</div>
                      <div>Price: ₹{g.guest?.rate || 0}/day</div>
                      <div>In: {g.guest?.checkInDate || (g.guest?.checkIn ? new Date(g.guest.checkIn).toLocaleDateString() : '—')} {g.guest?.checkInTime || ''}</div>
                      <div>Paid till now: ₹{paidSoFar}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }, [occupiedGroups, guestSearch, paymentsByStayKey]);

  const sub = path.split('/').pop();

  const renderSubpage = () => {
    if (sub === 'reservations') return <ReservationsPage data={remoteState} />;
    if (sub === 'checkout') return <CheckoutPage data={remoteState} />;
    if (sub === 'rentpayment') return <RentPaymentPage data={remoteState} />;
    if (sub === 'expenses') return <ExpensesPage data={remoteState} />;
    return null;
  };

  return (
    <div className="p-3 md:p-4 max-w-7xl mx-auto" style={{ background: '#fff' }}>
      {/* Tab pills: show ONLY on /liveupdate */}
      {isRootLiveUpdate && (
        <div className="flex flex-col md:flex-row md:items-start gap-3 mb-3">
          <div className="flex-1">
            <div className="flex gap-2 mb-2" style={{ overflowX: 'auto', paddingBottom: 2 }}>
              <Pill to="/liveupdate/checkout" active={sub === 'checkout' || isRootLiveUpdate}>Checkout</Pill>
              <Pill to="/liveupdate/reservations" active={sub === 'reservations'}>Reservations</Pill>
              <Pill to="/liveupdate/rentpayment" active={sub === 'rentpayment'}>Rent Payments</Pill>
              <Pill to="/liveupdate/expenses" active={sub === 'expenses'}>Expenses</Pill>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-4">
        {/* LEFT: Room Layout only on /liveupdate */}
        {isRootLiveUpdate && (
          <div style={{ flex: 1, minWidth: 280 }}>
            <div
              className="card"
              style={{
                padding: 12,
                marginBottom: 10,
                borderRadius: 10,
                background: COLORS.cream,
                boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
                border: `1px solid ${COLORS.border}`
              }}
            >
              <div style={{ fontWeight: 900, marginBottom: 8, color: COLORS.deep }}>Room Layout (Today)</div>

              <div style={{ display: 'flex', gap: 10, fontSize: 12, color: COLORS.muted, marginBottom: 6, flexWrap: 'wrap' }}>
                <div><span style={legendDot('#ffffff')} /> Free</div>
                <div><span style={legendDot('#ffe3a6')} /> Reserved</div>
                <div><span style={legendDot('#bfe8cb')} /> Occupied</div>
              </div>

              {Object.keys(roomsByFloor).map(floorNum => {
                const list = roomsByFloor[floorNum];
                if (!list || list.length === 0) return null;

                // Fixed 4 columns per floor for alignment and density
                return (
                  <div key={floorNum} style={{ marginBottom: 10 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: COLORS.muted, marginBottom: 6 }}>
                      Floor {floorNum}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, alignItems: 'stretch' }}>
                      {list.map(r => (
                        <div
                          key={r.number}
                          style={roomBoxStyle(r)}
                          title={
                            r.status === 'reserved'
                              ? `Reserved for: ${r.reservedFor?.name || 'Guest'}`
                              : r.status === 'occupied'
                              ? `Occupied by: ${r.guest?.name || 'Guest'}\nContact: ${r.guest?.contact || '-'}\nCheck-in: ${r.guest?.checkInDate || '-'} ${r.guest?.checkInTime || ''}`
                              : 'Free'
                          }
                        >
                          <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' }}>
                            {String(r.number).padStart(2, '0')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* RIGHT: subpages or default current guests */}
        <div className="flex-1">
          <div
            className="border rounded p-3 md:p-4"
            style={{
              borderColor: COLORS.border,
              background: '#fff',
              borderRadius: 12,
              boxShadow: '0 2px 12px rgba(0,0,0,0.05)'
            }}
          >
            {isRootLiveUpdate ? currentGuestsCard : (renderSubpage() || null)}
          </div>
        </div>
      </div>

      {loading && <div className="text-sm" style={{ color: COLORS.muted, marginTop: 8 }}>Loading...</div>}
      {error && <div className="text-sm" style={{ color: '#b91c1c', marginTop: 8 }}>{error}</div>}
    </div>
  );
}
