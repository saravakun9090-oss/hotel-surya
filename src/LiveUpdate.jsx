// src/LiveUpdate.jsx
import React, { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
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

    const fetchOnce = async () => {
      try {
        if (!url) throw new Error('No API URL configured');
        const res = await fetch(url);
        const ct = (res.headers.get('content-type') || '').toLowerCase();
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`HTTP ${res.status}: ${text}`);
        }
        if (ct.includes('text/html')) {
          const text = await res.text();
          throw new Error('Expected JSON from API but received HTML (likely no backend configured).');
        }
        if (!ct.includes('application/json')) {
          const text = await res.text();
          throw new Error('Server returned non-JSON response (see console)');
        }
        const json = await res.json();
        if (!mounted) return;
        setData(json.state || null);
        setLoading(false);
        setError(null);
      } catch (e) {
        if (!mounted) return;
        const msg = String(e);
        if (msg.includes('Expected JSON from API')) {
          setError(`Could not reach backend API at ${url}. Set VITE_MONGO_API_BASE to your backend URL (include /api).`);
        } else if (msg.includes('No API URL configured')) {
          setError('No backend API configured. Set VITE_MONGO_API_BASE in your build environment.');
        } else {
          setError(msg);
        }
        setLoading(false);
      }
    };

    fetchOnce();
    timer = setInterval(fetchOnce, interval);
    return () => { mounted = false; if (timer) clearInterval(timer); };
  }, [url, interval]);

  return { data, loading, error };
}

const Pill = ({ to, active, children }) => (
  <Link
    to={to}
    className={`px-3 py-1 rounded-md text-sm ${active ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800'}`}
  >
    {children}
  </Link>
);

const statusBg = (status) => {
  if (status === 'occupied') return 'bg-red-50 border-red-200';
  if (status === 'reserved') return 'bg-yellow-50 border-yellow-200';
  return 'bg-green-50 border-green-200';
};

const RoomBox = ({ room, onClick }) => (
  <div
    onClick={() => onClick?.(room)}
    className={`border rounded-md p-3 cursor-pointer flex items-center justify-between ${statusBg(room.status)}`}
  >
    <div>
      <div className="font-semibold">{room.number}</div>
      <div className="text-xs text-gray-600">{room.status}</div>
      {room.reservedFor && (
        <div className="text-xs text-gray-500">Reserved: {room.reservedFor.name}</div>
      )}
    </div>
    <div className="text-right text-sm">
      {room.guest ? (
        <div className="font-medium truncate max-w-[120px]">{room.guest.name}</div>
      ) : (
        <div className="text-gray-500">—</div>
      )}
    </div>
  </div>
);

export default function LiveUpdate() {
  const navigate = useNavigate();
  const loc = useLocation();
  const { data: remoteState, loading, error } = usePolling(`${API_BASE}/state`, 2500);

  const subpath = loc.pathname.split('/').pop();
  const [view, setView] = useState(subpath || 'checkout'); // checkout | reservations | rentpayment | expenses
  const [search, setSearch] = useState('');
  const [guestSearch, setGuestSearch] = useState('');

  useEffect(() => {
    const v = loc.pathname.split('/').pop() || 'checkout';
    setView(v);
  }, [loc.pathname]);

  const floors = useMemo(() => (remoteState?.floors || {}), [remoteState]);

  const allRooms = useMemo(() => {
    const arr = [];
    for (const fl of Object.values(floors)) {
      for (const r of fl) arr.push(r);
    }
    return arr.sort((a, b) => a.number - b.number);
  }, [floors]);

  const filteredRooms = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return allRooms;
    return allRooms.filter(
      r =>
        String(r.number).includes(s) ||
        (r.guest?.name && r.guest.name.toLowerCase().includes(s))
    );
  }, [allRooms, search]);

  // Group occupied rooms by guest (multi-room booking grouped)
  const occupiedGroups = useMemo(() => {
    const map = new Map();
    for (const r of allRooms) {
      if (r.status !== 'occupied' || !r.guest) continue;
      const key = `${r.guest.name}::${r.guest.checkIn || ''}`;
      if (!map.has(key)) map.set(key, { guest: r.guest, rooms: [] });
      map.get(key).rooms.push(r.number);
    }
    return Array.from(map.values()).map(x => ({
      guest: x.guest,
      rooms: x.rooms.sort((a, b) => a - b)
    }));
  }, [allRooms]);

  const rightDefaultCurrentGuests = () => {
    const list = occupiedGroups.filter(g => {
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
            {list.map((g, idx) => {
              const name = g.guest?.name || 'Guest';
              const initials =
                (String(name).split(' ').map(n => n[0]).filter(Boolean).slice(0, 2).join('') || name.slice(0, 2)).toUpperCase();
              return (
                <div key={idx} className="card" style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 8 }}>
                  <div
                    style={{
                      width: 40, height: 40, borderRadius: 8, background: 'rgba(0,0,0,0.06)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14
                    }}
                  >
                    {initials}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {name}
                        </div>
                        <div style={{ fontSize: 12, color: "var(--muted)" }}>
                          Room {(g.rooms || []).join(', ')}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 6, marginTop: 8, fontSize: 12 }}>
                      <div>Phone no: {g.guest?.contact || '—'}</div>
                      <div>Price: ₹{g.guest?.rate || 0}/day</div>
                      <div>In: {g.guest?.checkInDate || (g.guest?.checkIn ? new Date(g.guest.checkIn).toLocaleDateString() : '—')} {g.guest?.checkInTime || ''}</div>
                      {/* No “Open ID” / edit as requested */}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderSubpage = () => {
    if (subpath === 'reservations') return <ReservationsPage data={remoteState} />;
    if (subpath === 'checkout') return <CheckoutPage data={remoteState} />;
    if (subpath === 'rentpayment') return <RentPaymentPage data={remoteState} />;
    if (subpath === 'expenses') return <ExpensesPage data={remoteState} />;
    return null;
  };

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-start gap-3 mb-3">
        <div className="flex-1">
          <div className="flex flex-wrap gap-2 mb-2">
            <Pill to="/liveupdate/checkout" active={view === 'checkout'}>Checkout</Pill>
            <Pill to="/liveupdate/reservations" active={view === 'reservations'}>Reservations</Pill>
            <Pill to="/liveupdate/rentpayment" active={view === 'rentpayment'}>RentPayment</Pill>
            <Pill to="/liveupdate/expenses" active={view === 'expenses'}>Expenses</Pill>
          </div>
        </div>
        <div className="w-full md:w-56">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search rooms/guests"
            className="w-full px-2 py-1 border rounded text-sm"
          />
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        {/* Left: Rooms grid */}
        <div className="w-full md:w-80">
          <div className="mb-2 text-sm text-gray-600">Rooms</div>
          <div className="max-h-[70vh] overflow-auto">
            {loading && <div className="text-sm text-gray-500">Loading...</div>}
            {error && <div className="text-sm text-red-500">{error}</div>}
            <div className="grid grid-cols-2 md:grid-cols-1 gap-2">
              {filteredRooms.map(r => <RoomBox key={r.number} room={r} onClick={() => {}} />)}
            </div>
            {filteredRooms.length === 0 && !loading && <div className="text-sm text-gray-500">No rooms</div>}
          </div>
        </div>

        {/* Right: active tab */}
        <div className="flex-1">
          <div className="border rounded p-3 max-h-[75vh] overflow-auto">
            {renderSubpage() || rightDefaultCurrentGuests()}
          </div>
        </div>
      </div>
    </div>
  );
}
