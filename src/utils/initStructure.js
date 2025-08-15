// src/utils/initStructure.js
import { ensureDir } from './fsAccess';
import { monthFolder, displayDate } from './dateUtils';

export async function initFullFolderTree(baseHandle) {
  const fixed = ['Reservations', 'Checkins', 'Checkouts', 'ScannedDocuments'];
  for (const d of fixed) await ensureDir(baseHandle, d);

  

  const mName = monthFolder(new Date());
  const today = displayDate(new Date());
  

  console.log('Folder structure ready.');
}
