// Lightweight Firebase Cloud sync helper (placeholder config)
// Usage: call pushCheckin/pushCheckout/pushReservation/pushRent/pushExpense after local writes
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';

// Replace with your Firebase config and set these in Netlify environment or here for testing.
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
  console.warn('Firebase init failed (likely missing config)', e);
}

async function safeSet(collectionName, id, data) {
  if (!db) return;
  try {
    await setDoc(doc(db, collectionName, id), { ...data, updatedAt: serverTimestamp() });
  } catch (err) {
    console.warn('cloudSync set failed', collectionName, id, err);
  }
}

async function safeAdd(collectionName, data) {
  if (!db) return;
  try {
    await addDoc(collection(db, collectionName), { ...data, createdAt: serverTimestamp() });
  } catch (err) {
    console.warn('cloudSync add failed', collectionName, err);
  }
}

export async function pushCheckin(checkin) {
  // checkin should contain { name, room, checkIn, rate, contact, ... }
  try {
    const id = `${String(checkin.name||'').replace(/[^a-z0-9]/gi,'_')}_${(checkin.checkIn||'').slice(0,19)}`;
    await safeSet('checkins', id, checkin);
  } catch (e) { console.warn(e); }
}

export async function pushCheckout(checkout) {
  try {
    const id = `${String(checkout.name||'').replace(/[^a-z0-9]/gi,'_')}_${(checkout.checkOutDateTime||'').slice(0,19)}`;
    await safeSet('checkouts', id, checkout);
  } catch (e) { console.warn(e); }
}

export async function pushReservation(reservation) {
  try {
    const id = `res_${String(reservation.name||'').replace(/[^a-z0-9]/gi,'_')}_${reservation.room}_${reservation.date}`;
    await safeSet('reservations', id, reservation);
  } catch (e) { console.warn(e); }
}

export async function pushRent(rent) {
  try {
    // rent: { name, room, amount, date }
    await safeAdd('rents', rent);
  } catch (e) { console.warn(e); }
}

export async function pushExpense(expense) {
  try {
    await safeAdd('expenses', expense);
  } catch (e) { console.warn(e); }
}

export async function pushFullState(state) {
  try {
    // store the full app state under a known doc so dashboard can read it
    await safeSet('meta', 'latestState', { state });
  } catch (e) { console.warn('pushFullState failed', e); }
}

export default { pushCheckin, pushCheckout, pushReservation, pushRent, pushExpense, pushFullState };
