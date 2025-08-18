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

  return (
    <div style={{ padding: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <button className="btn" onClick={() => navigate(-1)}>Back</button>
        <h2 style={{ margin: 0, fontSize: 18 }}>Mobile View</h2>
      </div>

      <div style={{ marginBottom: 12 }}>
        <input className="input" placeholder="Search bookings, guest, room, date..." value={query} onChange={e=>setQuery(e.target.value)} />
      </div>

      <section style={{ marginBottom: 18 }}>
        <h3 style={{ margin: '8px 0' }}>Current Guests</h3>
        {currentGuests.filter(searchFilter).length === 0 ? (
          <div style={{ color: 'var(--muted)' }}>No current guests</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {currentGuests.filter(searchFilter).map((g, i) => (
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
        {loading ? <div>Loading...</div> : rents.filter(searchFilter).length === 0 ? (
          <div style={{ color: 'var(--muted)' }}>No rent records</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rents.filter(searchFilter).slice(0,50).map((r, i) => (
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
        {loading ? <div>Loading...</div> : expenses.filter(searchFilter).length === 0 ? (
          <div style={{ color: 'var(--muted)' }}>No expense records</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {expenses.filter(searchFilter).slice(0,50).map((e, i) => (
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
