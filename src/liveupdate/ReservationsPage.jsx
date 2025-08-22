import React from 'react';
export default function ReservationsPage({ data }) {
  const list = (data?.reservations || []).slice().reverse();
  return (
    <div>
      <h2 className="text-lg font-medium mb-2">Reservations</h2>
      <div className="mb-3">
        <input placeholder="Search reservations" className="w-full px-2 py-1 border rounded text-sm" />
      </div>
      <div className="space-y-2">
        {list.map((r, i) => (
          <div key={i} className="p-2 border rounded">
            <div className="font-medium">{r.name} — Room {r.room}</div>
            <div className="text-xs text-gray-600">{r.date} • {r.note || ''}</div>
          </div>
        ))}
        {list.length===0 && <div className="text-sm text-gray-500">No reservations</div>}
      </div>
    </div>
  );
}
