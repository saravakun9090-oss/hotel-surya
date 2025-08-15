import React, { useEffect,useRef, useState, useMemo } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import { useSearchParams } from "react-router-dom";

import { getBaseFolder, ensurePath, writeJSON, writeFile } from './utils/fsAccess';
import { monthFolder, displayDate, ymd } from './utils/dateUtils';
import StorageSetup from './components/StorageSetup';
import { hydrateStateFromDisk } from './services/diskSync';
import { Line, Doughnut, Bar } from "react-chartjs-2";


import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
  TimeScale,
} from "chart.js";
import "chartjs-adapter-date-fns";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
  TimeScale
);



const STORAGE_KEY = 'hotel_demo_v2';

// Seed generator with 4 rooms per floor
const generateDefault = () => {
  const floors = {};
for (let f = 1; f <= 5; f++) {
floors[f] = [];
for (let r = 1; r <= 4; r++) {
const number = f * 100 + r;
floors[f].push({ number, status: "free", guest: null, reservedFor: null });
}
}
  // sample data
  floors[1][1].status = 'reserved'; floors[1][1].reservedFor = { name: 'A. Kumar', from: '2025-08-15' };
  floors[2][2].status = 'occupied'; floors[2][2].guest = { name: 'Ravi', contact: '9876543210', checkIn: new Date().toISOString(), id: 'ID123' };
  floors[3][0].status = 'occupied'; floors[3][0].guest = { name: 'Priya', contact: '9345678123', checkIn: new Date().toISOString(), id: 'DL998' };
  return { floors, guests: [] };
};

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) { const s = generateDefault(); localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); return s; }
  try { return JSON.parse(raw); } catch (e) { const s = generateDefault(); localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); return s; }
}
function saveState(state) { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

// ---------- Small UI components ----------
const Sidebar = () => (
  <div className="sidebar">
    <div className="logo">🏨 HOTEL SURYA</div>
    <div className="subtitle">Manage check-ins, checkouts & reservations</div>
    <nav className="nav">
      <Link to="/">Dashboard</Link>
      <Link to="/checkin">Check-in</Link>
      <Link to="/checkout">Check-out</Link>
      <Link to="/reservations">Reservations</Link>
      <Link to="/floors">Floors</Link>
      <Link to="/storage">Storage</Link>
      <Link to="/accounts" className="btn">Accounts</Link>
      <Link to="/analysis">Analysis</Link>
      

    </nav>
    <div style={{ flex: 1 }} />
    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.9)' }}>Theme</div>
    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
      <div style={{ background: 'var(--cream)', padding: 8, borderRadius: 8 }}>Accent</div>
      <div style={{ background: 'var(--deep)', padding: 8, borderRadius: 8, color: 'white' }}>Primary</div>
    </div>
  </div>
);

const StatCard = ({ title, value }) => (
  <div className="stat">
    <div className="label">{title}</div>
    <div className="value">{value}</div>
  </div>
);

const RoomCard = ({ room, onClick }) => (
  <div className={`room ${room.status}`} onClick={() => onClick(room)} title={`Room ${room.number} — ${room.status}`}>
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 14 }}>{room.number}</div>
      <div style={{ fontSize: 11, marginTop: 6, color: 'rgba(0,0,0,0.45)' }}>{room.status}</div>
    </div>
  </div>
);

const Modal = ({ children, onClose }) => (
  <div className="modal" onClick={onClose}>
    <div className="modal-card" onClick={(e) => e.stopPropagation()}>{children}</div>
  </div>
);

// ---------- Pages ----------
function Dashboard({ state }) {
const floors = state.floors;
  let total = 0, free = 0, reserved = 0, occupied = 0;
const todayISO = ymd();

  // Count rooms by status
  for (const arr of Object.values(floors)) {
  for (const r of arr) {
    total++;
    const isReservedToday = (state.reservations || []).some(
      res => res.date === todayISO && res.room === r.number
    );

    if (r.status === 'occupied') {
      occupied++;
    } else if (isReservedToday) {
      reserved++;
    } else {
      free++;
    }
  }
}

  // Recent check-ins list
  const recent = [];
  for (const arr of Object.values(floors)) {
    for (const r of arr) {
      if (r.guest) recent.push({ room: r.number, guest: r.guest });
    }
  }

  // Today's reservations
  
  const todaysReservations = (state.reservations || []).filter(res => res.date === todayISO);

  const navigate = useNavigate();

const checkInReservation = (res) => {
  navigate('/checkin', {
    state: {
      prefName: res.name,
      prefRoom: res.room
    }
  });
};

  // Room layout: mark today's reservations
  const layoutFloors = {};
  Object.keys(floors).forEach(floorNum => {
    layoutFloors[floorNum] = floors[floorNum].map(r => {
      const res = todaysReservations.find(rr => rr.room === r.number);
      if (res && r.status === "free") {
        return { ...r, status: "reserved" }; // mark reserved
      }
      return r;
    });
  });

 

  

  return (
    <div>
      {/* HEADER */}
      <div className="header-row">
        <div>
          <div className="title">Dashboard</div>
          <div style={{ color: 'var(--muted)', marginTop: 4 }}>
            Overview of rooms, check-ins, and reservations
          </div>
        </div>
        <div className="controls">
          <div className="floor-pills">
            {Object.keys(floors).map(f => (
              <Link key={f} to={`/floors/${f}`} className="pill">
                Floor {f}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* MAIN: Two columns */}
      <div style={{ display: 'flex', gap: 20, marginTop: 20, alignItems: 'stretch' }}>
        
        {/* LEFT COLUMN */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
          
          {/* Overview (top) */}
          <div>
            <h3 style={{ margin: 0, marginBottom: 12 }}>Overview</h3>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 12
            }}>
              <StatCard title="Total Rooms" value={total} />
              <StatCard title="Available" value={free} />
              <StatCard title="Reserved" value={reserved} />
              <StatCard title="Occupied" value={occupied} />
            </div>
          </div>

          {/* Recent Check-ins (bottom) */}
          <div style={{ flex: 1, minHeight: 0 }}>
            <h3 style={{ margin: 0, marginBottom: 8 }}>Recent Check-ins</h3>
            <div className="list" style={{ marginTop: 0 }}>
              {recent.length === 0 && (
                <div style={{ color: 'var(--muted)' }}>No current guests</div>
              )}
              {recent.slice(0, 6).map((r, idx) => (
                <div
                  key={idx}
                  className="card"
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700 }}>{r.guest.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>Room {r.room}</div>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {new Date(r.guest.checkIn).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
          
          {/* Room Layout (top) */}
          <div>
            <h3 style={{ margin: 0, marginBottom: 12 }}>Room Layout (Today)</h3>
            <div className="card" style={{ padding: 14 }}>
              {Object.keys(layoutFloors).map(floorNum => (
                <div key={floorNum} style={{ marginBottom: 12 }}>
                  <div style={{
                    fontWeight: 700,
                    fontSize: 14,
                    marginBottom: 6,
                    color: 'var(--muted)'
                  }}>
                    Floor {floorNum}
                  </div>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4,1fr)',
                    gap: 8
                  }}>
                    {layoutFloors[floorNum].map(r => (
                      <div
                        key={r.number}
                        className={`room ${r.status}`}
                        style={{
                          height: 48,
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: 8
                        }}
                      >
                        {floorNum}{String(r.number).slice(-2)}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Today's Reservations (bottom) */}
          <div className="list">
        {(todaysReservations.length === 0) && (
  <div style={{ color: 'var(--muted)' }}>No reservations for today</div>
)}
{todaysReservations.map((r, i) => (
          <div key={i} className="card" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 700 }}>
                {r.name} - <span style={{ color: 'var(--muted)', fontWeight: 700 }}>{r.place}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                Room {r.room} — {r.date}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn primary" onClick={() => checkInReservation(r)}>Check-In</button>
              
            </div>
          </div>
        ))}
      </div>
        </div>
      </div>

      {/* Footer */}
      <div className="footer" style={{ marginTop: 20 }}>
        Tip: Click on any room in the Floors page to see actions: check-in, check-out, reserve.
      </div>
    </div>
  );
}

function FloorsPage({ state, setState, floorNumber }) {
  const [selected, setSelected] = useState(null);

  // Get today’s date in YYYY-MM-DD for comparison
  const todayISO = ymd();

  // Filter reservations for today on this floor
  const reservationsToday = (state.reservations || []).filter(
    res => res.date === todayISO
  );

  // Build the floor array, marking rooms reserved where applicable
  const floor = state.floors[floorNumber].map(r => {
    const res = reservationsToday.find(rr => rr.room === r.number);
    if (res && r.status === 'free') {
      return { ...r, status: 'reserved', reservedFor: { name: res.name, from: res.date } };
    }
    return r;
  });

  const onRoomClick = (room) => setSelected(room);

  const updateRoom = (number, patch) => {
    const newState = { ...state, floors: { ...state.floors } };
    newState.floors[floorNumber] =
      state.floors[floorNumber].map(r => (r.number === number ? { ...r, ...patch } : r));
    setState(newState);
    saveState(newState);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>Floor {floorNumber}</h3>
        <div style={{ color: 'var(--muted)' }}>Rooms: {floor.length}</div>
      </div>
      <div style={{ height: 12 }} />
      <div className="room-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {floor.map(r => (
          <RoomCard key={r.number} room={r} onClick={onRoomClick} />
        ))}
      </div>

      {selected && (
        <Modal onClose={() => setSelected(null)}>
          <h4>Room {selected.number}</h4>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>Status: {selected.status}</div>
          <div style={{ height: 12 }} />

          {selected.status === 'free' && (
            <div style={{ display: 'flex', gap: 8 }}>
              {/* Only Check-In is available for free rooms now */}
              <Link to="/checkin" state={{ room: selected.number }} className="btn primary">
                Check-In
              </Link>
            </div>
          )}

          {selected.status === 'reserved' && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn primary"
                onClick={() => {
                  updateRoom(selected.number, {
                    status: 'occupied',
                    guest: {
                      name: selected.reservedFor?.name || 'Guest',
                      contact: '',
                      checkIn: new Date().toISOString(),
                      id: ''
                    },
                    reservedFor: null
                  });
                  setSelected(null);
                }}
              >
                Check-In Reserved
              </button>
            </div>
          )}

          {selected.status === 'occupied' && (
            <div style={{ display: 'flex', gap: 8 }}>
              <Link to="/checkout" state={{ room: selected.number }} className="btn primary">
                Check-Out
              </Link>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

function FloorsContainer({ state, setState }) {
  const floors = Object.keys(state.floors).map(f => Number(f));
  return (
    <div>
      <h2>Floors — swipe left / right</h2>
      <div className="floor-scroll">
        {floors.map(f => (
          <div className="floor" key={f}>
            <FloorsPage state={state} setState={setState} floorNumber={f} />
          </div>
        ))}
      </div>
    </div>
  );
}

function CheckIn({ state, setState, locationState }) {

  
const location = useLocation();

useEffect(() => {
  if (location.state?.prefName || location.state?.prefRoom) {
    setForm(f => ({
      ...f,
      name: location.state.prefName || f.name,
      room: location.state.prefRoom || f.room
    }));
    setSelectedRoom(location.state.prefRoom || null);

    // Optional: trigger past guest search right away
    if (location.state.prefName && location.state.prefName.length >= 2) {
      nameFocusedRef.current = true;
      searchGuestMatches(location.state.prefName);
    }
  }
}, [location.state]);

   const navigate = useNavigate();
  const todayISO = ymd();

  const [form, setForm] = useState({ name: "", contact: "", room: "", rate: "" });
  const [scanFile, setScanFile] = useState(null);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [guestMatches, setGuestMatches] = useState([]);
  const [successMsg, setSuccessMsg] = useState("");


  const nameFocusedRef = useRef(false);
  const searchTimeoutRef = useRef(null);

  // Build room grid
  const reservationsToday = (state.reservations || []).filter(r => r.date === todayISO);
  const roomsByFloor = {};
  Object.keys(state.floors).forEach(floorNum => {
    roomsByFloor[floorNum] = state.floors[floorNum].map(r => {
      const res = reservationsToday.find(rr => rr.room === r.number);
      if (res && r.status === "free") return { ...r, status: "reserved", reservedFor: res };
      return r;
    });
  });

  // Occupied list
  const occupiedRooms = [];
  Object.values(state.floors).forEach(arr => {
    arr.forEach(r => { if (r.status === "occupied") occupiedRooms.push(r); });
  });

  const handleRoomClick = (room) => {
  if (room.status === "occupied") return;

  // Prefill name from reservation
  const reservedName = room.status === "reserved" ? (room.reservedFor?.name || "") : "";
  setSelectedRoom(room.number);
  setForm(f => ({
    ...f,
    room: room.number,
    name: reservedName || f.name
  }));

  setGuestMatches([]); // close any old dropdown

  // 🔹 If reservedName exists, trigger async search
  if (reservedName && reservedName.length >= 2) {
    nameFocusedRef.current = true; // so dropdown will render
    searchGuestMatches(reservedName);
  }
};

  async function deleteReservationFile(date, room, name) {
    try {
      const base = await getBaseFolder();
      if (!base) return;
      const dir = await ensurePath(base, ["Reservations", date]);
      const safe = String(name).replace(/[^\w\-]+/g, "_");
      await dir.removeEntry(`reservation-${room}-${safe}.json`);
    } catch (err) {
      console.warn("Failed to delete reservation file", err);
    }
  }

  // Recursively search scans
  async function searchScansRecursively(dirHandle, safeQuery, results, query) {
    for await (const [entryName, entryHandle] of dirHandle.entries()) {
      if (entryHandle.kind === "directory") {
        await searchScansRecursively(entryHandle, safeQuery, results, query);
      } else if (entryHandle.kind === "file") {
        if (entryName.toLowerCase().includes(safeQuery)) {
  // Remove extension
  let baseName = entryName.replace(/\.[^/.]+$/, "");
  baseName = baseName.replace(/_/g, " "); // underscores → spaces
  // Get only part before first "-" or "/" or space+digit (room no)
  let nameOnly = baseName.split(/[-/]| \d/)[0].trim();

  results.push({
    source: "scanfile",
    name: nameOnly || query,
    contact: "",
    room: "",
    scanInfo: { name: nameOnly || query, fileName: entryName, fileHandle: entryHandle }
  });
}
      }
    }
  }

  // Search guest matches
  async function searchGuestMatches(query) {
    if (!nameFocusedRef.current || !query || query.length < 2) {
      setGuestMatches([]);
      return;
    }
    try {
      const base = await getBaseFolder();
      if (!base) return;
      const results = [];
      const safeQuery = query.toLowerCase().replace(/[^\w\-]+/g, "_");

      // From Checkouts JSON
      const checkoutsRoot = await ensurePath(base, ["Checkouts"]);
      for await (const [dateFolder, dateHandle] of checkoutsRoot.entries()) {
        if (dateHandle.kind === "directory") {
          for await (const [fileName, fileHandle] of dateHandle.entries()) {
            if (fileHandle.kind === "file" && fileName.endsWith(".json")) {
              const file = await fileHandle.getFile();
              const data = JSON.parse(await file.text());
              if (data.name?.toLowerCase().includes(query.toLowerCase())) {
                results.push({
                  source: "checkout",
                  name: data.name,
                  contact: data.contact || "",
                  room: data.room,
                  scanInfo: { checkInDate: data.checkIn?.slice(0, 10) || dateFolder, name: data.name }
                });
              }
            }
          }
        }
      }

      // From anywhere in ScannedDocuments
      const scannedRoot = await ensurePath(base, ["ScannedDocuments"]);
      await searchScansRecursively(scannedRoot, safeQuery, results, query);

      if (nameFocusedRef.current) setGuestMatches(results); // only set if still focused
    } catch (err) {
      console.warn("Guest search failed:", err);
    }
  }

  // Use a guest match (prefill + reuse scan)
  async function useGuestMatch(match) {
  setForm(f => ({ ...f, name: match.name, contact: match.contact }));
  setGuestMatches([]); // close dropdown

  try {
    const base = await getBaseFolder();
    if (!base) return;

    // SAFE guest name
    const safeName = match.scanInfo.name.replace(/[^\w\-]+/g, "_");

    if (match.source === "scanfile" && match.scanInfo.fileHandle) {
  setScanFile({
    reused: true,
    fileHandle: match.scanInfo.fileHandle,
    safeName,
    name: match.scanInfo.fileName // ✅ use provided filename
  });
}
    else if (match.source === "checkout" && match.scanInfo.checkInDate) {
  const oldDate = match.scanInfo.checkInDate; // YYYY-MM-DD
  const oldYear = oldDate.slice(0, 4);
  const oldMonth = new Date(oldDate).toLocaleString("en-US", { month: "short" }).toLowerCase();
  const oldDateFolder = `${oldDate.slice(8,10)}-${oldDate.slice(5,7)}-${oldDate.slice(0,4)}`;

  const oldScanDir = await ensurePath(base, ["ScannedDocuments", oldYear, oldMonth, oldDateFolder]);
  for await (const [entryName, entryHandle] of oldScanDir.entries()) {
    if (entryHandle.kind === "file" && entryName.toLowerCase().includes(safeName.toLowerCase())) {
      setScanFile({
        reused: true,
        fileHandle: entryHandle,
        safeName,
        name: entryName // ✅ store the filename for UI
      });
      console.log("Found old scan from checkout:", entryName);
      break;
    }
  }
}

  } catch (err) {
    console.warn("Scan reuse failed", err);
  }
}

  // Save check-in data
  const saveCheckinData = async (guest) => {
  const base = await getBaseFolder();
  if (!base) return console.warn("Storage not connected.");

  const now = new Date();
  const todayISOstr = ymd(now);

  // Save check‑in JSON
  const dataDir = await ensurePath(base, ["Checkins", todayISOstr]);
  await writeJSON(dataDir, `checkin-${guest.name}-${guest.room}-${todayISOstr}.json`, guest);

  const year = String(now.getFullYear());
  const month = now.toLocaleString("en-US", { month: "short" }).toLowerCase();
  const dateFolder = `${String(now.getDate()).padStart(2,'0')}-${String(now.getMonth()+1).padStart(2,'0')}-${now.getFullYear()}`;
  const scansDir = await ensurePath(base, ["ScannedDocuments", year, month, dateFolder]);

  // If old scan is being reused
  if (scanFile?.reused && scanFile?.fileHandle) {
    const safeName = scanFile.safeName.replace(/[^\w\-]+/g, "_");
    const ext = scanFile.fileHandle.name?.split(".").pop() || "jpg";
    const newFileName = `${safeName}-${guest.room}-${todayISOstr}.${ext}`;
    const file = await scanFile.fileHandle.getFile();
    await writeFile(scansDir, newFileName, file);
    console.log("Reused old scan saved:", newFileName);
    return;
  }

  // If new scan uploaded
  if (scanFile && !scanFile.reused) {
    const ext = scanFile.name.includes(".") ? scanFile.name.split(".").pop() : "jpg";
    await writeFile(scansDir, `${guest.name}-${guest.room}-${todayISOstr}.${ext}`, scanFile);
  }
};

  // Submit form
  const submit = async (e) => {
    e.preventDefault();
    if (!form.room) return alert("Select a room");

    // ✅ Show success message
setSuccessMsg(`Room ${form.room} reserved successfully`);

// ✅ Reset form and selection
setForm({ name: "", contact: "", room: "",rate: "" });
setSelectedRoom(null);
setScanFile(null);

// ✅ Hide message after 3 seconds
setTimeout(() => setSuccessMsg(""), 3000);

    const newState = { ...state, floors: { ...state.floors } };
    Object.keys(newState.floors).forEach(fnum => {
      newState.floors[fnum] = newState.floors[fnum].map(r =>
        r.number === Number(form.room)
  ? { ...r, status: "occupied", guest: { name: form.name, contact: form.contact, checkIn: new Date().toISOString(), rate: Number(form.rate) || 0 } }

          : r
      );
    });

    const reservationMatch = state.reservations?.find(r => r.room === Number(form.room) && r.date === todayISO);
    if (reservationMatch) {
      newState.reservations = state.reservations.filter(r => !(r.room === Number(form.room) && r.date === todayISO));
      await deleteReservationFile(reservationMatch.date, reservationMatch.room, reservationMatch.name);
    }

    setState(newState);
    saveState(newState);
    await saveCheckinData({
  name: form.name,
  contact: form.contact,
  room: form.room,
  checkIn: new Date().toISOString(),
  rate: Number(form.rate) || 0
});


  
    
  };

  
  // Helpers for color key and style
  const legendDot = (bg) => ({
    display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
    background: bg, marginRight: 6, border: '1px solid rgba(0,0,0,0.1)'
  });

  const roomBoxStyle = (r) => {
    const bg =
      r.status === "reserved" ? "rgba(255, 213, 128, 0.6)" :
      r.status === "occupied" ? "rgba(139, 224, 164, 0.6)" :
      "rgba(255, 255, 255, 0.6)";
    const isDisabled = r.status === "occupied";
    const isSelected = selectedRoom === r.number;
    return {
      cursor: isDisabled ? "not-allowed" : "pointer",
      height: 56,
      borderRadius: 10,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: 800,
      color: '#08251f',
      background: bg,
      backdropFilter: 'saturate(120%) blur(2px)',
      border: `2px solid ${isSelected ? 'var(--deep)' : 'rgba(0,0,0,0.08)'}`,
      boxShadow: isSelected ? '0 0 0 3px rgba(46,76,65,0.15)' : '0 4px 10px rgba(0,0,0,0.06)',
      transition: 'all 120ms ease',
      transform: isSelected ? 'translateY(-1px)' : 'none',
      opacity: isDisabled ? 0.85 : 1,
      
    };
  };

  useEffect(() => () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current); }, []);

  async function scanFromLocalScanner() {
  try {
    const base = await getBaseFolder();
    if (!base) return alert("Storage not connected");

    // Point to your scanner dump folder
    const scanDir = await ensurePath(base, ["_ScannerTemp"]);

    let latestFile = null;
    let latestTime = 0;

    for await (const [name, handle] of scanDir.entries()) {
      if (handle.kind === "file" && /\.(jpg|jpeg|png|pdf)$/i.test(name)) {
        const file = await handle.getFile();
        if (file.lastModified > latestTime) {
          latestTime = file.lastModified;
          latestFile = file;
        }
      }
    }

    if (!latestFile) {
      alert("No scanned file found. Please scan and then click again.");
      return;
    }

    // Attach it to form
    setScanFile(latestFile);
    console.log("Attached scanned file:", latestFile.name);
  } catch (err) {
    console.error("Scan fetch failed:", err);
    alert("Failed to fetch scanned file.");
  }
}


  return (
    <div>
      <div className="header-row" style={{ marginBottom: 12 }}>
        <div className="title">Check-In</div>
      </div>
      <div style={{ display: 'flex', gap: 20 }}>
        {/* LEFT grid */}
        <div style={{ flex: 1 }}>
          <div className="card" style={{ padding: 14, marginBottom: 12 }}>
            <div style={{ fontWeight: 800, marginBottom: 10, color: 'var(--deep)' }}>Rooms Today</div>
            <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>
              <div><span style={legendDot('rgba(255,255,255,0.6)')} /> Free</div>
              <div><span style={legendDot('rgba(255, 213, 128, 0.6)')} /> Reserved</div>
              <div><span style={legendDot('rgba(139, 224, 164, 0.6)')} /> Occupied</div>
            </div>
            {Object.keys(roomsByFloor).map(floorNum => (
              <div key={floorNum} style={{ marginBottom: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--muted)', marginBottom: 8 }}>
                  Floor {floorNum}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                  {roomsByFloor[floorNum].map(r => (
                    <div
                      key={r.number}
                      style={roomBoxStyle(r)}
                      title={
                        r.status === 'reserved'
                          ? `Reserved for: ${r.reservedFor?.name || 'Guest'}`
                          : r.status === 'occupied'
                          ? `Occupied by: ${r.guest?.name || 'Guest'}\nContact: ${r.guest?.contact || '-'}\nCheck-in: ${r.guest?.checkIn ? new Date(r.guest.checkIn).toLocaleDateString() : '-'}`
                          : 'Free'
                      }
                      onClick={() => handleRoomClick(r)}
                    >
                      {r.number}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT form */}
        <div style={{ flex: 1 }}>
          <div className="card" style={{ padding: 16 }}>
            <form onSubmit={submit}>
              {/* Guest name */}
              <div style={{ position: 'relative' }}>
                <input
                  className="input"
                  style={{ marginBottom: 8 }}
                  placeholder="Guest name"
                  value={form.name}
                  onFocus={() => { nameFocusedRef.current = true; }}
                  onBlur={() => { nameFocusedRef.current = false; setTimeout(() => setGuestMatches([]), 100); }}
                  onChange={(e) => {
                    const val = e.target.value;
                    setForm({ ...form, name: val });
                    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
                    searchTimeoutRef.current = setTimeout(() => {
                      if (nameFocusedRef.current) searchGuestMatches(val);
                    }, 250);
                  }}
                />
                {nameFocusedRef.current && guestMatches.length > 0 && (
                  <div
                    className="card"
                    style={{
                      position: 'absolute', top: '100%', left: 0, right: 0,
                      background: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                      zIndex: 500, maxHeight: 220, overflowY: 'auto'
                    }}
                  >
                    {guestMatches.map((m, idx) => (
                      <div key={idx} style={{ padding: '6px 8px', cursor: 'pointer' }}
                        onMouseDown={(e) => { e.preventDefault(); useGuestMatch(m); }}>
                        <strong>{m.name}</strong> {m.contact && ` – ${m.contact}`}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <input className="input" style={{ marginBottom: 8 }}
                placeholder="Contact number"
                value={form.contact}
                onFocus={() => setGuestMatches([])}
                onChange={(e) => setForm({ ...form, contact: e.target.value })}
              />
              <input
  className="input"
  style={{ marginBottom: 8 }}
  type="number"
  placeholder="Rate per day"
  value={form.rate}
  onChange={(e) => setForm({ ...form, rate: e.target.value })}
/>
              <input className="input"
                placeholder="Room"
                value={form.room}
                readOnly
              />

              {/* Upload / reused indicator */}
<div className="form-row" style={{ alignItems: "center", gap: 8 }}>
  <button
    type="button"
    className="btn"
    onClick={scanFromLocalScanner}
    disabled={scanFile?.reused}
    style={{
      background: scanFile ? "var(--success, #18a957)" : undefined,
      borderColor: scanFile ? "var(--success, #18a957)" : undefined,
      color: scanFile ? "#fff" : undefined,
      transition: "background 120ms ease, border-color 120ms ease, color 120ms ease"
    }}
  >
    {scanFile?.reused ? "ID Attached (Reused)" : scanFile ? "ID Attached" : "Upload ID Scan"}
  </button>

  <input
    type="file"
    id="scanInput"
    style={{ display: "none" }}
    accept="image/*,.pdf"
    onChange={(e) => setScanFile(e.target.files[0])}
  />

  {scanFile && (
    <span
      style={{
        fontSize: 12,
        padding: "4px 8px",
        borderRadius: 6,
        background: "rgba(24,169,87,0.12)",
        color: "var(--success, #0d7a40)",
        border: "1px solid rgba(24,169,87,0.25)"
      }}
    >
      {scanFile.reused ? `Reused previous ID: ${scanFile.name}` : scanFile.name}
    </span>
  )}
</div>


              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
  <button
    className="btn primary"
    type="submit"
    disabled={!form.room || !form.name}
  >
    Check-In
  </button>

  {/* Clear / Reset button */}
  <button
    className="btn ghost"
    type="button"
    onClick={() => {
      setForm({ name: "", contact: "", room: "" }); // clears inputs
      setSelectedRoom(null);                        // removes highlight from room
      setScanFile(null);                            // removes scan file info
      setGuestMatches([]);                          // closes dropdown
    }}
  >
    Clear
  </button>
</div>

{successMsg && (
  <div style={{ marginTop: 8, color: "green", fontWeight: "bold" }}>
    {successMsg}
  </div>
)}


              
            </form>
          </div>

          {/* Current Guests */}
          <div className="card" style={{ padding: 14, marginTop: 20 }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>Current Guests</div>
            {occupiedRooms.length === 0 && (<div>No rooms are occupied</div>)}
            {occupiedRooms.map((r, idx) => (
              <div key={idx} className="card" style={{ display: 'flex', justifyContent: 'space-between', padding: 10 }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{r.guest?.name}</div>
                  <div style={{ fontSize: 12 }}>Room {r.number} — Floor {String(r.number)[0]}</div>
                </div>
                <div style={{ fontSize: 12 }}>In: {new Date(r.guest?.checkIn).toLocaleDateString()}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CheckOut({ state, setState }) {
  const ymd = (d = new Date()) => d.toISOString().slice(0, 10);

  const [confirmMsg, setConfirmMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [checkoutList, setCheckoutList] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");

  // ---------- FILE HELPERS ----------
  async function findCheckinFile(base, checkInDate, room, name) {
    const safe = (s) => String(s).toLowerCase().trim();
    const norm = (s) => safe(s).replace(/[\s_]+/g, "_");

    const normalizedName = norm(name);
    const expectedFile = `checkin-${normalizedName}-${room}-${checkInDate}.json`;

    try {
      const dir = await ensurePath(base, ["Checkins", checkInDate]);
      const handle = await dir.getFileHandle(expectedFile);
      return { dir, fileName: expectedFile };
    } catch {}

    async function scanFolder(dateFolder) {
      const dir = await ensurePath(base, ["Checkins", dateFolder]);
      for await (const [entryName, handle] of dir.entries()) {
        if (handle.kind !== "file" || !entryName.endsWith(".json")) continue;

        const entryLower = entryName.toLowerCase();
        const isRoomOk = entryLower.includes(`-${String(room)}-${dateFolder}.json`);
        const isCheckinPrefix = entryLower.startsWith("checkin-");
        if (!(isRoomOk && isCheckinPrefix)) continue;

        const start = "checkin-".length;
        const end = entryLower.lastIndexOf(`-${String(room)}-${dateFolder}.json`);
        if (end <= start) continue;

        const nameSegment = entryLower.slice(start, end);
        if (norm(nameSegment) === normalizedName) {
          return { dir, fileName: entryName };
        }
      }
      throw new Error("not-found");
    }

    try {
      return await scanFolder(checkInDate);
    } catch {}

    const d = new Date(checkInDate + "T00:00:00");
    const dMinus = new Date(d); dMinus.setDate(d.getDate() - 1);
    const dPlus = new Date(d); dPlus.setDate(d.getDate() + 1);

    for (const df of [ymd(dMinus), ymd(dPlus)]) {
      try {
        return await scanFolder(df);
      } catch {}
    }

    throw new Error("Check-in file not found for this guest/room/date.");
  }

  async function getRateFromCheckin(checkInDate, room, name) {
    const base = await getBaseFolder();
    const { dir, fileName } = await findCheckinFile(base, checkInDate, room, name);
    const fileHandle = await dir.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    const data = JSON.parse(await file.text());
    return Number(data.rate) || 0;
  }

  async function getTotalPayments(checkInDate, room, name, checkOutDate) {
    let totalPayment = 0;
    try {
      const base = await getBaseFolder();
      const rentRoot = await ensurePath(base, ["RentCollections"]);

      for await (const [dateFolder, dateHandle] of rentRoot.entries()) {
        if (dateHandle.kind !== "directory") continue;
        if (dateFolder < checkInDate || dateFolder > checkOutDate) continue;

        for await (const [rentFileName, rentFileHandle] of dateHandle.entries()) {
          if (!rentFileName.endsWith(".json")) continue;
          const rentFile = await rentFileHandle.getFile();
          const rentData = JSON.parse(await rentFile.text());

          if (
            String(rentData.room) === String(room) &&
            rentData.name?.trim().toLowerCase() === name.trim().toLowerCase()
          ) {
            totalPayment += Number(rentData.amount) || 0;
          }
        }
      }
    } catch (err) {
      console.warn("Error reading RentCollections:", err);
    }
    return totalPayment;
  }

  async function moveCheckinToCheckout(checkInDate, room, name) {
    const base = await getBaseFolder();
    if (!base) throw new Error("Storage not connected");

    const { dir: checkinDir, fileName } = await findCheckinFile(base, checkInDate, room, name);
    const fileHandle = await checkinDir.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    const data = JSON.parse(await file.text());

    const now = new Date();
    data.checkOutDate = now.toLocaleDateString();
    data.checkOutTime = now.toLocaleTimeString();
    data.checkOutDateTime = now.toISOString();

    const totalPayment = await getTotalPayments(checkInDate, room, name, ymd(now));
    const days = Math.max(1, Math.ceil((now - new Date(data.checkIn)) / (1000 * 60 * 60 * 24)));
const totalRent = days * (Number(data.rate) || 0);

data.daysStayed = days;
data.totalRent = totalRent;
data.totalPaid = totalPayment;
data.paymentTallyStatus = totalPayment >= totalRent ? "tallied" : "not-tallied";


    const checkoutDir = await ensurePath(base, ["Checkouts", ymd(now)]);
    const safeName = String(name).replace(/[^\w\-]+/g, "_");
    const checkoutFileName = `checkout-${safeName}-${room}-${checkInDate}.json`;
    await writeJSON(checkoutDir, checkoutFileName, data);

    await checkinDir.removeEntry(fileName);
  }

  async function doCheckout(roomNumber) {
    try {
      const newState = { ...state, floors: { ...state.floors } };

      for (const fnum of Object.keys(newState.floors)) {
        const updated = [];
        for (const r of newState.floors[fnum]) {
          if (r.number !== roomNumber) {
            updated.push(r);
            continue;
          }

          const guest = r.guest;
          const checkIn = guest?.checkIn ? new Date(guest.checkIn) : new Date();

          await moveCheckinToCheckout(
            checkIn.toISOString().slice(0, 10),
            roomNumber,
            guest?.name || "Guest"
          );

          updated.push({ ...r, status: "free", guest: null });
        }
        newState.floors[fnum] = updated;
      }

      setState(newState);
      saveState(newState);
      showSuccess("✅ Check-Out completed successfully");
      loadCheckoutList(); // refresh right panel
    } catch (err) {
      console.error(err);
      showError(err?.message || "❌ Failed to complete check-out");
    }
  }

  // -------- NEW: LOAD ALL CHECKOUT FILES --------
  async function loadCheckoutList() {
    try {
      const base = await getBaseFolder();
      const checkoutRoot = await ensurePath(base, ["Checkouts"]);
      const all = [];

      for await (const [dateFolder, dateHandle] of checkoutRoot.entries()) {
        if (dateHandle.kind !== "directory") continue;
        for await (const [fileName, fileHandle] of dateHandle.entries()) {
          if (!fileName.endsWith(".json")) continue;
          const file = await fileHandle.getFile();
          const data = JSON.parse(await file.text());
          all.push(data);
        }
      }

      // Sort latest first
      all.sort((a, b) => new Date(b.checkOutDateTime) - new Date(a.checkOutDateTime));
      setCheckoutList(all);
    } catch (err) {
      console.error("Failed to load checkout list", err);
    }
  }

  function showSuccess(msg) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(""), 2500);
  }
  function showError(msg) {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(""), 2500);
  }

  const occupied = [];
  for (const f of Object.values(state.floors)) {
    for (const r of f) if (r.status === "occupied") occupied.push(r);
  }

  useEffect(() => {
    loadCheckoutList();
  }, []);

  const filteredCheckoutList = checkoutList.filter((c) => {
    const q = searchQuery.toLowerCase();
    return (
      c.name?.toLowerCase().includes(q) ||
      String(c.room || "").includes(q)
    );
  });

  return (
    <div style={{ display: "flex", gap: "16px" }}>
      {/* LEFT SIDE - OCCUPIED ROOMS */}
      <div style={{ flex: 1 }}>
        {successMsg && <ToastCard color="#16a34a">{successMsg}</ToastCard>}
        {errorMsg && <ToastCard color="#dc2626">{errorMsg}</ToastCard>}

        {confirmMsg && (
          <ModalCard>
            <h3>Confirm Check-Out</h3>
            <div style={{ marginBottom: 12, whiteSpace: "pre-line" }}>
              {confirmMsg.text}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn ghost" onClick={() => setConfirmMsg(null)}>
                Cancel
              </button>
              <button
                className="btn primary"
                onClick={() => {
                  setConfirmMsg(null);
                  doCheckout(confirmMsg.roomNumber);
                }}
              >
                Confirm
              </button>
            </div>
          </ModalCard>
        )}

        <h2>Check-Out</h2>
        {occupied.length === 0 && (
          <div style={{ color: "var(--muted)" }}>No occupied rooms</div>
        )}
        {occupied.map((r) => {
          const checkIn = r.guest?.checkIn
            ? new Date(r.guest.checkIn)
            : new Date();
          const now = new Date();
          const days = Math.max(
            1,
            Math.ceil((now - checkIn) / (1000 * 60 * 60 * 24))
          );

          return (
            <div
              key={r.number}
              className="card"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ fontWeight: 700 }}>{r.guest?.name}</div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>
                  Room {r.number}
                </div>
              </div>
              <button
                className="btn primary"
                onClick={async () => {
                  try {
                    const rate = await getRateFromCheckin(
                      checkIn.toISOString().slice(0, 10),
                      r.number,
                      r.guest?.name || "Guest"
                    );
                    const totalRent = days * rate;
                    const totalPayment = await getTotalPayments(
                      checkIn.toISOString().slice(0, 10),
                      r.number,
                      r.guest?.name || "Guest",
                      ymd(now)
                    );
                    const tallyStatus = totalPayment >= totalRent;
                    setConfirmMsg({
                      roomNumber: r.number,
                      text: `Check out room ${r.number}?
Guest: ${r.guest?.name || ""}
Days Stayed: ${days}
Total Rent: ₹${totalRent}
Total Payment: ₹${totalPayment}
Tally: ${tallyStatus ? "✅" : "❌"}`,
                    });
                  } catch (err) {
                    showError("Failed to load payment data");
                  }
                }}
              >
                Check-Out
              </button>
            </div>
          );
        })}
      </div>

      {/* RIGHT SIDE - CHECKED OUT LIST */}
      <div style={{ flex: 1 }}>
        <h2>Checked-Out Guests</h2>
        <input
          type="text"
          placeholder="Search by name or room..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            marginBottom: "8px",
            padding: "6px",
            width: "100%",
            border: "1px solid var(--muted)",
            borderRadius: "4px",
          }}
        />
        <div className="list">
          {filteredCheckoutList.length === 0 && (
            <div style={{ color: "var(--muted)" }}>No checkouts found</div>
          )}
          {filteredCheckoutList.map((c, i) => (
  <div key={i} className="card" style={{ padding: "8px" }}>
    <div style={{ fontWeight: 700 }}>{c.name}</div>
    <div style={{ fontSize: 12, color: "var(--muted)" }}>
      Room {c.room}
    </div>
    <div style={{ fontSize: 12 }}>
      Check-In: {c.checkInDate} {c.checkInTime}
    </div>
    <div style={{ fontSize: 12 }}>
      Check-Out: {c.checkOutDate} {c.checkOutTime}
    </div>
    <div style={{ fontSize: 12 }}>
      Days Stayed: {c.daysStayed}
    </div>
    <div style={{ fontSize: 12 }}>
      Rent: ₹{c.totalRent}
    </div>
    <div style={{ fontSize: 12 }}>
      Total Paid: ₹{c.totalPaid}
    </div>
    <div style={{ fontSize: 12 }}>
      Payment Status:{" "}
      {c.paymentTallyStatus === "tallied" ? "✅ Tallied" : "❌ Not Tallied"}
    </div>
  </div>
))}

        </div>
      </div>
    </div>
  );
}


// --- Save a reservation to the connected storage folder ---
async function persistReservation(res) {
  try {
    const base = await getBaseFolder();
    if (!base) {
      console.warn("Storage not connected; skipping save to disk");
      return;
    }
    const dir = await ensurePath(base, ['Reservations', res.date]);
    const safe = String(res.name).replace(/[^\w\-]+/g, '_'); // sanitize filename
    await writeJSON(dir, `reservation-${res.room}-${safe}.json`, res);
    console.log("Reservation saved to disk:", res);
  } catch (err) {
    console.error("Failed to save reservation to disk:", err);
  }
}

// --- Delete a reservation file from the connected storage folder ---
async function deleteReservationFile(date, room, name) {
  try {
    const base = await getBaseFolder();
    if (!base) {
      console.warn("Storage not connected; skipping disk deletion");
      return;
    }
    const dir = await ensurePath(base, ['Reservations', date]);
    const safe = String(name).replace(/[^\w\-]+/g, '_'); // same filename sanitization
    await dir.removeEntry(`reservation-${room}-${safe}.json`);
    console.log(`Deleted reservation file: reservation-${room}-${safe}.json`);
  } catch (err) {
    console.warn("Failed to delete reservation file from disk:", err);
  }
}

function Reservations({ state, setState }) {
  const [form, setForm] = useState({ name: '', place: '', room: '', date: '' });
  const [availableRooms, setAvailableRooms] = useState([]);
  const [search, setSearch] = useState(""); // 🔍 search query

  
  // --- Calculate available rooms for a given date ---
  const updateAvailableRooms = (selectedDate) => {
    if (!selectedDate) {
      setAvailableRooms([]);
      return;
    }

    const rooms = [];

    for (const floor of Object.values(state.floors)) {
      for (const room of floor) {
        const isOccupied = room.status === 'occupied';
        const isReservedThatDate = (state.reservations || []).some(
          r => r.room === room.number && r.date === selectedDate
        );

        if (!isOccupied && !isReservedThatDate) {
          rooms.push(room.number);
        }
      }
    }

    setAvailableRooms(rooms);
  };

  // Add new reservation
  const addReservation = (e) => {
    e.preventDefault();
    if (!form.name || !form.place || !form.room || !form.date) {
      return alert('Please fill all fields');
    }

    // ✅ Create the reservation object once
    const resObj = {
      name: form.name,
      place: form.place,
      room: Number(form.room),
      date: form.date,
    };

    // Push to new state
    const newState = { ...state };
    if (!newState.reservations) newState.reservations = [];
    newState.reservations.push(resObj);

    setForm({ name: '', place: '', room: '', date: '' });

    // Update React state + browser localStorage
    setState(newState);
    saveState(newState);

    // ✅ Save the same reservation object to disk
    persistReservation(resObj);
  };

  // Delete reservation with confirmation + disk removal
  const deleteReservation = async (i) => {
    const res = state.reservations[i];
    if (!res) return;

    const confirmed = window.confirm(
      `Delete reservation?\n\nGuest: ${res.name}\nPlace: ${res.place || ''}\nRoom: ${res.room}\nDate: ${res.date}`
    );
    if (!confirmed) return;

    const newState = { ...state };
    newState.reservations.splice(i, 1);
    setState(newState);
    saveState(newState);

    // ✅ Remove from disk
    await deleteReservationFile(res.date, res.room, res.name);
  };

  const navigate = useNavigate();

const checkInReservation = (res) => {
  navigate('/checkin', {
    state: {
      prefName: res.name,
      prefRoom: res.room
    }
  });
};

  // 🔍 Filter reservations based on search box
  const filteredReservations = (state.reservations || []).filter(r => {
    const q = search.toLowerCase();
    return (
      r.name.toLowerCase().includes(q) ||
      (r.place && r.place.toLowerCase().includes(q)) ||
      String(r.room).includes(q) ||
      r.date.includes(q)
    );
  });

  return (
    <div>
      <div>
          <div style={{ paddingBottom: 10}} className="title">Reservations</div>
        </div>
      <form style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }} onSubmit={addReservation}>
        <input
          className="input"
          placeholder="Guest name"
          value={form.name}
          onChange={e => setForm({ ...form, name: e.target.value })}
        />
        <input
          className="input"
          placeholder="Place"
          value={form.place}
          onChange={e => setForm({ ...form, place: e.target.value })}
        />

        {/* Select date first */}
        <input
          className="input"
          type="date"
          value={form.date}
          onChange={e => {
            setForm({ ...form, date: e.target.value, room: '' });
            updateAvailableRooms(e.target.value);
          }}
        />

        {/* Room dropdown */}
        <select
          className="input"
          value={form.room}
          onChange={e => setForm({ ...form, room: e.target.value })}
          disabled={!form.date}
        >
          <option value="">Select a free room</option>
          {availableRooms.map(num => (
            <option key={num} value={num}>
              {num} — Floor {String(num)[0]}
            </option>
          ))}
        </select>

        <button className="btn primary" type="submit">Add</button>
      </form>

       {/* 🔍 Search Box */}
      <input
        className="input"
        style={{ marginBottom: 12 }}
        placeholder="Search reservations by name, place, room, or date"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />


      <div className="list">
        {(!state.reservations || state.reservations.length === 0) && (
          <div style={{ color: 'var(--muted)' }}>No reservations</div>
        )}
        {state.reservations && state.reservations.map((r, i) => (
          <div key={i} className="card" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 700 }}>
                {r.name} - <span style={{ color: 'var(--muted)', fontWeight: 700 }}>{r.place}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                Room {r.room} — {r.date}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn primary" onClick={() => checkInReservation(r)}>Check-In</button>
              <button className="btn ghost" onClick={() => deleteReservation(i)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RentPayments() {
  const ADMIN_PASS = "1234";
  const ymd = (d = new Date()) => d.toISOString().slice(0, 10);

  const [all, setAll] = useState([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [mode, setMode] = useState("All");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [editingRow, setEditingRow] = useState(null);
  const [editDays, setEditDays] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editMode, setEditMode] = useState("Cash");

  const [askPass, setAskPass] = useState(false);
  const [passValue, setPassValue] = useState("");
  const [passError, setPassError] = useState("");
  const [pendingAction, setPendingAction] = useState(null);
  const [pendingRow, setPendingRow] = useState(null);

  const [confirmMsg, setConfirmMsg] = useState(null); // {text, onConfirm}
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const base = await getBaseFolder();
      if (!base) {
        showError("Storage not connected");
        setLoading(false);
        return;
      }
      const root = await ensurePath(base, ["RentCollections"]);
      const rows = [];
      for await (const [dateName, dateHandle] of root.entries()) {
        if (dateHandle.kind !== "directory") continue;
        for await (const [fileName, fileHandle] of dateHandle.entries()) {
          if (!fileName.endsWith(".json")) continue;
          const file = await fileHandle.getFile();
          const data = JSON.parse(await file.text());
          rows.push({ ...data, _dateFolder: dateName, _fileName: fileName, _createdTime: file.lastModified });
        }
      }
      rows.sort((a, b) => b._createdTime - a._createdTime);
      setAll(rows);
    } catch (err) {
      console.error(err);
      showError("Failed to load rent payments");
    }
    setLoading(false);
  }

  const filtered = useMemo(() => {
    let rows = all;
    if (from) rows = rows.filter(r => r._dateFolder >= from);
    if (to) rows = rows.filter(r => r._dateFolder <= to);
    if (mode !== "All") rows = rows.filter(r => (r.mode || "").toLowerCase() === mode.toLowerCase());
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      rows = rows.filter(r =>
        String(r.name || "").toLowerCase().includes(s) ||
        String(r.room || "").toLowerCase().includes(s) ||
        String(r._dateFolder || "").toLowerCase().includes(s)
      );
    }
    return rows;
  }, [all, from, to, mode, q]);

  const totalAmount = useMemo(() => filtered.reduce((sum, r) => sum + (Number(r.amount) || 0), 0), [filtered]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page]);

  useEffect(() => { setPage(1); }, [from, to, mode, q]);
  function clearFilters() { setFrom(""); setTo(""); setMode("All"); setQ(""); }

  function requestPassword(action, row) {
    setPendingAction(action);
    setPendingRow(row);
    setPassValue("");
    setPassError("");
    setAskPass(true);
  }

  function handlePasswordSubmit() {
    if (passValue !== ADMIN_PASS) {
      setPassError("Incorrect password");
      return;
    }
    setAskPass(false);
    if (pendingAction === "edit") {
      enterEditMode(pendingRow);
    } else if (pendingAction === "delete") {
      setConfirmMsg({
        text: "Are you sure you want to delete this entry?",
        onConfirm: () => deleteEntry(pendingRow)
      });
    }
  }
  function handlePasswordCancel() { setAskPass(false); }
  function enterEditMode(row) { setEditingRow(row._fileName); setEditDays(row.days || ""); setEditAmount(row.amount || ""); setEditMode(row.mode || "Cash"); }

  async function saveEdit(row) {
    setConfirmMsg({
      text: "Save changes to this rent entry?",
      onConfirm: async () => {
        try {
          const base = await getBaseFolder();
          const dir = await ensurePath(base, ["RentCollections", row._dateFolder]);
          const updated = { ...row, days: Number(editDays), amount: Number(editAmount), mode: editMode };
          await writeJSON(dir, row._fileName, updated);
          showSuccess("✅ Entry updated successfully");
          setEditingRow(null);
          loadAll();
        } catch (err) {
          console.error(err);
          showError("Failed to save entry");
        }
      }
    });
  }
  function cancelEdit() { setEditingRow(null); }

  async function deleteEntry(row) {
    try {
      const base = await getBaseFolder();
      const dir = await ensurePath(base, ["RentCollections", row._dateFolder]);
      await dir.removeEntry(row._fileName);
      showSuccess("🗑 Entry deleted successfully");
      loadAll();
    } catch (err) {
      console.error(err);
      showError("Failed to delete entry");
    }
  }

  // Popup helpers
  function showSuccess(msg) { setSuccessMsg(msg); setTimeout(() => setSuccessMsg(""), 2500); }
  function showError(msg) { setErrorMsg(msg); setTimeout(() => setErrorMsg(""), 2500); }

  return (
    <div>
      {/* Password Popup */}
      {askPass && (
        <ModalCard>
          <h3>Enter Password</h3>
          <input type="password" value={passValue} onChange={(e) => setPassValue(e.target.value)} maxLength={4}
            className="input" style={{ textAlign: "center", fontSize: 18 }} />
          {passError && <div style={{ color: "red", fontSize: 13 }}>{passError}</div>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="btn ghost" onClick={handlePasswordCancel}>Cancel</button>
            <button className="btn primary" onClick={handlePasswordSubmit}>Confirm</button>
          </div>
        </ModalCard>
      )}

      {/* Confirm Popup */}
      {confirmMsg && (
        <ModalCard>
          <h3>Confirmation</h3>
          <div style={{ marginBottom: 12 }}>{confirmMsg.text}</div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="btn ghost" onClick={() => setConfirmMsg(null)}>Cancel</button>
            <button className="btn danger" onClick={() => { setConfirmMsg(null); confirmMsg.onConfirm(); }}>Yes</button>
          </div>
        </ModalCard>
      )}

      {/* Toasts */}
      {successMsg && <ToastCard color="#16a34a">{successMsg}</ToastCard>}
      {errorMsg && <ToastCard color="#dc2626">{errorMsg}</ToastCard>}

      {/* Header */}
      <div className="header-row" style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <div className="title">Rent Payments</div>
          <div style={{ color: "var(--muted)", marginTop: 4 }}>View, filter, and total all rent collections</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={loadAll}>Refresh</button>
        </div>
      </div>

      {/* Tools */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <input type="date" className="input" value={from} onChange={e => setFrom(e.target.value)} />
        <input type="date" className="input" value={to} onChange={e => setTo(e.target.value)} />
        <select className="input" value={mode} onChange={e => setMode(e.target.value)}>
          <option value="All">All Modes</option>
          <option value="Cash">Cash</option>
          <option value="GPay">GPay</option>
        </select>
        <input className="input" placeholder="Search by guest/room/date" value={q} onChange={e => setQ(e.target.value)} />
        <button className="btn ghost" onClick={clearFilters}>Clear Filters</button>
        <div style={{ marginLeft: "auto", fontWeight: 700 }}>Total: ₹{totalAmount}</div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 12 }}>
        {loading ? <div>Loading...</div> : filtered.length === 0 ? (
          <div style={{ color: "var(--muted)" }}>No records match filters</div>
        ) : (
          <>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f5f5f5" }}>
                  <th>Date</th><th>Guest</th><th>Room</th><th>Days</th><th>Amount</th><th>Mode</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r, idx) => (
                  <tr key={idx} style={{ borderBottom: "1px solid #eee" }}>
                    <td>{r._dateFolder}</td>
                    <td>{r.name}</td>
                    <td>{r.room}</td>
                    {editingRow === r._fileName ? (
                      <>
                        <td><input type="number" value={editDays} onChange={(e) => setEditDays(e.target.value)} style={{ width: 60 }} /></td>
                        <td><input type="number" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} style={{ width: 80 }} /></td>
                        <td>
                          <select value={editMode} onChange={(e) => setEditMode(e.target.value)}>
                            <option value="Cash">Cash</option>
                            <option value="GPay">GPay</option>
                          </select>
                        </td>
                        <td style={{ display: "flex", gap: 6 }}>
                          <button className="btn small" onClick={() => saveEdit(r)}>💾 Save</button>
                          <button className="btn small ghost" onClick={cancelEdit}>✖ Cancel</button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td>{r.days || "-"}</td>
                        <td>₹{r.amount}</td>
                        <td>{r.mode}</td>
                        <td style={{ display: "flex", gap: 6 }}>
                          <button className="btn small" onClick={() => requestPassword("edit", r)}>✏ Edit</button>
                          <button className="btn small danger" onClick={() => requestPassword("delete", r)}>🗑 Delete</button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pager */}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
              <div style={{ color: "var(--muted)" }}>
                Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, filtered.length)} of {filtered.length}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</button>
                <button className="btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Reusable modal card
function ModalCard({ children }) {
  return (
    <div style={{
      position: "fixed", top: 0, left: 0, width: "100%", height: "100%",
      background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000
    }}>
      <div style={{
        background: "#fff", padding: 20, borderRadius: 8,
        boxShadow: "0 4px 15px rgba(0,0,0,0.3)", width: 300
      }}>
        {children}
      </div>
    </div>
  );
}

// Reusable toast
function ToastCard({ children, color }) {
  return (
    <div style={{
      position: "fixed", bottom: "30px", right: "30px", background: "#fff",
      borderLeft: `6px solid ${color}`, padding: "12px 20px", borderRadius: "8px",
      boxShadow: "0 4px 15px rgba(0,0,0,0.2)", fontWeight: 600, color: "#111", zIndex: 2000
    }}>
      {children}
    </div>
  );
}
function ExpensePayments() {
  const ADMIN_PASS = "1234"; // Change your password

  const [all, setAll] = useState([]); 
  const [loading, setLoading] = useState(true);

  // Filters
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");

  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Modals and toasts
  const [askPass, setAskPass] = useState(false);
  const [askConfirm, setAskConfirm] = useState(false);
  const [passValue, setPassValue] = useState("");
  const [passError, setPassError] = useState("");
  const [pendingRow, setPendingRow] = useState(null);

  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const base = await getBaseFolder();
      if (!base) {
        showError("Storage not connected");
        setLoading(false);
        return;
      }
      const root = await ensurePath(base, ["Expenses"]);
      const rows = [];
      for await (const [dateName, dateHandle] of root.entries()) {
        if (dateHandle.kind !== "directory") continue;
        for await (const [fileName, fileHandle] of dateHandle.entries()) {
          if (!fileName.endsWith(".json")) continue;
          const file = await fileHandle.getFile();
          const data = JSON.parse(await file.text());
          rows.push({
            ...data,
            _dateFolder: dateName,
            _fileName: fileName,
            _createdTime: file.lastModified
          });
        }
      }
      rows.sort((a, b) => b._createdTime - a._createdTime);
      setAll(rows);
    } catch (err) {
      console.error("Failed to load expenses", err);
      showError("Failed to load expenses");
    }
    setLoading(false);
  }

  // Filter
  const filtered = useMemo(() => {
    let rows = all;
    if (from) rows = rows.filter(r => r._dateFolder >= from);
    if (to) rows = rows.filter(r => r._dateFolder <= to);
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      rows = rows.filter(
        r =>
          String(r.description || "").toLowerCase().includes(s) ||
          String(r._dateFolder || "").toLowerCase().includes(s)
      );
    }
    return rows;
  }, [all, from, to, q]);

  const totalAmount = useMemo(() => filtered.reduce((sum, r) => sum + (Number(r.amount) || 0), 0), [filtered]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page]);

  useEffect(() => { setPage(1); }, [from, to, q]);
  function clearFilters() { setFrom(""); setTo(""); setQ(""); }

  // Request password before delete
  function requestDelete(row) {
    setPendingRow(row);
    setPassValue("");
    setPassError("");
    setAskPass(true);
  }

  function handlePasswordSubmit() {
    if (passValue !== ADMIN_PASS) {
      setPassError("Incorrect password");
      return;
    }
    setAskPass(false);
    setAskConfirm(true); // show confirmation card
  }
  function handlePasswordCancel() { setAskPass(false); }

  async function performDelete() {
    try {
      const base = await getBaseFolder();
      const dir = await ensurePath(base, ["Expenses", pendingRow._dateFolder]);
      await dir.removeEntry(pendingRow._fileName);
      showSuccess("🗑 Expense deleted successfully");
      loadAll();
    } catch (err) {
      console.error(err);
      showError("❌ Failed to delete expense");
    }
  }

  // Toast helpers
  function showSuccess(msg) { setSuccessMsg(msg); setTimeout(() => setSuccessMsg(""), 2500); }
  function showError(msg) { setErrorMsg(msg); setTimeout(() => setErrorMsg(""), 2500); }

  return (
    <div>
      {/* Password Popup */}
      {askPass && (
        <ModalCard>
          <h3>Enter Password</h3>
          <input
            type="password"
            value={passValue}
            onChange={(e) => setPassValue(e.target.value)}
            maxLength={4}
            className="input"
            style={{ textAlign: "center", fontSize: 18 }}
          />
          {passError && <div style={{ color: "red", fontSize: 13 }}>{passError}</div>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="btn ghost" onClick={handlePasswordCancel}>Cancel</button>
            <button className="btn primary" onClick={handlePasswordSubmit}>Confirm</button>
          </div>
        </ModalCard>
      )}

      {/* Confirm Deletion Popup */}
      {askConfirm && (
        <ModalCard>
          <h3>Confirm Deletion</h3>
          <div style={{ marginBottom: 16 }}>Are you sure you want to delete this expense entry?</div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="btn ghost" onClick={() => setAskConfirm(false)}>Cancel</button>
            <button className="btn danger" onClick={() => { setAskConfirm(false); performDelete(); }}>🗑 Delete</button>
          </div>
        </ModalCard>
      )}

      {/* Toast popups */}
      {successMsg && <ToastCard color="#16a34a">{successMsg}</ToastCard>}
      {errorMsg && <ToastCard color="#dc2626">{errorMsg}</ToastCard>}

      {/* Header */}
      <div className="header-row" style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <div>
          <div className="title">Expense Payments</div>
          <div style={{ color: "var(--muted)", marginTop: 4 }}>View, filter, and total all expenses</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn" onClick={loadAll}>Refresh</button>
        </div>
      </div>

      {/* Tools */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input type="date" className="input" value={from} onChange={e => setFrom(e.target.value)} />
        <input type="date" className="input" value={to} onChange={e => setTo(e.target.value)} />
        <input className="input" placeholder="Search description/date" value={q} onChange={e => setQ(e.target.value)} />
        <button className="btn ghost" onClick={clearFilters}>Clear Filters</button>
        <div style={{ marginLeft: "auto", fontWeight: 700 }}>Total: ₹{totalAmount}</div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 12, marginTop: 10 }}>
        {loading ? (
          <div>Loading...</div>
        ) : filtered.length === 0 ? (
          <div style={{ color: "var(--muted)" }}>No records match filters</div>
        ) : (
          <>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f5f5f5" }}>
                  <th style={{ textAlign: "left", padding: 6 }}>Date</th>
                  <th style={{ textAlign: "left", padding: 6 }}>Description</th>
                  <th style={{ textAlign: "left", padding: 6 }}>Amount</th>
                  <th style={{ padding: 6 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r, idx) => (
                  <tr key={idx} style={{ borderBottom: "1px solid #eee" }}>
                    <td style={{ padding: 6 }}>{r._dateFolder}</td>
                    <td style={{ padding: 6 }}>{r.description}</td>
                    <td style={{ padding: 6 }}>₹{r.amount}</td>
                    <td style={{ padding: 6 }}>
                      <button className="btn small danger" onClick={() => requestDelete(r)}>🗑 Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pager */}
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
              <div style={{ color: "var(--muted)" }}>
                Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, filtered.length)} of {filtered.length}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</button>
                <button className="btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}



function Accounts({ state }) {
  const navigate = useNavigate();
const [rentForm, setRentForm] = useState({
    name: "",
    room: "",
    days: "",
    amount: "",
    mode: "Cash",
  });

  const [expForm, setExpForm] = useState({ desc: "", amount: "" });
  const [rentMsg, setRentMsg] = useState("");
const [expMsg, setExpMsg] = useState("");
  const [listType, setListType] = useState(null); // "rent" | "expense" | null
  const [listItems, setListItems] = useState([]);

  // 🔹 Compute occupied rooms
  const occupiedRooms = [];
  Object.keys(state.floors).forEach(floorNum => {
    state.floors[floorNum].forEach(room => {
      if (room.status === "occupied" && room.guest) {
        occupiedRooms.push({ number: room.number, guestName: room.guest.name });
      }
    });
  });

  const handleRoomChange = (roomNo) => {
    const selected = occupiedRooms.find(r => String(r.number) === roomNo);
    setRentForm(f => ({
      ...f,
      room: roomNo,
      name: selected ? selected.guestName : ""
    }));
  };

  

  const submitRent = async (e) => {
  e.preventDefault();

  if (!rentForm.room || !rentForm.name || !rentForm.days || !rentForm.amount || !rentForm.mode) {
    alert("Please fill all Rent Collection fields.");
    return;
  }

  try {
    const base = await getBaseFolder();
    if (!base) return alert("Storage not connected");

    setRentForm({ name: "", room: "", days: "", amount: "", mode: "Cash" });
    setRentMsg("✅ Rent entry saved successfully.");
    
    setTimeout(() => setRentMsg(""), 3000);

    const today = ymd(new Date());
    const rentDir = await ensurePath(base, ["RentCollections", today]);

    const fileName = `rent-${rentForm.name.replace(/[^\w\-]+/g, "_")}-${rentForm.room}-${Date.now()}.json`;

    const rentData = {
      ...rentForm,
      date: new Date().toISOString(),
    };

    await writeJSON(rentDir, fileName, rentData);
    // 🔹 Refresh today's lists instantly
    await loadTodayData();

    
  } catch (err) {
    console.warn("Failed to save rent", err);
    alert("Failed to save rent.");
  }
};


  const submitExpense = async (e) => {
  e.preventDefault();

  if (!expForm.desc || !expForm.amount) {
    alert("Please fill all Expense fields.");
    return;
  }

  const amountNum = Number(expForm.amount);
  if (Number.isNaN(amountNum) || amountNum <= 0) {
    alert("Enter a valid amount");
    return;
  }

  try {
    const base = await getBaseFolder();
    if (!base) {
      alert("Storage not connected");
      return;
    }

    setExpForm({ desc: "", amount: "" });
    setExpMsg("✅ Expense entry saved successfully.");
    
    setTimeout(() => setExpMsg(""), 3000);

    const today = ymd(new Date());
    const expDir = await ensurePath(base, ["Expenses", today]);

    const safeDesc = String(expForm.desc).replace(/[^\w\-]+/g, "_");
    const fileName = `expense-${safeDesc}-${Date.now()}.json`;

    const expenseData = {
      description: expForm.desc,
      amount: amountNum,
      date: new Date().toISOString(),
    };

    await writeJSON(expDir, fileName, expenseData);
    // 🔹 Refresh today's lists instantly
    await loadTodayData();
    
  } catch (err) {
    console.warn("Failed to save expense", err);
    alert("Failed to save expense.");
  }
};

const [todayRent, setTodayRent] = useState([]);
const [todayExpenses, setTodayExpenses] = useState([]);

useEffect(() => {
  loadTodayData();
}, []);

async function loadTodayData() {
  try {
    const base = await getBaseFolder();
    if (!base) return;
    const today = ymd(new Date());

    // Rent
    const rentDir = await ensurePath(base, ["RentCollections", today]);
    const rentArr = [];
    for await (const [name, handle] of rentDir.entries()) {
      if (handle.kind === "file" && name.endsWith(".json")) {
        const file = await handle.getFile();
        const data = JSON.parse(await file.text());
        data._createdTime = file.lastModified; // ✅ store creation time
        rentArr.push(data);
      }
    }
    // ✅ Sort newest first
    rentArr.sort((a, b) => b._createdTime - a._createdTime);
    setTodayRent(rentArr);

    // Expenses
    const expDir = await ensurePath(base, ["Expenses", today]);
    const expArr = [];
    for await (const [name, handle] of expDir.entries()) {
      if (handle.kind === "file" && name.endsWith(".json")) {
        const file = await handle.getFile();
        const data = JSON.parse(await file.text());
        data._createdTime = file.lastModified; // ✅ store creation time
        expArr.push(data);
      }
    }
    // ✅ Sort newest first
    expArr.sort((a, b) => b._createdTime - a._createdTime);
    setTodayExpenses(expArr);

  } catch (err) {
    console.error("Failed to load today's collections", err);
  }
}



  return (
    <div>
      {/* Header */}
<div className="header-row" style={{
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 12
}}>
  <div className="title">Accounts</div>

  <div style={{ display: "flex", gap: 10 }}>
    <button
      onClick={() => navigate("/rent-payments")}
      className="pill"
    >
      📑 Show All Rent Payments
    </button>

    <button
      onClick={() => navigate("/expense-payments")}
      className="pill"
    >
      💰 Show All Expenses
    </button>
  </div>
</div>


      <div
  style={{
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: 20,
    marginBottom: 20,alignItems: "start" 

  }}
>
  {/* Rent Collection */}
  <div className="card" style={{ padding: 16 }}>
    <h3 style={{ color: "var(--deep)", marginBottom: 10,fontWeight: 900 }}>Rent Collection</h3>
    <form onSubmit={submitRent} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <select className="input" value={rentForm.room} onChange={(e) => handleRoomChange(e.target.value)}>
        <option value="">Select Occupied Room</option>
        {occupiedRooms.map(r => (
          <option key={r.number} value={r.number}>
            Room {r.number} — {r.guestName}
          </option>
        ))}
      </select>
      <input className="input" placeholder="Guest Name" value={rentForm.name} readOnly />

      <input type="number" className="input" placeholder="Number of Days"
        value={rentForm.days || ""} min="1"
        onChange={(e) => setRentForm({ ...rentForm, days: e.target.value })} />

      <input type="number" className="input" placeholder="Amount"
        value={rentForm.amount}
        onChange={(e) => setRentForm({ ...rentForm, amount: e.target.value })} />

      <select className="input" value={rentForm.mode}
        onChange={(e) => setRentForm({ ...rentForm, mode: e.target.value })}>
        <option value="Cash">Cash</option>
        <option value="GPay">GPay</option>
      </select>

      <button className="btn primary" type="submit">Submit Rent</button>
    </form>
    {rentMsg && <div style={{ marginTop: 10, color: "green", fontWeight: "bold" }}>{rentMsg}</div>}
  </div>

  {/* Expenses */}
  <div className="card" style={{ padding: 16,}}>
    <h3 style={{ color: "var(--deep)", marginBottom: 10,fontWeight: 900 }}>Expenses</h3>
    <form onSubmit={submitExpense} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <input className="input" placeholder="Expense Description" value={expForm.desc}
        onChange={(e) => setExpForm({ ...expForm, desc: e.target.value })} />

      <input type="number" className="input" placeholder="Amount"
        value={expForm.amount}
        onChange={(e) => setExpForm({ ...expForm, amount: e.target.value })} />

      <button className="btn primary" type="submit">Submit Expense</button>
    </form>
    {expMsg && <div style={{ marginTop: 10, color: "green", fontWeight: "bold" }}>{expMsg}</div>}
  </div>
</div>

{/* Today's Collections & Expenses */}
<div
  style={{
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: 20,
    marginTop: 10,
    alignItems: "start" 
  }}
>
  {/* Today's Rent */}
  <div className="card" style={{ padding: 16 }}>
    <h3 style={{ color: "var(--deep)", marginBottom: 10,fontWeight: 900 }}>Today's Rent Collections</h3>
    {todayRent.length === 0 ? (
      <div style={{ color: "var(--muted)" }}>No rent collected today</div>
    ) : (
      <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
        {todayRent.map((r, idx) => (
          <li
            key={idx}
            style={{
              padding: "6px 0",
              borderBottom: "1px solid #f0f0f0",
              display: "flex",
              justifyContent: "space-between"
            }}
          >
            <div>
              Room {r.room} — <strong>{r.name}</strong>
            </div>
            <div style={{ fontWeight: 600 }}>{r.days} Day - ₹{r.amount}</div>
          </li>
        ))}
      </ul>
    )}
  </div>

  {/* Today's Expenses */}
  <div className="card" style={{ padding: 16 }}>
    <h3 style={{ color: "var(--deep)", marginBottom: 10,fontWeight: 900 }}>Today's Expenses</h3>
    {todayExpenses.length === 0 ? (
      <div style={{ color: "var(--muted)" }}>No expenses today</div>
    ) : (
      <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
        {todayExpenses.map((e, idx) => (
          <li
            key={idx}
            style={{
              padding: "6px 0",
              borderBottom: "1px solid #f0f0f0",
              display: "flex",
              justifyContent: "space-between"
            }}
          >
            <div>{e.description}</div>
            <div style={{ fontWeight: 600 }}>₹{e.amount}</div>
          </li>
        ))}
      </ul>
    )}
  </div>
</div>
      
    </div>
  );
}

// Helper to get YYYY-MM-DD string

function Analysis() {



  const [range, setRange] = useState({ from: "", to: "" });
  const [loading, setLoading] = useState(true);

  const [incomeTotal, setIncomeTotal] = useState(0);
  const [expenseTotal, setExpenseTotal] = useState(0);
  const [byMode, setByMode] = useState({ Cash: 0, GPay: 0 });
  const [daily, setDaily] = useState({});
  const [byRoom, setByRoom] = useState({});
  const [todayRent, setTodayRent] = useState([]);
  const [todayExpenses, setTodayExpenses] = useState([]);
  
// --- Helper to get YYYY-MM-DD string ---
const ymd = (d = new Date()) => d.toISOString().slice(0, 10);

  const today = ymd();

  // --- Helper to normalise folder names ---
function normalizeFolderDate(name) {
  // Already in YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(name)) return name;
  // Format DD-MM-YYYY
  if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(name)) {
    const [d, m, y] = name.split("-");
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}


// --- Get Today's rent collection ---
async function getTodayRent(rentRoot, today) {
  const list = [];
  for await (const [dateName, dateHandle] of rentRoot.entries()) {
    if (dateHandle.kind !== "directory") continue;
    const normalized = normalizeFolderDate(dateName);
    if (normalized !== today) continue;

    for await (const [fileName, fileHandle] of dateHandle.entries()) {
      if (!fileName.endsWith(".json")) continue;
      const file = await fileHandle.getFile();
      const data = JSON.parse(await file.text());
      list.push(data);
    }
  }
  return list;
}

// --- Get Today's expenses ---
async function getTodayExpenses(expRoot, today) {
  const list = [];
  for await (const [dateName, dateHandle] of expRoot.entries()) {
    if (dateHandle.kind !== "directory") continue;
    const normalized = normalizeFolderDate(dateName);
    if (normalized !== today) continue;

    for await (const [fileName, fileHandle] of dateHandle.entries()) {
      if (!fileName.endsWith(".json")) continue;
      const file = await fileHandle.getFile();
      const data = JSON.parse(await file.text());
      list.push(data);
    }
  }
  return list;
}

  const loadData = async () => {
    setLoading(true);
    try {
      const base = await getBaseFolder();
      if (!base) {
        alert("Storage not connected");
        setLoading(false);
        return;
      }

      const rentRoot = await ensurePath(base, ["RentCollections"]);
      const expRoot = await ensurePath(base, ["Expenses"]);

      // ✅ Get today's data separately
      const tRent = await getTodayRent(rentRoot, today);
      const tExp = await getTodayExpenses(expRoot, today);

      let inc = 0;
      let exp = 0;
      const modeAgg = { Cash: 0, GPay: 0 };
      const dayAgg = {};
      const roomAgg = {};

      const inRange = (dateName) => {
        if (range.from && dateName < range.from) return false;
        if (range.to && dateName > range.to) return false;
        return true;
      };

      // --- Rent loop ---
      for await (const [dateName, dateHandle] of rentRoot.entries()) {
        if (dateHandle.kind !== "directory") continue;
        if (!inRange(dateName)) continue;

        for await (const [fileName, fileHandle] of dateHandle.entries()) {
          if (!fileName.endsWith(".json")) continue;
          const file = await fileHandle.getFile();
          const data = JSON.parse(await file.text());
          const amount = Number(data.amount) || 0;
          inc += amount;

          if (data.mode && modeAgg[data.mode] !== undefined) {
            modeAgg[data.mode] += amount;
          }

          if (!dayAgg[dateName]) dayAgg[dateName] = { income: 0, expense: 0 };
          dayAgg[dateName].income += amount;

          const roomKey = String(data.room || "");
          if (roomKey) roomAgg[roomKey] = (roomAgg[roomKey] || 0) + amount;
        }
      }

      // --- Expenses loop ---
      for await (const [dateName, dateHandle] of expRoot.entries()) {
        if (dateHandle.kind !== "directory") continue;
        if (!inRange(dateName)) continue;

        for await (const [fileName, fileHandle] of dateHandle.entries()) {
          if (!fileName.endsWith(".json")) continue;
          const file = await fileHandle.getFile();
          const data = JSON.parse(await file.text());
          const amount = Number(data.amount) || 0;
          exp += amount;

          if (!dayAgg[dateName]) dayAgg[dateName] = { income: 0, expense: 0 };
          dayAgg[dateName].expense += amount;
        }
      }

      setIncomeTotal(inc);
      setExpenseTotal(exp);
      setByMode(modeAgg);
      setDaily(dayAgg);
      setByRoom(roomAgg);
      setTodayRent(tRent);
      setTodayExpenses(tExp);
    } catch (err) {
      console.error("Analysis load failed", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const net = useMemo(() => incomeTotal - expenseTotal, [incomeTotal, expenseTotal]);
  const sortedDates = useMemo(() => Object.keys(daily).sort(), [daily]);

  const lineData = useMemo(() => ({
    labels: sortedDates,
    datasets: [
      {
        label: "Income",
        data: sortedDates.map(d => daily[d].income),
        borderColor: "#16a34a",
        backgroundColor: "rgba(22,163,74,0.15)",
        fill: true,
        tension: 0.3,
        pointRadius: 2
      },
      {
        label: "Expense",
        data: sortedDates.map(d => daily[d].expense),
        borderColor: "#dc2626",
        backgroundColor: "rgba(220,38,38,0.12)",
        fill: true,
        tension: 0.3,
        pointRadius: 2
      }
    ]
  }), [daily, sortedDates]);

  const lineOptions = {
    responsive: true,
    plugins: {
      legend: { position: "top" },
      tooltip: { mode: "index", intersect: false }
    },
    interaction: { mode: "nearest", axis: "x", intersect: false },
    scales: {
      x: { ticks: { autoSkip: true, maxTicksLimit: 10 } },
      y: { beginAtZero: true }
    }
  };

  const donutData = useMemo(() => ({
    labels: ["Cash", "GPay"],
    datasets: [{
      data: [byMode.Cash || 0, byMode.GPay || 0],
      backgroundColor: ["#1d4ed8", "#0ea5e9"],
      borderWidth: 0
    }]
  }), [byMode]);

  const donutOptions = {
    responsive: true,
    plugins: { legend: { position: "bottom" } },
    cutout: "55%"
  };

  const topRooms = useMemo(() => {
    const entries = Object.entries(byRoom).sort((a, b) => b[1] - a[1]).slice(0, 5);
    return {
      labels: entries.map(([room]) => `Room ${room}`),
      values: entries.map(([, amt]) => amt)
    };
  }, [byRoom]);

  const barData = {
    labels: topRooms.labels,
    datasets: [{
      label: "Rent Collected",
      data: topRooms.values,
      backgroundColor: "rgba(99,102,241,0.3)",
      borderColor: "#6366f1",
      borderWidth: 1,
      borderRadius: 6,
      maxBarThickness: 36
    }]
  };

  const barOptions = {
    responsive: true,
    plugins: { legend: { display: false }, tooltip: { intersect: false } },
    scales: {
      x: { grid: { display: false } },
      y: { beginAtZero: true }
    }
  };

  return (
    <div>
      <div className="title" style={{ marginBottom: 12 }}>Hotel Analysis</div>

      {/* Date range filter */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          type="date"
          value={range.from}
          onChange={e => setRange({ ...range, from: e.target.value })}
          className="input"
        />
        <input
          type="date"
          value={range.to}
          onChange={e => setRange({ ...range, to: e.target.value })}
          className="input"
        />
        <button className="btn" onClick={loadData}>Filter</button>
      </div>

      {loading ? (
        <div>Loading...</div>
      ) : (
        <>
          {/* KPI Summary */}
          <div className="card" style={{ padding: 14, marginBottom: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
              <KPI title="Total Income" value={incomeTotal} color="#16a34a" />
              <KPI title="Total Expense" value={expenseTotal} color="#dc2626" />
              <KPI title="Net" value={net} color={net >= 0 ? "#16a34a" : "#dc2626"} />
            </div>
          </div>

          {/* Charts row */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
            <div className="card" style={{ padding: 14 }}>
              <h3 style={{ marginTop: 0 }}>Income vs Expense</h3>
              <div style={{ height: 280 }}>
                <Line data={lineData} options={lineOptions} />
              </div>
            </div>

            <div className="card" style={{ padding: 14 }}>
              <h3 style={{ marginTop: 0 }}>Income by Payment Mode</h3>
              <div style={{ height: 280, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Doughnut data={donutData} options={donutOptions} />
              </div>
            </div>
          </div>

          {/* Bar + Today lists */}
          <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: 12, marginTop: 12 }}>
            <div className="card" style={{ padding: 14 }}>
              <h3 style={{ marginTop: 0 }}>Top Rooms by Rent</h3>
              <div style={{ height: 280 }}>
                <Bar data={barData} options={barOptions} />
              </div>
            </div>

            <div className="card" style={{ padding: 14 }}>
              <h3 style={{ marginTop: 0 }}>Today</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Rent Collections</div>
                  {todayRent.length === 0 && <div style={{ color: "var(--muted)" }}>No rent collected today</div>}
                  {todayRent.map((r, i) => (
                    <div key={i} className="card" style={{ padding: 8, display: "flex", justifyContent: "space-between" }}>
                      <div>Room {r.room} — {r.name}</div>
                      <div>₹{r.amount} via {r.mode}</div>
                    </div>
                  ))}
                </div>
                <div>
                  <div style={{ fontWeight: 700, margin: "8px 0 6px" }}>Expenses</div>
                  {todayExpenses.length === 0 && <div style={{ color: "var(--muted)" }}>No expenses today</div>}
                  {todayExpenses.map((e, i) => (
                    <div key={i} className="card" style={{ padding: 8, display: "flex", justifyContent: "space-between" }}>
                      <div>{e.description}</div>
                      <div>₹{e.amount}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Lightweight KPI with a subtle count-up effect
function KPI({ title, value, color }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const duration = 500;
    const from = display;
    const to = value;
    let raf;
    const tick = (t) => {
      const p = Math.min(1, (t - start) / duration);
      setDisplay(Math.round(from + (to - from) * p));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <div className="card stat-card-animate" style={{ padding: 12 }}>
      <div style={{ fontSize: 12, color: "var(--muted)" }}>{title}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color }}>{display}</div>
    </div>
  );
}

// ---------- App ----------
export default function App() {
  const [state, setState] = useState(loadState());
  useEffect(() => { saveState(state); }, [state]);

  useEffect(() => {
  (async () => {
    const base = await getBaseFolder();
    if (base) {
      const synced = await hydrateStateFromDisk(state);
      if (synced) setState(synced);
    }
  })();
}, []);
  return (
    <Router>
      <div className="app-shell">
        <Sidebar />
        <div className="main">
          <Routes>
            <Route path="/" element={<Dashboard state={state} />} />
            <Route path="/floors" element={<FloorsContainer state={state} setState={setState} />} />
            <Route path="/floors/:floor" element={<FloorsContainer state={state} setState={setState} />} />
            <Route path="/checkin" element={<CheckIn state={state} setState={setState} locationState={{}} />} />
            <Route path="/checkout" element={<CheckOut state={state} setState={setState} />} />
            <Route path="/reservations" element={<Reservations state={state} setState={setState} />} />
            <Route path="/storage" element={<StorageSetup setState={setState} state={state} />} />
            <Route path="/accounts" element={<Accounts state={state} setState={setState} />} />
            <Route path="/analysis" element={<Analysis />} />
            <Route path="/rent-payments" element={<RentPayments />} /> 
            <Route path="/expense-payments" element={<ExpensePayments />} /> 
          </Routes>
        </div>
      </div>
    </Router>
  );
}
