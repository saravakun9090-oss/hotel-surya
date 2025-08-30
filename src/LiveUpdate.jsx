// LiveUpdate.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import ReservationsPage from './liveupdate/ReservationsPage';
import CheckoutPage from './liveupdate/CheckoutPage';
import RentPaymentPage from './liveupdate/RentPaymentPage';
import ExpensesPage from './liveupdate/ExpensesPage';

// Fixed API base from your snippet
const API_BASE = `https://hotel-app-backend-2gxi.onrender.com/api`;

const COLORS = {
  deep: '#2c3f34',
  cream: '#f7f5ee',
  muted: '#2c3d34ff',
  border: 'rgba(0,0,0,0.12)',
  btn: '#313e35',
  btnText: '#f5f7f4'
};

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
        const res = await fetch(url, { cache: 'no-store' });
        const ct = (res.headers.get('content-type') || '').toLowerCase();
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
        if (!ct.includes('application/json')) throw new Error('Server returned non-JSON response');
        const json = await res.json();
        if (!mounted) return;
        const s = (json && typeof json === 'object' && json.state && typeof json.state === 'object') ? json.state : null;
        setData(s);
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

// Poll checkins directly from Mongo
function useCheckins(apiBase, interval = 2500) {
  const [checkins, setCheckins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  useEffect(() => {
    let mounted = true;
    let timer = null;
    const once = async () => {
      try {
        const res = await fetch(`${apiBase}/checkins`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
        const json = await res.json();
        if (!mounted) return;
        if (json.ok && Array.isArray(json.checkins)) {
          const sorted = json.checkins.slice().sort((a, b) => {
            const ta = new Date(a.checkIn || a.checkInDate || 0).getTime();
            const tb = new Date(b.checkIn || b.checkInDate || 0).getTime();
            return tb - ta;
          });
          setCheckins(sorted);
          setError(null);
        } else {
          setCheckins([]);
          setError('Invalid checkins payload');
        }
      } catch (e) {
        if (!mounted) return;
        setError(String(e));
      } finally {
        if (mounted) setLoading(false);
      }
    };
    once();
    timer = setInterval(once, interval);
    return () => { mounted = false; if (timer) clearInterval(timer); };
  }, [apiBase, interval]);
  return { checkins, loading, error };
}

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

const roomBoxStyle = (status) => {
  const base = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: 8,
    fontWeight: 700,
    fontSize: 13,
    cursor: 'default',
    border: '1px solid rgba(0,0,0,0.14)',
    userSelect: 'none',
    boxShadow: '0 1px 1px rgba(0,0,0,0.04)',
    color: COLORS.deep,
    background: '#ffffff'
  };
  if (status === 'occupied') return { ...base, background: '#bfe8cb' };
  if (status === 'reserved') return { ...base, background: '#ffe3a6' };
  return base;
};

function normalizeCheckInYmdFromDoc(doc) {
  if (doc?.checkIn) {
    try { return new Date(doc.checkIn).toISOString().slice(0, 10); } catch {}
  }
  if (doc?.checkInDate) {
    const d = String(doc.checkInDate);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(d)) {
      const [dd, mm, yyyy] = d.split('/');
      return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    }
  }
  return '';
}

function roomsKeyOf(value) {
  if (Array.isArray(value)) {
    return value.slice().map(Number).filter(Boolean).sort((a, b) => a - b).join('_');
  }
  return String(value || '')
    .split(',')
    .map(s => Number(s.trim()))
    .filter(Boolean)
    .sort((a, b) => a - b)
    .join('_');
}

export default function LiveUpdate() {
  const loc = useLocation();
  const path = loc.pathname;
  const isRootLiveUpdate = path === '/liveupdate' || path === '/liveupdate/';

  // Combined state (reservations, checkouts, rentPayments, expenses, floors if provided)
  const { data: remoteState, loading, error } = usePolling(`${API_BASE}/state`, 2500);

  // Mongo checkins used as the single source of truth for occupancy
  const { checkins, loading: checkinsLoading, error: checkinsError } = useCheckins(API_BASE, 2500);

  // Search for Current Guests
  const [guestSearch, setGuestSearch] = useState('');

  // Floors (optional; used purely for the grid layout)
  const floors = useMemo(() => {
    const f = remoteState?.floors;
    return (f && typeof f === 'object') ? f : {};
  }, [remoteState]);

  // Reservations (for reserved overlay if a room is not occupied)
  const reservations = useMemo(() => {
    return remoteState?.reservations || [];
  }, [remoteState]);

  // Build occupiedRooms from checkins
  const occupiedRooms = useMemo(() => {
    const set = new Set();
    for (const ci of checkins || []) {
      const rooms = Array.isArray(ci.room)
        ? ci.room
        : String(ci.room || '')
          .split(',')
          .map(s => Number(s.trim()))
          .filter(Boolean);
      for (const r of rooms) set.add(Number(r));
    }
    return set;
  }, [checkins]);

  // Build reservedRooms from reservations (if reservation has room number(s))
// Build reservedRooms from reservations (support array rooms)
const reservedRooms = useMemo(() => {
  const set = new Set();
  for (const r of reservations || []) {
    if (Array.isArray(r.room)) {
      r.room.forEach(roomNum => set.add(Number(roomNum)));
    } else if (r.room != null) {
      set.add(Number(r.room));
    }
  }
  return set;
}, [reservations]);




  // Rent payments for “Paid till now”
  const rentPayments = remoteState?.rentPayments || remoteState?.rent_payments || [];
  const paymentsIndex = useMemo(() => {
    const exact = new Map();  // `${name}::${checkInYmd}`
    const approx = new Map(); // `${name}::${roomsKey}`
    for (const p of rentPayments) {
      const amount = Number(p.amount) || 0;
      const name = (p.name || "").trim().toLowerCase();
      const cin = (p.checkInYmd || "").slice(0, 10);
      const rk = roomsKeyOf(p.room);
      if (name && cin) {
        const k = `${name}::${cin}`;
        exact.set(k, (exact.get(k) || 0) + amount);
      } else if (name && rk) {
        const k2 = `${name}::${rk}`;
        approx.set(k2, (approx.get(k2) || 0) + amount);
      }
    }
    return { exact, approx };
  }, [rentPayments]);

  // Current Guests card (driven by checkins)
  const currentGuestsCard = useMemo(() => {
    const filtered = (checkins || []).filter(ci => {
      const q = guestSearch.trim().toLowerCase();
      if (!q) return true;
      const name = String(ci.name || '').toLowerCase();
      const roomStr = Array.isArray(ci.room) ? ci.room.join(', ') : String(ci.room || '');
      return name.includes(q) || roomStr.includes(q);
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
          <div style={{ fontSize: 13, color: COLORS.muted }}>{(checkins || []).length} occupied</div>
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

        {(!checkins || checkins.length === 0) && (
          <div style={{ color: COLORS.muted }}>
            {checkinsLoading ? 'Loading...' : (checkinsError ? `Error: ${checkinsError}` : 'No rooms are occupied')}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, paddingRight: 6 }}>
            {filtered.map((ci, idx) => {
              const name = ci.name || 'Guest';
              const initials =
                (String(name).split(' ').map(n => n).filter(Boolean).slice(0, 2).join('') || name.slice(0, 2)).toUpperCase();

              const cinYmd = normalizeCheckInYmdFromDoc(ci);
              const nameKey = (name || "").trim().toLowerCase();
              const rk = roomsKeyOf(ci.room);

              let paidSoFar = 0;
              if (nameKey && cinYmd) {
                paidSoFar = paymentsIndex.exact.get(`${nameKey}::${cinYmd}`) || 0;
              }
              if (!paidSoFar && nameKey && rk) {
                paidSoFar = paymentsIndex.approx.get(`${nameKey}::${rk}`) || 0;
              }

              return (
                <div
                  key={ci.id || idx}
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
                        Room {Array.isArray(ci.room) ? ci.room.join(', ') : (ci.room || '—')}
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8, marginTop: 8, fontSize: 12, color: COLORS.deep }}>
                      <div>Phone no: {ci.contact || '—'}</div>
                      <div>Price: ₹{Number(ci.rate || 0)}/day</div>
                      <div>
                        In: {ci.checkInDate
                              ? ci.checkInDate
                              : (ci.checkIn ? new Date(ci.checkIn).toLocaleDateString() : '—')} {ci.checkInTime || ''}
                      </div>
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
  }, [checkins, checkinsLoading, checkinsError, guestSearch, paymentsIndex]);

  // Derive room grid data by overlaying occupied/reserved statuses
  const roomsByFloor = useMemo(() => {
    const out = {};
    for (const [fnum, list] of Object.entries(floors)) {
      const sorted = (Array.isArray(list) ? list : []).slice().sort((a, b) => a.number - b.number);
      out[fnum] = sorted.map(r => {
        const roomNo = Number(r.number);
        const isOccupied = occupiedRooms.has(roomNo);
        const isReserved = !isOccupied && reservedRooms.has(roomNo);
        const status = isOccupied ? 'occupied' : (isReserved ? 'reserved' : 'free');

        // Tooltip info from checkins or reservation if available
        let title = 'Free';
        if (status === 'reserved') {
          title = `Reserved`;
        }
        if (status === 'occupied') {
          // Try to find a checkin doc that includes this room
          const match = (checkins || []).find(ci => {
            const rooms = Array.isArray(ci.room)
              ? ci.room
              : String(ci.room || '')
                  .split(',')
                  .map(s => Number(s.trim()))
                  .filter(Boolean);
            return rooms.includes(roomNo);
          });
          const gname = match?.name || 'Guest';
          const contact = match?.contact || '-';
          const cdate = match?.checkInDate || (match?.checkIn ? new Date(match.checkIn).toLocaleDateString() : '-');
          const ctime = match?.checkInTime || '';
          title = `Occupied by: ${gname}\nContact: ${contact}\nCheck-in: ${cdate} ${ctime}`;
        }

        return {
          ...r,
          status,
          _title: title
        };
      });
    }
    return out;
  }, [floors, occupiedRooms, reservedRooms, checkins]);

  // Checkout list
  const checkouts = useMemo(() => {
    const arr = (remoteState?.checkouts || remoteState?.checkoutsList || []).slice();
    arr.sort((a, b) => {
      const ta = new Date(a.checkOutDateTime || a.checkOutDate || 0).getTime();
      const tb = new Date(b.checkOutDateTime || b.checkOutDate || 0).getTime();
      return tb - ta;
    });
    return arr;
  }, [remoteState]);

  const serverState = remoteState || null;
  const sub = path.split('/').pop();

  const renderSubpage = () => {
    if (sub === 'reservations') return <ReservationsPage data={serverState} />;
    if (sub === 'checkout') return <CheckoutPage data={{ checkoutsList: checkouts }} />;
    if (sub === 'rentpayment') return <RentPaymentPage data={serverState} />;
    if (sub === 'expenses') return <ExpensesPage data={serverState} />;
    return null;
  };

  return (
    <div className="p-3 md:p-4 max-w-7xl mx-auto" style={{ background: '#fff' }}>
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
                return (
                  <div key={floorNum} style={{ marginBottom: 10 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: COLORS.muted, marginBottom: 6 }}>
                      Floor {floorNum}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, alignItems: 'stretch' }}>
                      {list.map(r => (
                        <div
                          key={r.number}
                          style={roomBoxStyle(r.status)}
                          title={r._title}
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

      {(loading || checkinsLoading) && (
        <div className="text-sm" style={{ color: COLORS.muted, marginTop: 8 }}>
          Loading...
        </div>
      )}
      {(error || checkinsError) && (
        <div className="text-sm" style={{ color: '#b91c1c', marginTop: 8 }}>
          {error || checkinsError}
        </div>
      )}
    </div>
  );
}
