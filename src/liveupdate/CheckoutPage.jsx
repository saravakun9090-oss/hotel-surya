// src/liveupdate/CheckoutPage.jsx
import React, { useMemo, useState } from 'react';

export default function CheckoutPage({ data }) {
  // pull from server-provided list
  const all = useMemo(() => (data?.checkouts || data?.checkoutsList || []).slice().reverse(), [data]);
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return all;
    return all.filter(c => {
      const name = (c.name || c.guest?.name || '').toLowerCase();
      const roomStr = Array.isArray(c.room) ? c.room.join(', ') : (c.room || c.rooms || '');
      const phone = String(c.contact || '').toLowerCase();
      const dates = [c.checkInDate, c.checkOutDate].filter(Boolean).join(' ').toLowerCase();
      return name.includes(s) || roomStr.includes(s) || phone.includes(s) || dates.includes(s);
    });
  }, [q, all]);

  return (
    <div>
      <h2 className="text-lg font-semibold mb-2">Checkouts</h2>

      {/* Search/filter */}
      <div className="mb-2">
        <input
          placeholder="Search by name/room/phone/date"
          className="w-full px-2 py-1 border rounded text-sm"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="list" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {filtered.length === 0 ? (
          <div style={{ color: "var(--muted)" }}>No checkouts found</div>
        ) : (
          filtered.map((c, i) => {
            const name = c.name || c.guest?.name || 'Guest';
            const roomStr = Array.isArray(c.room) ? c.room.join(', ') : (c.room || c.rooms || '—');
            return (
              <div key={i} className="card" style={{ padding: 10 }}>
                {/* Title and room */}
                <div style={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {name}
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>
                  Room {roomStr}
                </div>
                {/* Phone */}
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                  Phone no: {c.contact || '—'}
                </div>

                {/* Details grid */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 6, marginTop: 8, fontSize: 12 }}>
                  <div>Check-In: {c.checkInDate} {c.checkInTime}</div>
                  <div>Check-Out: {c.checkOutDate} {c.checkOutTime}</div>
                  <div>Days Stayed: {c.daysStayed}</div>
                  <div>Rent: ₹{c.totalRent}</div>
                  <div>Total Paid: ₹{c.totalPaid}</div>
                  <div>
                    Payment Status: {String(c.paymentTallyStatus).toLowerCase() === 'tallied' ? "✅ Tallied" : "❌ Not Tallied"}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
