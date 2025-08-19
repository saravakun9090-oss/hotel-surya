import { getBaseFolder, ensureDir, listDirs, listFiles, readJSONFile } from '../utils/fsAccess';

function makeEmptyFloors() {
  const floors = {};
  for (let f = 1; f <= 5; f++) {
    floors[f] = [];
    for (let r = 1; r <= 4; r++) {
      const number = f * 100 + r;
      floors[f].push({ number, status: 'free', rate: 2500, guest: null, reservedFor: null });
    }
  }
  return floors;
}

export async function hydrateStateFromDisk(currentState) {
  const base = await getBaseFolder();
  if (!base) return null; // no folder selected

  const next = {
    floors: makeEmptyFloors(),
    guests: [],
    reservations: []
  };

  // ---- Load Check-ins ----
  try {
    const checkinsRoot = await ensureDir(base, 'Checkins');
    const dayDirs = await listDirs(checkinsRoot);

    for (const day of dayDirs) {
      const jsonFiles = await listFiles(day.handle, '.json');
      for (const f of jsonFiles) {
        const data = await readJSONFile(f.handle);
        if (!data) continue;
        // Support both single room (number/string) and array of rooms
        const rooms = Array.isArray(data.room) ? data.room.map(Number) : [Number(data.room)];
        for (const roomNum of rooms) {
          const floorNum = String(roomNum)[0];
          const floorArr = next.floors[floorNum];
          if (!floorArr) continue;

          next.floors[floorNum] = floorArr.map(r =>
            r.number === roomNum
              ? {
                  ...r,
                  status: 'occupied',
                  guest: {
                    name: data.name || 'Guest',
                    contact: data.contact || '',
                    id: data.id || '',
                    checkIn: data.checkIn || new Date().toISOString(),
                    checkInDate: data.checkInDate || null,
                    checkInTime: data.checkInTime || null,
                    rate: data.rate || r.rate,
                    edited: Boolean(data.edited)
                  }
                }
              : r
          );

          next.guests.push({
            room: roomNum,
            name: data.name,
            contact: data.contact,
            id: data.id,
            checkIn: data.checkIn,
            edited: Boolean(data.edited)
          });
        }
      }
    }
  } catch (err) {
    console.warn("No Checkins folder or error reading it:", err);
  }

  // ---- Load Reservations ----
  try {
    const resRoot = await ensureDir(base, 'Reservations');
    const dayDirs = await listDirs(resRoot);

    for (const day of dayDirs) {
      const jsonFiles = await listFiles(day.handle, '.json');
      for (const f of jsonFiles) {
        const data = await readJSONFile(f.handle);
        if (!data) continue;

        next.reservations.push({
          name: data.name || 'Guest',
          place: data.place || '',
          room: Number(data.room),
          date: data.date || day.name
        });
      }
    }
  } catch (err) {
    console.warn("No Reservations folder or error reading it:", err);
  }

  // ---- Preserve old rates if defined ----
  if (currentState?.floors) {
    for (const fnum of Object.keys(next.floors)) {
      next.floors[fnum] = next.floors[fnum].map(r => {
        const old = currentState.floors[fnum]?.find(x => x.number === r.number);
        return old ? { ...r, rate: old.rate ?? r.rate } : r;
      });
    }
  }

  return next;
}

// Upsert a record to disk folders (Checkins or Reservations). This will create the
// necessary date folder and write a JSON file named by id (or generated) so disk
// storage mirrors remote updates.
export async function upsertDiskDoc(collection, doc) {
  try {
    const base = await getBaseFolder();
    if (!base) return null;
    // collection -> folder mapping
    const colFolder = collection === 'reservations' ? 'Reservations' : collection === 'checkins' ? 'Checkins' : collection;
    const root = await ensureDir(base, colFolder);

    // determine date folder name (for Checkins/Reservations we expect a date)
    const dateStr = doc.date || (doc.checkIn ? doc.checkIn.slice(0, 10) : (new Date()).toISOString().slice(0,10));
    const dayDir = await ensureDir(root, dateStr);

    const filename = (doc.id || `${collection}_${Date.now()}`).toString() + '.json';
    // write using writeJSON helper from fsAccess (import lazily to avoid cycle)
    const { writeJSON } = await import('../utils/fsAccess');
    await writeJSON(dayDir, filename, doc);
    return { ok: true, path: `${colFolder}/${dateStr}/${filename}` };
  } catch (err) {
    console.warn('upsertDiskDoc error', err);
    return { ok: false, error: err.message };
  }
}
