// src/utils/initStructure.js
import { ensureDir, writeJSON, readJSONFile } from './fsAccess';
import { monthFolder, displayDate } from './dateUtils';

// Ensure the main folder tree exists and create a persistent sharing link (link.json)
// The function will create fixed folders and a stable `link.json` at the root when missing.
export async function initFullFolderTree(baseHandle) {
  const fixed = ['Reservations', 'Checkins', 'Checkouts', 'ScannedDocuments', 'RentCollections', 'Expenses'];
  for (const d of fixed) await ensureDir(baseHandle, d);

  // ensure a Shared folder for snapshot files
  await ensureDir(baseHandle, 'Shared');

  // Ensure a persistent sharing link exists at the root (link.json).
  try {
    let existing = null;
    try {
      const fh = await baseHandle.getFileHandle('link.json');
      existing = await readJSONFile(fh);
    } catch (e) {
      // file doesn't exist
      existing = null;
    }

    if (!existing || !existing.id) {
      const id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID().slice(0, 8) : `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
      // Use path style /<id> for nicer links
      const url = `https://hotelsurya.netlify.app/${id}`;
      const payload = { id, url, createdAt: new Date().toISOString() };
      await writeJSON(baseHandle, 'link.json', payload);
      console.log('Created persistent link.json', payload);
      return payload;
    } else {
      console.log('link.json exists', existing?.id ?? 'no-id');
      return existing;
    }
  } catch (err) {
    console.warn('Could not ensure link.json', err);
    return null;
  }
}
