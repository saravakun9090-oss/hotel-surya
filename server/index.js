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

app.get('/api/ping', (req, res) => {
  if (!col) return res.status(500).json({ ok: false, msg: 'mongo not initialized' });
  res.json({ ok: true });
});

app.get('/api/debug', async (req, res) => {
  try {
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
    if (!bucket) return res.status(500).send('GridFS not initialized');
    const id = req.params.id;
    const _id = new dbClient.bson.ObjectId(id);
    const downloadStream = bucket.openDownloadStream(_id);
    downloadStream.on('error', (err) => res.status(404).send(String(err)));
    downloadStream.pipe(res);
  } catch (e) {
    res.status(500).send(String(e));
  }
});

app.get('/api/state', async (req, res) => {
  if (!col) return res.status(500).json({ ok: false, msg: 'mongo not initialized' });
  const doc = await col.findOne({ _id: 'singleton' });
  res.json({ state: doc?.state || null });
});

app.post('/api/state', async (req, res) => {
  if (!col) return res.status(500).json({ ok: false, msg: 'mongo not initialized' });
  const { state } = req.body || {};
  await col.updateOne({ _id: 'singleton' }, { $set: { state, updatedAt: new Date() } });
  res.json({ ok: true });
});

const PORT = process.env.PORT || 4000;
initDb().catch(err => console.error('initDb failed', err)).finally(() => {
  app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
});
