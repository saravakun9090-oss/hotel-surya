// src/liveupdate/RentPaymentPage.jsx
import React, { useEffect, useMemo, useState } from 'react';

export default function RentPaymentPage({ data }) {
  const base = useMemo(() => (data?.rentPayments || data?.rent_payments || []), [data]);

  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [mode, setMode] = useState('All');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // In this page we rely on already-polled data, so loadAll just toggles a state
  const loadAll = () => {
    setLoading(true);
    setTimeout(() => setLoading(false), 300);
  };

  const clearFilters = () => {
    setFrom('');
    setTo('');
    setMode('All');
    setQ('');
    setPage(1);
  };

  // Normalize: ensure we have comparable date string: r.date (YYYY-MM-DD) or fallbacks
  const rows = useMemo(() => {
    return base.map(r => ({
      ...r,
      _dateFolder: r.date || r.month || '',
      _roomStr: Array.isArray(r.room) ? r.room.join(', ') : (r.room || ''),
    }));
  }, [base]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter(r => {
      // date range
      if (from && (r._dateFolder || '').slice(0, 10) < from) return false;
      if (to && (r._dateFolder || '').slice(0, 10) > to) return false;
      // mode
      if (mode !== 'All' && String(r.mode || '').toLowerCase() !== mode.toLowerCase()) return false;
      // search
      if (s) {
        const hay = [
          r.name || '',
          r._roomStr,
          r._dateFolder || '',
          String(r.days || ''),
          String(r.amount || ''),
          String(r.mode || '')
        ].join(' ').toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [rows, from, to, mode, q]);

  const totalAmount = useMemo(() => {
    return filtered.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  }, [filtered]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);

  useEffect(() => { setPage(1); }, [from, to, mode, q]);

  return (
    <div>
      {/* Header */}
      <div className="header-row" style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <div className="title">Rent Payments</div>
          <div style={{ color: "var(--muted)", marginTop: 4 }}>View, filter, and total all rent collections</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={loadAll}>Refresh</button>
        </div>
      </div>

      {/* Tools */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <input type="date" className="input" value={from} onChange={e => setFrom(e.target.value)} />
        <input type="date" className="input" value={to} onChange={e => setTo(e.target.value)} />
        <select className="input" value={mode} onChange={e => setMode(e.target.value)}>
          <option value="All">All Modes</option>
          <option value="Cash">Cash</option>
          <option value="GPay">GPay</option>
        </select>
        <input className="input" placeholder="Search by guest/room/date" value={q} onChange={e => setQ(e.target.value)} />
        <button className="btn ghost" onClick={clearFilters}>Clear Filters</button>
        <div style={{ marginLeft: "auto", fontWeight: 700 }}>Total: ₹{totalAmount}</div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 12 }}>
        {loading ? <div>Loading...</div> : filtered.length === 0 ? (
          <div style={{ color: "var(--muted)" }}>No records match filters</div>
        ) : (
          <>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f5f5f5" }}>
                  <th>Date</th><th>Guest</th><th>Room</th><th>Days</th><th>Amount</th><th>Mode</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r, idx) => (
                  <tr key={idx} style={{ borderBottom: "1px solid #eee" }}>
                    <td>{r._dateFolder}</td>
                    <td>{r.name}</td>
                    <td>{r._roomStr}</td>
                    <td>{r.days || "-"}</td>
                    <td>₹{r.amount}</td>
                    <td>{r.mode}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pager */}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
              <div style={{ color: "var(--muted)" }}>
                Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, filtered.length)} of {filtered.length}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</button>
                <button className="btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
