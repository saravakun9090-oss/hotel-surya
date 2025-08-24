// src/liveupdate/ExpensesPage.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
const COLORS = {
deep: '#2c3f34',
cream: '#f7f5ee', // was #f0eee1
muted: '#2c3d34ff', // was #6b7a72
border: 'rgba(0,0,0,0.12)'
};

export default function ExpensesPage({ data }) {
  const navigate = useNavigate();
  const base = useMemo(() => (data?.expenses || []).slice().reverse(), [data]);

  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const loadAll = () => { setLoading(true); setTimeout(() => setLoading(false), 300); };
  const clearFilters = () => { setFrom(''); setTo(''); setQ(''); setPage(1); };

  const rows = useMemo(() => {
    return base.map(r => ({
      ...r,
      _dateFolder: r.date || '',
      _desc: r.description || r.category || r.note || '',
      _amt: Number(r.amount) || 0
    }));
  }, [base]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter(r => {
      const date10 = (r._dateFolder || '').slice(0, 10);
      if (from && date10 < from) return false;
      if (to && date10 > to) return false;
      if (s) {
        const hay = [r._desc, r._dateFolder, String(r.amount)].join(' ').toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [rows, from, to, q]);

  const totalAmount = useMemo(() => filtered.reduce((sum, r) => sum + (Number(r.amount) || 0), 0), [filtered]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = useMemo(() => filtered.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize), [filtered, page, pageSize]);
  useEffect(() => { setPage(1); }, [from, to, q]);

  return (
    <div>
      <div style={{ marginBottom: 10 }}>
        <button className="btn ghost" onClick={() => navigate('/liveupdate')} style={{ color: COLORS.deep, border: `1px solid ${COLORS.border}`, background: COLORS.cream }}>← Back</button>
      </div>

      <div className="header-row" style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div className="title" style={{ fontWeight: 900, color: COLORS.deep }}>Expense Payments</div>
          <div style={{ color: COLORS.muted, marginTop: 4 }}>View, filter, and total all expenses</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={loadAll}>Refresh</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input type="date" className="input" value={from} onChange={e => setFrom(e.target.value)} />
        <input type="date" className="input" value={to} onChange={e => setTo(e.target.value)} />
        <input className="input" placeholder="Search description/date" value={q} onChange={e => setQ(e.target.value)} />
        <button className="btn ghost" onClick={clearFilters}>Clear Filters</button>
        <div style={{ marginLeft: "auto", fontWeight: 900, color: COLORS.deep }}>Total: ₹{totalAmount}</div>
      </div>

      <div className="card" style={{ padding: 12, marginTop: 10, borderRadius: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.05)', border: `1px solid ${COLORS.border}`, background: '#fff' }}>
        {loading ? (
          <div>Loading...</div>
        ) : filtered.length === 0 ? (
          <div style={{ color: COLORS.muted }}>No records match filters</div>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
                <thead>
                  <tr style={{ background: COLORS.cream }}>
                    <th style={{ textAlign: "left", padding: 8 }}>Date</th>
                    <th style={{ textAlign: "left", padding: 8 }}>Description</th>
                    <th style={{ textAlign: "left", padding: 8 }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r, idx) => (
                    <tr key={idx} style={{ borderBottom: "1px solid #eee" }}>
                      <td style={{ padding: 8 }}>{r._dateFolder}</td>
                      <td style={{ padding: 8 }}>{r._desc}</td>
                      <td style={{ padding: 8 }}>₹{r._amt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ color: COLORS.muted }}>
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
