import React, { useEffect, useState } from 'react';
import { initGun, subscribeCollection, offCollection } from '../services/realtime';

const DEFAULT_PEERS = ['https://gun-manhattan.herokuapp.com/gun'];

function pad2(n){ return String(n).padStart(2,'0'); }

export default function RemoteView() {
  const [checkins, setCheckins] = useState({});
  const [reservations, setReservations] = useState({});
  const [rentPayments, setRentPayments] = useState({});
  const [expenses, setExpenses] = useState({});
  const [checkouts, setCheckouts] = useState({});

  useEffect(() => {
    initGun({ peers: DEFAULT_PEERS });

    const onCheckin = (key, data) => setCheckins(prev => ({ ...prev, [key]: data }));
    const onRes = (key, data) => setReservations(prev => ({ ...prev, [key]: data }));
    const onRent = (key, data) => setRentPayments(prev => ({ ...prev, [key]: data }));
    const onExp = (key, data) => setExpenses(prev => ({ ...prev, [key]: data }));
    const onCheckout = (key, data) => setCheckouts(prev => ({ ...prev, [key]: data }));

    subscribeCollection('checkins', onCheckin);
    subscribeCollection('reservations', onRes);
    subscribeCollection('rentCollections', onRent);
    subscribeCollection('expenses', onExp);
    subscribeCollection('checkouts', onCheckout);

    return () => {
      try { offCollection('checkins'); offCollection('reservations'); offCollection('rentCollections'); offCollection('expenses'); offCollection('checkouts'); } catch (e) {}
    };
  }, []);

  // helpers to compute room status from checkins/reservations
  const today = new Date().toISOString().slice(0,10);

  const roomHasCheckin = (roomNum) => {
    return Object.values(checkins).some(d => {
      if (!d) return false;
      const rooms = Array.isArray(d.room) ? d.room.map(Number) : [Number(d.room)];
      return rooms.includes(Number(roomNum));
    });
  };

  const roomHasReservationToday = (roomNum) => {
    return Object.values(reservations).some(d => {
      if (!d) return false;
      const rnum = Number(d.room);
      const date = d.date || (d.checkIn ? d.checkIn.slice(0,10) : null);
      return rnum === Number(roomNum) && date === today;
    });
  };

  const floors = [];
  for (let f = 1; f <= 5; f++) {
    const rooms = [];
    for (let r = 1; r <= 4; r++) {
      rooms.push(f * 100 + r);
    }
    floors.push({ floor: f, rooms });
  }

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ marginTop: 0 }}>Remote View — Live Updates</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            <div style={{ padding: 8, borderRadius: 8, background: '#e6fff0', color: '#0b8046', fontWeight: 700 }}>Occupied</div>
            <div style={{ padding: 8, borderRadius: 8, background: '#fff7e6', color: '#b65a00', fontWeight: 700 }}>Reserved</div>
            <div style={{ padding: 8, borderRadius: 8, background: '#f3f4f6', color: '#111', fontWeight: 700 }}>Free</div>
          </div>

          {floors.map(f => (
            <div key={f.floor} style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>Floor {f.floor}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                {f.rooms.map(num => {
                  const occ = roomHasCheckin(num);
                  const resv = !occ && roomHasReservationToday(num);
                  const bg = occ ? 'rgba(139,224,164,0.6)' : resv ? 'rgba(255,213,128,0.6)' : 'rgba(255,255,255,0.9)';
                  const border = occ ? '1px solid rgba(0,0,0,0.06)' : '1px solid rgba(0,0,0,0.06)';
                  return (
                    <div key={num} title={`Room ${num}`} style={{ background: bg, borderRadius: 8, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, border }}>
                      {String(f.floor)}{pad2(num).slice(-2)}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div>
          <div style={{ marginBottom: 12 }}>
            <h3 style={{ margin: '6px 0' }}>Recent Check-ins</h3>
            <div style={{ maxHeight: 160, overflowY: 'auto' }}>
              {Object.values(checkins).length === 0 && <div style={{ color: 'var(--muted)' }}>No check-ins</div>}
              {Object.entries(checkins).slice(-30).reverse().map(([k,d]) => (
                <div key={k} className="card" style={{ padding: 8, marginBottom: 8 }}>
                  <div style={{ fontWeight: 700 }}>{d.name || 'Guest'}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>Room: {Array.isArray(d.room) ? d.room.join(',') : d.room} — {d.checkIn?.slice(0,10) || '-'}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <h3 style={{ margin: '6px 0' }}>Today's Reservations</h3>
            <div style={{ maxHeight: 160, overflowY: 'auto' }}>
              {Object.values(reservations).filter(d => (d.date || '').slice(0,10) === today).length === 0 && <div style={{ color: 'var(--muted)' }}>No reservations today</div>}
              {Object.entries(reservations).filter(([k,d]) => (d.date||'').slice(0,10) === today).slice(-30).reverse().map(([k,d]) => (
                <div key={k} className="card" style={{ padding: 8, marginBottom: 8 }}>
                  <div style={{ fontWeight: 700 }}>{d.name || 'Guest'}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>Room: {d.room} — {d.date}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <h3 style={{ margin: '6px 0' }}>Recent Rent Payments</h3>
            <div style={{ maxHeight: 140, overflowY: 'auto' }}>
              {Object.values(rentPayments).length === 0 && <div style={{ color: 'var(--muted)' }}>No payments</div>}
              {Object.entries(rentPayments).slice(-30).reverse().map(([k,d]) => (
                <div key={k} className="card" style={{ padding: 8, marginBottom: 8 }}>
                  <div style={{ fontWeight: 700 }}>{d.name || 'Guest'}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>Room: {d.room} — ₹{d.amount || d.rate || '-'}</div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 style={{ margin: '6px 0' }}>Recent Expenses</h3>
            <div style={{ maxHeight: 140, overflowY: 'auto' }}>
              {Object.values(expenses).length === 0 && <div style={{ color: 'var(--muted)' }}>No expenses</div>}
              {Object.entries(expenses).slice(-30).reverse().map(([k,d]) => (
                <div key={k} className="card" style={{ padding: 8, marginBottom: 8 }}>
                  <div style={{ fontWeight: 700 }}>{d.title || d.name || 'Expense'}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>₹{d.amount || '-'}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
