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

// server/seedDefault.mjs (only the generator changed; rest same)
const generateDefault = () => {
  const floors = {};
  for (let f = 1; f <= 5; f++) {
    floors[f] = [];
    for (let r = 1; r <= 4; r++) {
      const number = f * 100 + r;
      floors[f].push({ number, status: "free", guest: null, reservedFor: null, rate: 2500 });
    }
  }

  // sample data
  floors[1][1].status = 'reserved';
  floors[1][1].reservedFor = { name: 'A. Kumar', from: new Date().toISOString().slice(0,10) };

  // mark 202, 301 as occupied examples (indexing: 2nd floor index 1 -> room 202; 3rd floor index 0 -> room 301)
  floors[2][1].status = 'occupied';
  floors[2][1].guest = { name: 'Ravi', contact: '9876543210', checkIn: new Date().toISOString(), id: 'ID123', rate: 1500 };

  floors[3][0].status = 'occupied';
  floors[3][0].guest = { name: 'Priya', contact: '9345678123', checkIn: new Date().toISOString(), id: 'DL998', rate: 2000 };

  const todayISO = new Date().toISOString().slice(0,10);

  return {
    floors,
    guests: [],
    reservations: [
      { name: 'zzzzz', place: '1111', room: 101, date: todayISO },
      { name: 'xxxxxx', place: 'yyyyyyy', room: 103, date: todayISO }
    ],
    checkouts: [],
    rentPayments: [],
    expenses: []
  };
};



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
