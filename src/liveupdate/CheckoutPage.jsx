// src/liveupdate/CheckoutPage.jsx
import React, { useMemo, useState } from 'react';

export default function CheckoutPage({ data }) {
  const all = useMemo(() => (data?.checkouts || data?.checkoutsList || []).slice().reverse(), [data]);
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return all;
    return all.filter(c => {
      const name = (c.name || c.guest?.name || '').toLowerCase();
      const room = Array.isArray(c.room) ? c.room.join(', ') : (c.room || '');
      const dates = [c.checkInDate, c.checkOutDate].filter(Boolean).join(' ');
      return name.includes(s) || String(room).includes(s) || dates.toLowerCase().includes(s);
    });
  }, [q, all]);

  return (
    <div>
      <h2 className="text-lg font-semibold mb-2">Checkouts</h2>
      <div className="mb-2">
        <input
          placeholder="Search by name/room/date"
          className="w-full px-2 py-1 border rounded text-sm"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="list" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filtered.length === 0 ? (
          <div style={{ color: "var(--muted)" }}>No checkouts found</div>
        ) : (
          filtered.map((c, i) => (
            <div key={i} className="card" style={{ padding: 10 }}>
              <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {c.name || c.guest?.name || 'Guest'}
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                Room {Array.isArray(c.room) ? c.room.join(', ') : (c.room || c.rooms || '—')}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 6, marginTop: 8, fontSize: 12 }}>
                <div>Check-In: {c.checkInDate} {c.checkInTime}</div>
                <div>Check-Out: {c.checkOutDate} {c.checkOutTime}</div>
                <div>Days Stayed: {c.daysStayed}</div>
                <div>Rent: ₹{c.totalRent}</div>
                <div>Total Paid: ₹{c.totalPaid}</div>
                <div>Payment Status: {c.paymentTallyStatus === "tallied" ? "✅ Tallied" : "❌ Not Tallied"}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
