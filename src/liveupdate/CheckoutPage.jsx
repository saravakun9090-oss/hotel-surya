import React, { useState, useMemo } from 'react';

export default function CheckoutPage({ data }) {
  const [search, setSearch] = useState('');
  const all = useMemo(() => (data?.checkouts || data?.checkoutsList || []).slice().reverse(), [data]);

  const filtered = useMemo(() => {
    const q = (search || '').trim().toLowerCase();
    if (!q) return all;
    return all.filter(c => {
      return String(c.name || c.guest?.name || '').toLowerCase().includes(q)
        || String(c.room || c.rooms || '').toLowerCase().includes(q)
        || String(c.checkInDate || c.checkIn || '').toLowerCase().includes(q)
        || String(c.checkOutDate || c.checkOut || '').toLowerCase().includes(q);
    });
  }, [all, search]);

  return (
    <div>
      <div>
        <div style={{ paddingBottom: 10 }} className="title">Checkouts / Active Stays</div>
      </div>

      {/* Search box */}
      <div style={{ marginBottom: 12 }}>
        <input
          className="input"
          placeholder="Search checkouts by name, room, or date"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="list">
        {(!filtered || filtered.length === 0) && (
          <div style={{ color: 'var(--muted)' }}>No checkouts</div>
        )}

        {filtered.map((c, i) => (
          <div key={i} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 700 }}>
                {c.name || c.guest?.name} <span style={{ color: 'var(--muted)', fontWeight: 700 }}>• Room {c.room || c.rooms}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                Check-in: {c.checkInDate || c.checkIn} — Check-out: {c.checkOutDate || c.checkOut}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn primary" onClick={() => { /* view details */ }}>Details</button>
              <button className="btn ghost" onClick={() => { /* delete action */ }}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
