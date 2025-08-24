// server/index.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import { Readable } from 'stream';
import { MongoClient, GridFSBucket, ObjectId } from 'mongodb';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = process.env.DB_NAME || 'hotel_surya';
// Keep consistent across repo: 'state' or 'app_state'
const COLLECTION = process.env.COLLECTION || 'state';
const PORT = process.env.PORT || 4000;

// Globals
let dbClient;
let db;
let col;
let bucket;
let checkoutsCol;
let rentPaymentsCol;
let expensesCol;

// Helper to coerce string id to ObjectId safely
function dbId(id) {
  try { return new ObjectId(String(id)); } catch { return null; }
}

async function initDb() {
  if (!MONGO_URI) {
    console.error('[DB] Missing MONGO_URI env');
    return;
  }
  if (dbClient && col && bucket && checkoutsCol && rentPaymentsCol && expensesCol) return;

  console.log('[DB] Connecting to Mongo...');
  dbClient = new MongoClient(MONGO_URI, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 8000,
  });
  await dbClient.connect();

  db = dbClient.db(DB_NAME);

  // Use env-configured collection name consistently
  col = db.collection(COLLECTION);

  // GridFS bucket (uploads)
  bucket = new GridFSBucket(db, { bucketName: 'uploads' });

  checkoutsCol    = db.collection('checkouts');
  rentPaymentsCol = db.collection('rent_payments');
  expensesCol     = db.collection('expenses');

  await Promise.allSettled([
    checkoutsCol.createIndex({ checkOutDateTime: -1 }),
    rentPaymentsCol.createIndex({ date: -1 }),
    expensesCol.createIndex({ date: -1 }),
  ]);

  console.log('[DB] Connected. Collections and indexes ready.');
}

async function ensureDb() {
  if (dbClient && col && bucket && checkoutsCol && rentPaymentsCol && expensesCol) return;
  try {
    await initDb();
  } catch (e) {
    console.error('[DB] ensureDb error:', e);
  }
}

app.get('/api/ping', async (req, res) => {
  await ensureDb();
  if (!col) return res.status(500).json({ ok: false, msg: 'mongo not initialized' });
  res.json({ ok: true });
});

app.get('/api/debug', async (req, res) => {
  try {
    await ensureDb();
    const info = {
      ok: !!col,
      db: DB_NAME,
      collection: COLLECTION,
      hasMongoUri: !!MONGO_URI
    };
    res.json(info);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// multer memory storage
const upload = multer({ storage: multer.memoryStorage() });

// Upload scanned file to GridFS and return id
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    await ensureDb();
    if (!bucket) return res.status(500).json({ ok: false, msg: 'gridfs not initialized' });
    if (!req.file) return res.status(400).json({ ok: false, error: 'no file' });

    const fileBuffer = req.file.buffer;
    const filename = req.file.originalname || 'upload';
    const readable = Readable.from(fileBuffer);
    const uploadStream = bucket.openUploadStream(filename);

    readable
      .on('error', (err) => res.status(500).json({ ok: false, error: String(err) }))
      .pipe(uploadStream)
      .on('error', (err) => res.status(500).json({ ok: false, error: String(err) }))
      .on('finish', (file) => {
        res.json({ ok: true, id: file._id.toString(), filename: file.filename });
      });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// Download by id
app.get('/api/download/:id', async (req, res) => {
  try {
    await ensureDb();
    if (!bucket) return res.status(500).send('GridFS not initialized');

    const _id = new ObjectId(String(req.params.id));
    const downloadStream = bucket.openDownloadStream(_id);
    downloadStream.on('error', (err) => res.status(404).send(String(err)));
    downloadStream.pipe(res);
  } catch (e) {
    res.status(500).send(String(e));
  }
});

// Return combined state (recent-first)
app.get('/api/state', async (req, res) => {
  try {
    await ensureDb();
    if (!col || !checkoutsCol || !rentPaymentsCol || !expensesCol) {
      return res.status(503).json({ ok: false, error: 'mongo not initialized' });
    }

    const doc = await col.findOne({ _id: 'singleton' });
    const baseState = doc?.state || {};

    // Include ids so client can edit/delete precisely
    const [checkouts, rentPayments, expenses] = await Promise.all([
      checkoutsCol.find({}).sort({ checkOutDateTime: -1, _id: -1 }).toArray(),
      rentPaymentsCol.find({}).sort({ date: -1, _id: -1 }).toArray(),
      expensesCol.find({}).sort({ date: -1, _id: -1 }).toArray(),
    ]);

    res.json({
      ok: true,
      state: {
        ...baseState,
        checkouts: checkouts.map(({ _id, ...d }) => ({ id: String(_id), ...d })),
        rentPayments: rentPayments.map(({ _id, ...d }) => ({ id: String(_id), ...d })),
        expenses: expenses.map(({ _id, ...d }) => ({ id: String(_id), ...d }))
      }
    });
  } catch (e) {
    console.error('GET /api/state failed:', e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// Save base app state snapshot
app.post('/api/state', async (req, res) => {
  await ensureDb();
  if (!col) return res.status(503).json({ ok: false, msg: 'mongo not initialized' });

  const { state } = req.body || {};
  await col.updateOne(
    { _id: 'singleton' },
    { $set: { state, updatedAt: new Date() } },
    { upsert: true }
  );
  res.json({ ok: true });
});

/* ========= RENT PAYMENTS ========= */

// Create rent payment (needed to avoid 404)
app.post('/api/rent-payment', async (req, res) => {
  try {
    await ensureDb();
    const b = req.body || {};
    const doc = {
      name: String(b.name || '').trim(),
      room: Array.isArray(b.room)
        ? b.room.map(Number)
        : String(b.room || '').split(',').map(s => Number(s.trim())).filter(Boolean),
      days: Number(b.days) || 0,
      amount: Number(b.amount) || 0,
      mode: String(b.mode || 'Cash'),
      date: String(b.date || '').slice(0, 10),
      checkInYmd: b.checkInYmd ? String(b.checkInYmd).slice(0, 10) : null,
      createdAt: new Date().toISOString()
    };
    const result = await rentPaymentsCol.insertOne(doc);
    res.json({ ok: true, id: String(result.insertedId) });
  } catch (e) {
    console.error('POST /api/rent-payment', e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// Update rent payment
app.put('/api/rent-payment/:id', async (req, res) => {
  try {
    await ensureDb();
    const { id } = req.params;
    const _id = dbId(id);
    if (!_id) return res.status(400).json({ ok: false, error: 'invalid id' });

    const body = req.body || {};
    const patch = {
      ...(body.name != null ? { name: String(body.name).trim() } : {}),
      ...(body.room != null ? { room: Array.isArray(body.room) ? body.room.map(Number) : String(body.room).split(',').map(s=>Number(s.trim())).filter(Boolean) } : {}),
      ...(body.days != null ? { days: Number(body.days) || 0 } : {}),
      ...(body.amount != null ? { amount: Number(body.amount) || 0 } : {}),
      ...(body.mode != null ? { mode: String(body.mode) } : {}),
      ...(body.date != null ? { date: String(body.date).slice(0,10) } : {}),
      ...(body.checkInYmd != null ? { checkInYmd: String(body.checkInYmd).slice(0,10) } : {}),
      updatedAt: new Date().toISOString()
    };
    await rentPaymentsCol.updateOne({ _id }, { $set: patch });
    res.json({ ok: true });
  } catch (e) {
    console.error('PUT /api/rent-payment/:id', e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// Delete rent payment
app.delete('/api/rent-payment/:id', async (req, res) => {
  try {
    await ensureDb();
    const { id } = req.params;
    const _id = dbId(id);
    if (!_id) return res.status(400).json({ ok: false, error: 'invalid id' });

    await rentPaymentsCol.deleteOne({ _id });
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/rent-payment/:id', e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});

/* ========= EXPENSES ========= */

// Create expense (needed to avoid 404)
app.post('/api/expense', async (req, res) => {
  try {
    await ensureDb();
    const b = req.body || {};
    const doc = {
      description: String(b.description || '').trim(),
      amount: Number(b.amount) || 0,
      date: String(b.date || '').slice(0,10),
      createdAt: new Date().toISOString()
    };
    const result = await expensesCol.insertOne(doc);
    res.json({ ok: true, id: String(result.insertedId) });
  } catch (e) {
    console.error('POST /api/expense', e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// Update expense
app.put('/api/expense/:id', async (req, res) => {
  try {
    await ensureDb();
    const { id } = req.params;
    const _id = dbId(id);
    if (!_id) return res.status(400).json({ ok: false, error: 'invalid id' });

    const b = req.body || {};
    const patch = {
      ...(b.description != null ? { description: String(b.description) } : {}),
      ...(b.amount != null ? { amount: Number(b.amount) || 0 } : {}),
      ...(b.date != null ? { date: String(b.date).slice(0,10) } : {}),
      updatedAt: new Date().toISOString()
    };
    await expensesCol.updateOne({ _id }, { $set: patch });
    res.json({ ok: true });
  } catch (e) {
    console.error('PUT /api/expense/:id', e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// Delete expense
app.delete('/api/expense/:id', async (req, res) => {
  try {
    await ensureDb();
    const { id } = req.params;
    const _id = dbId(id);
    if (!_id) return res.status(400).json({ ok: false, error: 'invalid id' });

    await expensesCol.deleteOne({ _id });
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/expense/:id', e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});

/* ========= CHECKOUTS ========= */

// Record a checkout for LiveUpdate
app.post('/api/checkout', async (req, res) => {
  try {
    await ensureDb();
    if (!checkoutsCol) return res.status(503).json({ ok: false, error: 'mongo not initialized' });

    const body = req.body || {};
    const doc = { ...body, createdAt: new Date().toISOString() };
    await checkoutsCol.insertOne(doc);
    res.json({ ok: true });
  } catch (e) {
    console.error('POST /api/checkout failed:', e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// 404 catch-all should be last
app.use((req, res) => {
  res.status(404).json({ ok: false, error: 'Not Found' });
});

(async () => {
  console.log('[Boot] Starting server', { PORT, DB_NAME, COLLECTION, hasMongoUri: !!MONGO_URI });
  await ensureDb(); // don’t crash if DB missing; routes will 503 until configured
  app.listen(PORT, () => console.log(`[Server] Listening on ${PORT}`));
})();
