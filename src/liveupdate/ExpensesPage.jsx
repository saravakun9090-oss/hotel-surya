// src/liveupdate/ExpensesPage.jsx
import React, { useEffect, useMemo, useState } from 'react';

const COLORS = { deep: '#2c3f34', cream: '#f7f5ee', muted: '#2c3d34ff', border: 'rgba(0,0,0,0.12)', btn: '#313e35', btnText: '#f5f7f4' };

export default function ExpensesPage({ data }) {
  // SORT: most recent first
  const base = useMemo(() => {
  const arr = (data?.expenses || []).slice();
  arr.sort((a,b)=> new Date(b.date || 0) - new Date(a.date || 0));
  return arr;
  }, [data]);

  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const prefersMobile = typeof window !== 'undefined' ? window.innerWidth <= 640 : false;
  const [view, setView] = useState(prefersMobile ? 'cards' : 'table');
  useEffect(() => {
    const onResize = () => {
      const mobile = window.innerWidth <= 640;
      setView(v => (v === 'table' && mobile) ? 'cards' : (v === 'cards' && !mobile ? 'table' : v));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const loadAll = () => { setLoading(true); setTimeout(() => setLoading(false), 300); };

  const clearFilters = () => { setFrom(''); setTo(''); setQ(''); setPage(1); };

  const rows = useMemo(() => {
    return base.map(r => ({
      ...r,
      _date: r.date || '',
      _desc: r.description || r.category || r.note || '',
      _amt: Number(r.amount) || 0,
      _ts: new Date(r.date || 0).getTime()
    }));
  }, [base]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter(r => {
      const ymd = (r._date || '').slice(0, 10);
      if (from && ymd < from) return false;
      if (to && ymd > to) return false;
      if (s) {
        const hay = [r._desc, r._date, String(r._amt)].join(' ').toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [rows, from, to, q]);

  const totalAmount = useMemo(() => filtered.reduce((sum, r) => sum + (Number(r._amt) || 0), 0), [filtered]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = useMemo(() => filtered.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize), [filtered, page, pageSize]);

  useEffect(() => { setPage(1); }, [from, to, q]);

  return (
    <div>
      <div style={{ marginBottom: 10 }}>
        <button className="btn ghost" onClick={() => navigate('/liveupdate')} style={{ color: COLORS.deep, border: `1px solid ${COLORS.border}`, background: COLORS.cream }}>← Back</button>
      </div>
      {/* Header */}
      <div className="header-row" style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div className="title" style={{ fontWeight: 900, color: COLORS.deep }}>Expense Payments</div>
          <div style={{ color: COLORS.muted, marginTop: 4 }}>View, filter, and total all expenses</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '2px' }}>
            <button className="btn" onClick={() => setView('table')}
              style={{ background: view==='table'? COLORS.btn : 'transparent', color: view==='table'? COLORS.btnText: COLORS.deep, borderRadius: 6, padding: '6px 10px' }}>
              Table
            </button>
            <button className="btn" onClick={() => setView('cards')}
              style={{ background: view==='cards'? COLORS.btn : 'transparent', color: view==='cards'? COLORS.btnText: COLORS.deep, borderRadius: 6, padding: '6px 10px' }}>
              Cards
            </button>
          </div>
          <button className="btn" onClick={loadAll} style={{ background: COLORS.btn, color: COLORS.btnText, border: '1px solid rgba(0,0,0,0.18)' }}>Refresh</button>
        </div>
      </div>

      {/* Tools */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input type="date" className="input" value={from} onChange={e => setFrom(e.target.value)} />
        <input type="date" className="input" value={to} onChange={e => setTo(e.target.value)} />
        <input className="input" placeholder="Search description/date" value={q} onChange={e => setQ(e.target.value)} />
        <button className="btn" onClick={clearFilters} style={{ background: 'transparent', border: `1px solid ${COLORS.border}`, color: COLORS.deep }}>Clear</button>
        <div style={{ marginLeft: "auto", fontWeight: 900, color: COLORS.deep }}>Total: ₹{totalAmount}</div>
      </div>

      {/* Content */}
      <div className="card" style={{ padding: 12, marginTop: 10, borderRadius: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.05)', border: `1px solid ${COLORS.border}`, background: '#fff' }}>
        {loading ? (
          <div>Loading...</div>
        ) : filtered.length === 0 ? (
          <div style={{ color: COLORS.muted }}>No records match filters</div>
        ) : view === 'table' ? (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
                <thead>
                  <tr style={{ background: '#f5f5f5' }}>
                    <th style={{ textAlign: "left", padding: 8 }}>Date</th>
                    <th style={{ textAlign: "left", padding: 8 }}>Description</th>
                    <th style={{ textAlign: "left", padding: 8 }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r, idx) => (
                    <tr key={idx} style={{ borderBottom: "1px solid #eee" }}>
                      <td style={{ padding: 8 }}>{r._date}</td>
                      <td style={{ padding: 8 }}>{r._desc}</td>
                      <td style={{ padding: 8 }}>₹{r._amt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pager */}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ color: COLORS.muted }}>
                Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, filtered.length)} of {filtered.length}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={{ background: COLORS.btn, color: COLORS.btnText, border: '1px solid rgba(0,0,0,0.18)' }}>Prev</button>
                <button className="btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} style={{ background: COLORS.btn, color: COLORS.btnText, border: '1px solid rgba(0,0,0,0.18)' }}>Next</button>
              </div>
            </div>
          </>
        ) : (
          // Cards view (mobile-compact)
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pageRows.map((r, idx) => (
                <div key={idx} className="card" style={{ border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                    <div style={{ fontWeight: 800, color: COLORS.deep, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r._desc}</div>
                    <div style={{ fontSize: 12, color: COLORS.muted }}>{r._date}</div>
                  </div>
                  <div style={{ marginTop: 6, fontWeight: 900, color: COLORS.deep }}>₹{r._amt}</div>
                </div>
              ))}
            </div>

            {/* Pager */}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <div style={{ color: COLORS.muted }}>
                Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, filtered.length)} of {filtered.length}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={{ background: COLORS.btn, color: COLORS.btnText, border: '1px solid rgba(0,0,0,0.18)' }}>Prev</button>
                <button className="btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} style={{ background: COLORS.btn, color: COLORS.btnText, border: '1px solid rgba(0,0,0,0.18)' }}>Next</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
