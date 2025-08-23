import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';

dotenv.config();
const uri = process.env.MONGO_URI;
const dbName = process.env.DB_NAME || 'hotel_surya';
const colName = process.env.COLLECTION || 'app_state';
if (!uri) {
  console.error('MONGO_URI not set in server/.env');
  process.exit(2);
}

function generateDefault() {
  const floors = {};
  for (let f = 1; f <= 5; f++) {
    floors[f] = [];
    for (let r = 1; r <= 4; r++) {
      const number = f * 100 + r;
      floors[f].push({ number, status: "free", guest: null, reservedFor: null, rate: 2500 });
    }
  }

  // Sample occupied
  floors[1][1].status = 'reserved';
  floors[1][1].reservedFor = { name: 'A. Kumar', from: '2025-08-15' };

  floors.status = 'occupied';
  floors.guest = {
    name: 'Ravi',
    contact: '9876543210',
    checkIn: new Date().toISOString(),
    id: 'ID123',
    rate: 1500
  };

  // Important: sample you showed in earlier JSON
  floors.status = 'occupied';
  floors.guest = {
    name: '11111111111',
    contact: '2222222222',
    id: '',
    checkIn: '2025-08-23T13:46:07.339Z',
    checkInDate: '8/23/2025',
    checkInTime: '7:16:07 PM',
    rate: 1200,
    edited: false
  };

  // Reservations
  const todayISO = new Date().toISOString().slice(0, 10);
  const reservations = [
    { name: 'zzzzz', place: '1111', room: 101, date: todayISO },
    { name: 'xxxxxx', place: 'yyyyyyy', room: 103, date: todayISO }
  ];

  // REQUIRED: checkouts array (completed checkouts)
  // Format you asked:
  // Name | Room | Check-In | Check-Out | Days | Rent | Total Paid | Payment Status
  const checkouts = [
    {
      name: "xxx",
      room: 104,
      checkInDate: "23/08/2025 15:57:43",   // combine date+time to match your table
      checkOutDate: "23/08/2025 16:13:22",
      daysStayed: 1,
      totalRent: 1000,
      totalPaid: 1000,
      paymentTallyStatus: "tallied"         // "tallied" or "not-tallied"
    }
  ];

  // REQUIRED: rentPayments array
  // Format you asked:
  // Date | Guest | Room | Days | Amount | Mode
  const rentPayments = [
    {
      date: "2025-08-23",
      name: "xxx",     // or payer
      room: 104,
      days: 1,
      amount: 1000,
      mode: "Cash"
    }
  ];

  // REQUIRED: expenses array
  // Format you asked (you showed "Date Description Amount")
  // LiveUpdate/ExpensesPage currently shows e.category || e.note, so either send "category" or tweak the component.
  // To avoid changing the component, send "category".
  const expenses = [
    {
      date: "2025-08-23",
      category: "bbb",   // use 'category' so your current ExpensesPage displays it
      amount: 1000
    }
  ];

  return {
    floors,
    guests: [
      { room: 403, name: "11111111111", contact: "2222222222", checkIn: "2025-08-23T13:46:07.339Z", edited: false },
      { room: 102, name: "2222", contact: "1212", checkIn: "2025-08-23T14:34:45.424Z", edited: false }
    ],
    reservations,
    checkouts,
    rentPayments,
    expenses
  };
}


async function run() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(dbName);
    const col = db.collection(colName);
    const sample = generateDefault();
    const res = await col.updateOne({ _id: 'singleton' }, { $set: { state: sample, updatedAt: new Date() } }, { upsert: true });
    console.log('Wrote sample state. result:', res.result || res);
  } catch (e) {
    console.error('Error seeding:', e.message);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}

run();
