// src/utils/sharedSync.js
import { ensureDir, ensurePath, listDirs, listFiles, readJSONFile, writeJSON, getBaseFolder } from './fsAccess';

// Helper: recursively list files inside a directory and return { path, name }
async function listAllFiles(dirHandle, prefix = '') {
  const out = [];
  for await (const [name, handle] of dirHandle.entries()) {
    const p = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === 'directory') {
      const nested = await listAllFiles(handle, p);
      out.push(...nested);
    } else if (handle.kind === 'file') {
      out.push({ path: p, name });
    }
  }
  return out;
}

// Limit large lists to this many recent entries to keep snapshot small
const MAX_ITEMS = 500;

export async function writeSharedSnapshot(state) {
  try {
    const base = await getBaseFolder();
    if (!base) return;
    const sharedDir = await ensureDir(base, 'Shared');

    const payload = {
      updatedAt: new Date().toISOString(),
      floors: state.floors || {},
      reservations: state.reservations || [],
      guests: state.guests || []
    };

    // Attach checkins
    try {
      const checkinsRoot = await ensurePath(base, ['Checkins']);
      const dayDirs = await listDirs(checkinsRoot);
      const checkins = [];
      for (const day of dayDirs) {
        const files = await listFiles(day.handle, '.json');
        for (const f of files) {
          const data = await readJSONFile(f.handle);
          if (!data) continue;
          checkins.push({
            dateFolder: day.name,
            file: f.name,
            name: data.name || null,
            room: data.room || null,
            id: data.id || null,
            contact: data.contact || null,
            checkIn: data.checkIn || null,
            rate: data.rate || null,
            edited: Boolean(data.edited)
          });
        }
      }
      payload.checkins = checkins.slice(-MAX_ITEMS);
    } catch (e) {
      payload.checkins = [];
    }

    // Attach checkouts
    try {
      const checkoutRoot = await ensurePath(base, ['Checkouts']);
      const dayDirs = await listDirs(checkoutRoot);
      const checkouts = [];
      for (const day of dayDirs) {
        const files = await listFiles(day.handle, '.json');
        for (const f of files) {
          const data = await readJSONFile(f.handle);
          if (!data) continue;
          checkouts.push({
            dateFolder: day.name,
            file: f.name,
            name: data.name || null,
            room: data.room || null,
            id: data.id || null,
            paid: data.paid || null,
            checkoutAt: data.checkoutAt || null,
            notes: data.notes || null
          });
        }
      }
      payload.checkouts = checkouts.slice(-MAX_ITEMS);
    } catch (e) {
      payload.checkouts = [];
    }

    // Attach rent payments (RentCollections)
    try {
      const rentRoot = await ensurePath(base, ['RentCollections']);
      const dateDirs = await listDirs(rentRoot);
      const rents = [];
      for (const dateDir of dateDirs) {
        const files = await listFiles(dateDir.handle, '.json');
        for (const f of files) {
          const data = await readJSONFile(f.handle);
          if (!data) continue;
          rents.push({
            dateFolder: dateDir.name,
            file: f.name,
            name: data.name || null,
            room: data.room || null,
            amount: data.amount || data.paid || null,
            note: data.note || null
          });
        }
      }
      payload.rentPayments = rents.slice(-MAX_ITEMS);
    } catch (e) {
      payload.rentPayments = [];
    }

    // Attach expenses
    try {
      const expRoot = await ensurePath(base, ['Expenses']);
      const dateDirs = await listDirs(expRoot);
      const expenses = [];
      for (const dateDir of dateDirs) {
        const files = await listFiles(dateDir.handle, '.json');
        for (const f of files) {
          const data = await readJSONFile(f.handle);
          if (!data) continue;
          expenses.push({
            dateFolder: dateDir.name,
            file: f.name,
            category: data.category || null,
            amount: data.amount || null,
            note: data.note || null
          });
        }
      }
      payload.expenses = expenses.slice(-MAX_ITEMS);
    } catch (e) {
      payload.expenses = [];
    }

    // Index scanned documents (filenames + relative path)
    try {
      const scannedRoot = await ensurePath(base, ['ScannedDocuments']);
      const all = await listAllFiles(scannedRoot);
      payload.scannedDocuments = all.slice(-MAX_ITEMS);
    } catch (e) {
      payload.scannedDocuments = [];
    }

    await writeJSON(sharedDir, 'sharedSnapshot.json', payload);
  } catch (err) {
    console.warn('Failed to write shared snapshot', err);
  }
}
