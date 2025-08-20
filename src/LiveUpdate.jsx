import React, { useEffect, useState, useCallback } from 'react';
import { load } from './services/storageAdapter';

function SmallRoom({ r }) {
  const bg = r.status === 'occupied' ? 'var(--accent)' : r.status === 'reserved' ? '#ffd580' : '#fff';
  return (
    <div className="card" style={{ padding: 8, borderRadius: 8, background: bg, textAlign: 'center' }}>
      <div style={{ fontWeight: 800 }}>{r.number}</div>
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{r.status}</div>
    </div>
  );
}

export default function LiveUpdate() {
  const [state, setState] = useState(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchState = useCallback(async (opts = {}) => {
    setLoading(true);
    try {
      const s = await load('mongo', null);
      setState(s);
      setConnected(true);
    } catch (e) {
      setConnected(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    fetchState();
    const id = setInterval(() => { if (mounted) fetchState(); }, 3000);
    return () => { mounted = false; clearInterval(id); };
  }, [fetchState]);

  const floors = state?.floors || {};

  // button actions: quick filters
  const onCheckout = () => setFilter('occupied');
  const onReservations = () => setFilter('reserved');
  const onRentPayments = () => setFilter('all');
  const onExpenses = () => setFilter('all');

  return (
    <div style={{ padding: 12, fontFamily: 'system-ui, Arial' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>Live Update</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn" onClick={onCheckout}>Checkout</button>
            <button className="btn" onClick={onReservations}>Reservations</button>
            <button className="btn" onClick={onRentPayments}>Rent payments</button>
            <button className="btn" onClick={onExpenses}>Expenses</button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input placeholder="Search by guest" value={search} onChange={e => setSearch(e.target.value)} className="input" style={{ padding: 6, borderRadius: 6 }} />
            <select value={filter} onChange={e => setFilter(e.target.value)} className="input" style={{ padding: 6, borderRadius: 6 }}>
              <option value="all">All</option>
              <option value="occupied">Occupied</option>
              <option value="reserved">Reserved</option>
              <option value="free">Free</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ fontSize: 12, color: connected ? 'green' : 'red' }}>{connected ? 'Mongo: connected' : 'Mongo: disconnected'}</div>
            <button className="btn" onClick={() => fetchState()}>Refresh</button>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: '0 0 320px' }}>
          {Object.keys(floors).length === 0 && (
            <div style={{ color: 'var(--muted)' }}>{loading ? 'Loading...' : 'No floors found'}</div>
          )}
          {Object.keys(floors).map(fn => (
            <div key={fn} style={{ marginBottom: 8 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Floor {fn}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
                {floors[fn].filter(r => filter === 'all' ? true : r.status === filter).map(r => (
                  <SmallRoom key={r.number} r={r} />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Current Check-ins</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {(Object.values(floors).flat().filter(r => r.status === 'occupied' && (search ? String(r.guest?.name || '').toLowerCase().includes(search.toLowerCase()) : true))).map(r => (
              <div key={r.number} className="card" style={{ padding: 8, borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 800 }}>{r.guest?.name || 'Guest'}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>Room {r.number} • {r.guest?.contact || ''}</div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{new Date(r.guest?.checkIn || Date.now()).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
