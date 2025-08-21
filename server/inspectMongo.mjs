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
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(dbName);
    console.log('Connected to', dbName);

    const cols = await db.listCollections().toArray();
    console.log('Collections:', cols.map(c=>c.name).join(', '));

    const col = db.collection(colName);
    const doc = await col.findOne({ _id: 'singleton' });
    console.log('\napp_state (collection:', colName + '):');
    if (!doc) console.log('  (no document with _id=singleton)');
    else {
      console.log('  _id:', doc._id);
      console.log('  updatedAt:', doc.updatedAt || 'N/A');
      console.log('  state:', doc.state === null ? 'null' : '(present)');
      if (doc.state) {
        try {
          const s = JSON.stringify(doc.state, null, 2);
          console.log('  state (preview):', s.substring(0, 1000));
        } catch (e) { console.log('  state (unable to stringify)'); }
      }
    }

    // GridFS bucket names (scans.files/scans.chunks)
    const filesCount = await db.collection('scans.files').countDocuments().catch(()=>0);
    const chunksCount = await db.collection('scans.chunks').countDocuments().catch(()=>0);
    console.log('\nGridFS scans.files count:', filesCount, 'scans.chunks count:', chunksCount);

    // Also show app collection total docs
    const appCount = await col.countDocuments().catch(()=>0);
    console.log('\n' + colName + ' document count:', appCount);

  } catch (e) {
    console.error('Error:', e.message);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}

run();
