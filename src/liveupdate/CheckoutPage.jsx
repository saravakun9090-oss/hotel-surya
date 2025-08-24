// src/liveupdate/CheckoutPage.jsx
import React, { useMemo, useState } from 'react';

export default function CheckoutPage({ data }) {
  // Source list from server
  const all = useMemo(() => (data?.checkouts || data?.checkoutsList || []).slice().reverse(), [data]);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterPayment, setFilterPayment] = useState('all'); // all | tallied | not-tallied

  // Helper: normalize a variety of date formats to yyyy-mm-dd (best-effort)
  const ymdFromDisplay = (dstr) => {
    if (!dstr) return '';
    // If already yyyy-mm-dd
    if (/^\d{4}-\d{2}-\d{2}$/.test(dstr)) return dstr;
    // dd/mm/yyyy
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(dstr)) {
      const [dd, mm, yyyy] = dstr.split('/');
      return `${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`;
    }
    // Try Date parse
    const d = new Date(dstr);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0,10);
    return '';
  };

  // Derived with filters applied
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return all.filter((c) => {
      // Search by name/room/phone/date text
      if (q) {
        const name = (c.name || c.guest?.name || '').toLowerCase();
        const roomStr = Array.isArray(c.room) ? c.room.join(', ') : (c.room || c.rooms || '');
        const phone = String(c.contact || '').toLowerCase();
        const dates = [c.checkInDate, c.checkOutDate].filter(Boolean).join(' ').toLowerCase();
        const hay = [name, roomStr, phone, dates].join(' ');
        if (!hay.includes(q)) return false;
      }

      // Date range filter (using Check-Out date if present; else use Check-In)
      const coYmd = ymdFromDisplay(c.checkOutDate) || ymdFromDisplay(c.checkInDate);
      if (filterDateFrom && coYmd && coYmd < filterDateFrom) return false;
      if (filterDateTo && coYmd && coYmd > filterDateTo) return false;

      // Payment filter
      const status = String(c.paymentTallyStatus || '').toLowerCase();
      if (filterPayment === 'tallied' && status !== 'tallied') return false;
      if (filterPayment === 'not-tallied' && status === 'tallied') return false;

      return true;
    });
  }, [all, searchQuery, filterDateFrom, filterDateTo, filterPayment]);

  return (
    <div>
      {/* Filters/Header */}
      <div
        className="card"
        style={{
          padding: 14,
          marginBottom: 12,
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
          background: "var(--card-bg, #fff)",
          borderRadius: 10,
          boxShadow: "0 2px 8px rgba(0,0,0,0.05)"
        }}
      >
        <div style={{ fontWeight: 800, color: "var(--deep, #0b3d2e)", fontSize: 18 }}>
          Checked-Out Guests
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            type="text"
            placeholder="Search name or room..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              padding: "8px 10px",
              border: "1px solid rgba(0,0,0,0.12)",
              borderRadius: 8,
              minWidth: 200
            }}
          />
          <input
            type="date"
            value={filterDateFrom}
            onChange={(e) => setFilterDateFrom(e.target.value)}
            style={{
              padding: "8px 10px",
              border: "1px solid rgba(0,0,0,0.12)",
              borderRadius: 8
            }}
          />
          <input
            type="date"
            value={filterDateTo}
            onChange={(e) => setFilterDateTo(e.target.value)}
            style={{
              padding: "8px 10px",
              border: "1px solid rgba(0,0,0,0.12)",
              borderRadius: 8
            }}
          />
          <select
            value={filterPayment}
            onChange={(e) => setFilterPayment(e.target.value)}
            style={{
              padding: "8px 10px",
              border: "1px solid rgba(0,0,0,0.12)",
              borderRadius: 8,
              minWidth: 160
            }}
          >
            <option value="all">All payments</option>
            <option value="tallied">Tallied ✅</option>
            <option value="not-tallied">Not tallied ❌</option>
          </select>
          <button
            className="btn ghost"
            onClick={() => {
              setSearchQuery("");
              setFilterDateFrom("");
              setFilterDateTo("");
              setFilterPayment("all");
            }}
          >
            Clear
          </button>
        </div>
      </div>

      {/* List */}
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
                    Payment Status: {String(c.paymentTallyStatus).toLowerCase() === 'tallied' ? '✅ Tallied' : '❌ Not Tallied'}
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
