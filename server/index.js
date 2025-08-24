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

  col = db.collection(COLLECTION);
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

// Return combined state (includes id fields for items from Mongo)
app.get('/api/state', async (req, res) => {
  try {
    await ensureDb();
    if (!col || !checkoutsCol || !rentPaymentsCol || !expensesCol) {
      return res.status(503).json({ ok: false, error: 'mongo not initialized' });
    }

    const doc = await col.findOne({ _id: 'singleton' });
    const baseState = doc?.state || {};

    const [checkoutsRaw, rentPaymentsRaw, expensesRaw] = await Promise.all([
      checkoutsCol.find({}).sort({ checkOutDateTime: -1 }).toArray(),
      rentPaymentsCol.find({}).sort({ date: -1 }).toArray(),
      expensesCol.find({}).sort({ date: -1 }).toArray(),
    ]);

    const mapWithId = (arr) => arr.map(d => {
      const { _id, ...rest } = d || {};
      return { id: _id ? String(_id) : undefined, ...rest };
    });

    const checkouts = mapWithId(checkoutsRaw);
    const rentPayments = mapWithId(rentPaymentsRaw);
    const expenses = mapWithId(expensesRaw);

    res.json({
      ok: true,
      state: {
        ...baseState,
        checkouts,
        rentPayments,
        expenses
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

// Create rent payment (returns inserted id)
app.post('/api/rent-payment', async (req, res) => {
  try {
    await ensureDb();
    if (!rentPaymentsCol) return res.status(503).json({ ok: false, error: 'mongo not initialized' });

    const body = req.body || {};
    const doc = {
      name: String(body.name || '').trim(),
      room: Array.isArray(body.room)
        ? body.room.map(Number)
        : String(body.room || '')
            .split(',')
            .map(s => Number(s.trim()))
            .filter(Boolean),
      days: Number(body.days) || null,
      amount: Number(body.amount) || 0,
      mode: String(body.mode || 'Cash'),
      date: body.date || new Date().toISOString().slice(0, 10),
      checkInYmd: body.checkInYmd ? String(body.checkInYmd).slice(0,10) : null,
      createdAt: new Date().toISOString()
    };

    const result = await rentPaymentsCol.insertOne(doc);
    res.json({ ok: true, id: String(result.insertedId) });
  } catch (e) {
    console.error('POST /api/rent-payment failed:', e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// Update a rent payment (days, amount, mode)
app.put('/api/rent-payment/:id', async (req, res) => {
  try {
    await ensureDb();
    if (!rentPaymentsCol) return res.status(503).json({ ok: false, error: 'mongo not initialized' });

    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ ok: false, error: 'missing id' });

    const patch = {};
    if (req.body?.days !== undefined)   patch.days = Number(req.body.days) || 0;
    if (req.body?.amount !== undefined) patch.amount = Number(req.body.amount) || 0;
    if (req.body?.mode !== undefined)   patch.mode = String(req.body.mode || 'Cash');

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ ok: false, error: 'no fields to update' });
    }

    const result = await rentPaymentsCol.updateOne(
      { _id: new ObjectId(id) },
      { $set: patch }
    );

    if (result.matchedCount === 0) return res.status(404).json({ ok: false, error: 'not found' });
    res.json({ ok: true });
  } catch (e) {
    console.error('PUT /api/rent-payment/:id failed:', e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// Delete a rent payment
app.delete('/api/rent-payment/:id', async (req, res) => {
  try {
    await ensureDb();
    if (!rentPaymentsCol) return res.status(503).json({ ok: false, error: 'mongo not initialized' });

    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ ok: false, error: 'missing id' });

    const result = await rentPaymentsCol.deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) return res.status(404).json({ ok: false, error: 'not found' });

    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/rent-payment/:id failed:', e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// Add an expense (returns inserted id)
app.post('/api/expense', async (req, res) => {
  try {
    await ensureDb();
    if (!expensesCol) return res.status(503).json({ ok: false, error: 'mongo not initialized' });

    const body = req.body || {};
const doc = {
  description: String(body.description || '').trim(),
  amount: Number(body.amount) || 0,
  date: body.date || new Date().toISOString().slice(0, 10),
  createdAt: new Date().toISOString()
};

const result = await expensesCol.insertOne(doc);

// Notify listeners that expenses changed
sseBroadcast('expenses:update', { action: 'created', id: String(result.insertedId) });

res.json({ ok: true, id: String(result.insertedId) });

  } catch (e) {
    console.error('POST /api/expense failed:', e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// Delete an expense
// Delete an expense + SSE notify
app.delete('/api/expense/:id', async (req, res) => {
try {
await ensureDb();
if (!expensesCol) return res.status(503).json({ ok: false, error: 'mongo not initialized' });

    const id = String(req.params.id || '').trim();
if (!id) return res.status(400).json({ ok: false, error: 'missing id' });

const result = await expensesCol.deleteOne({ _id: new ObjectId(id) });
if (result.deletedCount === 0) return res.status(404).json({ ok: false, error: 'not found' });

// Notify listeners that expenses changed
sseBroadcast('expenses:update', { action: 'deleted', id });

res.json({ ok: true });

  } catch (e) {
    console.error('DELETE /api/expense/:id failed:', e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// Optional: record a checkout for LiveUpdate
app.post('/api/checkout', async (req, res) => {
  try {
    await ensureDb();
    if (!checkoutsCol) return res.status(503).json({ ok: false, error: 'mongo not initialized' });

    const body = req.body || {};
    const doc = {
      ...body,
      createdAt: new Date().toISOString()
    };
    await checkoutsCol.insertOne(doc);
    res.json({ ok: true });
  } catch (e) {
    console.error('POST /api/checkout failed:', e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});

(async () => {
  console.log('[Boot] Starting server', { PORT, DB_NAME, COLLECTION, hasMongoUri: !!MONGO_URI });
  await ensureDb();
  app.listen(PORT, () => console.log(`[Server] Listening on ${PORT}`));
})();
