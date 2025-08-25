// server/showCurrent.mjs
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

async function run() {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
  try {
    await client.connect();
    const db = client.db(dbName);
    const col = db.collection(colName);

    console.log(`Connected to ${dbName}, collection ${colName}`);
    const doc = await col.findOne({ _id: 'singleton' });
    if (!doc) {
      console.log('No singleton document found.');
      return;
    }

    const state = doc.state || null;
    console.log('updatedAt:', doc.updatedAt || 'N/A');

    // Print a safe preview of state
    try {
      const s = JSON.stringify(state, null, 2);
      console.log('state (preview, first 2000 chars):');
      console.log(s.length > 2000 ? s.slice(0, 2000) + ' ...' : s);
    } catch {
      console.log('state present but not JSON-stringifiable');
    }
  } catch (e) {
    console.error('Error:', e.message);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}

run();
