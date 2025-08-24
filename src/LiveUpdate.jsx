// src/LiveUpdate.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import ReservationsPage from './liveupdate/ReservationsPage';
import CheckoutPage from './liveupdate/CheckoutPage';
import RentPaymentPage from './liveupdate/RentPaymentPage';
import ExpensesPage from './liveupdate/ExpensesPage';

const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_MONGO_API_BASE)
  ? import.meta.env.VITE_MONGO_API_BASE
  : (window.__MONGO_API_BASE__ || '/api');

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

const Pill = ({ to, active, children }) => (
  <Link to={to} className={`px-3 py-1 rounded-md text-sm ${active ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800'}`}>
    {children}
  </Link>
);

// Styles for new Rooms grid
const legendDot = (bg) => ({
  display: 'inline-block',
  width: 10,
  height: 10,
  borderRadius: 3,
  background: bg,
  verticalAlign: 'middle',
  marginRight: 6,
  border: '1px solid rgba(0,0,0,0.08)'
});

const roomBoxStyle = (r) => {
  const base = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: 8,
    fontWeight: 700,
    cursor: 'pointer',
    border: '1px solid rgba(0,0,0,0.08)',
    userSelect: 'none',
  };
  if (r.status === 'reserved') {
    return { ...base, background: 'rgba(255, 213, 128, 0.6)' };
  }
  if (r.status === 'occupied') {
    return { ...base, background: 'rgba(139, 224, 164, 0.6)' };
  }
  return { ...base, background: 'rgba(255,255,255,0.6)' };
};

export default function LiveUpdate() {
  const loc = useLocation();
  const path = loc.pathname; // e.g., /liveupdate, /liveupdate/expenses, etc.
  const isRootLiveUpdate = path === '/liveupdate' || path === '/liveupdate/';

  const { data: remoteState, loading, error } = usePolling(`${API_BASE}/state`, 2500);

  const [searchRooms, setSearchRooms] = useState('');
  const [guestSearch, setGuestSearch] = useState('');

  const floors = useMemo(() => (remoteState?.floors || {}), [remoteState]);

  const allRooms = useMemo(() => {
    const arr = [];
    for (const fl of Object.values(floors)) for (const r of fl) arr.push(r);
    return arr.sort((a, b) => a.number - b.number);
  }, [floors]);

  // Rooms by floor for the left grid
  const roomsByFloor = useMemo(() => {
    const map = {};
    for (const [fnum, list] of Object.entries(floors)) {
      map[fnum] = list.slice().sort((a, b) => a.number - b.number);
    }
    return map;
  }, [floors]);

  const filteredRoomsForSearch = useMemo(() => {
    const s = searchRooms.trim().toLowerCase();
    if (!s) return allRooms;
    return allRooms.filter(r =>
      String(r.number).includes(s) ||
      (r.guest?.name && r.guest.name.toLowerCase().includes(s))
    );
  }, [allRooms, searchRooms]);

  // Payments map for “Paid till now”
  const rentPayments = remoteState?.rentPayments || remoteState?.rent_payments || [];
  const paymentsByGroupKey = useMemo(() => {
    // groupKey = guestName + earliest checkIn ISO day for robustness
    const keyOf = (guestName, checkInISO) => `${(guestName || '').trim().toLowerCase()}::${(checkInISO || '').slice(0,10)}`;
    const sums = new Map();

    // Sum by guest+day across room arrays
    for (const p of rentPayments) {
      const name = (p.name || '').trim();
      // We don't have check-in date in payment; approximate by using today's ymd to avoid empty key collisions.
      // UI purpose only; still shows meaningful "paid till now".
      const approx = (p.date || '').slice(0,10) || '';
      const key = keyOf(name, approx);
      const prev = sums.get(key) || 0;
      sums.set(key, prev + (Number(p.amount) || 0));
    }
    return sums;
  }, [rentPayments]);

  // Group occupied by guest (multi-room booking grouped)
  const occupiedGroups = useMemo(() => {
    const map = new Map();
    for (const r of allRooms) {
      if (r.status !== 'occupied' || !r.guest) continue;
      const key = `${r.guest.name || ''}::${r.guest.checkIn || ''}`;
      if (!map.has(key)) map.set(key, { guest: r.guest, rooms: [] });
      map.get(key).rooms.push(r.number);
    }
    return Array.from(map.values()).map(x => ({
      guest: x.guest,
      rooms: x.rooms.sort((a, b) => a - b)
    }));
  }, [allRooms]);

  // Current Guests list with search and “Paid till now”
  const currentGuestsCard = useMemo(() => {
    const filtered = occupiedGroups.filter(g => {
      const q = guestSearch.trim().toLowerCase();
      if (!q) return true;
      const name = String(g.guest?.name || '').toLowerCase();
      const rooms = (g.rooms || []).map(String).join(', ');
      return name.includes(q) || rooms.includes(q);
    });

    return (
      <div className="card" style={{ padding: 14, marginTop: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontWeight: 800 }}>Current Guests</div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>{occupiedGroups.length} occupied</div>
        </div>

        <div style={{ marginBottom: 10 }}>
          <input
            className="input"
            style={{ width: '100%', padding: '8px 10px' }}
            placeholder="Search guest or room..."
            value={guestSearch}
            onChange={(e) => setGuestSearch(e.target.value)}
          />
        </div>

        {occupiedGroups.length === 0 && <div style={{ color: 'var(--muted)' }}>No rooms are occupied</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 6 }}>
            {filtered.map((g, idx) => {
              const name = g.guest?.name || 'Guest';
              const initials =
                (String(name).split(' ').map(n => n[0]).filter(Boolean).slice(0, 2).join('') || name.slice(0, 2)).toUpperCase();
              // Approximate key for payments sum
              const paidKey = `${(name || '').trim().toLowerCase()}::${(g.guest?.checkIn || '').slice(0,10)}`;
              const paidSoFar = paymentsByGroupKey.get(paidKey) || 0;

              return (
                <div key={idx} className="card" style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 8 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 8, background: 'rgba(0,0,0,0.06)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14
                  }}>
                    {initials}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {name}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>
                        Room {(g.rooms || []).join(', ')}
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 6, marginTop: 8, fontSize: 12 }}>
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
  }, [occupiedGroups, guestSearch, paymentsByGroupKey]);

  // Subpage render
  const sub = path.split('/').pop();
  const renderSubpage = () => {
    if (sub === 'reservations') return <ReservationsPage data={remoteState} />;
    if (sub === 'checkout') return <CheckoutPage data={remoteState} />;
    if (sub === 'rentpayment') return <RentPaymentPage data={remoteState} />;
    if (sub === 'expenses') return <ExpensesPage data={remoteState} />;
    return null;
  };

  // Click for room (optional)
  const handleRoomClick = (r) => {
    // reserved for future actions
  };

  return (
    <div className="p-4 max-w-6xl mx-auto">
      {/* Tabs with correct labels */}
      <div className="flex flex-col md:flex-row md:items-start gap-3 mb-3">
        <div className="flex-1">
          <div className="flex flex-wrap gap-2 mb-2">
            <Pill to="/liveupdate/checkout" active={sub === 'checkout' || isRootLiveUpdate}>Checkout</Pill>
            <Pill to="/liveupdate/reservations" active={sub === 'reservations'}>Reservations</Pill>
            <Pill to="/liveupdate/rentpayment" active={sub === 'rentpayment'}>Rent Payments</Pill>
            <Pill to="/liveupdate/expenses" active={sub === 'expenses'}>Expenses</Pill>
          </div>
        </div>
        {/* This search filters the Rooms grid when on root; otherwise it’s hidden along with the grid */}
        {isRootLiveUpdate && (
          <div className="w-full md:w-56">
            <input
              value={searchRooms}
              onChange={e => setSearchRooms(e.target.value)}
              placeholder="Search rooms/guests"
              className="w-full px-2 py-1 border rounded text-sm"
            />
          </div>
        )}
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        {/* LEFT: Rooms grid only on /liveupdate */}
        {isRootLiveUpdate && (
          <div style={{ flex: 1 }}>
            <div className="card" style={{ padding: 14, marginBottom: 12 }}>
              <div style={{ fontWeight: 800, marginBottom: 10, color: 'var(--deep)' }}>Rooms Today</div>

              <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>
                <div><span style={legendDot('rgba(255,255,255,0.6)')} /> Free</div>
                <div><span style={legendDot('rgba(255, 213, 128, 0.6)')} /> Reserved</div>
                <div><span style={legendDot('rgba(139, 224, 164, 0.6)')} /> Occupied</div>
              </div>

              {Object.keys(roomsByFloor).map(floorNum => {
                // If searching, reduce to matching rooms
                const list = searchRooms
                  ? roomsByFloor[floorNum].filter(r =>
                      filteredRoomsForSearch.some(fr => fr.number === r.number)
                    )
                  : roomsByFloor[floorNum];

                if (!list || list.length === 0) return null;

                return (
                  <div key={floorNum} style={{ marginBottom: 14 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--muted)', marginBottom: 8 }}>
                      Floor {floorNum}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
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
                          onClick={() => handleRoomClick(r)}
                        >
                          {r.number}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* RIGHT: subpages or default current guests (on root) */}
        <div className="flex-1">
          <div className="border rounded p-3 max-h-[75vh] overflow-auto">
            {isRootLiveUpdate ? currentGuestsCard : (renderSubpage() || null)}
          </div>
        </div>
      </div>

      {/* Loading / error (non-blocking) */}
      {loading && <div className="text-sm text-gray-500 mt-2">Loading...</div>}
      {error && <div className="text-sm text-red-500 mt-2">{error}</div>}
    </div>
  );
}
