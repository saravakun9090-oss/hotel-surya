import React, { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { getBaseFolder, ensurePath, writeFile, readJSONFile, writeJSON } from './utils/fsAccess';
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
  const [localRentList, setLocalRentList] = useState([]);
  const [localExpenses, setLocalExpenses] = useState([]);
  const [localCheckouts, setLocalCheckouts] = useState([]);
  const [storageConnected, setStorageConnected] = useState(false);

  // effective dataset: prefer non-empty remote arrays, otherwise fall back to local lists
  const effective = useMemo(() => {
    const e = {};
    e.floors = remoteState?.floors || {};
    e.reservations = (remoteState?.reservations && remoteState.reservations.length) ? remoteState.reservations : [];
    e.checkouts = (remoteState?.checkouts && remoteState.checkouts.length) ? remoteState.checkouts : localCheckouts;
    if (remoteState?.rentPayments && remoteState.rentPayments.length) e.rentPayments = remoteState.rentPayments;
    else if (remoteState?.rent_payments && remoteState.rent_payments.length) e.rentPayments = remoteState.rent_payments;
    else e.rentPayments = localRentList;
    e.expenses = (remoteState?.expenses && remoteState.expenses.length) ? remoteState.expenses : localExpenses;
    return e;
  }, [remoteState, localRentList, localExpenses, localCheckouts]);

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

  // Load recent local RentCollections, Expenses and Checkouts as fallbacks when remote doesn't provide data
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const base = await getBaseFolder();
        setStorageConnected(!!base);
        if (!base) return;

        const rentAcc = [];
        const expAcc = [];
        const checkoutAcc = [];
        // scan last 7 days
        for (let d = 0; d < 7; d++) {
          const dt = new Date();
          dt.setDate(dt.getDate() - d);
          const folder = dt.toISOString().slice(0,10);

          try {
            const rentDir = await ensurePath(base, ['RentCollections', folder]);
            for await (const [name, handle] of rentDir.entries()) {
              if (handle.kind !== 'file' || !name.endsWith('.json')) continue;
              try { const f = await handle.getFile(); const data = JSON.parse(await f.text()); data._file = `RentCollections/${folder}/${name}`; rentAcc.push(data); } catch(e) { continue; }
            }
          } catch (e) { /* ignore */ }

          try {
            const expDir = await ensurePath(base, ['Expenses', folder]);
            for await (const [name, handle] of expDir.entries()) {
              if (handle.kind !== 'file' || !name.endsWith('.json')) continue;
              try { const f = await handle.getFile(); const data = JSON.parse(await f.text()); data._file = `Expenses/${folder}/${name}`; expAcc.push(data); } catch(e) { continue; }
            }
          } catch (e) { /* ignore */ }

          try {
            const coDir = await ensurePath(base, ['Checkouts', folder]);
            for await (const [name, handle] of coDir.entries()) {
              if (handle.kind !== 'file' || !name.endsWith('.json')) continue;
              try { const f = await handle.getFile(); const data = JSON.parse(await f.text()); data._file = `Checkouts/${folder}/${name}`; checkoutAcc.push(data); } catch(e) { continue; }
            }
          } catch (e) { /* ignore */ }
        }

        if (!mounted) return;
        rentAcc.sort((a,b)=> (b._file||'').localeCompare(a._file||''));
        expAcc.sort((a,b)=> (b._file||'').localeCompare(a._file||''));
        checkoutAcc.sort((a,b)=> (b._file||'').localeCompare(a._file||''));
        setLocalRentList(rentAcc);
        setLocalExpenses(expAcc);
        setLocalCheckouts(checkoutAcc);
      } catch (e) {
        setStorageConnected(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

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

  // Group occupied rooms by guest (name + checkIn) similar to CheckIn component
  const occupiedGroups = useMemo(() => {
    const map = new Map();
    const todayISO = new Date().toISOString().slice(0,10);
    const occ = allRooms.filter(r => r.status === 'occupied');
    for (const r of occ) {
      const name = String(r.guest?.name || '').trim();
      const checkIn = (r.guest?.checkIn || '').slice(0,10) || todayISO;
      const key = `${name.toLowerCase()}::${checkIn}`;
      if (!map.has(key)) map.set(key, { guest: r.guest || {}, rooms: [] , _key: key });
      const g = map.get(key);
      if (!g.rooms.includes(r.number)) g.rooms.push(r.number);
      // keep latest guest info
      g.guest = { ...g.guest, ...(r.guest || {}) };
    }
    return Array.from(map.values()).map(g => ({ guest: g.guest, rooms: (g.rooms||[]).sort((a,b)=>a-b), _key: g._key }));
  }, [allRooms]);

  // Build payments map from effective.rentPayments: sum numeric amounts by guest group
  const paymentsMap = useMemo(() => {
    const map = {};
    const pays = effective.rentPayments || [];
    if (!pays || !pays.length) return map;
    // helper to parse numeric amount
    const parseAmt = (v) => {
      if (v == null) return 0;
      if (typeof v === 'number') return v;
      const s = String(v).replace(/[^0-9.-]+/g, '');
      const n = parseFloat(s);
      return Number.isFinite(n) ? n : 0;
    };

    for (const p of pays) {
      const payer = String(p.name || p.payer || '').trim().toLowerCase();
      // rooms could be '101' or [101]
      const pRooms = Array.isArray(p.room || p.rooms) ? (p.room || p.rooms).map(Number) : (p.room ? [Number(p.room)] : []);
      const amt = parseAmt(p.amount ?? p.total ?? p.pay ?? p.value ?? 0);

      // try to match payments to occupiedGroups by name or room intersection
      for (const g of occupiedGroups) {
        const gname = String(g.guest?.name || '').trim().toLowerCase();
        const roomsSet = new Set((g.rooms || []).map(Number));
        let matched = false;
        if (gname && payer && gname === payer) matched = true;
        if (!matched && pRooms.length) {
          for (const pr of pRooms) if (roomsSet.has(pr)) { matched = true; break; }
        }
        if (matched) {
          map[g._key] = (map[g._key] || 0) + amt;
        }
      }
    }
    return map;
  }, [effective.rentPayments, occupiedGroups]);

  // scannedMap and utilities (mark which guest groups have a saved scanned ID)
  const [scannedMap, setScannedMap] = useState({});

  const groupKey = (group) => `${String(group.guest?.name||'').toLowerCase()}::${(group.guest?.checkIn||'').slice(0,10)}`;

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const base = await getBaseFolder();
        if (!base) return;
        const scannedRoot = await ensurePath(base, ['ScannedDocuments']);
        const newMap = {};

        async function recurse(dir, safeQuery, foundObj) {
          for await (const [entryName, entryHandle] of dir.entries()) {
            if (!mounted) return;
            if (entryHandle.kind === 'directory') {
              await recurse(entryHandle, safeQuery, foundObj);
              if (foundObj.found) return;
            } else if (entryHandle.kind === 'file') {
              if (entryName.toLowerCase().includes(safeQuery)) { foundObj.found = entryHandle; return; }
            }
          }
        }

        for (const g of occupiedGroups) {
          const safe = String(g.guest?.name || '').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
          const found = { found: null };
          try { await recurse(scannedRoot, safe, found); } catch (e) { /* ignore */ }
          if (found.found) newMap[g._key] = true;
        }

        if (!mounted) return;
        setScannedMap(m => ({ ...m, ...newMap }));
      } catch (e) {
        // ignore
      }
    })();
    return () => { mounted = false; };
  }, [occupiedGroups]);

  // Open a preview of scanned ID for a guest group (opens in new tab)
  const openGuestPreview = async (group) => {
    try {
      const base = await getBaseFolder();
      if (!base) return alert('Storage not connected');
      const scannedRoot = await ensurePath(base, ['ScannedDocuments']);
      const safe = String(group.guest?.name || '').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      let foundHandle = null;

      async function recurse(dir) {
        for await (const [entryName, entryHandle] of dir.entries()) {
          if (entryHandle.kind === 'directory') { const r = await recurse(entryHandle); if (r) return r; }
          else if (entryHandle.kind === 'file') {
            if (entryName.toLowerCase().includes(safe)) return entryHandle;
          }
        }
        return null;
      }

      foundHandle = await recurse(scannedRoot);
      if (!foundHandle) return alert('No scanned document found for this guest');
      const file = await foundHandle.getFile();
      const url = URL.createObjectURL(file);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (err) {
      console.warn('Preview open failed', err);
      alert('Failed to open scanned document');
    }
  };

  // Attach a scanned file to a guest: simple picker -> save under today's ScannedDocuments folder
  const attachScanToGuest = async (group) => {
    try {
      const base = await getBaseFolder();
      if (!base) return alert('Storage not connected');
      // pick file
      let file = null;
      if (window.showOpenFilePicker) {
        try {
          const [handle] = await window.showOpenFilePicker({ multiple: false });
          file = await handle.getFile();
        } catch (e) { return; }
      } else {
        const picked = await new Promise((resolve) => {
          const input = document.createElement('input');
          input.type = 'file'; input.accept = 'image/*,.pdf'; input.onchange = () => resolve(input.files && input.files[0] ? input.files[0] : null);
          document.body.appendChild(input); input.click(); setTimeout(() => document.body.removeChild(input), 1000);
        });
        if (!picked) return; file = picked;
      }

      const now = new Date();
      const todayISOstr = now.toISOString().slice(0,10);
      const year = String(now.getFullYear());
      const month = now.toLocaleString('en-US', { month: 'short' }).toLowerCase();
      const dateFolder = `${String(now.getDate()).padStart(2,'0')}-${String(now.getMonth()+1).padStart(2,'0')}-${now.getFullYear()}`;
      const scansDir = await ensurePath(base, ['ScannedDocuments', year, month, dateFolder]);
      const safeName = String(group.guest?.name || '').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase() || 'guest';
      const roomsKey = (group.rooms || []).join('_') || 'rooms';
      const rawExt = (file.name && file.name.includes('.')) ? file.name.split('.').pop() : 'jpg';
      const ext = String(rawExt).replace(/[^a-zA-Z0-9]/g, '').slice(0,8) || 'jpg';
      const newFileName = `${safeName}-${roomsKey}-${todayISOstr}.${ext}`.replace(/[^a-zA-Z0-9._-]/g, '_');
      await writeFile(scansDir, newFileName, file);
      setScannedMap(m => ({ ...m, [group._key || groupKey(group)]: true }));
      alert('Scanned file saved');
    } catch (err) {
      console.warn('Attach scan failed', err);
      alert('Failed to attach scan: ' + (err?.message || String(err)));
    }
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
      // build effective pays (prefer non-empty remote arrays)
      const paysRemote = (remoteState?.rentPayments && remoteState.rentPayments.length) ? remoteState.rentPayments : (remoteState?.rent_payments && remoteState.rent_payments.length ? remoteState.rent_payments : null);
      const effectivePays = paysRemote ? paysRemote : (localRentList || []);
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
            <div className="text-sm text-gray-500">{effectivePays.length} total {storageConnected ? '' : '(storage not connected)'}</div>
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
      const ex = (remoteState?.expenses && remoteState.expenses.length) ? remoteState.expenses : localExpenses;
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

    // default: show grouped Current Guests card list (similar to Check-In page)
    const q = (guestSearch || '').trim().toLowerCase();
    const filtered = occupiedGroups.filter(g => {
      if (!q) return true;
      const name = String(g.guest?.name || '').toLowerCase();
      const rooms = (g.rooms || []).map(String).join(', ');
      return name.includes(q) || rooms.includes(q);
    });

    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontWeight: 800 }}>Current Guests</div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>{occupiedGroups.length} occupied</div>
        </div>

        <div style={{ marginBottom: 10 }}>
          <input className="input" style={{ width: '100%', padding: '8px 10px' }} placeholder="Search guest or room..." value={guestSearch} onChange={(e) => setGuestSearch(e.target.value)} />
        </div>

        {filtered.length === 0 && <div style={{ color: 'var(--muted)' }}>No rooms are occupied</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 6 }}>
            {filtered.map((g, idx) => {
              const name = g.guest?.name || 'Guest';
              const initials = (String(name).split(' ').map(n => n[0]).filter(Boolean).slice(0,2).join('') || name.slice(0,2)).toUpperCase();
              return (
                <div key={idx} className="card" style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 8 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 8, background: 'rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14 }}>
                    {initials}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <div style={{ alignItems: 'center', gap: 8, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Room {(g.rooms || []).join(', ')}</div>
                          {g.guest?.edited && (
                            <div style={{ background: 'rgba(34,197,94,0.12)', color: '#16a34a', padding: '2px 6px', borderRadius: 6, fontSize: 12, fontWeight: 700 }}>edited</div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6, marginTop: 8, fontSize: 12 }}>
                      <div>Phone no: {g.guest.contact}</div>
                      <div>Price: ₹{g.guest?.rate || 0}/day</div>
                      <div>In: {g.guest?.checkInDate || new Date(g.guest?.checkIn || '').toLocaleDateString()} {g.guest?.checkInTime || ''}</div>
                      <div>Paid: ₹{paymentsMap[g._key] || 0}</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 120, alignItems: 'flex-end' }}>
                    {scannedMap[g._key] ? (
                      <button className="btn" style={{ padding: '6px 10px', fontSize: 13 }} onClick={() => openGuestPreview(g)}>📎 Open ID</button>
                    ) : (
                      <button className="btn" style={{ padding: '6px 10px', fontSize: 13, background: 'rgba(239,68,68,0.08)', color: '#ef4444', borderColor: 'rgba(239,68,68,0.18)' }} onClick={() => attachScanToGuest(g)}>⬆️ Upload ID</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };
      // default: show grouped Current Guests card list (similar to Check-In page)
      const q = (guestSearch || '').trim().toLowerCase();
      const filtered = occupiedGroups.filter(g => {
        if (!q) return true;
        const name = String(g.guest?.name || '').toLowerCase();
        const rooms = (g.rooms || []).map(String).join(', ');
        return name.includes(q) || rooms.includes(q);
      });

      return (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontWeight: 800 }}>Current Guests</div>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>{occupiedGroups.length} occupied</div>
          </div>

          <div style={{ marginBottom: 10 }}>
            <input className="input" style={{ width: '100%', padding: '8px 10px' }} placeholder="Search guest or room..." value={guestSearch} onChange={(e) => setGuestSearch(e.target.value)} />
          </div>

          {filtered.length === 0 && <div style={{ color: 'var(--muted)' }}>No rooms are occupied</div>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 6 }}>
              {filtered.map((g, idx) => {
                const name = g.guest?.name || 'Guest';
                const initials = (String(name).split(' ').map(n => n[0]).filter(Boolean).slice(0,2).join('') || name.slice(0,2)).toUpperCase();
                return (
                  <div key={idx} className="card" style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 8 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 8, background: 'rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14 }}>
                      {initials}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                          <div style={{ alignItems: 'center', gap: 8, minWidth: 0 }}>
                            <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Room {(g.rooms || []).join(', ')}</div>
                            {g.guest?.edited && (
                              <div style={{ background: 'rgba(34,197,94,0.12)', color: '#16a34a', padding: '2px 6px', borderRadius: 6, fontSize: 12, fontWeight: 700 }}>edited</div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6, marginTop: 8, fontSize: 12 }}>
                        <div>Phone no: {g.guest.contact}</div>
                        <div>Price: ₹{g.guest?.rate || 0}/day</div>
                        <div>In: {g.guest?.checkInDate || new Date(g.guest?.checkIn || '').toLocaleDateString()} {g.guest?.checkInTime || ''}</div>
                        <div>Paid: ₹{paymentsMap[g._key] || 0}</div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 120, alignItems: 'flex-end' }}>
                      {scannedMap[g._key] ? (
                        <button className="btn" style={{ padding: '6px 10px', fontSize: 13 }} onClick={() => openGuestPreview(g)}>📎 Open ID</button>
                      ) : (
                        <button className="btn" style={{ padding: '6px 10px', fontSize: 13, background: 'rgba(239,68,68,0.08)', color: '#ef4444', borderColor: 'rgba(239,68,68,0.18)' }} onClick={() => attachScanToGuest(g)}>⬆️ Upload ID</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      );

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
        <div className="w-full md:w-80">
          <div className="mb-2 text-sm text-gray-600">Room Layout (Today)</div>
          <div className="card" style={{ padding: 14, maxHeight: '70vh', overflow: 'auto' }}>
            {loading && <div className="text-sm text-gray-500">Loading...</div>}
            {error && <div className="text-sm text-red-500">{error}</div>}
            {Object.keys(layoutFloors).length === 0 && !loading && <div className="text-sm text-gray-500">No rooms</div>}
            {Object.keys(layoutFloors).map(floorNum => (
              <div key={floorNum} style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6, color: 'var(--muted)' }}>Floor {floorNum}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
                  {layoutFloors[floorNum].map(r => (
                    <div
                      key={r.number}
                      className={`room ${r.status}`}
                      onClick={() => { /* optional click */ }}
                      style={{
                        height: 48,
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 8,
                        background: r.status === 'occupied' ? 'rgba(246, 85, 85, 0.08)' : r.status === 'reserved' ? 'rgba(255, 213, 128, 0.6)' : 'rgba(139, 224, 164, 0.6)',
                        border: '1px solid rgba(0,0,0,0.06)'
                      }}
                    >
                      {floorNum}{String(r.number).slice(-2)}
                    </div>
                  ))}
                </div>
              </div>
            ))}
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
