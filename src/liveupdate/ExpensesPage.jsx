import React from 'react';
export default function ExpensesPage({ data }) {
  const list = (data?.expenses || []).slice().reverse();
  return (
    <div>
      <h2 className="text-lg font-medium mb-2">Expenses</h2>
      <div className="mb-3">
        <input placeholder="Search expenses" className="w-full px-2 py-1 border rounded text-sm" />
      </div>
      <div className="space-y-2">
        {list.map((e, i) => (
          <div key={i} className="p-2 border rounded">
            <div className="font-medium">{e.category || e.note} — {e.amount}</div>
            <div className="text-xs text-gray-600">{e.date}</div>
          </div>
        ))}
        {list.length===0 && <div className="text-sm text-gray-500">No expenses</div>}
      </div>
    </div>
  );
}
