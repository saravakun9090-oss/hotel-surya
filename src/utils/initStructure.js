// src/utils/initStructure.js
import { ensureDir, listFiles, readJSONFile, writeJSON } from './fsAccess';
import { monthFolder, displayDate } from './dateUtils';

export async function initFullFolderTree(baseHandle) {
  const fixed = ['Reservations', 'Checkins', 'Checkouts', 'ScannedDocuments'];
  for (const d of fixed) await ensureDir(baseHandle, d);

  

  const mName = monthFolder(new Date());
  const today = displayDate(new Date());
  

  console.log('Folder structure ready.');

  // Ensure a persistent sharing link exists at the root (link.json).
  try {
    // Look for existing link.json at root
    const jsonFiles = await listFiles(baseHandle, '.json');
    const linkFile = jsonFiles.find(f => f.name === 'link.json');
    if (!linkFile) {
      const id = (crypto && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
      const url = `https://hotelsurya.netlify.app/?link=${id}`;
      const payload = { id, url, createdAt: new Date().toISOString(), lastUpdated: null };
      await writeJSON(baseHandle, 'link.json', payload);
      console.log('Created persistent link.json');
    } else {
      // leave existing link as-is
      const existing = await readJSONFile(linkFile.handle);
      console.log('link.json exists', existing?.id ?? 'no-id');
    }
  } catch (err) {
    console.warn('Could not ensure link.json', err);
  }
}
