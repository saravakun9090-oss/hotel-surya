// src/liveupdate/ReservationsPage.jsx
import React, { useMemo, useState } from 'react';

export default function ReservationsPage({ data }) {
  const list = useMemo(() => (data?.reservations || []).slice().reverse(), [data]);
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return list;
    return list.filter(r => {
      const name = String(r.name || '').toLowerCase();
      const place = String(r.place || '').toLowerCase();
      const room = String(r.room || '');
      const date = String(r.date || '');
      return name.includes(s) || place.includes(s) || room.includes(s) || date.includes(s);
    });
  }, [q, list]);

  return (
    <div>
      <h2 className="text-lg font-semibold mb-2">Reservations</h2>
      <div className="mb-2">
        <input
          placeholder="Search by name/place/room/date"
          className="w-full px-2 py-1 border rounded text-sm"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="list" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.length === 0 && <div style={{ color: 'var(--muted)' }}>No reservations</div>}
        {filtered.map((r, i) => (
          <div key={i} className="card" style={{ display: 'flex', justifyContent: 'space-between', padding: 10 }}>
            <div>
              <div style={{ fontWeight: 700 }}>
                {r.name} {r.place ? <span style={{ color: 'var(--muted)', fontWeight: 700 }}> - {r.place}</span> : null}
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                Room {r.room} — {r.date}
              </div>
            </div>
            {/* Buttons removed per request */}
          </div>
        ))}
      </div>
    </div>
  );
}
