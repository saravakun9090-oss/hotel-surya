// src/liveupdate/ReservationsPage.jsx
import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
const COLORS = {
deep: '#2c3f34',
cream: '#f7f5ee', // was #f0eee1
muted: '#2c3d34ff', // was #6b7a72
border: 'rgba(0,0,0,0.12)'
};

export default function ReservationsPage({ data }) {
  const navigate = useNavigate();
  const list = useMemo(() => {
const arr = (data?.reservations || []).slice();
arr.sort((a,b)=> {
const ta = new Date(a.date || 0).getTime();
const tb = new Date(b.date || 0).getTime();
return tb - ta;
});
return arr;
}, [data]);
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
      <div style={{ marginBottom: 10 }}>
        <button className="btn ghost" onClick={() => navigate('/liveupdate')} style={{ color: COLORS.deep, border: `1px solid ${COLORS.border}`, background: COLORS.cream }}>← Back</button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <input
          placeholder="Search by name/place/room/date"
          className="w-full px-3 py-2 border rounded-md text-sm"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ borderColor: COLORS.border }}
        />
      </div>

      <div className="list" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.length === 0 && <div style={{ color: COLORS.muted }}>No reservations</div>}
        {filtered.map((r, i) => (
          <div key={i} className="card" style={{ display: 'flex', justifyContent: 'space-between', padding: 12, borderRadius: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.05)', border: `1px solid ${COLORS.border}`, background: '#fff' }}>
            <div>
              <div style={{ fontWeight: 900, color: COLORS.deep }}>
                {r.name} {r.place ? <span style={{ color: COLORS.muted, fontWeight: 700 }}> - {r.place}</span> : null}
              </div>
              <div style={{ fontSize: 12, color: COLORS.muted }}>
                Room {r.room} — {r.date}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
