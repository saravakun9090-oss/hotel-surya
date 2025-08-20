// src/services/storageAdapter.js
import { hydrateStateFromDisk, saveStateToDisk } from './diskSync';
import { loadStateFromMongo, saveStateToMongo, testConnection } from './mongoSync';

export async function load(storage, currentState) {
  if (storage === 'local') return await hydrateStateFromDisk(currentState);
  if (storage === 'mongo') return await loadStateFromMongo();
  throw new Error('Unknown storage: ' + storage);
}

export async function save(storage, state) {
  if (storage === 'local') return await saveStateToDisk(state);
  if (storage === 'mongo') return await saveStateToMongo(state);
  throw new Error('Unknown storage: ' + storage);
}

export async function ping(storage) {
  if (storage === 'local') {
    const { getBaseFolder } = await import('../utils/fsAccess');
    const base = await getBaseFolder();
    return Boolean(base);
  }
  if (storage === 'mongo') return await testConnection();
  return false;
}
