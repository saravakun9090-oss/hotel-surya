import React, { useEffect, useState, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import ReservationsPage from './liveupdate/ReservationsPage';
import CheckoutPage from './liveupdate/CheckoutPage';
import RentPaymentPage from './liveupdate/RentPaymentPage';
import ExpensesPage from './liveupdate/ExpensesPage';

const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_MONGO_API_BASE)
  ? import.meta.env.VITE_MONGO_API_BASE
  : (window.__MONGO_API_BASE__ || '/api');

const STORAGE_KEY = 'hotel_demo_v2';

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
  // accept either { state: {...} } or raw object
  setData((json && typeof json === 'object' && 'state' in json) ? (json.state || null) : json || null);
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
  const loc = useLocation();
  const { data: remoteState, loading, error } = usePolling(`${API_BASE}/fullstate`, 2500);

  // local fallback so LiveUpdate still shows data when the storage backend isn't available
  const [localState, setLocalState] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) { return null; }
  });

  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    // listen for other windows updating the localStorage key
    const onStorage = (ev) => {
      if (!ev) return;
      if (ev.key === STORAGE_KEY) {
        try { setLocalState(ev.newValue ? JSON.parse(ev.newValue) : null); } catch (e) { /* ignore */ }
      }
    };
    window.addEventListener('storage', onStorage);

    // BroadcastChannel (if available) for same-origin tabs to sync immediately
    let bc;
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        bc = new BroadcastChannel('hotel_state');
        bc.onmessage = (m) => {
          if (m?.data?.state) setLocalState(m.data.state);
        };
      }
    } catch (e) { /* ignore */ }

    return () => { window.removeEventListener('storage', onStorage); if (bc) bc.close(); };
  }, []);

  // when remote state arrives, cache it locally and broadcast to other tabs
  useEffect(() => {
    if (!remoteState) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(remoteState));
      setLocalState(remoteState);
      setLastUpdated(Date.now());
    } catch (e) { /* ignore */ }
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const ch = new BroadcastChannel('hotel_state');
        ch.postMessage({ state: remoteState });
        ch.close();
      }
    } catch (e) { /* ignore */ }
  }, [remoteState]);

  // force fetch: immediate one-time fetch that updates local cache/state
  const forceFetch = async () => {
    try {
    const res = await fetch(`${API_BASE}/fullstate`);
      if (!res.ok) {
        const txt = await res.text();
        return alert('Fetch failed: ' + txt);
      }
      const json = await res.json();
      const s = json.state || null;
      if (s) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch (e) {}
        setLocalState(s);
        setLastUpdated(Date.now());
        try { if (typeof BroadcastChannel !== 'undefined') { const ch=new BroadcastChannel('hotel_state'); ch.postMessage({state:s}); ch.close(); } } catch (e) {}
      }
    } catch (err) {
      alert('Fetch failed: ' + String(err));
    }
  };

  const reloadFromCache = () => {
    try {
      const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!s) return alert('No cached state');
      setLocalState(s);
      setLastUpdated(Date.now());
    } catch (e) {
      alert('No cached state');
    }
  };
  const viewFromPath = loc.pathname.split('/').pop() || 'checkout';
  const [view, setView] = useState(viewFromPath); // checkout | reservations | rentpayment | expenses
  const [search, setSearch] = useState('');

  const state = remoteState || localState || {};
  const floors = useMemo(() => (state?.floors || {}), [state]);

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

  const rightContent = () => {
  if (!state) return <div className="p-4 text-sm text-gray-500">No data</div>;
  if (view === 'reservations') {
  const res = state.reservations || [];
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
  const pays = state.rentPayments || state.rent_payments || [];
      const list = pays.filter(p => JSON.stringify(p).toLowerCase().includes(search.toLowerCase()));
      return (
        <div>
          <div className="text-sm text-gray-600 mb-2">Rent Payments</div>
          {list.map((p, i) => (
            <div key={i} className="p-2 border-b">{p.date || p.month} — {p.room} — {p.amount}</div>
          ))}
          {list.length===0 && <div className="p-2 text-sm text-gray-500">No payments</div>}
        </div>
      );
    }

    if (view === 'expenses') {
  const ex = state.expenses || [];
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
  const occupied = allRooms.filter(r => r.status === 'occupied');
    const list = occupied.filter(o => (o.guest?.name || '').toLowerCase().includes(search.toLowerCase()));
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
    if (subpath === 'reservations') return <ReservationsPage data={state} />;
    if (subpath === 'checkout') return <CheckoutPage data={state} />;
    if (subpath === 'rentpayment') return <RentPaymentPage data={state} />;
    if (subpath === 'expenses') return <ExpensesPage data={state} />;
    return null;
  };

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
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search" className="flex-1 px-2 py-1 border rounded text-sm" />
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <div className={`text-xs px-2 py-1 rounded ${remoteState ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>{remoteState ? 'Live' : 'Cached'}</div>
              <button className="text-xs px-2 py-1 border rounded" onClick={forceFetch}>Force fetch</button>
              <button className="text-xs px-2 py-1 border rounded" onClick={reloadFromCache}>Reload cache</button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="w-full md:w-80">
          <div className="mb-2 text-sm text-gray-600">Rooms</div>
          <div className="max-h-[70vh] overflow-auto">
            {loading && <div className="text-sm text-gray-500">Loading...</div>}
            {error && <div className="text-sm text-red-500">{error}</div>}
            <div className="grid grid-cols-2 md:grid-cols-1 gap-2">
              {filteredRooms.map(r => <RoomBox key={r.number} room={r} onClick={() => {}} />)}
            </div>
            {filteredRooms.length===0 && !loading && <div className="text-sm text-gray-500">No rooms</div>}
          </div>
        </div>

        <div className="flex-1">
          <div className="border rounded p-3 max-h-[75vh] overflow-auto">
            {renderSubpage() || rightContent()}
          </div>
        </div>
      </div>
    </div>
  );
}
