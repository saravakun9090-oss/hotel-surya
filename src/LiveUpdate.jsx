// src/LiveUpdate.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
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
  <Link
    to={to}
    className={`px-3 py-2 rounded-md text-sm whitespace-nowrap ${active ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800'}`}
    style={{ boxShadow: active ? '0 2px 6px rgba(0,0,0,0.12)' : 'none' }}
  >
    {children}
  </Link>
);

// Legend helpers
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

// Room box style (bug-fixed: stronger contrast for "free", consistent border, grid-safe min width)
const roomBoxStyle = (r) => {
  const base = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    minWidth: 64,
    borderRadius: 10,
    fontWeight: 800,
    cursor: 'pointer',
    border: '1px solid rgba(0,0,0,0.12)',
    userSelect: 'none',
    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
    color: '#0b3d2e'
  };
  if (r.status === 'reserved') return { ...base, background: 'rgba(255, 213, 128, 0.65)' };
  if (r.status === 'occupied') return { ...base, background: 'rgba(139, 224, 164, 0.7)' };
  return { ...base, background: 'rgba(248, 250, 252, 0.9)' }; // light “free” tile
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
  const navigate = useNavigate();
  const path = loc.pathname;
  const isRootLiveUpdate = path === '/liveupdate' || path === '/liveupdate/';

  const { data: remoteState, loading, error } = usePolling(`${API_BASE}/state`, 2500);

  // IMPORTANT: search moved into Current Guests (removed top-right search)
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

  // Current Guests list (with search inside this card)
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
          padding: 16,
          marginTop: 16,
          borderRadius: 12,
          boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
          background: 'var(--card-bg, #fff)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>Current Guests</div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>{occupiedGroups.length} occupied</div>
        </div>

        {/* Search moved here */}
        <div style={{ marginBottom: 10 }}>
          <input
            className="input"
            style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(0,0,0,0.1)' }}
            placeholder="Search guest or room..."
            value={guestSearch}
            onChange={(e) => setGuestSearch(e.target.value)}
          />
        </div>

        {occupiedGroups.length === 0 && <div style={{ color: 'var(--muted)' }}>No rooms are occupied</div>}

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
                    border: '1px solid rgba(0,0,0,0.06)'
                  }}
                >
                  <div style={{
                    width: 44, height: 44, borderRadius: 10, background: 'rgba(0,0,0,0.06)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 14
                  }}>
                    {initials}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {name}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>
                        Room {(g.rooms || []).join(', ')}
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8, marginTop: 8, fontSize: 12 }}>
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

  // Subpage wrapper to add Back button on each subpage
  const BackButton = () => (
    <div style={{ marginBottom: 10 }}>
      <button className="btn ghost" onClick={() => navigate('/liveupdate')}>← Back</button>
    </div>
  );

  const renderSubpage = () => {
    if (sub === 'reservations') return (<><BackButton /><ReservationsPage data={remoteState} /></>);
    if (sub === 'checkout') return (<><BackButton /><CheckoutPage data={remoteState} /></>);
    if (sub === 'rentpayment') return (<><BackButton /><RentPaymentPage data={remoteState} /></>);
    if (sub === 'expenses') return (<><BackButton /><ExpensesPage data={remoteState} /></>);
    return null;
  };

  const handleRoomClick = (r) => {};

  return (
    <div className="p-3 md:p-4 max-w-7xl mx-auto">
      {/* Tabs with correct labels (kept across pages). Scrolling on mobile */}
      <div className="flex flex-col md:flex-row md:items-start gap-3 mb-3">
        <div className="flex-1">
          <div className="flex gap-2 mb-2" style={{ overflowX: 'auto', paddingBottom: 2 }}>
            <Pill to="/liveupdate/checkout" active={sub === 'checkout' || isRootLiveUpdate}>Checkout</Pill>
            <Pill to="/liveupdate/reservations" active={sub === 'reservations'}>Reservations</Pill>
            <Pill to="/liveupdate/rentpayment" active={sub === 'rentpayment'}>Rent Payments</Pill>
            <Pill to="/liveupdate/expenses" active={sub === 'expenses'}>Expenses</Pill>
          </div>
        </div>
        {/* Removed top-right search; it now lives in Current Guests card */}
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        {/* LEFT: Rooms grid only on /liveupdate (hidden entirely on subpages) */}
        {isRootLiveUpdate && (
          <div style={{ flex: 1, minWidth: 280 }}>
            <div
              className="card"
              style={{
                padding: 16,
                marginBottom: 12,
                borderRadius: 12,
                background: 'var(--card-bg, #fff)',
                boxShadow: '0 2px 10px rgba(0,0,0,0.06)'
              }}
            >
              <div style={{ fontWeight: 900, marginBottom: 10, color: 'var(--deep)' }}>Rooms Today</div>

              <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--muted)', marginBottom: 8, flexWrap: 'wrap' }}>
                <div><span style={legendDot('rgba(248, 250, 252, 0.9)')} /> Free</div>
                <div><span style={legendDot('rgba(255, 213, 128, 0.7)')} /> Reserved</div>
                <div><span style={legendDot('rgba(139, 224, 164, 0.7)')} /> Occupied</div>
              </div>

              {Object.keys(roomsByFloor).map(floorNum => {
                const list = roomsByFloor[floorNum];
                if (!list || list.length === 0) return null;

                // Fluid grid: auto fill with min 70px tiles
                const gridCols = 'repeat(auto-fill, minmax(70px, 1fr))';

                return (
                  <div key={floorNum} style={{ marginBottom: 14 }}>
                    <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--muted)', marginBottom: 8 }}>
                      Floor {floorNum}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 10 }}>
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
          <div
            className="border rounded p-3 md:p-4"
            style={{ borderColor: 'rgba(0,0,0,0.1)', background: 'var(--card-bg, #fff)', borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}
          >
            {isRootLiveUpdate ? currentGuestsCard : (renderSubpage() || null)}
          </div>
        </div>
      </div>

      {loading && <div className="text-sm text-gray-500 mt-2">Loading...</div>}
      {error && <div className="text-sm text-red-500 mt-2">{error}</div>}
    </div>
  );
}
