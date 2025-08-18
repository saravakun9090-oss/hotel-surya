import React, { useEffect, useState } from 'react';
import { getFirestore, collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { initializeApp } from 'firebase/app';
import * as cloudSync from '../services/cloudSync';

// Simple owner-only dashboard that requires a shared password set via env var REACT_APP_OWNER_PASSWORD
// It reads Firestore collections: checkins, checkouts, reservations, rents, expenses

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || '',
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || '',
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || ''
};
let db = null;
try {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
} catch (e) {
  console.warn('Firebase init failed in dashboard', e);
}

// NOTE: Owner password hard-coded here as requested. Change the value to your desired password.
const OWNER_PASSWORD = 'ChangeMe123!';

export default function RemoteDashboard() {
  const [authorized, setAuthorized] = useState(false);
  const [password, setPassword] = useState('');
  const [checkins, setCheckins] = useState([]);
  const [checkouts, setCheckouts] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [rents, setRents] = useState([]);
  const [expenses, setExpenses] = useState([]);

  useEffect(() => {
    if (!authorized || !db) return;
    const unsub = [];

    try {
      const q1 = query(collection(db, 'checkins'), orderBy('createdAt', 'desc'));
      unsub.push(onSnapshot(q1, snap => setCheckins(snap.docs.map(d => ({ id: d.id, ...d.data() })) )));
    } catch (e) { console.warn(e); }
    try {
      const q2 = query(collection(db, 'checkouts'), orderBy('createdAt', 'desc'));
      unsub.push(onSnapshot(q2, snap => setCheckouts(snap.docs.map(d => ({ id: d.id, ...d.data() })) )));
    } catch (e) { console.warn(e); }
    try { const q3 = query(collection(db, 'reservations'), orderBy('createdAt', 'desc')); unsub.push(onSnapshot(q3, snap => setReservations(snap.docs.map(d => ({ id: d.id, ...d.data() })) ))); } catch (e) { console.warn(e); }
    try { const q4 = query(collection(db, 'rents'), orderBy('createdAt', 'desc')); unsub.push(onSnapshot(q4, snap => setRents(snap.docs.map(d => ({ id: d.id, ...d.data() })) ))); } catch (e) { console.warn(e); }
    try { const q5 = query(collection(db, 'expenses'), orderBy('createdAt', 'desc')); unsub.push(onSnapshot(q5, snap => setExpenses(snap.docs.map(d => ({ id: d.id, ...d.data() })) ))); } catch (e) { console.warn(e); }

    return () => unsub.forEach(u => typeof u === 'function' && u());
  }, [authorized]);

  function tryAuth() {
  const secret = OWNER_PASSWORD || process.env.REACT_APP_OWNER_PASSWORD || '';
  if (password === secret && secret !== '') setAuthorized(true);
    else alert('Invalid password');
  }

  if (!authorized) {
    return (
      <div style={{ padding: 20 }}>
        <h2>Owner Dashboard — Login</h2>
        <p>Enter owner password to view live data.</p>
        <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Owner password" />
        <div style={{ height: 10 }} />
        <button onClick={tryAuth} className="btn primary">Enter</button>
        <p style={{ marginTop: 12, color: 'var(--muted)' }}>This is a shared-password login. Set REACT_APP_OWNER_PASSWORD in Netlify env vars.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 12 }}>
      <h2>Owner Live Dashboard</h2>
      <div style={{ marginBottom: 8 }}>
        <strong>Firebase:</strong> {db ? <span style={{ color: 'green' }}>connected</span> : <span style={{ color: 'crimson' }}>not configured</span>} {' '}
        {db && (
          <button className="btn" style={{ marginLeft: 8 }} onClick={async () => {
            try {
              const sample = { name: 'Owner Test', room: [101], checkIn: new Date().toISOString(), rate: 0 };
              await cloudSync.pushCheckin(sample);
              alert('Test checkin pushed');
            } catch (e) { alert('Test push failed: ' + (e?.message || e)); }
          }}>Send test check-in</button>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="card">
          <h3>Recent Check-ins</h3>
          {checkins.length === 0 && <div style={{ color: 'var(--muted)' }}>No check-ins</div>}
          {checkins.slice(0, 20).map(c => (
            <div key={c.id} className="card" style={{ marginBottom: 8 }}>
              <div style={{ fontWeight: 700 }}>{c.name} — {Array.isArray(c.room) ? c.room.join(',') : c.room}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{c.checkIn}</div>
            </div>
          ))}
        </div>

        <div className="card">
          <h3>Recent Check-outs</h3>
          {checkouts.length === 0 && <div style={{ color: 'var(--muted)' }}>No check-outs</div>}
          {checkouts.slice(0, 20).map(c => (
            <div key={c.id} className="card" style={{ marginBottom: 8 }}>
              <div style={{ fontWeight: 700 }}>{c.name} — {Array.isArray(c.rooms) ? c.rooms.join(',') : c.room}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{c.checkOutDateTime || c.checkOutDate}</div>
            </div>
          ))}
        </div>

        <div className="card">
          <h3>Reservations</h3>
          {reservations.length === 0 && <div style={{ color: 'var(--muted)' }}>No reservations</div>}
          {reservations.slice(0, 20).map(r => (
            <div key={r.id} className="card" style={{ marginBottom: 8 }}>
              <div style={{ fontWeight: 700 }}>{r.name} — Room {r.room}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{r.date}</div>
            </div>
          ))}
        </div>

        <div className="card">
          <h3>Rents & Payments</h3>
          {rents.length === 0 && <div style={{ color: 'var(--muted)' }}>No rent entries</div>}
          {rents.slice(0, 30).map(r => (
            <div key={r.id} className="card" style={{ marginBottom: 6 }}>
              <div style={{ fontWeight: 700 }}>{r.name} — ₹{r.amount}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{r.date}</div>
            </div>
          ))}

          <h4 style={{ marginTop: 12 }}>Expenses</h4>
          {expenses.length === 0 && <div style={{ color: 'var(--muted)' }}>No expenses</div>}
          {expenses.slice(0, 30).map(e => (
            <div key={e.id} className="card" style={{ marginBottom: 6 }}>
              <div style={{ fontWeight: 700 }}>{e.title} — ₹{e.amount}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{e.date}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
