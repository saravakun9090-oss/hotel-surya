import React from 'react';
export default function CheckoutPage({ data }) {
  let all = (data?.checkouts || data?.checkoutsList || []);
  // If we have checkout-like records, prefer those (historical checkouts)
  if (Array.isArray(all) && all.length > 0) {
    const realCheckouts = all.filter(c => c.checkOutDate || c.checkOutDateTime || c.daysStayed || c.totalRent);
    if (realCheckouts.length > 0) {
      all = realCheckouts;
    }
  }

  // If no explicit checkout records, derive active stays from floors
  if ((!all || all.length === 0) && data?.floors) {
    const rooms = [];
    for (const fl of Object.values(data.floors)) {
      for (const r of fl) {
        if (r?.status === 'occupied' && r.guest) {
          rooms.push({ room: r.number, name: r.guest?.name || r.guest?.fullName || '', checkIn: r.guest?.checkIn || r.guest?.checkInDate || null, checkOut: r.guest?.checkOut || null });
        }
      }
    }
    all = rooms;
  }
  all = (all || []).slice().reverse();
  return (
    <div>
      <h2 className="text-lg font-medium mb-2">Checkouts / Active Stays</h2>
      <div className="mb-3">
        <input placeholder="Search checkouts" className="w-full px-2 py-1 border rounded text-sm" />
      </div>
      <div className="space-y-2">
        {all.map((c, i) => (
          <div key={i} className="p-2 border rounded">
            <div className="font-medium">Room {c.room || c.rooms} — {c.name || c.guest?.name}</div>
            <div className="text-xs text-gray-600">Check-in: {c.checkInDate || c.checkIn} • Check-out: {c.checkOutDate || c.checkOut}</div>
          </div>
        ))}
        {all.length===0 && <div className="text-sm text-gray-500">No checkouts</div>}
      </div>
    </div>
  );
}
