// src/utils/fsAccess.js
const DB_NAME = 'hotel_surya_fs';
const STORE = 'kv';
const KEY = 'base_dir_handle';

async function openDB() {
  return await new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key, value) {
  const db = await openDB();
  await new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

async function idbGet(key) {
  const db = await openDB();
  return await new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readonly');
    const rq = tx.objectStore(STORE).get(key);
    rq.onsuccess = () => res(rq.result || null);
    rq.onerror = () => rej(rq.error);
  });
}

export async function chooseBaseFolder() {
  if (!window.showDirectoryPicker) {
    throw new Error('File System Access API not supported in this browser.');
  }
  const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
  await idbSet(KEY, handle);
  return handle;
}

export async function getBaseFolder() {
  const handle = await idbGet(KEY);
  if (!handle) return null;
  const ok = await verifyPerm(handle);
  return ok ? handle : null;
}

async function verifyPerm(handle) {
  const opts = { mode: 'readwrite' };
  const qp = await handle.queryPermission?.(opts);
  if (qp === 'granted') return true;
  const rp = await handle.requestPermission?.(opts);
  return rp === 'granted';
}

export async function ensureDir(parent, name) {
  return await parent.getDirectoryHandle(name, { create: true });
}

export async function ensurePath(baseHandle, parts) {
  let dir = baseHandle;
  for (const p of parts) dir = await ensureDir(dir, p);
  return dir;
}

export async function writeJSON(dirHandle, filename, data) {
  const fh = await dirHandle.getFileHandle(filename, { create: true });
  const w = await fh.createWritable();
  await w.write(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  await w.close();
}

export async function writeFile(dirHandle, filename, blob) {
  const fh = await dirHandle.getFileHandle(filename, { create: true });
  const w = await fh.createWritable();
  await w.write(blob);
  await w.close();
}

export async function listDirs(dirHandle) {
  const dirs = [];
  for await (const [name, handle] of dirHandle.entries()) {
    if (handle.kind === 'directory') dirs.push({ name, handle });
  }
  return dirs;
}

export async function listFiles(dirHandle, acceptExt = null) {
  const files = [];
  for await (const [name, handle] of dirHandle.entries()) {
    if (handle.kind === 'file') {
      if (!acceptExt || name.toLowerCase().endsWith(acceptExt)) {
        files.push({ name, handle });
      }
    }
  }
  return files;
}

export async function readJSONFile(fileHandle) {
  const file = await fileHandle.getFile();
  const text = await file.text();
  try { 
    return JSON.parse(text); 
  } catch { 
    return null; 
  }
}