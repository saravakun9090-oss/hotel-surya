import React, { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
// no local FS access in LiveUpdate UI — rely only on remoteState
import ReservationsPage from './liveupdate/ReservationsPage';
import CheckoutPage from './liveupdate/CheckoutPage';
import RentPaymentPage from './liveupdate/RentPaymentPage';
import ExpensesPage from './liveupdate/ExpensesPage';

const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_MONGO_API_BASE)
  ? import.meta.env.VITE_MONGO_API_BASE
  : (window.__MONGO_API_BASE__ || '/api');

function usePolling(url, interval = 2000) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    let timer = null;

    const fetchOnce = async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(await res.text());
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

    fetchOnce();
    timer = setInterval(fetchOnce, interval);

    return () => { mounted = false; if (timer) clearInterval(timer); };
  }, [url, interval]);

  return { data, loading, error };
}

const PillButton = ({ to, active, children }) => (
  <Link to={to} className={`px-3 py-1 rounded-md text-sm ${active ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800'}`}>
    {children}
  </Link>
);

const RoomBox = ({ room, onClick }) => (
  <div onClick={() => onClick(room)} className={`border rounded-md p-3 mb-2 cursor-pointer flex items-center justify-between ${room.status === 'occupied' ? 'bg-red-50' : room.status === 'reserved' ? 'bg-yellow-50' : 'bg-green-50'}`}>
    <div>
      <div className="font-semibold">{room.number}</div>
      <div className="text-xs text-gray-600">{room.status}</div>
      {room.reservedFor && <div className="text-xs text-gray-500">Reserved: {room.reservedFor.name}</div>}
    </div>
    <div className="text-right text-sm">
      {room.guest ? <div className="font-medium">{room.guest.name}</div> : <div className="text-gray-500">—</div>}
      <div className="mt-1"><button className="text-xs underline" onClick={(e)=>{e.stopPropagation(); onClick(room);}}>Open ID</button></div>
    </div>
  </div>
);

export default function LiveUpdate() {
  const navigate = useNavigate();
  const loc = useLocation();
  const { data: remoteState, loading, error } = usePolling(`${API_BASE}/state`, 2500);
  const viewFromPath = loc.pathname.split('/').pop() || 'checkout';
  const [view, setView] = useState(viewFromPath); // checkout | reservations | rentpayment | expenses
  const [search, setSearch] = useState('');
  const [guestSearch, setGuestSearch] = useState('');
  const [rentSearch, setRentSearch] = useState('');
  const [rentFrom, setRentFrom] = useState('');
  const [rentTo, setRentTo] = useState('');

  // effective dataset: use only remoteState (no local storage fallbacks)
  const effective = useMemo(() => {
    const e = {};
    e.floors = remoteState?.floors || {};
    e.reservations = remoteState?.reservations || [];
    e.checkouts = remoteState?.checkouts || [];
    e.rentPayments = remoteState?.rentPayments || remoteState?.rent_payments || [];
    e.expenses = remoteState?.expenses || [];
    return e;
  }, [remoteState]);

  const floors = useMemo(() => (remoteState?.floors || {}), [remoteState]);

  const allRooms = useMemo(() => {
    const arr = [];
    for (const fl of Object.values(floors)) {
      for (const r of fl) arr.push(r);
    }
    return arr.sort((a,b)=>a.number-b.number);
  }, [floors]);

  const filteredRooms = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return allRooms;
    return allRooms.filter(r => String(r.number).includes(s) || (r.guest && r.guest.name && r.guest.name.toLowerCase().includes(s)));
  }, [allRooms, search]);

  // No local storage scanning in LiveUpdate — rely on remoteState only

  // Build a per-floor layout and mark reservations for today
  const layoutFloors = useMemo(() => {
    const todayISO = new Date().toISOString().slice(0,10);
    const lf = {};
    const keys = Object.keys(floors).sort((a,b)=>Number(a)-Number(b));
    for (const floorNum of keys) {
      lf[floorNum] = (floors[floorNum] || []).map(r => {
        const res = (remoteState?.reservations || []).find(rr => Number(rr.room) === Number(r.number) && rr.date === todayISO);
        if (res && r.status === 'free') return { ...r, status: 'reserved', reservedFor: res };
        return r;
      });
    }
    return lf;
  }, [floors, remoteState]);

  // helpers for UI styling
  const legendDot = (bg) => ({ display: 'inline-block', width: 10, height: 10, borderRadius: 6, background: bg, marginRight: 8, verticalAlign: 'middle' });
  const roomBoxStyle = (r) => {
    const base = {
      height: 56,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 8,
      fontWeight: 800,
      cursor: 'pointer',
      border: '1px solid rgba(0,0,0,0.06)'
    };
    if (r.status === 'reserved') return { ...base, background: 'rgba(255, 213, 128, 0.6)', color: '#3b2b00' };
    if (r.status === 'occupied') return { ...base, background: 'rgba(139, 224, 164, 0.9)', color: '#013220' };
    // free
    return { ...base, background: '#ffffff', color: '#111' };
  };

  const handleRoomClick = (r) => {
    // keep simple: navigate to reservations view for the room or just focus — currently no op
    // you can replace this with navigation or modal open if desired
  };

  const rightContent = () => {
    if (!remoteState) return <div className="p-4 text-sm text-gray-500">No data</div>;
  if (view === 'reservations') {
      const res = remoteState.reservations || [];
      const list = res.filter(r => (r.name || '').toLowerCase().includes(search.toLowerCase()));
      return (
        <div>
          <div className="text-sm text-gray-600 mb-2">Reservations</div>
          {list.map((r, i) => (
            <div key={i} className="p-2 border-b">{r.date} — {r.room} — {r.name}</div>
          ))}
          {list.length===0 && <div className="p-2 text-sm text-gray-500">No reservations</div>}
        </div>
      );
    }

    if (view === 'rentpayment') {
      const effectivePays = effective.rentPayments || [];
      // apply dedicated rent filters (date range + search)
      const fromDate = rentFrom ? new Date(rentFrom) : null;
      const toDate = rentTo ? new Date(rentTo) : null;
      const list = effectivePays.filter(p => {
        // search match
        const matchesSearch = !rentSearch || JSON.stringify(p).toLowerCase().includes(rentSearch.toLowerCase());
        if (!matchesSearch) return false;
        // date range match if p.date exists
        if ((fromDate || toDate) && p.date) {
          const pd = new Date(p.date);
          if (Number.isNaN(pd.getTime())) return true; // can't parse, include
          if (fromDate && pd < fromDate) return false;
          if (toDate && pd > toDate) return false;
        }
        return true;
      });

      return (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="text-lg font-semibold">Rent Payments</div>
            <div className="text-sm text-gray-500">{effectivePays.length} total</div>
          </div>

          <div className="flex gap-2 mb-3 flex-wrap">
            <input type="date" value={rentFrom} onChange={e=>setRentFrom(e.target.value)} className="px-2 py-1 border rounded text-sm" />
            <input type="date" value={rentTo} onChange={e=>setRentTo(e.target.value)} className="px-2 py-1 border rounded text-sm" />
            <input placeholder="Search payments" value={rentSearch} onChange={e=>setRentSearch(e.target.value)} className="px-2 py-1 border rounded text-sm flex-1" />
            <button className="btn ghost" onClick={() => { setRentFrom(''); setRentTo(''); setRentSearch(''); }}>Clear</button>
          </div>

          <div className="space-y-1">
            {list.map((p, i) => (
              <div key={i} className="p-2 border rounded-sm flex justify-between items-center">
                <div>
                  <div className="font-medium">{p.name || p.payer || '—'} — Room {p.room || p.rooms || '—'}</div>
                  <div className="text-xs text-gray-600">{p.date || p.month || '—'}</div>
                </div>
        <div className="text-right font-semibold">{p.amount || p.total || '—'}</div>
              </div>
            ))}
      {list.length===0 && <div className="p-2 text-sm text-gray-500">No payments</div>}
          </div>
        </div>
      );
    }

    if (view === 'expenses') {
      const ex = effective.expenses || [];
      const list = ex.filter(e => JSON.stringify(e).toLowerCase().includes(search.toLowerCase()));
      return (
        <div>
          <div className="text-sm text-gray-600 mb-2">Expenses</div>
          {list.map((e, i) => (
            <div key={i} className="p-2 border-b">{e.date} — {e.category || e.note} — {e.amount}</div>
          ))}
          {list.length===0 && <div className="p-2 text-sm text-gray-500">No expenses</div>}
        </div>
      );
    }

    // default: checkout view
    // prefer effective.checkouts when available (from remote or local fallback)
    const effectiveCheckouts = effective.checkouts || [];
    // If effectiveCheckouts contains data, use it; otherwise fall back to occupied rooms for active stays
    let list = [];
    if (effectiveCheckouts.length) {
      // normalize checkouts into items with name and room fields for searching
      list = effectiveCheckouts.filter(c => (String(c.name || c.guest?.name || c.room || c.rooms) || '').toLowerCase().includes(search.toLowerCase()));
    } else {
      const occupied = allRooms.filter(r => r.status === 'occupied');
      list = occupied.filter(o => (o.guest?.name || '').toLowerCase().includes(search.toLowerCase()));
    }
    return (
      <div>
        <div className="text-sm text-gray-600 mb-2">Checkouts / Active Stays</div>
        {list.map((r) => (
          <div key={r.number} className="p-2 border-b">
            <div className="font-medium">Room {r.number} — {r.guest?.name}</div>
            <div className="text-xs text-gray-600">Contact: {r.guest?.contact || '—'} • Rate: {r.guest?.rate || '—'}</div>
          </div>
        ))}
        {list.length===0 && <div className="p-2 text-sm text-gray-500">No active checkouts</div>}
      </div>
    );
  };

  // if the path specifically points to a subpage, render that full page on the right
  const subpath = loc.pathname.split('/').pop();
  const renderSubpage = () => {
    if (subpath === 'reservations') return <ReservationsPage data={effective} />;
    if (subpath === 'checkout') return <CheckoutPage data={effective} />;
    if (subpath === 'rentpayment') return <RentPaymentPage data={effective} />;
    if (subpath === 'expenses') return <ExpensesPage data={effective} />;
    return null;
  };

  // If user navigated directly to a subpage route, show it as a standalone page (no room layout)
  if (['reservations', 'checkout', 'rentpayment', 'expenses'].includes(subpath)) {
    return (
      <div className="p-4 max-w-5xl mx-auto">
        <div className="border rounded p-3 bg-white">
          {renderSubpage()}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-5xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-start gap-3 mb-3">
        <div className="flex-1">
          <div className="flex flex-wrap gap-2 mb-2">
            <PillButton to="/liveupdate/checkout" active={view==='checkout'}>Checkout</PillButton>
            <PillButton to="/liveupdate/reservations" active={view==='reservations'}>Reservations</PillButton>
            <PillButton to="/liveupdate/rentpayment" active={view==='rentpayment'}>RentPayment</PillButton>
            <PillButton to="/liveupdate/expenses" active={view==='expenses'}>Expenses</PillButton>
          </div>
        </div>
        <div className="w-full md:w-48">
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search" className="w-full px-2 py-1 border rounded text-sm" />
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        {/* LEFT: Rooms grid */}
        <div style={{ flex: 1 }}>
          <div className="card" style={{ padding: 14, marginBottom: 12 }}>
            <div style={{ fontWeight: 800, marginBottom: 10, color: 'var(--deep)' }}>Rooms Today</div>

            <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>
              <div><span style={legendDot('rgba(255,255,255,0.6)')} /> Free</div>
              <div><span style={legendDot('rgba(255, 213, 128, 0.6)')} /> Reserved</div>
              <div><span style={legendDot('rgba(139, 224, 164, 0.6)')} /> Occupied</div>
            </div>

            {loading && <div className="text-sm text-gray-500">Loading...</div>}
            {error && <div className="text-sm text-red-500">{error}</div>}
            {Object.keys(layoutFloors).map(floorNum => (
              <div key={floorNum} style={{ marginBottom: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--muted)', marginBottom: 8 }}>
                  Floor {floorNum}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                  {layoutFloors[floorNum].map(r => (
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
            ))}
          </div>
        </div>

        {/* RIGHT: Current Guests card */}
        <div style={{ flex: 1 }}>
          <div className="card" style={{ padding: 14, marginTop: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontWeight: 800 }}>Current Guests</div>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>{(effective.checkouts || []).length} occupied</div>
            </div>

            {/* Search (full width) */}
            <div style={{ marginBottom: 10 }}>
              <input className="input" style={{ width: '100%', padding: '8px 10px' }} placeholder="Search guest or room..." value={guestSearch} onChange={(e) => setGuestSearch(e.target.value)} />
            </div>

            {((effective.checkouts || []).length === 0) && <div style={{ color: 'var(--muted)' }}>No rooms are occupied</div>}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 6 }}>
                {((effective.checkouts || []).filter(g => {
                  const q = guestSearch.trim().toLowerCase();
                  if (!q) return true;
                  const name = String(g.guest?.name || g.name || '').toLowerCase();
                  const rooms = (g.rooms || g.room || []);
                  const roomsStr = Array.isArray(rooms) ? rooms.map(String).join(', ') : String(rooms);
                  return name.includes(q) || roomsStr.includes(q);
                })).map((g, idx) => {
                  const name = g.guest?.name || g.name || 'Guest';
                  const initials = (String(name).split(' ').map(n => n[0]).filter(Boolean).slice(0,2).join('') || name.slice(0,2)).toUpperCase();
                  const roomsArr = Array.isArray(g.rooms) ? g.rooms : (g.rooms ? [g.rooms] : (g.room ? [g.room] : []));
                  return (
                    <div key={idx} className="card" style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 8 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 8, background: 'rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14 }}>
                        {initials}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                            <div style={{ alignItems: 'center', gap: 8, minWidth: 0 }}>
                              <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {name}
                              </div>
                              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                                Room {roomsArr.join(', ')}
                              </div>
                              {g.guest?.edited && (
                                <div style={{ background: 'rgba(34,197,94,0.12)', color: '#16a34a', padding: '2px 6px', borderRadius: 6, fontSize: 12, fontWeight: 700 }}>edited</div>
                              )}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 6, marginTop: 8, fontSize: 12 }}>
                          <div>Phone no: {g.guest?.contact || g.contact || '-'}</div>
                          <div>Price: ₹{g.guest?.rate || g.rate || 0}/day</div>
                          <div>In: {g.guest?.checkInDate || new Date(g.guest?.checkIn || g.checkIn || '').toLocaleDateString()} {g.guest?.checkInTime || ''}</div>
                          <div>Paid: ₹{g.totalPaid || g.total || g.paid || 0}</div>
                        </div>
                      </div>

                      {/* no edit / open id buttons per request */}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
