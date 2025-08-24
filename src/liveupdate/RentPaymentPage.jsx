// src/liveupdate/RentPaymentPage.jsx
import React, { useEffect, useMemo, useState } from 'react';

const COLORS = { deep: '#2c3f34', cream: '#f7f5ee', muted: '#5b6a62', border: 'rgba(0,0,0,0.12)', btn: '#313e35', btnText: '#f5f7f4' };

const API_BASE =
  (typeof window !== 'undefined' && window.__MONGO_API_BASE__) ||
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_MONGO_API_BASE) ||
  '/api';

export default function RentPaymentPage({ data }) {
  // Include ids from server so we can PUT/DELETE
  const base = useMemo(() => {
    const arr = (data?.rentPayments || data?.rent_payments || []).slice();
    arr.sort((a,b)=> new Date(b.date || b.month || 0) - new Date(a.date || a.month || 0));
    return arr;
  }, [data]);

  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [mode, setMode] = useState('All');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // Edit modal state
  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [editDays, setEditDays] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editMode, setEditMode] = useState('Cash');

  // View toggle
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

  const loadAll = async () => {
    // Soft manual refresh for UX; polling will still update soon
    setLoading(true);
    try {
      await fetch(`${API_BASE}/state`, { cache: 'no-store' });
    } finally {
      setTimeout(() => setLoading(false), 250);
    }
  };

  const clearFilters = () => {
    setFrom(''); setTo(''); setMode('All'); setQ(''); setPage(1);
  };

  const rows = useMemo(() => {
    return base.map(r => ({
      ...r,
      _date: r.date || r.month || '',
      _roomStr: Array.isArray(r.room) ? r.room.join(', ') : (r.room || ''),
      _ts: new Date(r.date || r.month || 0).getTime()
    }));
  }, [base]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter(r => {
      const ymd = (r._date || '').slice(0,10);
      if (from && ymd < from) return false;
      if (to && ymd > to) return false;
      if (mode !== 'All' && String(r.mode || '').toLowerCase() !== mode.toLowerCase()) return false;
      if (s) {
        const hay = [r.name || '', r._roomStr, r._date || '', String(r.days || ''), String(r.amount || ''), String(r.mode || '')].join(' ').toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [rows, from, to, mode, q]);

  const totalAmount = useMemo(() => filtered.reduce((sum, r) => sum + (Number(r.amount) || 0), 0), [filtered]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = useMemo(() => filtered.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize), [filtered, page, pageSize]);

  useEffect(() => { setPage(1); }, [from, to, mode, q]);

  // Edit
  const openEdit = (r) => {
    setEditRow(r);
    setEditDays(r.days || '');
    setEditAmount(r.amount || '');
    setEditMode(r.mode || 'Cash');
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!editRow?.id) { setEditOpen(false); return; }
    setLoading(true);
    try {
      await fetch(`${API_BASE}/rent-payment/${encodeURIComponent(editRow.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          days: Number(editDays) || 0,
          amount: Number(editAmount) || 0,
          mode: editMode
        })
      });
      // Soft refresh now; poll will also update
      await fetch(`${API_BASE}/state`, { cache: 'no-store' });
    } finally {
      setLoading(false);
      setEditOpen(false);
    }
  };

  // Delete
  const deleteRow = async (r) => {
    if (!r?.id) return;
    if (!confirm('Delete this rent payment?')) return;
    setLoading(true);
    try {
      await fetch(`${API_BASE}/rent-payment/${encodeURIComponent(r.id)}`, { method: 'DELETE' });
      await fetch(`${API_BASE}/state`, { cache: 'no-store' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="header-row" style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div className="title" style={{ fontWeight: 900, color: COLORS.deep }}>Rent Payments</div>
          <div style={{ color: COLORS.muted, marginTop: 4 }}>View, filter, edit or delete rent collections</div>
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
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <input type="date" className="input" value={from} onChange={e => setFrom(e.target.value)} />
        <input type="date" className="input" value={to} onChange={e => setTo(e.target.value)} />
        <select className="input" value={mode} onChange={e => setMode(e.target.value)}>
          <option value="All">All Modes</option>
          <option value="Cash">Cash</option>
          <option value="GPay">GPay</option>
        </select>
        <input className="input" placeholder="Search by guest/room/date" value={q} onChange={e => setQ(e.target.value)} />
        <button className="btn" onClick={clearFilters} style={{ background: 'transparent', border: `1px solid ${COLORS.border}`, color: COLORS.deep }}>Clear</button>
        <div style={{ marginLeft: "auto", fontWeight: 900, color: COLORS.deep }}>Total: ₹{totalAmount}</div>
      </div>

      {/* Content */}
      <div className="card" style={{ padding: 12, borderRadius: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.05)', border: `1px solid ${COLORS.border}`, background: '#fff' }}>
        {loading ? <div>Loading...</div> : filtered.length === 0 ? (
          <div style={{ color: COLORS.muted }}>No records match filters</div>
        ) : view === 'table' ? (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
                <thead>
                  <tr style={{ background: '#f5f5f5' }}>
                    <th style={{ textAlign: 'left', padding: 8 }}>Date</th>
                    <th style={{ textAlign: 'left', padding: 8 }}>Guest</th>
                    <th style={{ textAlign: 'left', padding: 8 }}>Room</th>
                    <th style={{ textAlign: 'left', padding: 8 }}>Days</th>
                    <th style={{ textAlign: 'left', padding: 8 }}>Amount</th>
                    <th style={{ textAlign: 'left', padding: 8 }}>Mode</th>
                    <th style={{ textAlign: 'left', padding: 8 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r, idx) => (
                    <tr key={r.id || idx} style={{ borderBottom: "1px solid #eee" }}>
                      <td style={{ padding: 8 }}>{r._date}</td>
                      <td style={{ padding: 8 }}>{r.name}</td>
                      <td style={{ padding: 8 }}>{r._roomStr}</td>
                      <td style={{ padding: 8 }}>{r.days || "-"}</td>
                      <td style={{ padding: 8 }}>₹{r.amount}</td>
                      <td style={{ padding: 8 }}>{r.mode}</td>
                      <td style={{ padding: 8, display: 'flex', gap: 6 }}>
                        <button className="btn small" onClick={() => openEdit(r)} style={{ background: COLORS.btn, color: COLORS.btnText }}>Edit</button>
                        <button className="btn small danger" onClick={() => deleteRow(r)}>Delete</button>
                      </td>
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
                <div key={r.id || idx} className="card" style={{ border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                    <div style={{ fontWeight: 800, color: COLORS.deep, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                    <div style={{ fontSize: 12, color: COLORS.muted }}>{r._date}</div>
                  </div>
                  <div style={{ fontSize: 12, color: COLORS.muted }}>Room {r._roomStr} • {r.mode} • {r.days || '-'} day(s)</div>
                  <div style={{ marginTop: 6, fontWeight: 900, color: COLORS.deep }}>₹{r.amount}</div>
                  <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                    <button className="btn small" onClick={() => openEdit(r)} style={{ background: COLORS.btn, color: COLORS.btnText }}>Edit</button>
                    <button className="btn small danger" onClick={() => deleteRow(r)}>Delete</button>
                  </div>
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

      {/* Edit Modal */}
      {editOpen && editRow && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
          <div style={{ background:'#fff', padding:16, borderRadius:10, minWidth:280 }}>
            <div style={{ fontWeight:900, marginBottom:8, color:COLORS.deep }}>Edit Payment</div>
            <div style={{ display:'grid', gap:8 }}>
              <label style={{ fontSize:12, color:COLORS.muted }}>Days
                <input className="input" type="number" value={editDays} onChange={e=>setEditDays(e.target.value)} />
              </label>
              <label style={{ fontSize:12, color:COLORS.muted }}>Amount
                <input className="input" type="number" value={editAmount} onChange={e=>setEditAmount(e.target.value)} />
              </label>
              <label style={{ fontSize:12, color:COLORS.muted }}>Mode
                <select className="input" value={editMode} onChange={e=>setEditMode(e.target.value)}>
                  <option value="Cash">Cash</option>
                  <option value="GPay">GPay</option>
                </select>
              </label>
            </div>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:12 }}>
              <button className="btn ghost" onClick={()=> setEditOpen(false)}>Cancel</button>
              <button className="btn" style={{ background:COLORS.btn, color:COLORS.btnText }} onClick={saveEdit}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
