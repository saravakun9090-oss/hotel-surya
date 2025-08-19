// src/utils/sharedSync.js
import { ensureDir, writeJSON, getBaseFolder } from './fsAccess';

// Write a snapshot of the minimal public state to Shared/sharedSnapshot.json
export async function writeSharedSnapshot(state) {
  try {
    const base = await getBaseFolder();
    if (!base) return;
    const sharedDir = await ensureDir(base, 'Shared');
    const payload = {
      updatedAt: new Date().toISOString(),
      floors: state.floors || {},
      reservations: state.reservations || [],
      // include minimal aggregated lists for checkins/checkouts/payments/expenses as needed
      guests: state.guests || []
    };
    await writeJSON(sharedDir, 'sharedSnapshot.json', payload);
  } catch (err) {
    console.warn('Failed to write shared snapshot', err);
  }
}
