import React, { useState, useMemo } from 'react';

export default function CheckoutPage({ data }) {
  const [errorMsg, setErrorMsg] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterPayment, setFilterPayment] = useState('all'); // all | tallied | not-tallied

  const all = useMemo(() => (data?.checkouts || data?.checkoutsList || []).slice().reverse(), [data]);

  const formatMoney = (n) => `₹${Number(n || 0).toLocaleString()}`;
  const chipStyle = (ok) => ({
    display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '4px 8px', borderRadius: 999,
    border: `1px solid ${ok ? 'rgba(22,163,74,0.25)' : 'rgba(220,38,38,0.25)'}`,
    background: ok ? 'rgba(22,163,74,0.10)' : 'rgba(220,38,38,0.08)', color: ok ? '#166534' : '#991b1b', fontWeight: 600
  });

  const filteredCheckoutList = useMemo(() => {
    const q = (searchQuery || '').trim().toLowerCase();

    return all.filter(c => {
      // Search
      const matchesSearch =
        q.length === 0 ||
        (String(c.name || c.guest?.name || '')).toLowerCase().includes(q) ||
        String(Array.isArray(c.room) ? c.room.join(', ') : (c.room || '')).toLowerCase().includes(q);

      // Payment status
      const status = (c.paymentTallyStatus || '').toLowerCase();
      const matchesPayment =
        filterPayment === 'all' ||
        (filterPayment === 'tallied' && status === 'tallied') ||
        (filterPayment === 'not-tallied' && status !== 'tallied');

      // Date range filter (inclusive)
      const coTime = c.checkOutDateTime ? new Date(c.checkOutDateTime) : (c.checkOutDate ? new Date((c.checkOutDate || '') + 'T00:00:00') : null);
      const fromOk = filterDateFrom ? (coTime ? coTime >= new Date(filterDateFrom + 'T00:00:00') : true) : true;
      const toOk = filterDateTo ? (coTime ? coTime <= new Date(filterDateTo + 'T23:59:59') : true) : true;

      return matchesSearch && matchesPayment && fromOk && toOk;
    });
  }, [all, searchQuery, filterDateFrom, filterDateTo, filterPayment]);

  return (
    <div style={{ padding: 16 }}>
      {errorMsg && <div style={{ marginBottom: 8, color: '#dc2626' }}>{errorMsg}</div>}

      {/* Filters/Header */}
      <div
        className="card"
        style={{
          padding: 14,
          marginBottom: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
          background: 'var(--card-bg, #fff)',
          borderRadius: 10,
          boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
        }}
      >
        <div style={{ fontWeight: 800, color: 'var(--deep, #0b3d2e)', fontSize: 18 }}>Checked-Out Guests</div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Search name or room..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ padding: '8px 10px', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 8, minWidth: 200 }}
          />
          <input
            type="date"
            value={filterDateFrom}
            onChange={(e) => setFilterDateFrom(e.target.value)}
            style={{ padding: '8px 10px', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 8 }}
          />
          <input
            type="date"
            value={filterDateTo}
            onChange={(e) => setFilterDateTo(e.target.value)}
            style={{ padding: '8px 10px', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 8 }}
          />
          <select
            value={filterPayment}
            onChange={(e) => setFilterPayment(e.target.value)}
            style={{ padding: '8px 10px', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 8, minWidth: 160 }}
          >
            <option value="all">All payments</option>
            <option value="tallied">Tallied ✅</option>
            <option value="not-tallied">Not tallied ❌</option>
          </select>
          <button
            className="btn ghost"
            onClick={() => {
              setSearchQuery('');
              setFilterDateFrom('');
              setFilterDateTo('');
              setFilterPayment('all');
            }}
          >
            Clear
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', background: 'var(--card-bg, #fff)', borderRadius: 10, boxShadow: '0 4px 10px rgba(0,0,0,0.06)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'linear-gradient(0deg, rgba(12,53,44,0.03), rgba(12,53,44,0.03))', color: 'var(--deep, #0b3d2e)' }}>
                {['Name','Room','Check-In','Check-Out','Days','Rent','Total Paid','Payment Status'].map((h, idx) => (
                  <th key={idx} style={{ position: 'sticky', top: 0, textAlign: 'left', padding: '10px 12px', fontSize: 12, letterSpacing: 0.2, borderBottom: '1px solid rgba(0,0,0,0.06)', zIndex: 1, background: 'inherit' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredCheckoutList.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: 16, color: 'var(--muted, #6b7280)' }}>No checkouts found</td>
                </tr>
              ) : (
                filteredCheckoutList.map((c, i) => {
                  const ok = (c.paymentTallyStatus || '').toLowerCase() === 'tallied';
                  const rowBg = i % 2 === 0 ? 'rgba(0,0,0,0.015)' : 'transparent';
                  return (
                    <tr key={i} style={{ background: rowBg, borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 600, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</td>
                      <td style={{ padding: '10px 12px' }}>{c.room}</td>
                      <td style={{ padding: '10px 12px' }}>{(c.checkInDate || '-') } {(c.checkInTime || '')}</td>
                      <td style={{ padding: '10px 12px' }}>{(c.checkOutDate || '-') } {(c.checkOutTime || '')}</td>
                      <td style={{ padding: '10px 12px' }}>{c.daysStayed}</td>
                      <td style={{ padding: '10px 12px' }}>{formatMoney(c.totalRent)}</td>
                      <td style={{ padding: '10px 12px' }}>{formatMoney(c.totalPaid)}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={chipStyle(ok)}>
                          <span>{ok ? '✅' : '❌'}</span>
                          <span>{ok ? 'Tallied' : 'Not Tallied'}</span>
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
