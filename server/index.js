/* eslint-env node */
import express from 'express';
import cors from 'cors';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import multer from 'multer';
import { Readable } from 'stream';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Simple SSE clients set for live updates
const sseClients = new Set();

function broadcastState(state) {
  const payload = JSON.stringify({ state });
  for (const res of sseClients) {
    try {
      res.write(`data: ${payload}\n\n`);
    } catch (_e) {
      // ignore individual client write errors
    }
  }
}

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = process.env.DB_NAME || 'hotel_surya';
const COLLECTION = process.env.COLLECTION || 'app_state';

let dbClient;
let col;
let bucket;

async function initDb() {
  if (!MONGO_URI) {
    console.warn('MONGO_URI not set - mongo endpoints will fail');
    return;
  }
  // initialize client and collections
  if (dbClient && dbClient.topology && dbClient.topology.isConnected && dbClient.isConnected && col && bucket) {
    return; // already initialized (best-effort check)
  }
  dbClient = new MongoClient(MONGO_URI);
  await dbClient.connect();
  const db = dbClient.db(DB_NAME);
  col = db.collection(COLLECTION);
  // GridFS bucket
  const { GridFSBucket } = await import('mongodb');
  bucket = new GridFSBucket(db, { bucketName: 'scans' });
  // ensure single doc with _id = 'singleton'
  await col.updateOne({ _id: 'singleton' }, { $setOnInsert: { state: null } }, { upsert: true });
}

// Ensure DB is ready for use; attempt to init if not yet connected.
async function ensureDb() {
  if (col && bucket) return;
  try {
    await initDb();
  } catch (_err) {
    console.error('ensureDb failed', _err.message || _err);
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
    const info = { ok: !!col, db: DB_NAME, collection: COLLECTION };
    res.json(info);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// multer memory storage
const upload = multer({ storage: multer.memoryStorage() });

// Upload scanned file to GridFS and return a public URL token
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    await ensureDb();
    if (!bucket) return res.status(500).json({ ok: false, msg: 'gridfs not initialized' });
    const fileBuffer = req.file.buffer;
    const filename = req.file.originalname;
    const readable = Readable.from(fileBuffer);
    const uploadStream = bucket.openUploadStream(filename);
    readable.pipe(uploadStream)
      .on('error', (err) => res.status(500).json({ ok: false, error: String(err) }))
      .on('finish', (file) => {
        // return id for download
        res.json({ ok: true, id: file._id.toString(), filename });
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
    const id = req.params.id;
    const _id = new dbClient.bson.ObjectId(id);
    const downloadStream = bucket.openDownloadStream(_id);
    downloadStream.on('error', (err) => res.status(404).send(String(err)));
    downloadStream.pipe(res);
  } catch (_e) {
    console.error('Error initializing server:', _e.message);
    process.exitCode = 1;
  }
});

app.get('/api/state', async (req, res) => {
  await ensureDb();
  if (!col) return res.status(500).json({ ok: false, msg: 'mongo not initialized' });
  const doc = await col.findOne({ _id: 'singleton' });
  res.json({ state: doc?.state || null });
});

// Server-Sent Events endpoint for live updates
app.get('/api/stream', async (req, res) => {
  // set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });
  // send a ping comment to keep connection alive
  res.write(': connected\n\n');
  sseClients.add(res);
  req.on('close', () => {
    sseClients.delete(res);
  });
});

// Return a fuller state view: prefer singleton state, otherwise aggregate from common collections
app.get('/api/fullstate', async (req, res) => {
  await ensureDb();
  if (!col) return res.status(500).json({ ok: false, msg: 'mongo not initialized' });
  try {
    const buildFullState = async () => {
      const doc = await col.findOne({ _id: 'singleton' });
      if (doc && doc.state) return doc.state;
      const db = dbClient.db(DB_NAME);
      const out = {};
      const tryColl = async (name) => {
        try {
          const exists = await db.listCollections({ name }).hasNext();
          if (!exists) return [];
          return await db.collection(name).find().toArray();
        } catch (_e) {
          void _e;
          return [];
        }
      };
      out.checkins = await tryColl('Checkins');
      out.checkouts = await tryColl('Checkouts');
      out.reservations = await tryColl('Reservations');
      out.rentPayments = await tryColl('RentCollections');
      out.expenses = await tryColl('Expenses');
      out.floors = (await tryColl('Floors'))[0] || {};
      return { floors: out.floors || {}, checkins: out.checkins, checkouts: out.checkouts, reservations: out.reservations, rentPayments: out.rentPayments, expenses: out.expenses };
    };

    const state = await buildFullState();
    return res.json({ state });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
});

app.post('/api/state', async (req, res) => {
  await ensureDb();
  if (!col) return res.status(500).json({ ok: false, msg: 'mongo not initialized' });
  const { state } = req.body || {};
  await col.updateOne({ _id: 'singleton' }, { $set: { state, updatedAt: new Date() } });
  // broadcast to SSE clients the new state
  try {
    broadcastState(state);
  } catch (_e) { /* ignore */ }
  res.json({ ok: true });
});

// Insert a rent entry into RentCollections and broadcast updated fullstate
app.post('/api/rent', async (req, res) => {
  await ensureDb();
  if (!dbClient) return res.status(500).json({ ok: false, msg: 'mongo not initialized' });
  try {
    const data = req.body || {};
    const db = dbClient.db(DB_NAME);
    const coll = db.collection('RentCollections');
    const inserted = await coll.insertOne({ ...data, createdAt: new Date() });
    // build and broadcast fullstate
    const buildFullState = async () => {
      const doc = await col.findOne({ _id: 'singleton' });
      if (doc && doc.state) return doc.state;
      const out = {};
      const tryColl = async (name) => {
        try { const exists = await db.listCollections({ name }).hasNext(); if (!exists) return []; return await db.collection(name).find().toArray(); } catch (_e) { void _e; return []; }
      };
      out.checkins = await tryColl('Checkins');
      out.checkouts = await tryColl('Checkouts');
      out.reservations = await tryColl('Reservations');
      out.rentPayments = await tryColl('RentCollections');
      out.expenses = await tryColl('Expenses');
      out.floors = (await tryColl('Floors'))[0] || {};
      return { floors: out.floors || {}, checkins: out.checkins, checkouts: out.checkouts, reservations: out.reservations, rentPayments: out.rentPayments, expenses: out.expenses };
    };
    const state = await buildFullState();
    try { broadcastState(state); } catch (_e) { /* ignore */ }
    res.json({ ok: true, id: inserted.insertedId });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// Insert an expense entry into Expenses and broadcast updated fullstate
app.post('/api/expense', async (req, res) => {
  await ensureDb();
  if (!dbClient) return res.status(500).json({ ok: false, msg: 'mongo not initialized' });
  try {
    const data = req.body || {};
    const db = dbClient.db(DB_NAME);
    const coll = db.collection('Expenses');
    const inserted = await coll.insertOne({ ...data, createdAt: new Date() });
    // build and broadcast fullstate
    const buildFullState = async () => {
      const doc = await col.findOne({ _id: 'singleton' });
      if (doc && doc.state) return doc.state;
      const out = {};
      const tryColl = async (name) => {
        try { const exists = await db.listCollections({ name }).hasNext(); if (!exists) return []; return await db.collection(name).find().toArray(); } catch (_e) { void _e; return []; }
      };
      out.checkins = await tryColl('Checkins');
      out.checkouts = await tryColl('Checkouts');
      out.reservations = await tryColl('Reservations');
      out.rentPayments = await tryColl('RentCollections');
      out.expenses = await tryColl('Expenses');
      out.floors = (await tryColl('Floors'))[0] || {};
      return { floors: out.floors || {}, checkins: out.checkins, checkouts: out.checkouts, reservations: out.reservations, rentPayments: out.rentPayments, expenses: out.expenses };
    };
    const state = await buildFullState();
    try { broadcastState(state); } catch (_e) { /* ignore */ }
    res.json({ ok: true, id: inserted.insertedId });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// Insert a reservation into Reservations and broadcast updated fullstate
app.post('/api/reservation', async (req, res) => {
  await ensureDb();
  if (!dbClient) return res.status(500).json({ ok: false, msg: 'mongo not initialized' });
  try {
    const data = req.body || {};
    const db = dbClient.db(DB_NAME);
    const coll = db.collection('Reservations');
    const inserted = await coll.insertOne({ ...data, createdAt: new Date() });
    const buildFullState = async () => {
      const doc = await col.findOne({ _id: 'singleton' });
      if (doc && doc.state) return doc.state;
      const out = {};
      const tryColl = async (name) => {
        try { const exists = await db.listCollections({ name }).hasNext(); if (!exists) return []; return await db.collection(name).find().toArray(); } catch (_e) { void _e; return []; }
      };
      out.checkins = await tryColl('Checkins');
      out.checkouts = await tryColl('Checkouts');
      out.reservations = await tryColl('Reservations');
      out.rentPayments = await tryColl('RentCollections');
      out.expenses = await tryColl('Expenses');
      out.floors = (await tryColl('Floors'))[0] || {};
      return { floors: out.floors || {}, checkins: out.checkins, checkouts: out.checkouts, reservations: out.reservations, rentPayments: out.rentPayments, expenses: out.expenses };
    };
    const state = await buildFullState();
    try { broadcastState(state); } catch (_e) { /* ignore */ }
    res.json({ ok: true, id: inserted.insertedId });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// Insert a checkin into Checkins and broadcast updated fullstate
app.post('/api/checkin', async (req, res) => {
  await ensureDb();
  if (!dbClient) return res.status(500).json({ ok: false, msg: 'mongo not initialized' });
  try {
    const data = req.body || {};
    const db = dbClient.db(DB_NAME);
    const coll = db.collection('Checkins');
    const inserted = await coll.insertOne({ ...data, createdAt: new Date() });
    const buildFullState = async () => {
      const doc = await col.findOne({ _id: 'singleton' });
      if (doc && doc.state) return doc.state;
      const out = {};
      const tryColl = async (name) => {
        try { const exists = await db.listCollections({ name }).hasNext(); if (!exists) return []; return await db.collection(name).find().toArray(); } catch (_e) { void _e; return []; }
      };
      out.checkins = await tryColl('Checkins');
      out.checkouts = await tryColl('Checkouts');
      out.reservations = await tryColl('Reservations');
      out.rentPayments = await tryColl('RentCollections');
      out.expenses = await tryColl('Expenses');
      out.floors = (await tryColl('Floors'))[0] || {};
      return { floors: out.floors || {}, checkins: out.checkins, checkouts: out.checkouts, reservations: out.reservations, rentPayments: out.rentPayments, expenses: out.expenses };
    };
    const state = await buildFullState();
    try { broadcastState(state); } catch (_e) { /* ignore */ }
    res.json({ ok: true, id: inserted.insertedId });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// Insert a checkout into Checkouts and broadcast updated fullstate
app.post('/api/checkout', async (req, res) => {
  await ensureDb();
  if (!dbClient) return res.status(500).json({ ok: false, msg: 'mongo not initialized' });
  try {
    const data = req.body || {};
    const db = dbClient.db(DB_NAME);
    const coll = db.collection('Checkouts');
    const inserted = await coll.insertOne({ ...data, createdAt: new Date() });
    const buildFullState = async () => {
      const doc = await col.findOne({ _id: 'singleton' });
      if (doc && doc.state) return doc.state;
      const out = {};
      const tryColl = async (name) => {
        try { const exists = await db.listCollections({ name }).hasNext(); if (!exists) return []; return await db.collection(name).find().toArray(); } catch (_e) { void _e; return []; }
      };
      out.checkins = await tryColl('Checkins');
      out.checkouts = await tryColl('Checkouts');
      out.reservations = await tryColl('Reservations');
      out.rentPayments = await tryColl('RentCollections');
      out.expenses = await tryColl('Expenses');
      out.floors = (await tryColl('Floors'))[0] || {};
      return { floors: out.floors || {}, checkins: out.checkins, checkouts: out.checkouts, reservations: out.reservations, rentPayments: out.rentPayments, expenses: out.expenses };
    };
    const state = await buildFullState();
    try { broadcastState(state); } catch (_e) { /* ignore */ }
    res.json({ ok: true, id: inserted.insertedId });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

const PORT = process.env.PORT || 4000;
initDb().catch(err => console.error('initDb failed', err)).finally(() => {
  app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
});
