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
      floors[f].push({ number, status: "free", guest: null, reservedFor: null });
    }
  }
  return { floors, guests: [], reservations: [], rentPayments: [], expenses: [] };
}

async function run() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(dbName);
    const col = db.collection(colName);
    const sample = generateDefault();
    const res = await col.updateOne({ _id: 'singleton' }, { $set: { state: sample, updatedAt: new Date() } }, { upsert: true });
  console.log('Wrote default state. result:', res.result || res);
  } catch (e) {
    console.error('Error seeding:', e.message);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}

run();
