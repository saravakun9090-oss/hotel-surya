import React from 'react';
export default function RentPaymentPage({ data }) {
  const list = (data?.rentPayments || data?.rent_payments || []).slice().reverse();
  return (
    <div>
      <h2 className="text-lg font-medium mb-2">Rent Payments</h2>
      <div className="mb-3">
        <input placeholder="Search payments" className="w-full px-2 py-1 border rounded text-sm" />
      </div>
      <div className="space-y-2">
        {list.map((p, i) => (
          <div key={i} className="p-2 border rounded">
            <div className="font-medium">Room {p.room} — {p.payer || p.name}</div>
            <div className="text-xs text-gray-600">{p.date || p.month} • {p.amount}</div>
          </div>
        ))}
        {list.length===0 && <div className="text-sm text-gray-500">No payments</div>}
      </div>
    </div>
  );
}
