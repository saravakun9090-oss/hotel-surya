import React, { useEffect,useRef, useState, useMemo } from 'react';
import { Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import { useSearchParams } from "react-router-dom";

import { getBaseFolder, ensurePath, writeJSON, writeFile, readJSONFile } from './utils/fsAccess';
import { monthFolder, displayDate, ymd } from './utils/dateUtils';
import StorageSetup from './components/StorageSetup';
import LiveUpdate from './LiveUpdate';
import { hydrateStateFromDisk } from './services/diskSync';
import { Line, Doughnut, Bar } from "react-chartjs-2";
import { motion } from "framer-motion";



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
  
  return { floors, guests: [] };
};

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) { const s = generateDefault(); localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); return s; }
  try { return JSON.parse(raw); } catch (e) { const s = generateDefault(); localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); return s; }
}
function saveState(state) { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }



const Sidebar = () => {
  const location = useLocation();

  const navItems = [
    { to: "/", label: "Dashboard" },
    { to: "/checkin", label: "Check-in" },
    { to: "/checkout", label: "Check-out" },
    { to: "/reservations", label: "Reservations" },
    { to: "/storage", label: "Storage" },
    { to: "/accounts", label: "Accounts" },
    { to: "/analysis", label: "Analysis" },
  ];

  return (
    <div
      className="w-64 h-screen flex flex-col p-4 text-white border-r border-white/10"
      style={{ backgroundColor: "#344239" }} // Sidebar base color
    >
      {/* Logo */}
      <div className="mb-6">
        <h1 className="text-lg font-bold">🏨 HOTEL SURYA</h1>
        <p className="text-xs opacity-80">
          Manage check-ins, checkouts & reservations
        </p>
      </div>

      {/* Nav */}
      <nav className="relative flex flex-col space-y-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.to;

          return (
            <Link
              key={item.to}
              to={item.to}
              className="relative px-4 py-2 rounded-lg font-medium transition-colors"
            >
              {isActive && (
                <motion.div
                  layoutId="activeBackground"
                  className="absolute inset-0 rounded-lg 
                             bg-white/10 backdrop-blur-md 
                             border border-white/20 
                             shadow-[inset_2px_2px_6px_rgba(255,255,255,0.25),inset_-2px_-2px_6px_rgba(0,0,0,0.25),0_4px_12px_rgba(0,0,0,0.4)] 
                             before:absolute before:inset-0 before:rounded-lg 
                             before:bg-gradient-to-tr before:from-white/20 before:to-transparent"
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
              )}
              <span className="relative z-10">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
};



const StatCard = ({ title, value }) => (
  <div className="stat"   style={{backgroundColor: 'rgba(70, 89, 77, 1)'}}>
    <div className="label" style={{color: '#ffffffcd'}}>{title}</div>
    <div className="value" style={{color: '#ffffffff'}}>{value}</div>
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
  // Recent check-ins list (group by guest so multi-room bookings show as one)
  const recentMap = new Map();
  for (const arr of Object.values(floors)) {
    for (const r of arr) {
      if (!r.guest) continue;
      const key = `${r.guest.name}::${r.guest.checkIn || ''}`;
      if (!recentMap.has(key)) recentMap.set(key, { guest: r.guest, rooms: [] });
      recentMap.get(key).rooms.push(r.number);
    }
  }
  const recent = Array.from(recentMap.values()).map(x => ({ guest: x.guest, room: x.rooms.join(', ') }));

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
  </div>

  {/* MAIN CONTENT */}
  <div
    style={{
      display: "flex",
      gap: 20,
      marginTop: 20,
      alignItems: "stretch"
    }}
  >
    {/* LEFT COLUMN */}
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Overview */}
      <div className="card" style={{ padding: 16 }}>
        <h3 style={{ margin: 0, marginBottom: 16 }}>Overview</h3>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: 16
            
          }}
        >
          <StatCard title="Total Rooms" value={total} />
          <StatCard title="Available" value={free} />
          <StatCard title="Reserved" value={reserved} />
          <StatCard title="Occupied" value={occupied} />
        </div>
      </div>

      {/* Recent Check-ins */}
<div
  className="card"
  style={{
    flex: 1,
    padding: 16,
    display: "flex",
    flexDirection: "column",
  }}
>
  <h3 style={{ margin: 0, marginBottom: 12 }}>Recent Check-ins</h3>
  <div
    className="list"
    style={{
      flex: 1,
      overflowY: "auto",
      paddingRight: 4,
      maxHeight: 400, // 🔑 set a height limit
    }}
  >
    {recent.length === 0 && (
      <div style={{ color: "var(--muted)" }}>No current guests</div>
    )}
    {recent.map((r, idx) => (
      <div key={idx} className="card" style={{ marginBottom: 8, padding: "10px 12px" }}>
        <div style={{ fontWeight: 700 }}>{r.guest.name}</div>
        <div style={{ fontSize: 12, color: "var(--muted)" }}>Room {r.room}</div>
      </div>
    ))}
  </div>
</div>
    </div>

    {/* RIGHT COLUMN */}
    <div style={{ flex: 1.2, display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Room Layout */}
      <div className="card" style={{ padding: 16 }}>
  <h3 style={{ margin: 0, marginBottom: 16 }}>Room Layout (Today)</h3>
  {Object.keys(layoutFloors).map((floorNum) => (
    <div key={floorNum} style={{ marginBottom: 16 }}>
      <div
        style={{
          fontWeight: 700,
          fontSize: 14,
          marginBottom: 6,
          color: "var(--muted)"
        }}
      >
        Floor {floorNum}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4,1fr)",
          gap: 8
        }}
      >
        {layoutFloors[floorNum].map((r) => {
          // define glassy background color per status
          let bg =
            r.status === "occupied"
              ? "rgba(0, 180, 90, 0.25)" // green tint
              : r.status === "reserved"
              ? "rgba(240, 180, 0, 0.25)" // amber tint
              : "rgba(255, 255, 255, 0.15)"; // free: light frosted glass

          let textColor = "#000";

          return (
            <div
              key={r.number}
              className={`room ${r.status}`}
              style={{
                height: 50,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 10,
                color: textColor,
                background: bg,
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
                border: "1px solid rgba(255,255,255,0.2)",
                boxShadow:
                  "inset 2px 2px 6px rgba(255,255,255,0.25), inset -2px -2px 6px rgba(0,0,0,0.25), 0 4px 12px rgba(0,0,0,0.25)"
              }}
            >
              {floorNum}
              {String(r.number).slice(-2)}
            </div>
          );
        })}
      </div>
    </div>
  ))}
</div>


      {/* Today's Reservations */}
<div
  className="card"
  style={{
    padding: 16,
    flex: 1,
    display: "flex",
    flexDirection: "column",
  }}
>
  <h3 style={{ margin: 0, marginBottom: 12 }}>Today's Reservations</h3>
  <div
    style={{
      flex: 1,
      overflowY: "auto",
      paddingRight: 4,
      maxHeight: 150, // 🔑 set a height limit
    }}
  >
    {todaysReservations.length === 0 && (
      <div style={{ color: "var(--muted)" }}>No reservations for today</div>
    )}
    {todaysReservations.map((r, i) => (
      <div key={i} className="card" style={{ marginBottom: 8, padding: "10px 12px" }}>
        <div style={{ fontWeight: 700 }}>
          {r.name} - <span style={{ color: "var(--muted)" }}>{r.place}</span>
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)" }}>
          Room {r.room} — {r.date}
        </div>
      </div>
    ))}
  </div>
</div>
    </div>
  </div>
</div>


  );
}



// Helper functions
const pad2 = (n) => String(n).padStart(2, "0");
const fmtDate = (d = new Date()) => `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
const fmtTime = (d = new Date()) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;

async function fetchRateFromCheckin(room, guestName, checkInDate) {
  try {
    const base = await getBaseFolder();
    if (!base) return 0;
    const dir = await ensurePath(base, ["Checkins", checkInDate]);
    const safeName = guestName.toLowerCase().replace(/[^\w\-]+/g, "_");
    for await (const [fileName, fileHandle] of dir.entries()) {
      if (fileHandle.kind !== "file") continue;
      if (fileName.toLowerCase().includes(`-${room}-`) && fileName.toLowerCase().includes(safeName)) {
        const file = await fileHandle.getFile();
        const data = JSON.parse(await file.text());
        return Number(data.rate) || 0;
      }
    }
  } catch (err) {
    console.warn("Rate lookup failed", err);
  }
  return 0;
}


function CheckIn({ state, setState, locationState }) {
  const ymd = (d = new Date()) => d.toISOString().slice(0, 10);
  const location = useLocation();
  const navigate = useNavigate();
  const todayISO = ymd();

  const [form, setForm] = useState({ name: "", contact: "", room: [], rate: "" });
  const [scanFile, setScanFile] = useState(null);
  const [scanPreviewUrl, setScanPreviewUrl] = useState(null);
  const [tempPending, setTempPending] = useState(null); // { file, name, tempName, tempHandle, group }
  const [tempPreviewUrl, setTempPreviewUrl] = useState(null);
  const [showTempModal, setShowTempModal] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [guestMatches, setGuestMatches] = useState([]);
  const [successMsg, setSuccessMsg] = useState("");
  const [occupiedRooms, setOccupiedRooms] = useState([]);
  const [editGuest, setEditGuest] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editRoomsInput, setEditRoomsInput] = useState("");
  const [editNameInput, setEditNameInput] = useState("");
  const [editRateInput, setEditRateInput] = useState("");
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewFileName, setPreviewFileName] = useState(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [conflictMsg, setConflictMsg] = useState(null);
  const [guestSearch, setGuestSearch] = useState("");
  const [scannedMap, setScannedMap] = useState({}); // key -> boolean
  const [paymentsMap, setPaymentsMap] = useState({}); // key -> number
  const [refreshKey, setRefreshKey] = useState(0);
  
  const nameFocusedRef = useRef(false);
  const searchTimeoutRef = useRef(null);

  useEffect(() => {
    if (location.state?.prefName || location.state?.prefRoom) {
      setForm(f => ({
        ...f,
        name: location.state.prefName || f.name,
        room: location.state.prefRoom ? (Array.isArray(location.state.prefRoom) ? location.state.prefRoom : [location.state.prefRoom]) : f.room
      }));
      setSelectedRoom(location.state.prefRoom || null);

      if (location.state.prefName && location.state.prefName.length >= 2) {
        nameFocusedRef.current = true;
        searchGuestMatches(location.state.prefName);
      }
    }
  }, [location.state]);

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

  useEffect(() => {
  (async () => {
    // Group occupied rooms by guest (name + checkIn) so multi-room bookings appear as one entry
    const map = new Map();
    for (const arr of Object.values(state.floors)) {
      for (const r of arr) {
        if (r.status === "occupied" && r.guest) {
          let guestData = { ...r.guest };
          if (!guestData.rate) {
            const checkInDate = (guestData.checkIn || "").slice(0, 10) || ymd(new Date());
            const fetchedRate = await fetchRateFromCheckin(r.number, guestData.name, checkInDate);
            guestData.rate = fetchedRate;
          }
          const key = `${guestData.name}::${guestData.checkIn || ''}`;
          if (!map.has(key)) map.set(key, { guest: guestData, rooms: [] });
          map.get(key).rooms.push(r.number);
        }
      }
    }
    const grouped = Array.from(map.values()).map(g => ({
      guest: g.guest,
      rooms: g.rooms.sort((a,b)=>a-b)
    }));
    setOccupiedRooms(grouped);
  })();
}, [state.floors, refreshKey]);

  // Open the edit modal for a grouped guest
  const openEditModal = (group) => {
    setEditGuest(group);
    setEditNameInput(group.guest?.name || "");
    setEditRateInput(String(group.guest?.rate || ""));
    setEditRoomsInput((group.rooms || []).join(', '));
    setShowEditModal(true);
  };

  // Save edits: update in-memory state, localStorage, and persist to Checkins JSON on disk
  // Save edits: update in-memory state, localStorage, disk, and MongoDB (when id exists)
async function saveEditChanges() {
  if (!editGuest) return;

  const ymd = (d = new Date()) => d.toISOString().slice(0, 10);

  const origRooms = (editGuest.rooms || []).map(Number);

  // parse rooms input
  const parsed = String(editRoomsInput || "")
    .split(",")
    .map(s => Number(s.trim()))
    .filter(Boolean);
  if (parsed.length === 0) return alert("Please provide at least one room");

  const newRooms = parsed;

  // check for conflicts: any newly requested room occupied by someone else
  const occupiedByOthers = [];
  for (const floorArr of Object.values(state.floors)) {
    for (const r of floorArr) {
      if (newRooms.includes(r.number)) {
        // allow if it's part of original group
        if (!origRooms.includes(r.number) && r.status === "occupied") {
          occupiedByOthers.push(r.number);
        }
      }
    }
  }
  if (occupiedByOthers.length) {
    setConflictMsg("Rooms already occupied: " + occupiedByOthers.join(", "));
    return;
  }

  const newState = { ...state, floors: { ...state.floors } };

  // free original rooms (unless they are also in newRooms)
  Object.keys(newState.floors).forEach(fnum => {
    newState.floors[fnum] = newState.floors[fnum].map(r => {
      if (origRooms.includes(r.number) && !newRooms.includes(r.number)) {
        return { ...r, status: "free", guest: null };
      }
      return r;
    });
  });

  // occupy new rooms with updated guest info (preserve id/checkIn fields)
  const updatedGuest = {
    ...editGuest.guest,
    name: editNameInput,
    rate: Number(editRateInput) || 0,
    edited: true
  };

  Object.keys(newState.floors).forEach(fnum => {
    newState.floors[fnum] = newState.floors[fnum].map(r => {
      if (newRooms.includes(r.number)) {
        return {
          ...r,
          status: "occupied",
          guest: {
            ...updatedGuest,
            checkIn: r.guest?.checkIn || editGuest.guest?.checkIn,
            checkInDate: editGuest.guest?.checkInDate,
            checkInTime: editGuest.guest?.checkInTime
          }
        };
      }
      return r;
    });
  });

  // Update app state and persist to localStorage first
  setState(newState);
  saveState(newState);
  try {
    if ("BroadcastChannel" in window) {
      const bc = new BroadcastChannel("hotel_state");
      bc.postMessage({ type: "state:update", state: newState });
      bc.close();
    }
  } catch {}

  // Then attempt to update the on-disk checkin JSON file for this booking (if storage connected)
  try {
    const base = await getBaseFolder();
    if (base) {
      const checkInISO = (editGuest.guest?.checkIn || "").slice(0, 10) || ymd(new Date());
      const checkinDir = await ensurePath(base, ["Checkins", checkInISO]);

      let foundOld = null;
      for await (const [entryName, entryHandle] of checkinDir.entries()) {
        if (entryHandle.kind !== "file" || !entryName.endsWith(".json")) continue;
        try {
          const f = await entryHandle.getFile();
          const data = JSON.parse(await f.text());
          const dataName = String(data.name || "").trim().toLowerCase();
          const origName = String(editGuest.guest?.name || "").trim().toLowerCase();
          const dataRooms = Array.isArray(data.room) ? data.room.map(Number) : [Number(data.room)];
          // Match by original name and at least one overlapping room
          if (dataName === origName && dataRooms.some(r => origRooms.includes(r))) {
            foundOld = { entryName, data };
            break;
          }
        } catch {
          continue;
        }
      }

      if (foundOld) {
        const newData = {
          ...foundOld.data,
          name: editNameInput,
          room: newRooms,
          rate: Number(editRateInput) || Number(foundOld.data.rate) || 0,
          edited: true
        };
        // Preserve mongo id in file if it already exists in old file
        if (foundOld.data?.id) newData.id = foundOld.data.id;

        const safe = String(editNameInput).replace(/[^\w\-]+/g, "_");
        const roomsKeyNew = newRooms.join("_");
        const newFileName = `checkin-${safe}-${roomsKeyNew}-${checkInISO}.json`;
        await writeJSON(checkinDir, newFileName, newData);

        if (foundOld.entryName !== newFileName) {
          try {
            await checkinDir.removeEntry(foundOld.entryName);
          } catch (e) {
            console.warn("Failed to remove old checkin file", e);
          }
        }

        // Also update RentCollections so previous payments map to the new rooms
        try {
          const rentRoot = await ensurePath(base, ["RentCollections"]);
          for await (const [dateFolder, dateHandle] of rentRoot.entries()) {
            if (dateHandle.kind !== "directory") continue;
            for await (const [rentFileName, rentFileHandle] of dateHandle.entries()) {
              if (rentFileHandle.kind !== "file" || !rentFileName.endsWith(".json")) continue;
              try {
                const rf = await rentFileHandle.getFile();
                const rentData = JSON.parse(await rf.text());
                const paidRooms = Array.isArray(rentData.room) ? rentData.room.map(Number) : [Number(rentData.room)];
                const paidName = String(rentData.name || "").trim().toLowerCase();
                const origNameLower = String(editGuest.guest?.name || "").trim().toLowerCase();
                const intersects = paidRooms.some(pr => origRooms.includes(Number(pr)));
                if (intersects && paidName === origNameLower) {
                  const updatedRent = { ...rentData, room: newRooms };
                  try {
                    await writeJSON(dateHandle, rentFileName, updatedRent);
                  } catch (err) {
                    console.warn("Failed to update rent file", rentFileName, err);
                  }
                }
              } catch {
                continue;
              }
            }
          }
        } catch (err) {
          console.warn("Failed to update RentCollections for edited booking", err);
        }
      }
    }
  } catch (err) {
    console.warn("Failed to persist edit to disk:", err);
  }

  // Mirror to server: update check-in in Mongo and remap rent rows
  try {
    const API_BASE =
      window.__MONGO_API_BASE__ ||
      (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_MONGO_API_BASE) ||
      "/api";

    // 1) Update server check-in (if id known)
    const mongoId = editGuest?.guest?.id;
    if (mongoId) {
      await fetch(`${API_BASE}/checkin/${encodeURIComponent(mongoId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editNameInput,
          room: newRooms,
          rate: Number(editRateInput) || 0,
          contact: editGuest.guest?.contact || "",
          checkInDate: editGuest.guest?.checkInDate || "",
          checkInTime: editGuest.guest?.checkInTime || ""
        })
      }).catch(() => {});
    }

    // 2) Remap existing server rent rows for this stay (optional)
    await fetch(`${API_BASE}/rent-payment/remap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fromName: (editGuest.guest?.name || "").trim(),
        toName: editNameInput.trim(),
        fromRooms: origRooms,
        toRooms: newRooms,
        sinceYmd: (editGuest.guest?.checkIn || "").slice(0, 10)
      })
    }).catch(() => {});
  } catch (e) {
    console.warn("server mirrors after edit failed", e);
  }

  setShowEditModal(false);
  setEditGuest(null);
  setRefreshKey(k => k + 1);
}

  // Search ScannedDocuments for a matching file and open preview modal
  const openGuestPreview = async (group) => {
    try {
      const base = await getBaseFolder();
      if (!base) return alert('Storage not connected');
      const scannedRoot = await ensurePath(base, ['ScannedDocuments']);
      const safe = String(group.guest?.name || '').replace(/[\W_]+/g, '_').toLowerCase();
      let foundHandle = null;
      let foundName = null;

      async function recurse(dir) {
        for await (const [entryName, entryHandle] of dir.entries()) {
          if (entryHandle.kind === 'directory') {
            await recurse(entryHandle);
            if (foundHandle) return;
          } else if (entryHandle.kind === 'file') {
            if (entryName.toLowerCase().includes(safe)) {
              foundHandle = entryHandle;
              foundName = entryName;
              return;
            }
          }
        }
      }

      await recurse(scannedRoot);
      if (!foundHandle) return alert('No scanned document found for this guest');
      const file = await foundHandle.getFile();
      const url = URL.createObjectURL(file);
      setPreviewFileName(foundName);
      setPreviewUrl(url);
      setShowPreviewModal(true);
      return;
    } catch (err) {
      console.warn('Preview open failed', err);
      // fallback: try remote link.json mapping
    }

    try {
      const base = await getBaseFolder();
      if (!base) return alert('Storage not connected');
      // read link.json at root
      try {
        const fh = await base.getFileHandle('link.json');
        const existing = await readJSONFile(fh);
        const safe = String(group.guest?.name || '').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
        // find any mapping where filename includes safe
        for (const [k, v] of Object.entries(existing || {})) {
          if (k.toLowerCase().includes(safe)) {
            // fetch remote file as blob
            const API_BASE = window.__MONGO_API_BASE__ || '/api';
            const baseUrl = API_BASE.startsWith('http') ? API_BASE.replace(/\/api$/, '') : '';
            const url = (baseUrl || '') + `/api/download/${v.id}`;
            try {
              const r = await fetch(url);
              if (!r.ok) throw new Error('Download failed');
              const blob = await r.blob();
              const objectUrl = URL.createObjectURL(blob);
              setPreviewFileName(k);
              setPreviewUrl(objectUrl);
              setShowPreviewModal(true);
              return;
            } catch (e) {
              console.warn('Remote preview failed', e);
            }
          }
        }
      } catch (e) {
        // no link.json or read failed
      }
      alert('Failed to open scanned document');
      return;
    } catch (err2) {
      console.warn('Remote fallback failed', err2);
      alert('Failed to open scanned document');
    }
  };

  // Compute a key to identify a guest group
  const groupKey = (group) => `${String(group.guest?.name||'').toLowerCase()}::${(group.guest?.checkIn||'').slice(0,10)}`;

  // Check ScannedDocuments for each occupied group and set scannedMap
  useEffect(() => {
    (async () => {
      try {
        const base = await getBaseFolder();
        if (!base) return;
        const scannedRoot = await ensurePath(base, ['ScannedDocuments']);
        const newMap = { ...scannedMap };
        for (const g of occupiedRooms) {
          const safe = String(g.guest?.name || '').replace(/[\W_]+/g, '_').toLowerCase();
          let found = false;
          async function recurse(dir) {
            for await (const [entryName, entryHandle] of dir.entries()) {
              if (found) return;
              if (entryHandle.kind === 'directory') {
                await recurse(entryHandle);
              } else if (entryHandle.kind === 'file') {
                if (entryName.toLowerCase().includes(safe)) { found = true; return; }
              }
            }
          }
          await recurse(scannedRoot);
          newMap[groupKey(g)] = found;
        }
        setScannedMap(newMap);
      } catch (err) {
        // ignore
      }
    })();
  }, [occupiedRooms]);

  // Compute total payments for each occupied group from RentCollections (from checkIn date to today)
  useEffect(() => {
    (async () => {
      try {
        const base = await getBaseFolder();
        if (!base) return;
        const rentRoot = await ensurePath(base, ['RentCollections']);

        const todayISO = (new Date()).toISOString().slice(0,10);
        const map = {};

        // Prepare groups for quick checks
        const groups = occupiedRooms.map(g => ({
          key: groupKey(g),
          name: String(g.guest?.name || '').trim().toLowerCase(),
          rooms: new Set((g.rooms || []).map(Number)),
          since: (g.guest?.checkIn || '').slice(0,10) || todayISO
        }));

        for await (const [dateFolder, dateHandle] of rentRoot.entries()) {
          if (dateHandle.kind !== 'directory') continue;

          // For each file in this date folder
          for await (const [fileName, fileHandle] of dateHandle.entries()) {
            if (fileHandle.kind !== 'file' || !fileName.endsWith('.json')) continue;
            try {
              const f = await fileHandle.getFile();
              const data = JSON.parse(await f.text());
              const paidName = String(data.name || '').trim().toLowerCase();
              const paidRooms = Array.isArray(data.room) ? data.room.map(Number) : [Number(data.room)];
              const amount = Number(data.amount) || 0;

              // Check this rent entry against each group
              for (const grp of groups) {
                // Only consider entries between group's checkin and today
                if (dateFolder < grp.since || dateFolder > todayISO) continue;
                if (paidName !== grp.name) continue;
                const intersects = paidRooms.some(pr => grp.rooms.has(Number(pr)));
                if (intersects) {
                  map[grp.key] = (map[grp.key] || 0) + amount;
                }
              }
            } catch (err) {
              // skip bad files
              continue;
            }
          }
        }

        setPaymentsMap(map);
      } catch (err) {
        console.warn('Failed to compute payments map', err);
      }
    })();
  }, [occupiedRooms]);

  // Attach a scanned file to a guest group: try scanner temp, else pick file, then write to ScannedDocuments
  const attachScanToGuest = async (group) => {
    try {
      const base = await getBaseFolder();
      if (!base) return alert('Storage not connected');

      // non-blocking: ask native scanner to open if available
      try {
        if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
          window.__TAURI__.invoke('open_scanner_ui').catch(() => {});
        }
      } catch (e) { /* ignore */ }

      // Try reading from _ScannerTemp (if present). Be defensive: if any step fails, fall back to picker.
      let fileToSave = null;
      let fileName = null;
      try {
        const tempDir = await ensurePath(base, ['_ScannerTemp']);
        let latest = null;
        let latestTime = 0;
        let latestName = null;
        for await (const [name, handle] of tempDir.entries()) {
          try {
            if (handle.kind === 'file' && /\.(jpg|jpeg|png|pdf)$/i.test(name)) {
              const file = await handle.getFile();
              if (file && file.lastModified > latestTime) {
                latestTime = file.lastModified; latest = file; latestName = name; }
            }
          } catch (e) {
            // ignore single file errors and continue scanning
            console.warn('Error reading temp entry', name, e);
            continue;
          }
        }
        if (latest) {
          // Instead of immediately saving, open a preview popup showing the temp file.
          try {
            const url = URL.createObjectURL(latest);
            setTempPending({ file: latest, name: latestName, tempHandle: null, tempName: latestName, tempHandleRef: null, group });
            setTempPreviewUrl(url);
            setShowTempModal(true);
            return; // wait for user's confirmation to save
          } catch (e) {
            // if preview creation fails, fall back to immediate save path
            console.warn('Failed to preview temp file, will fallback to save', e);
            fileToSave = latest; fileName = latestName;
          }
        }
      } catch (e) {
        // Could not read _ScannerTemp (not present or permission); fall back to file picker
        console.warn('Scanner temp read failed, will fallback to picker', e);
      }

      if (!fileToSave) {
        // pick file from user and show the same preview + OK modal as scanner temp
        if (window.showOpenFilePicker) {
          try {
            const [handle] = await window.showOpenFilePicker({ multiple: false, types: [{ description: 'Images or PDF', accept: {'image/*':['.png','.jpg','.jpeg'], 'application/pdf':['.pdf']} }] });
            const file = await handle.getFile();
            fileToSave = file; fileName = handle.name || file.name;
          } catch (err) {
            // user probably cancelled
            console.warn('File picker cancelled or failed', err);
            return;
          }
        } else {
          const picked = await new Promise((resolve) => {
            const input = document.createElement('input'); input.type = 'file'; input.accept = '.jpg,.jpeg,.png,.pdf,image/*'; input.style.display = 'none'; input.onchange = () => resolve(input.files && input.files[0] ? input.files[0] : null); document.body.appendChild(input); input.click(); setTimeout(() => document.body.removeChild(input), 1000);
          });
          if (!picked) return; fileToSave = picked; fileName = picked.name;
        }

        // Create a preview and ask user to confirm saving (same UX as scanner temp)
        try {
          const url = URL.createObjectURL(fileToSave);
          setTempPending({ file: fileToSave, name: fileName, tempName: null, tempHandle: null, group });
          setTempPreviewUrl(url);
          setShowTempModal(true);
          return; // wait for confirmation
        } catch (e) {
          console.warn('Failed to preview picked file, will fallback to immediate save', e);
          // fallthrough to immediate save below
        }
      }

      if (!fileToSave) throw new Error('No file to save');

  // Use the same destination logic as the Check-In flow: save under today's ScannedDocuments folder
  const now = new Date();
  const todayISOstr = ymd(now);
  const year = String(now.getFullYear());
  const month = now.toLocaleString('en-US', { month: 'short' }).toLowerCase();
  const dateFolder = `${pad2(now.getDate())}-${pad2(now.getMonth() + 1)}-${now.getFullYear()}`;
  const scansDir = await ensurePath(base, ['ScannedDocuments', year, month, dateFolder]);

  const safeName = String(group.guest?.name || '').replace(/[^\w\-]+/g, '_').toLowerCase() || 'guest';
  const roomsKey = (group.rooms || []).join('_') || 'rooms';
  const rawExt = (fileName && fileName.includes('.')) ? fileName.split('.').pop() : (fileToSave.name && fileToSave.name.split('.').pop()) || 'jpg';
  const ext = String(rawExt).replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'jpg';
  let candidate = `${safeName}-${roomsKey}-${todayISOstr}.${ext}`;
  // final sanitation: allow only safe filename chars
  const newFileName = candidate.replace(/[^a-zA-Z0-9._-]/g, '_');

      try {
        await writeFile(scansDir, newFileName, fileToSave);
        // also try to upload to server and store link metadata at root
        try {
          const { uploadFileToServer } = await import('./services/upload');
          const resp = await uploadFileToServer(fileToSave);
          // write link.json at root with mapping
          try {
            await writeJSON(await getBaseFolder(), 'link.json', { id: resp.id, filename: newFileName, uploadedAt: new Date().toISOString() });
          } catch (e) { /* ignore link write failures */ }
        } catch (e) {
          console.warn('Upload failed or not configured', e);
        }
      } catch (e) {
        console.error('Failed writing scan file', e);
        return alert('Failed to save scanned file: ' + (e?.message || String(e)));
      }

      // mark map and show a small success message (no post-save preview required)
      setScannedMap(m => ({ ...m, [groupKey(group)]: true }));
      setSuccessMsg('Scanned document saved');
      setTimeout(() => setSuccessMsg(''), 2500);
    } catch (err) {
      console.warn('Attach scan failed', err);
      alert('Failed to attach scan: ' + (err?.message || String(err)));
    }
  };

  // User confirms saving the temp scanned file to ScannedDocuments and deletion from _ScannerTemp
  const saveTempScanConfirmed = async () => {
    if (!tempPending) return;
    try {
      const base = await getBaseFolder();
      if (!base) return alert('Storage not connected');

  const { group, file, tempName } = tempPending;
  // Use today's folder and filename pattern (same as Check-In flow)
  const now = new Date();
  const todayISOstr = ymd(now);
  const year = String(now.getFullYear());
  const month = now.toLocaleString('en-US', { month: 'short' }).toLowerCase();
  const dateFolder = `${pad2(now.getDate())}-${pad2(now.getMonth() + 1)}-${now.getFullYear()}`;
  const scansDir = await ensurePath(base, ['ScannedDocuments', year, month, dateFolder]);

  const safeName = String(group.guest?.name || '').replace(/[^\w\-]+/g, '_').toLowerCase() || 'guest';
  const roomsKey = (group.rooms || []).join('_') || 'rooms';
  const rawExt = (tempPending.name && tempPending.name.includes('.')) ? tempPending.name.split('.').pop() : (file.name && file.name.split('.').pop()) || 'jpg';
  const ext = String(rawExt).replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'jpg';
  const newFileName = `${safeName}-${roomsKey}-${todayISOstr}.${ext}`.replace(/[^a-zA-Z0-9._-]/g, '_');

  await writeFile(scansDir, newFileName, file);
  // attempt upload
  try {
    const { uploadFileToServer } = await import('./services/upload');
    const resp = await uploadFileToServer(file);
    try { await writeJSON(await getBaseFolder(), 'link.json', { id: resp.id, filename: newFileName, uploadedAt: new Date().toISOString() }); } catch (e) {}
  } catch (e) { console.warn('Upload failed', e); }

      // delete temp entry (best-effort)
      try {
        const tempDir = await ensurePath(base, ['_ScannerTemp']);
        await tempDir.removeEntry(tempName);
      } catch (e) {
        console.warn('Failed to delete temp scan after save', e);
      }

  setScannedMap(m => ({ ...m, [groupKey(group)]: true }));
  setSuccessMsg('Scanned document saved');
  setTimeout(() => setSuccessMsg(''), 2500);
    } catch (err) {
      console.error('Save temp failed', err);
      alert('Failed to save scanned file: ' + (err?.message || String(err)));
    } finally {
      // cleanup temp modal state
      if (tempPreviewUrl) { URL.revokeObjectURL(tempPreviewUrl); setTempPreviewUrl(null); }
      setTempPending(null);
      setShowTempModal(false);
    }
  };

  const cancelTempPreview = () => {
    if (tempPreviewUrl) URL.revokeObjectURL(tempPreviewUrl);
    setTempPreviewUrl(null);
    setTempPending(null);
    setShowTempModal(false);
  };

  // Cleanup preview URL when modal closes
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleRoomClick = (room) => {
    if (room.status === "occupied") return;
    const reservedName = room.status === "reserved" ? (room.reservedFor?.name || "") : "";
    setSelectedRoom(room.number);
    setForm(f => {
      const existing = Array.isArray(f.room) ? f.room : (f.room ? [f.room] : []);
      // toggle selection
      const idx = existing.indexOf(room.number);
      const nextRooms = idx === -1 ? [...existing, room.number] : existing.filter(x => x !== room.number);
      return {
        ...f,
        room: nextRooms,
        name: reservedName || f.name
      };
    });
    setGuestMatches([]);
    if (reservedName && reservedName.length >= 2) {
      nameFocusedRef.current = true;
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

  async function searchScansRecursively(dirHandle, safeQuery, results, query) {
    for await (const [entryName, entryHandle] of dirHandle.entries()) {
      if (entryHandle.kind === "directory") {
        await searchScansRecursively(entryHandle, safeQuery, results, query);
      } else if (entryHandle.kind === "file") {
        if (entryName.toLowerCase().includes(safeQuery)) {
          let baseName = entryName.replace(/\.[^/.]+$/, "").replace(/_/g, " ");
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

      // From Checkouts
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
                  scanInfo: { checkInDate: data.checkInDate || dateFolder, checkInTime: data.checkInTime || "", name: data.name }
                });
              }
            }
          }
        }
      }

      // From ScannedDocuments
      const scannedRoot = await ensurePath(base, ["ScannedDocuments"]);
      await searchScansRecursively(scannedRoot, safeQuery, results, query);

      if (nameFocusedRef.current) setGuestMatches(results);
    } catch (err) {
      console.warn("Guest search failed:", err);
    }
  }

  async function useGuestMatch(match) {
    setForm(f => ({ ...f, name: match.name, contact: match.contact }));
    setGuestMatches([]);
    try {
      const base = await getBaseFolder();
      if (!base) return;

      const safeName = match.scanInfo.name.replace(/[^\w\-]+/g, "_");

      if (match.source === "scanfile" && match.scanInfo.fileHandle) {
        setScanFile({
          reused: true,
          fileHandle: match.scanInfo.fileHandle,
          safeName,
          name: match.scanInfo.fileName
        });
      } else if (match.source === "checkout" && match.scanInfo.checkInDate) {
  const parsed = buildScanFolders(match.scanInfo.checkInDate);
  if (!parsed) {
    console.warn("Invalid checkInDate for scan:", match.scanInfo.checkInDate);
    return;
  }

  const { year: oldYear, month: oldMonth, folder: oldDateFolder } = parsed;
  const oldScanDir = await ensurePath(base, ["ScannedDocuments", oldYear, oldMonth, oldDateFolder]);

  for await (const [entryName, entryHandle] of oldScanDir.entries()) {
    if (entryHandle.kind === "file" && entryName.toLowerCase().includes(safeName.toLowerCase())) {
      setScanFile({
        reused: true,
        fileHandle: entryHandle,
        safeName,
        name: entryName
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

  const saveCheckinData = async (guest) => {
  const base = await getBaseFolder();
  if (!base) return console.warn("Storage not connected.");

  const now = new Date();
  const ymd = (d = new Date()) => d.toISOString().slice(0, 10);
  const pad2 = (n) => String(n).padStart(2, '0');

  const todayISOstr = ymd(now);

  // Normalize rooms for payload and filenames
  const roomsArr = Array.isArray(guest.room) ? guest.room.map(Number) : [Number(guest.room)];
  const roomsKey = roomsArr.join('_');

  // 1) Persist the check-in record (including optional Mongo id) to Checkins/YYYY-MM-DD
  const dataDir = await ensurePath(base, ["Checkins", todayISOstr]);

  const payload = {
    id: guest.id || undefined,                     // Mongo id if provided
    name: String(guest.name || '').trim(),
    contact: String(guest.contact || '').trim(),
    room: roomsArr,
    checkIn: guest.checkIn || now.toISOString(),
    checkInDate: guest.checkInDate || now.toLocaleDateString(),
    checkInTime: guest.checkInTime || now.toLocaleTimeString(),
    rate: Number(guest.rate) || 0
  };

  await writeJSON(
    dataDir,
    `checkin-${payload.name}-${roomsKey}-${todayISOstr}.json`,
    payload
  );

  // 2) Persist the scan to ScannedDocuments/YYYY/mon/DD-MM-YYYY
  const year = String(now.getFullYear());
  const month = now.toLocaleString("en-US", { month: "short" }).toLowerCase();
  const dateFolder = `${pad2(now.getDate())}-${pad2(now.getMonth() + 1)}-${now.getFullYear()}`;
  const scansDir = await ensurePath(base, ["ScannedDocuments", year, month, dateFolder]);

  // Reused scan from a previous fileHandle
  if (scanFile?.reused && scanFile?.fileHandle) {
    const safeName = String(scanFile.safeName || payload.name).replace(/[^\w\-]+/g, "_");
    const ext = scanFile.fileHandle.name?.split(".").pop() || "jpg";
    const newFileName = `${safeName}-${roomsKey}-${todayISOstr}.${ext}`;
    const file = await scanFile.fileHandle.getFile();

    await writeFile(scansDir, newFileName, file);

    // Best-effort upload + link mapping
    try {
      const { uploadFileToServer } = await import('./services/upload');
      const resp = await uploadFileToServer(file);
      try {
        await writeJSON(
          await getBaseFolder(),
          'link.json',
          { id: resp.id, filename: newFileName, uploadedAt: new Date().toISOString() }
        );
      } catch (e) { /* ignore mapping write errors */ }
    } catch (e) {
      console.warn('Upload failed', e);
    }

    console.log("Reused old scan saved:", newFileName);
    return;
  }

  // Freshly attached scan (picked or from _ScannerTemp)
  if (scanFile && scanFile.file) {
    const ext = scanFile.name && scanFile.name.includes(".")
      ? scanFile.name.split(".").pop()
      : "jpg";
    const safeName = String(payload.name).replace(/[^\w\-]+/g, "_");
    const newFileName = `${safeName}-${roomsKey}-${todayISOstr}.${ext}`;

    await writeFile(scansDir, newFileName, scanFile.file);
    console.log("Saved scanned file:", newFileName);

    // Best-effort upload + link mapping
    try {
      const { uploadFileToServer } = await import('./services/upload');
      const resp = await uploadFileToServer(scanFile.file);
      try {
        await writeJSON(
          await getBaseFolder(),
          'link.json',
          { id: resp.id, filename: newFileName, uploadedAt: new Date().toISOString() }
        );
      } catch (e) { /* ignore mapping write errors */ }
    } catch (e) {
      console.warn('Upload failed', e);
    }

    // If the file came from _ScannerTemp, try to delete the temp entry
    if (scanFile.tempName) {
      try {
        const tempDir = await ensurePath(base, ["_ScannerTemp"]);
        await tempDir.removeEntry(scanFile.tempName);
        console.log("Deleted temp scan:", scanFile.tempName);
      } catch (err) {
        console.warn("Failed to delete temp scan file:", err);
      }
    }
  }
};


  const submit = async (e) => {
  e.preventDefault();
  if (!form.room) return alert("Select a room");
  if (!form.contact || String(form.contact).trim() === "") return alert("Please enter contact number");

  const now = new Date();
  const checkInDate = now.toLocaleDateString();
  const checkInTime = now.toLocaleTimeString();

  const roomsToOccupy = Array.isArray(form.room) ? form.room.map(Number) : [Number(form.room)];

  // Prepare local state first (without id)
  const newState = { ...state, floors: { ...state.floors } };
  Object.keys(newState.floors).forEach(fnum => {
    newState.floors[fnum] = newState.floors[fnum].map(r =>
      roomsToOccupy.includes(r.number)
        ? {
            ...r,
            status: "occupied",
            guest: {
              name: form.name,
              contact: form.contact,
              checkIn: now.toISOString(),
              checkInDate,
              checkInTime,
              rate: Number(form.rate) || 0,
              id: "" // temp, will fill after server
            }
          }
        : r
    );
  });

  // Remove matching reservations for any of the rooms checked-in
const todayISO = (new Date()).toISOString().slice(0,10);
const roomsSet = new Set(roomsToOccupy.map(Number));

// Find all reservations that overlap ANY checked-in room for today
const reservationMatches = (state.reservations || []).filter(
  r =>
    Array.isArray(r.room)
      ? r.room.some(roomNum => roomsSet.has(Number(roomNum)))
      : roomsSet.has(Number(r.room))
    && r.date === todayISO
);

if (reservationMatches.length) {
  // Remove all matching reservations (person+date overlap with checked-in rooms)
  newState.reservations = (state.reservations || []).filter(
    r =>
      !(Array.isArray(r.room)
        ? r.room.some(roomNum => roomsSet.has(Number(roomNum)))
        : roomsSet.has(Number(r.room))
      && r.date === todayISO)
  );

  // Delete reservation files on disk for each room in each matching reservation
  for (const rm of reservationMatches) {
    if (Array.isArray(rm.room)) {
      for (const roomNum of rm.room) {
        await deleteReservationFile(rm.date, roomNum, rm.name);
      }
    } else {
      await deleteReservationFile(rm.date, rm.room, rm.name);
    }
  }

  // Mirror deletion to Mongo by name+date (not room, since all rooms in doc)
  try {
    const API_BASE =
      window.MONGO_API_BASE ||
      (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_MONGO_API_BASE) ||
      '/api';
    for (const rm of reservationMatches) {
      await fetch(`${API_BASE}/reservation`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: String(rm.name || '').trim(),
          date: String(rm.date || '').slice(0,10) // No room needed since doc holds array
        })
      }).catch(() => {});
    }
  } catch {
    // best-effort; ignore failures
  }
}



  // One and only server call: POST if no id, else PUT by id
  let mongoId = null;
  try {
    const API_BASE =
      window.__MONGO_API_BASE__ ||
      (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_MONGO_API_BASE) ||
      '/api';

    // Try to see if any of the rooms already has an id for this checkin (rare, e.g., re-submit)
    let existingId = null;
    for (const farr of Object.values(state.floors)) {
      for (const r of farr) {
        if (roomsSet.has(Number(r.number)) && r.guest?.id) {
          existingId = r.guest.id;
          break;
        }
      }
      if (existingId) break;
    }

    if (existingId) {
      // Update existing server record
      const putResp = await fetch(`${API_BASE}/checkin/${encodeURIComponent(existingId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name || 'Guest',
          contact: form.contact || '',
          room: roomsToOccupy,
          rate: Number(form.rate) || 0,
          checkInDate,
          checkInTime
        })
      });
      if (putResp.ok) mongoId = existingId;
    } else {
      // Create once
      const postResp = await fetch(`${API_BASE}/checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name || 'Guest',
          contact: form.contact || '',
          room: roomsToOccupy,
          rate: Number(form.rate) || 0,
          checkInDate,
          checkInTime,
          checkIn: now.toISOString(),
          checkInDateTime: now.toISOString()
        })
      });
      if (postResp.ok) {
        const j = await postResp.json().catch(() => null);
        mongoId = (j && (j._id || j.id)) || null;
      }
    }
  } catch {
    // ignore server errors, local still works
  }

  // Inject id (if received) into all occupied rooms for this check-in
  if (mongoId) {
    Object.keys(newState.floors).forEach(fnum => {
      newState.floors[fnum] = newState.floors[fnum].map(r =>
        roomsToOccupy.includes(r.number)
          ? { ...r, guest: { ...(r.guest || {}), id: mongoId } }
          : r
      );
    });
  }

  // Persist local app state and broadcast
  setState(newState);
  saveState(newState);
  try {
    if ('BroadcastChannel' in window) {
      const bc = new BroadcastChannel('hotel_state');
      bc.postMessage({ type: 'state:update', state: newState });
      bc.close();
    }
  } catch {}

  // Persist Checkins JSON (include id to avoid future POSTs)
  await saveCheckinData({
    id: mongoId || undefined,
    name: form.name,
    contact: form.contact,
    room: roomsToOccupy,
    checkIn: now.toISOString(),
    checkInDate,
    checkInTime,
    rate: Number(form.rate) || 0
  });

  // UI feedback and cleanup
  setSuccessMsg(`Room ${form.room} reserved successfully`);
  setForm({ name: "", contact: "", room: "", rate: "" });
  setSelectedRoom(null);
  setScanFile(null);
  setTimeout(() => setSuccessMsg(""), 3000);

  setRefreshKey(k => k + 1);
};


  const legendDot = (bg) => ({
    display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
    background: bg, marginRight: 6, border: '1px solid rgba(0,0,0,0.1)'
  });

  const roomBoxStyle = (r) => {
  const baseBg =
    r.status === "reserved" ? "rgba(255, 213, 128, 0.6)" :
      r.status === "occupied" ? "rgba(139, 224, 164, 0.6)" :
    "rgba(255, 255, 255, 0.15)"; // frosty neutral white

  const isDisabled = r.status === "occupied";
  const isSelected = Array.isArray(form.room) ? form.room.includes(r.number) : selectedRoom === r.number;

  // If selected and FREE → turn blue
  const selectedFree = isSelected && r.status !== "occupied" && r.status !== "reserved";

  return {
    cursor: isDisabled ? "not-allowed" : "pointer",
    height: 56,
    borderRadius: 20,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: 14,
    color: '#000000ff',
    background: selectedFree ? "rgba(0, 132, 255, 0.3)" : baseBg, // frosted blue if selected & free
    backdropFilter: 'blur(18px) saturate(200%)',
    WebkitBackdropFilter: 'blur(18px) saturate(200%)',
    border: selectedFree 
      ? '1.5px solid rgba(0, 132, 255, 0.6)'
      : `1.2px solid rgba(255,255,255,0.25)`,
    boxShadow: selectedFree 
      ? 'inset 1px 1px 3px rgba(255,255,255,0.6), inset -2px -2px 4px rgba(0,0,0,0.25), 0 0 14px rgba(0,132,255,0.55)' 
      : 'inset 1px 1px 3px rgba(255,255,255,0.5), inset -2px -2px 4px rgba(0,0,0,0.25), 0 4px 14px rgba(0,0,0,0.3)',
    transition: 'all 180ms ease',
    transform: isSelected ? 'translateY(-2px)' : 'none',
    opacity: isDisabled ? 0.75 : 1,
  };
};


  useEffect(() => () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current); }, []);

  async function scanFromLocalScanner() {
    try {
      const base = await getBaseFolder();
      if (!base) return alert("Storage not connected");

      // If running inside Tauri, try to open the native scanner UI so the user can scan now.
      try {
        if (window.__TAURI__ && typeof window.__TAURI__.invoke === 'function') {
          // non-blocking: open scanner app/window and continue to watch _ScannerTemp
          window.__TAURI__.invoke('open_scanner_ui').catch(err => console.warn('open_scanner_ui failed', err));
        }
      } catch (err) {
        console.warn('Tauri invoke unavailable or failed', err);
      }

      const scanDir = await ensurePath(base, ["_ScannerTemp"]);
      let latestFile = null;
      let latestTime = 0;
      let latestName = null;
      let latestHandle = null;

      for await (const [name, handle] of scanDir.entries()) {
        if (handle.kind === "file" && /\.(jpg|jpeg|png|pdf)$/i.test(name)) {
          const file = await handle.getFile();
          if (file.lastModified > latestTime) {
            latestTime = file.lastModified;
            latestFile = file;
            latestName = name;
            latestHandle = handle;
          }
        }
      }

      if (!latestFile) {
        // Fallback: allow the user to pick a file manually if automatic scanner drop isn't available
        const pickFile = async () => {
          // Prefer native file picker if supported
          if (window.showOpenFilePicker) {
            try {
              const [handle] = await window.showOpenFilePicker({
                multiple: false,
                types: [
                  { description: 'Images or PDF', accept: { 'image/*': ['.png', '.jpg', '.jpeg'], 'application/pdf': ['.pdf'] } }
                ]
              });
              const file = await handle.getFile();
              return file;
            } catch (err) {
              return null;
            }
          }

          // Fallback to a hidden input element
          return await new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.jpg,.jpeg,.png,.pdf,image/*';
            input.style.display = 'none';
            input.onchange = () => resolve(input.files && input.files[0] ? input.files[0] : null);
            document.body.appendChild(input);
            input.click();
            // clean up after selection
            setTimeout(() => { document.body.removeChild(input); }, 1000);
          });
        };

        const picked = await pickFile();
        if (!picked) {
          alert("No scanned file found. Please scan and then click again or pick a file.");
          return;
        }

        setScanFile({ file: picked, name: picked.name, tempName: null, tempHandle: null, reused: false });
        console.log("Attached picked file:", picked.name);
        return;
      }

      // Save both the file and its original handle/name so we can delete it later from _ScannerTemp
      setScanFile({ file: latestFile, name: latestFile.name, tempName: latestName, tempHandle: latestHandle, reused: false });
      console.log("Attached scanned file:", latestFile.name);
    } catch (err) {
      console.error("Scan fetch failed:", err);
      alert("Failed to fetch scanned file.");
    }
  }

  // Create a preview URL for the attached scan (image or PDF). Clean up old URL on change.
  useEffect(() => {
    let url = null;
    let cancelled = false;
    async function makePreview() {
      if (!scanFile) {
        setScanPreviewUrl(null);
        return;
      }
      try {
        let file = scanFile.file;
        if (!file && scanFile.fileHandle) {
          file = await scanFile.fileHandle.getFile();
        }
        if (!file) {
          setScanPreviewUrl(null);
          return;
        }
        url = URL.createObjectURL(file);
        if (!cancelled) setScanPreviewUrl(url);
      } catch (err) {
        console.warn('Failed to create scan preview', err);
        setScanPreviewUrl(null);
      }
    }
    makePreview();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
      setScanPreviewUrl(null);
    };
  }, [scanFile]);

  

  return (
    <div>
    {/* Header */}
    <div className="header-row" style={{ marginBottom: 12 }}>
      <div className="title">Check-In</div>
    </div>

    <div style={{ display: 'flex', gap: 20 }}>
      {/* LEFT: Rooms grid */}
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
                        ? `Occupied by: ${r.guest?.name || 'Guest'}\nContact: ${r.guest?.contact || '-'}\nCheck-in: ${r.guest?.checkInDate || '-'} ${r.guest?.checkInTime || ''}`
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

      {/* RIGHT: Check-in form */}
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
  required
  min="1"
  onChange={(e) => setForm({ ...form, rate: e.target.value })}
/>

            <input className="input"
              placeholder="Room"
              value={form.room}
              readOnly
            />

            {/* Scan / Reuse button */}
            <div className="form-row" style={{ alignItems: "center", gap: 8, marginBottom: 12 }}>
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

            {/* Scan preview */}
            {scanPreviewUrl && (
              <div style={{ marginTop: 8 }}>
                {/\.pdf$/i.test(scanFile?.name || '') ? (
                  <object data={scanPreviewUrl} type="application/pdf" width="100%" height="300">
                    <a href={scanPreviewUrl} target="_blank" rel="noreferrer">Open PDF</a>
                  </object>
                ) : (
                  <img src={scanPreviewUrl} alt="Scan preview" style={{ maxWidth: '100%', maxHeight: 300, borderRadius: 8, border: '1px solid rgba(0,0,0,0.06)' }} />
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn primary" type="submit" disabled={!form.room || !form.name || !form.contact}>Check-In</button>
              <button className="btn ghost" type="button" onClick={() => {
                setForm({ name: "", contact: "", room: "", rate: "" });
                setSelectedRoom(null);
                setScanFile(null);
                setGuestMatches([]);
              }}>Clear</button>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontWeight: 800 }}>Current Guests</div>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>{occupiedRooms.length} occupied</div>
          </div>

          {/* Search (full width) */}
          <div style={{ marginBottom: 10 }}>
            <input className="input" style={{ width: '100%', padding: '8px 10px' }} placeholder="Search guest or room..." value={guestSearch} onChange={(e) => setGuestSearch(e.target.value)} />
          </div>

          {occupiedRooms.length === 0 && <div style={{ color: 'var(--muted)' }}>No rooms are occupied</div>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 6 }}>
            {/** make a filtered view so search only affects the display */}
            { (occupiedRooms.filter(g => {
                const q = guestSearch.trim().toLowerCase();
                if (!q) return true;
                const name = String(g.guest?.name || '').toLowerCase();
                const rooms = (g.rooms || []).map(String).join(', ');
                return name.includes(q) || rooms.includes(q);
              })).map((g, idx) => {
              const name = g.guest?.name || 'Guest';
              const initials = (String(name).split(' ').map(n => n[0]).filter(Boolean).slice(0,2).join('') || name.slice(0,2)).toUpperCase();
              return (
                <div key={idx} className="card" style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 8 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 8, background: 'rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14 }}>
                    {initials}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <div style={{ alignItems: 'center', gap: 8, minWidth: 0 }}>
                          
                          <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {name}
          </div>
          
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            Room {(g.rooms || []).join(', ')}
          </div>
          

                          
                          {g.guest?.edited && (
                            <div style={{ background: 'rgba(34,197,94,0.12)', color: '#16a34a', padding: '2px 6px', borderRadius: 6, fontSize: 12, fontWeight: 700 }}>edited</div>
                          )}
                        </div>
                      </div>
                      
                      
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 6, marginTop: 8, fontSize: 12 }}>
            <div>Phone no: {g.guest.contact}</div>
            <div>Price: ₹{g.guest?.rate || 0}/day</div>
            <div>In: {g.guest?.checkInDate || new Date(g.guest?.checkIn || "").toLocaleDateString()} {g.guest?.checkInTime || ''}</div>
            <div>Paid: ₹{paymentsMap[groupKey(g)] || 0}</div>
            
          </div>
                    
                    
                    </div>

                   <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 120, alignItems: 'flex-end' }}>
                    <button className="btn" style={{ padding: '6px 10px', fontSize: 13, background: '#2f4338', color: '#f1eedf'}} onClick={() => openEditModal(g)}>Edit</button>
                    {scannedMap[groupKey(g)] ? (
                      <button className="btn" style={{ padding: '6px 10px', fontSize: 13 }} onClick={() => openGuestPreview(g)}>📎 Open ID</button>
                    ) : (
                      <button className="btn" style={{ padding: '6px 10px', fontSize: 13, background: 'rgba(239,68,68,0.08)', color: '#ef4444', borderColor: 'rgba(239,68,68,0.18)' }} onClick={() => attachScanToGuest(g)}>⬆️ Upload ID</button>
                    )}
                  </div>
                </div>
              );
            })}
            </div>
          </div>

          {/* Edit Modal */}
          {showEditModal && editGuest && (
            <Modal onClose={() => setShowEditModal(false)}>
              <h3 style={{ marginTop: 0 }}>Edit Booking</h3>
              <div style={{ marginBottom: 8 }}>
                <input className="input" value={editNameInput} onChange={(e) => setEditNameInput(e.target.value)} />
              </div>
              <div style={{ marginBottom: 8 }}>
                <input className="input" value={editRoomsInput} onChange={(e) => setEditRoomsInput(e.target.value)} placeholder="Rooms (comma separated)" />
              </div>
              <div style={{ marginBottom: 8 }}>
                <input className="input" type="number" value={editRateInput} onChange={(e) => setEditRateInput(e.target.value)} placeholder="Group rate per day" />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn ghost" onClick={() => { setShowEditModal(false); setEditGuest(null); }}>Cancel</button>
                <button className="btn primary" onClick={saveEditChanges}>Save</button>
              </div>
            </Modal>
          )}

          {/* Preview Modal */}
          {showPreviewModal && previewUrl && (
            <Modal onClose={() => { setShowPreviewModal(false); if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); } }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ margin: 0 }}>{previewFileName || 'Scanned Document'}</h4>
                <a href={previewUrl} target="_blank" rel="noreferrer" className="btn">Open in new tab</a>
              </div>
              <div style={{ marginTop: 10 }}>
                {/\.pdf$/i.test(previewFileName || '') ? (
                  <object data={previewUrl} type="application/pdf" width="100%" height={500}>
                    <a href={previewUrl} target="_blank" rel="noreferrer">Open PDF</a>
                  </object>
                ) : (
                  <img src={previewUrl} alt="Preview" style={{ maxWidth: '100%', maxHeight: 600 }} />
                )}
              </div>
            </Modal>
          )}

          {/* Temp Preview Modal: shown when a file exists in _ScannerTemp and user clicked Upload ID */}
          {showTempModal && tempPending && tempPreviewUrl && (
            <Modal onClose={cancelTempPreview}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ margin: 0 }}>Preview scanned document</h4>
              </div>
              <div style={{ marginTop: 10 }}>
                {/\.pdf$/i.test(tempPending.name || '') ? (
                  <object data={tempPreviewUrl} type="application/pdf" width="100%" height={350}>
                    <a href={tempPreviewUrl} target="_blank" rel="noreferrer">Open PDF</a>
                  </object>
                ) : (
                  <img src={tempPreviewUrl} alt="Temp preview" style={{ maxWidth: '100%', maxHeight: 350 }} />
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                <button className="btn ghost" onClick={cancelTempPreview}>Cancel</button>
                <button className="btn primary" onClick={saveTempScanConfirmed}>OK</button>
              </div>
            </Modal>
          )}
          {conflictMsg && (
            <Modal onClose={() => setConflictMsg(null)}>
              <h3 style={{ marginTop: 0 }}>Room conflict</h3>
              <div style={{ marginBottom: 12 }}>{conflictMsg}</div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button className="btn ghost" onClick={() => setConflictMsg(null)}>OK</button>
              </div>
            </Modal>
          )}
        </div>
      </div>
    </div>
  </div>
  );
}

function CheckOut({ state, setState }) {
  const navigate = useNavigate();
  const ymd = (d = new Date()) => d.toISOString().slice(0, 10);

  const [confirmMsg, setConfirmMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [checkoutList, setCheckoutList] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");

  // ---------- FILE HELPERS ----------
  async function findCheckinFile(base, checkInDate, room, name) {
    const norm = (s) => String(s).toLowerCase().trim();
    const normalizedName = norm(name);

    async function scanFolder(dateFolder) {
      const dir = await ensurePath(base, ["Checkins", dateFolder]);
      for await (const [entryName, handle] of dir.entries()) {
        if (handle.kind !== "file" || !entryName.endsWith(".json")) continue;
        try {
          const file = await handle.getFile();
          const data = JSON.parse(await file.text());
          const dataName = norm(data.name || "");
          const rooms = Array.isArray(data.room) ? data.room.map(Number) : [Number(data.room)];
          if (dataName === normalizedName && rooms.includes(Number(room))) {
            return { dir, fileName: entryName };
          }
        } catch (err) {
          continue;
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
    try {
      const base = await getBaseFolder();
      const { dir, fileName } = await findCheckinFile(base, checkInDate, room, name);
      const fileHandle = await dir.getFileHandle(fileName);
      const file = await fileHandle.getFile();
      const data = JSON.parse(await file.text());
      return Number(data.rate) || 0;
    } catch (err) {
      return 0;
    }
  }

  async function getTotalPayments(checkInDate, room, name, checkOutDate) {
    const roomsSet = new Set((Array.isArray(room) ? room : [room]).map(r => Number(r)));
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

          const paidRoom = rentData.room;
          const paidRooms = Array.isArray(paidRoom) ? paidRoom.map(Number) : [Number(paidRoom)];

          const intersects = paidRooms.some(pr => roomsSet.has(Number(pr)));
          if (intersects && rentData.name?.trim().toLowerCase() === name.trim().toLowerCase()) {
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

    const rooms = Array.isArray(data.room) ? data.room.map(Number) : [Number(data.room)];
    const totalPayment = await getTotalPayments(checkInDate, rooms, name, ymd(now));

    const days = Math.max(1, Math.ceil((now - new Date(data.checkIn)) / (1000 * 60 * 60 * 24)));
    const groupRatePerDay = Number(data.rate) || 0;
    const totalRent = days * groupRatePerDay;

    data.rooms = rooms;
    data.daysStayed = days;
    data.totalRent = totalRent;
    data.totalPaid = totalPayment;
    data.paymentTallyStatus = totalPayment >= totalRent ? "tallied" : "not-tallied";

    const checkoutDir = await ensurePath(base, ["Checkouts", ymd(now)]);
    const safeName = String(name).replace(/[^\w\-]+/g, "_");
    const roomsKey = rooms.join('_');
    const checkoutFileName = `checkout-${safeName}-${roomsKey}-${checkInDate}.json`;
    await writeJSON(checkoutDir, checkoutFileName, data);

    await checkinDir.removeEntry(fileName);
  }

  async function doCheckout(roomNumber) {
    try {
      const newState = { ...state, floors: { ...state.floors } };
      const roomsToCheckout = Array.isArray(roomNumber) ? roomNumber.map(Number) : [Number(roomNumber)];

      // Find guest info (from current state) to compute totals and for mirror POST
      let guestName = null;
      let guestCheckIn = null;
      let guestContact = '';
      for (const fnum of Object.keys(newState.floors)) {
        for (const r of newState.floors[fnum]) {
          if (roomsToCheckout.includes(r.number) && r.guest) {
            guestName = r.guest.name;
            guestCheckIn = r.guest.checkIn ? new Date(r.guest.checkIn) : new Date();
            guestContact = r.guest.contact || '';
            break;
          }
        }
        if (guestName) break;
      }

      // Compute financials for mirror POST
      const now = new Date();
      const checkInISO = (guestCheckIn || new Date()).toISOString().slice(0, 10);
      const nowISO = ymd(now);
      const rate = await getRateFromCheckin(checkInISO, roomsToCheckout[0], guestName || 'Guest');
      const days = Math.max(1, Math.ceil((now - (guestCheckIn || now)) / (1000 * 60 * 60 * 24)));
      const totalRent = days * (Number(rate) || 0);
      const totalPayment = await getTotalPayments(checkInISO, roomsToCheckout, guestName || 'Guest', nowISO);
      const isTallied = Number(totalPayment || 0) >= Number(totalRent || 0);

      if (guestName) {
        await moveCheckinToCheckout(
          checkInISO,
          roomsToCheckout[0],
          guestName || "Guest"
        );
      }

      // Clear rooms in UI state
      for (const fnum of Object.keys(newState.floors)) {
        newState.floors[fnum] = newState.floors[fnum].map(r =>
          roomsToCheckout.includes(r.number) ? { ...r, status: 'free', guest: null } : r
        );
      }

      setState(newState);
      saveState(newState);
      showSuccess("✅ Check-Out completed successfully");
      loadCheckoutList();
      // In App, after setState(newState) and saveState(newState):
try {
  if ('BroadcastChannel' in window) {
    const bc = new BroadcastChannel('hotel_state');
    bc.postMessage({ type: 'state:update', state: newState });
    bc.close();
  }
} catch {}


      // Mirror checkout to backend with complete details
      try {
        const API_BASE =
          window.__MONGO_API_BASE__ ||
          (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_MONGO_API_BASE) ||
          '/api';

        // Re-derive check-in fields for display (use guestCheckIn if available)
        let checkInDate = '';
        let checkInTime = '';
        if (guestCheckIn) {
          checkInDate = guestCheckIn.toLocaleDateString();
          checkInTime = guestCheckIn.toLocaleTimeString();
        } else {
          // As a fallback, try to locate a still-present guest record in original state
          for (const fnum of Object.keys(state.floors)) {
            for (const r of state.floors[fnum]) {
              if (roomsToCheckout.includes(r.number) && r.guest) {
                if (r.guest.checkInDate) checkInDate = r.guest.checkInDate;
                if (r.guest.checkInTime) checkInTime = r.guest.checkInTime;
                if (!checkInDate && r.guest.checkIn) {
                  const d = new Date(r.guest.checkIn);
                  checkInDate = d.toLocaleDateString();
                  checkInTime = checkInTime || d.toLocaleTimeString();
                }
                break;
              }
            }
          }
        }

        const checkOutDate = now.toLocaleDateString();
        const checkOutTime = now.toLocaleTimeString();

        await fetch(`${API_BASE}/checkout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: guestName || 'Guest',
            room: roomsToCheckout,
            contact: guestContact || '',
            checkInDate,
            checkInTime,
            checkOutDate,
            checkOutTime,
            daysStayed: days,
            totalRent,
            totalPaid: totalPayment,
            paymentTallyStatus: isTallied ? 'tallied' : 'not-tallied',
            checkOutDateTime: now.toISOString()
          })
        });
      } catch (mirrorErr) {
        console.warn('Remote checkout mirror failed:', mirrorErr);
      }
    } catch (err) {
      console.error(err);
      showError(err?.message || "❌ Failed to complete check-out");
    }
  }

  // -------- LOAD ALL CHECKOUT FILES (local disk preview) --------
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

  // Group occupied rooms by guest (so multi-room bookings are a single item)
  const occupiedMap = new Map();
  for (const f of Object.values(state.floors)) {
    for (const r of f) {
      if (r.status !== 'occupied' || !r.guest) continue;
      const key = `${r.guest.name}::${r.guest.checkIn || ''}`;
      if (!occupiedMap.has(key)) occupiedMap.set(key, { guest: r.guest, rooms: [] });
      occupiedMap.get(key).rooms.push(r.number);
    }
  }
  const occupied = Array.from(occupiedMap.values()).map(x => ({ guest: x.guest, rooms: x.rooms.sort((a,b)=>a-b) }));

  useEffect(() => {
    loadCheckoutList();
  }, []);

  const filteredCheckoutList = checkoutList.filter((c) => {
    const q = searchQuery.toLowerCase();
    const name = (c.name || '').toLowerCase();
    const roomStr = Array.isArray(c.room) ? c.room.join(', ') : (c.room || '');
    return name.includes(q) || roomStr.includes(q);
  });

  return (
    <div style={{ display: "flex", gap: 16 }}>
      {/* LEFT SIDE - OCCUPIED ROOMS */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {successMsg && <ToastCard color="#16a34a">{successMsg}</ToastCard>}
        {errorMsg && <ToastCard color="#dc2626">{errorMsg}</ToastCard>}

        {confirmMsg && (
          <ModalCard>
            <h3 style={{ marginTop: 0 }}>Confirm Check-Out</h3>
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

        <div className="card" style={{ padding: 12, marginBottom: 12 }}>
          <h2 style={{ margin: 0, marginBottom: 8 }}>Check-Out</h2>

          {occupied.length === 0 ? (
            <div style={{ color: "var(--muted)" }}>No occupied rooms</div>
          ) : (
            <div className="list" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {occupied.map((entry) => {
                const checkIn = entry.guest?.checkIn ? new Date(entry.guest.checkIn) : new Date();
                const now = new Date();
                const days = Math.max(1, Math.ceil((now - checkIn) / (1000 * 60 * 60 * 24)));
                const roomsLabel = entry.rooms.join(', ');

                return (
                  <div
                    key={roomsLabel}
                    className="card"
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 10 }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {entry.guest?.name}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>
                        Rooms {roomsLabel}
                      </div>
                    </div>

                    <button
                      className="btn primary"
                      onClick={async () => {
                        try {
                          const checkInISO = checkIn.toISOString().slice(0, 10);
                          const nowISO = ymd(now);
                          const guestName = entry.guest?.name || "Guest";

                          const rate = await getRateFromCheckin(checkInISO, entry.rooms[0], guestName);
                          const totalRent = days * (Number(rate) || 0);
                          const totalPayment = await getTotalPayments(checkInISO, entry.rooms, guestName, nowISO);
                          const tallyStatus = totalPayment >= totalRent;

                          setConfirmMsg({
                            roomNumber: entry.rooms,
                            text: `Check out rooms ${roomsLabel}?
Guest: ${guestName}
Days Stayed: ${days}
Total Rent: ₹${totalRent}
Total Payment: ₹${totalPayment}
Tally: ${tallyStatus ? "✅" : "❌"}`
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
          )}
        </div>
      </div>

      {/* RIGHT SIDE - CHECKED OUT LIST */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="card" style={{ padding: 12, marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}>
            <h2 style={{ margin: 0, flex: 1 }}>Checked-Out Guests</h2>
            <button onClick={() => navigate("/checkout-list")} className="pill" style={{background: 'var(--deep)', color: 'var(--cream)'}}> Show All Checkout </button>
          </div>

          <input
            type="text"
            placeholder="Search by name or room..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              marginBottom: 8,
              padding: "6px 8px",
              width: "100%",
              border: "1px solid var(--muted)",
              borderRadius: 6
            }}
          />

          <div className="list" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filteredCheckoutList.length === 0 ? (
              <div style={{ color: "var(--muted)" }}>No checkouts found</div>
            ) : (
              filteredCheckoutList.map((c, i) => (
                <div key={i} className="card" style={{ padding: 10 }}>
                  <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.name}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>
                    Room {Array.isArray(c.room) ? c.room.join(', ') : (c.room || '—')}
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 6, marginTop: 8, fontSize: 12 }}>
                    <div>Check-In: {c.checkInDate} {c.checkInTime}</div>
                    <div>Check-Out: {c.checkOutDate} {c.checkOutTime}</div>
                    <div>Days Stayed: {c.daysStayed}</div>
                    <div>Rent: ₹{c.totalRent}</div>
                    <div>Total Paid: ₹{c.totalPaid}</div>
                    <div>Payment Status: {String(c.paymentTallyStatus).toLowerCase() === "tallied" ? "✅ Tallied" : "❌ Not Tallied"}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}



function CheckoutListPage() {
  const [checkoutList, setCheckoutList] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterPayment, setFilterPayment] = useState("all"); // "all" | "tallied" | "not-tallied"

  useEffect(() => {
    loadCheckoutList();
  }, []);

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
      all.sort((a, b) => new Date(b.checkOutDateTime) - new Date(a.checkOutDateTime));
      setCheckoutList(all);
    } catch (err) {
      console.error("Failed to load checkout list", err);
      setErrorMsg("Failed to load checkout list");
      setTimeout(() => setErrorMsg(""), 3000);
    }
  }

  // Helpers
  const formatMoney = (n) => `₹${Number(n || 0).toLocaleString()}`;
  const chipStyle = (ok) => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    padding: "4px 8px",
    borderRadius: 999,
    border: `1px solid ${ok ? "rgba(22,163,74,0.25)" : "rgba(220,38,38,0.25)"}`,
    background: ok ? "rgba(22,163,74,0.10)" : "rgba(220,38,38,0.08)",
    color: ok ? "#166534" : "#991b1b",
    fontWeight: 600
  });

  // Filters
  const filteredCheckoutList = checkoutList.filter((c) => {
    const q = searchQuery.trim().toLowerCase();

    // Search
    const matchesSearch =
      q.length === 0 ||
      (c.name || "").toLowerCase().includes(q) ||
      String(c.room || "").includes(q);

    // Payment
    const status = (c.paymentTallyStatus || "").toLowerCase();
    const matchesPayment =
      filterPayment === "all" ||
      (filterPayment === "tallied" && status === "tallied") ||
      (filterPayment === "not-tallied" && status !== "tallied");

    // Date range (inclusive)
    const coTime = c.checkOutDateTime
      ? new Date(c.checkOutDateTime)
      : new Date((c.checkOutDate || "") + "T00:00:00");

    const fromOk = filterDateFrom ? coTime >= new Date(filterDateFrom + "T00:00:00") : true;
    const toOk = filterDateTo ? coTime <= new Date(filterDateTo + "T23:59:59") : true;

    return matchesSearch && matchesPayment && fromOk && toOk;
  });

  return (
    <div style={{ padding: 16 }}>
      {errorMsg && <ToastCard color="#dc2626">{errorMsg}</ToastCard>}

      {/* Filters/Header */}
      <div
        className="card"
        style={{
          padding: 14,
          marginBottom: 12,
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
          background: "var(--card-bg, #fff)",
          borderRadius: 10,
          boxShadow: "0 2px 8px rgba(0,0,0,0.05)"
        }}
      >
        <div style={{ fontWeight: 800, color: "var(--deep, #0b3d2e)", fontSize: 18 }}>
          Checked-Out Guests
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            type="text"
            placeholder="Search name or room..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              padding: "8px 10px",
              border: "1px solid rgba(0,0,0,0.12)",
              borderRadius: 8,
              minWidth: 200
            }}
          />
          <input
            type="date"
            value={filterDateFrom}
            onChange={(e) => setFilterDateFrom(e.target.value)}
            style={{
              padding: "8px 10px",
              border: "1px solid rgba(0,0,0,0.12)",
              borderRadius: 8
            }}
          />
          <input
            type="date"
            value={filterDateTo}
            onChange={(e) => setFilterDateTo(e.target.value)}
            style={{
              padding: "8px 10px",
              border: "1px solid rgba(0,0,0,0.12)",
              borderRadius: 8
            }}
          />
          <select
            value={filterPayment}
            onChange={(e) => setFilterPayment(e.target.value)}
            style={{
              padding: "8px 10px",
              border: "1px solid rgba(0,0,0,0.12)",
              borderRadius: 8,
              minWidth: 160
            }}
          >
            <option value="all">All payments</option>
            <option value="tallied">Tallied ✅</option>
            <option value="not-tallied">Not tallied ❌</option>
          </select>
          <button
            className="btn ghost"
            onClick={() => {
              setSearchQuery("");
              setFilterDateFrom("");
              setFilterDateTo("");
              setFilterPayment("all");
            }}
          >
            Clear
          </button>
        </div>
      </div>

      {/* Table */}
      <div
        className="card"
        style={{
          padding: 0,
          overflow: "hidden",
          background: "var(--card-bg, #fff)",
          borderRadius: 10,
          boxShadow: "0 4px 10px rgba(0,0,0,0.06)"
        }}
      >
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr
                style={{
                  background: "linear-gradient(0deg, rgba(12,53,44,0.03), rgba(12,53,44,0.03))",
                  color: "var(--deep, #0b3d2e)"
                }}
              >
                {[
                  "Name",
                  "Room",
                  "Check-In",
                  "Check-Out",
                  "Days",
                  "Rent",
                  "Total Paid",
                  "Payment Status"
                ].map((h, idx) => (
                  <th
                    key={idx}
                    style={{
                      position: "sticky",
                      top: 0,
                      textAlign: "left",
                      padding: "10px 12px",
                      fontSize: 12,
                      letterSpacing: 0.2,
                      borderBottom: "1px solid rgba(0,0,0,0.06)",
                      zIndex: 1,
                      background: "inherit"
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredCheckoutList.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    style={{
                      textAlign: "center",
                      padding: 16,
                      color: "var(--muted, #6b7280)"
                    }}
                  >
                    No checkouts found
                  </td>
                </tr>
              ) : (
                filteredCheckoutList.map((c, i) => {
                  const ok = (c.paymentTallyStatus || "").toLowerCase() === "tallied";
                  const rowBg = i % 2 === 0 ? "rgba(0,0,0,0.015)" : "transparent";
                  return (
                    <tr
                      key={i}
                      style={{
                        background: rowBg,
                        borderBottom: "1px solid rgba(0,0,0,0.06)"
                      }}
                    >
                      <td
                        style={{
                          padding: "10px 12px",
                          fontWeight: 600,
                          maxWidth: 220,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap"
                        }}
                      >
                        {c.name}
                      </td>
                      <td style={{ padding: "10px 12px" }}>{c.room}</td>
                      <td style={{ padding: "10px 12px" }}>
                        {(c.checkInDate || "-")} {(c.checkInTime || "")}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        {(c.checkOutDate || "-")} {(c.checkOutTime || "")}
                      </td>
                      <td style={{ padding: "10px 12px" }}>{c.daysStayed}</td>
                      <td style={{ padding: "10px 12px" }}>{formatMoney(c.totalRent)}</td>
                      <td style={{ padding: "10px 12px" }}>{formatMoney(c.totalPaid)}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={chipStyle(ok)}>
                          <span>{ok ? "✅" : "❌"}</span>
                          <span>{ok ? "Tallied" : "Not Tallied"}</span>
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
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
// Dedicated: remove 1 reservation file from disk
async function deleteReservationFile(date, room, name) {
  try {
    const base = await getBaseFolder();
    if (!base) {
      console.warn("Storage not connected; skipping disk deletion");
      return;
    }
    const dir = await ensurePath(base, ['Reservations', date]);
    const safe = String(name).replace(/[^\w\-]+/g, '_');
    await dir.removeEntry(`reservation-${room}-${safe}.json`);
    console.log(`Deleted reservation file: reservation-${room}-${safe}.json`);
  } catch (err) {
    console.warn("Failed to delete reservation file from disk:", err);
  }
}


function Reservations({ state, setState }) {
  const [form, setForm] = React.useState({ name: '', place: '', room: [], date: '' });
  const [availableRooms, setAvailableRooms] = React.useState([]);
  const [search, setSearch] = React.useState('');

  // Calculate available rooms for a date
  const updateAvailableRooms = (date) => {
    if (!date) {
      setAvailableRooms([]);
      return;
    }
    const reservedRoomSet = new Set();
    (state.reservations || []).forEach(r => {
      if (r.date === date) {
        if (Array.isArray(r.room)) r.room.forEach(n => reservedRoomSet.add(n));
        else reservedRoomSet.add(r.room);
      }
    });

    const rooms = [];
    for (const floor of Object.values(state.floors || {})) {
      for (const room of floor) {
        const roomNum = Number(room.number);
        const occupied = (state.checkins || []).some(ci => {
          const ciRooms = Array.isArray(ci.room) ? ci.room : [ci.room];
          return ciRooms.includes(roomNum);
        });
        const reserved = reservedRoomSet.has(roomNum);
        if (!occupied && !reserved) rooms.push(roomNum);
      }
    }
    setAvailableRooms(rooms);
  };

  // Add reservation
  const addReservation = async (e) => {
    e.preventDefault();
    if (!form.name || !form.place || !form.room.length || !form.date) {
      return alert('Please fill all fields and select at least one room');
    }
    const resObj = {
      name: form.name,
      place: form.place,
      room: form.room.map(Number),
      date: form.date,
    };
    const newState = { ...state };
    newState.reservations = (newState.reservations || []).filter(r => !(r.name === resObj.name && r.date === resObj.date));
    newState.reservations.push(resObj);
    setForm({ name: '', place: '', room: [], date: '' });
    setState(newState);
    saveState(newState);
    try {
      if ('BroadcastChannel' in window) {
        const bc = new BroadcastChannel('hotel_state');
        bc.postMessage({ type: 'state:update', state: newState });
        bc.close();
      }
    } catch {}
    await persistReservation(resObj);
    try {
      const API_BASE = window.MONGO_API_BASE || (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_MONGO_API_BASE) || '/api';
      await fetch(`${API_BASE}/reservation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(resObj)
      }).catch(() => { });
    } catch { }
  };

  // Delete reservation
  const deleteReservation = async (i) => {
    const res = state.reservations[i];
    if (!res) return;
    const confirmed = window.confirm(`Delete reservation?\n\nGuest: ${res.name}\nPlace: ${res.place || ''}\nRooms: ${ Array.isArray(res.room) ? res.room.join(', ') : res.room }\nDate: ${res.date}`);
    if (!confirmed) return;
    const newState = { ...state };
    newState.reservations.splice(i, 1);
    setState(newState);
    saveState(newState);
    try {
      if ('BroadcastChannel' in window) {
        const bc = new BroadcastChannel('hotel_state');
        bc.postMessage({ type: 'state:update', state: newState });
        bc.close();
      }
    } catch { }
    if (Array.isArray(res.room)) {
      for (const roomNum of res.room) await deleteReservationFile(res.date, roomNum, res.name);
    } else {
      await deleteReservationFile(res.date, res.room, res.name);
    }
    try {
      const API_BASE = window.MONGO_API_BASE || (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_MONGO_API_BASE) || '/api';
      await fetch(`${API_BASE}/reservation`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: res.name, date: res.date })
      }).catch(() => { });
    } catch { }
  };

  const navigate = useNavigate();
  const checkInReservation = (res) => {
    navigate('/checkin', { state: { prefName: res.name, prefRoom: res.room } });
  };

  // Filter reservations
  const filteredReservations = (state.reservations || []).filter(r => {
    const query = search.toLowerCase();
    const roomsStr = Array.isArray(r.room) ? r.room.join(' ') : String(r.room || '');
    return (
      r.name.toLowerCase().includes(query) ||
      (r.place && r.place.toLowerCase().includes(query)) ||
      roomsStr.includes(query) ||
      r.date.includes(query)
    );
  });

  return (
    <div>
      <div className="title" style={{ paddingBottom: 10 }}>Reservations</div>
      <form style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }} onSubmit={addReservation}>
        <input className="input" placeholder="Guest name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        <input className="input" placeholder="Place" value={form.place} onChange={e => setForm({ ...form, place: e.target.value })} />
        <input
          className="input"
          type="date"
          value={form.date}
          onChange={e => {
            setForm({ ...form, date: e.target.value, room: [] });
            updateAvailableRooms(e.target.value);
          }}
        />
        <select
          multiple
          className="input"
          value={form.room}
          disabled={!form.date}
          onChange={e => {
            const selected = Array.from(e.target.selectedOptions).map(o => o.value);
            setForm({ ...form, room: selected });
          }}
        >
          <option value="" disabled>Select one or more rooms</option>
          {availableRooms.map(num => (
            <option key={num} value={num}>{num} — Floor {String(num)[0]}</option>
          ))}
        </select>
        <button className="btn primary" type="submit">Add</button>
      </form>

      <input className="input" placeholder="Search reservations by name, place, room, or date" value={search} onChange={e => setSearch(e.target.value)} style={{ marginBottom: 12 }} />

      <div className="list">
        {filteredReservations.length === 0 && <div style={{ color: 'var(--muted)' }}>No reservations</div>}
        {filteredReservations.map((r, i) => (
          <div key={i} className="card" style={{ display: 'flex', justifyContent: 'space-between', padding: 12, borderRadius: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.05)', background: '#fff', border: '1px solid var(--muted)' }}>
            <div>
              <div style={{ fontWeight: '700' }}>{r.name} {r.place && <span style={{ color: 'var(--muted)', fontWeight: '700' }}> - {r.place}</span>}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Room {Array.isArray(r.room) ? r.room.join(', ') : r.room} — {r.date}</div>
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



// --- Backend mirror helpers for LiveUpdate sync ---
// Reuse the same API_BASE resolution pattern used elsewhere
const API_BASE =
  window.__MONGO_API_BASE__ ||
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_MONGO_API_BASE) ||
  '/api';

// Utility
function normalizeRoomsArray(room) {
  if (Array.isArray(room)) return room.map(Number).filter(Boolean).sort((a, b) => a - b);
  if (room == null) return [];
  return String(room)
    .split(',')
    .map(s => Number(s.trim()))
    .filter(Boolean)
    .sort((a, b) => a - b);
}
function toYMD(dateLike) {
  if (!dateLike) return '';
  const s = String(dateLike);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  try {
    return new Date(s).toISOString().slice(0, 10);
  } catch {
    return '';
  }
}

// ----- RentPayments: find server row id by signature -----
async function findServerRentRowId(signature) {
  try {
    const res = await fetch(`${API_BASE}/state`, { cache: 'no-store' });
    if (!res.ok) return null;
    const json = await res.json();
    // Support either state.rentPayments or state.rent_payments shapes
    const list = (json?.state?.rentPayments || json?.state?.rent_payments || []);
    const sigName = String(signature.name || '').trim().toLowerCase();
    const sigRoomsStr = JSON.stringify(normalizeRoomsArray(signature.room));
    const sigDate = toYMD(signature.date || signature._dateFolder);
    const sigAmount = signature.amount != null ? Number(signature.amount) : null;
    const sigDays = signature.days != null ? Number(signature.days) : null;
    const sigMode = String(signature.mode || '').trim().toLowerCase();

    for (const r of list) {
      const name = String(r.name || '').trim().toLowerCase();
      const roomsStr = JSON.stringify(normalizeRoomsArray(r.room));
      const date = toYMD(r.date);
      const amount = r.amount != null ? Number(r.amount) : null;
      const days = r.days != null ? Number(r.days) : null;
      const mode = String(r.mode || '').trim().toLowerCase();

      // Strict match on key fields to avoid wrong updates
      const ok =
        (!sigDate || date === sigDate) &&
        (!sigName || name === sigName) &&
        (!sigRoomsStr || roomsStr === sigRoomsStr) &&
        (sigAmount === null || amount === sigAmount) &&
        (sigDays === null || days === sigDays) &&
        (!sigMode || mode === sigMode);

      if (ok) return r.id || r._id || null;
    }
    return null;
  } catch (e) {
    console.warn('findServerRentRowId failed', e);
    return null;
  }
}

async function mirrorRentEdit(originalRow, updatedRow) {
  try {
    const id = await findServerRentRowId({
      date: originalRow._dateFolder,
      name: originalRow.name,
      room: originalRow.room,
      days: originalRow.days,
      amount: originalRow.amount,
      mode: originalRow.mode
    });
    if (!id) return;

    await fetch(`${API_BASE}/rent-payment/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // Send only the fields that can change in your UI
        days: Number(updatedRow.days) || 0,
        amount: Number(updatedRow.amount) || 0,
        mode: updatedRow.mode || 'Cash'
      })
    }).catch(() => {});
  } catch (e) {
    console.warn('mirrorRentEdit failed', e);
  }
}

async function mirrorRentDelete(originalRow) {
  try {
    const id = await findServerRentRowId({
      date: originalRow._dateFolder,
      name: originalRow.name,
      room: originalRow.room,
      days: originalRow.days,
      amount: originalRow.amount,
      mode: originalRow.mode
    });
    if (!id) return;

    await fetch(`${API_BASE}/rent-payment/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    }).catch(() => {});
  } catch (e) {
    console.warn('mirrorRentDelete failed', e);
  }
}

// ----- ExpensePayments: find server expense id -----
async function findServerExpenseId(signature) {
  try {
    const res = await fetch(`${API_BASE}/state`, { cache: 'no-store' });
    if (!res.ok) return null;
    const json = await res.json();
    const list = (json?.state?.expenses || []);
    const sigDate = toYMD(signature.date || signature._dateFolder);
    const sigDesc = String(signature.description || '').trim().toLowerCase();
    const sigAmount = signature.amount != null ? Number(signature.amount) : null;

    for (const r of list) {
      const date = toYMD(r.date);
      const desc = String(r.description || '').trim().toLowerCase();
      const amt = r.amount != null ? Number(r.amount) : null;

      const ok =
        (!sigDate || date === sigDate) &&
        (!sigDesc || desc === sigDesc) &&
        (sigAmount === null || amt === sigAmount);

      if (ok) return r.id || r._id || null;
    }
    return null;
  } catch (e) {
    console.warn('findServerExpenseId failed', e);
    return null;
  }
}

async function mirrorExpenseDelete(originalRow) {
  try {
    const id = await findServerExpenseId({
      date: originalRow._dateFolder,
      description: originalRow.description,
      amount: originalRow.amount
    });
    if (!id) return;
    await fetch(`${API_BASE}/expense/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    }).catch(() => {});
  } catch (e) {
    console.warn('mirrorExpenseDelete failed', e);
  }
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

  // Mirror to backend so LiveUpdate reflects edits
  mirrorRentEdit(row, updated).catch(() => {});

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

  // Mirror delete to backend so LiveUpdate reflects deletions
  mirrorRentDelete(row).catch(() => {});

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

    // Mirror delete to backend so LiveUpdate reflects deletions
    mirrorExpenseDelete(pendingRow).catch(() => {});

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

  // 🔹 Compute occupied rooms grouped by guest (multi-room bookings shown as one option)
  const occupiedRooms = [];
  {
    const map = new Map();
    Object.keys(state.floors).forEach(floorNum => {
      state.floors[floorNum].forEach(room => {
        if (room.status === "occupied" && room.guest) {
          const key = `${room.guest.name}::${room.guest.checkIn || ''}`;
          if (!map.has(key)) map.set(key, { guestName: room.guest.name, rooms: [] });
          map.get(key).rooms.push(room.number);
        }
      });
    });
    for (const v of map.values()) {
      occupiedRooms.push({ guestName: v.guestName, rooms: v.rooms.sort((a,b)=>a-b) });
    }
  }

  const handleRoomChange = (roomsCsv) => {
    const rooms = String(roomsCsv || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const selected = occupiedRooms.find(r => r.rooms.join(',') === rooms.join(','));
    setRentForm(f => ({
      ...f,
      room: rooms.join(',') || '',
      name: selected ? selected.guestName : ''
    }));
  };

  // Helper: find the current stay's check-in date as YYYY-MM-DD for the selected group (guest + rooms)
  function findCheckInYMD(state, guestName, roomsCsv) {
    const roomsArr = String(roomsCsv || '')
      .split(',')
      .map(s => Number(s.trim()))
      .filter(Boolean)
      .sort((a,b)=>a-b);

    for (const fl of Object.values(state.floors || {})) {
      for (const r of fl) {
        if (r.status === 'occupied' && r.guest && roomsArr.includes(r.number)) {
          const sameGuest = (r.guest.name || '').trim().toLowerCase() === (guestName || '').trim().toLowerCase();
          if (!sameGuest) continue;

          // Prefer explicit checkInDate if present; normalize to yyyy-mm-dd
          if (r.guest.checkInDate) {
            const d = String(r.guest.checkInDate);
            if (/^\d{2}\/\d{2}\/\d{4}$/.test(d)) {
              const [dd, mm, yyyy] = d.split('/');
              return `${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`;
            }
            if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
          }
          if (r.guest.checkIn) return new Date(r.guest.checkIn).toISOString().slice(0,10);
        }
      }
    }
    return null;
  }

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

      // Normalize rooms as array
      const roomsArr = rentForm.room ? rentForm.room.split(',').map(s => Number(s.trim())) : [];
      const roomsKey = roomsArr.join('_') || String(rentForm.room || '').replace(/[^\w\-]+/g, '_');
      const fileName = `rent-${rentForm.name.replace(/[^\w\-]+/g, "_")}-${roomsKey || 'room'}-${Date.now()}.json`;

      const rentData = {
        ...rentForm,
        room: roomsArr.length ? roomsArr : (isNaN(Number(rentForm.room)) ? rentForm.room : [Number(rentForm.room)]),
        date: new Date().toISOString(),
      };

      await writeJSON(rentDir, fileName, rentData);
      // ✅ Refresh today's lists instantly
      await loadTodayData();

      // NEW: Mirror to backend for LiveUpdate with checkInYmd stay key
      try {
        const API_BASE =
          window.__MONGO_API_BASE__ ||
          (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_MONGO_API_BASE) ||
          '/api';

        const checkInYmd = findCheckInYMD(state, rentData.name, rentForm.room); // stay key

        await fetch(`${API_BASE}/rent-payment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: rentData.name,
            room: Array.isArray(rentData.room)
              ? rentData.room
              : String(rentData.room || '')
                  .split(',')
                  .map(s => Number(s.trim()))
                  .filter(Boolean),
            days: Number(rentData.days) || 0,
            amount: Number(rentData.amount) || 0,
            mode: rentData.mode || 'Cash',
            // Use YYYY-MM-DD for server-side sort consistency
            date: new Date().toISOString().slice(0, 10),
            checkInYmd: checkInYmd || null
          })
        });
      } catch (mirrorErr) {
        console.warn('Remote rent-payment mirror failed:', mirrorErr);
      }
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

      // Mirror to backend for LiveUpdate
      try {
        const API_BASE =
          window.__MONGO_API_BASE__ ||
          (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_MONGO_API_BASE) ||
          '/api';
        await fetch(`${API_BASE}/expense`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            description: expenseData.description,
            amount: Number(expenseData.amount) || 0,
            date: new Date().toISOString().slice(0, 10)
          })
        });
      } catch (mirrorErr) {
        console.warn('Remote expense mirror failed:', mirrorErr);
      }
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
            className="pill" style={{background: 'var(--deep)', color: 'var(--cream)',}}
          >
            📑 Show All Rent Payments
          </button>

          <button
            onClick={() => navigate("/expense-payments")}
            className="pill" style={{background: 'var(--deep)', color: 'var(--cream)',}}
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
                <option key={r.rooms.join('_')} value={r.rooms.join(',')}>
                  Rooms {r.rooms.join(', ')} — {r.guestName}
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
                    Rooms {Array.isArray(r.room) ? r.room.join(', ') : r.room} — <strong>{r.name}</strong>
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



function buildScanFolders(dateStr) {
  if (!dateStr) return null;
  let d;

  // case 1: ISO yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    d = new Date(dateStr + "T00:00:00");
  }
  // case 2: dd/mm/yyyy
  else if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
    const [dd, mm, yyyy] = dateStr.split("/");
    d = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
  }
  // fallback
  else {
    d = new Date(dateStr);
  }

  if (isNaN(d)) return null;

  const year = String(d.getFullYear());
  const month = d.toLocaleString("en-US", { month: "short" }).toLowerCase();
  const folder = `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${year}`;

  return { year, month, folder };
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
  useEffect(() => { 
    saveState(state); 
    // attempt to write to remote (non-blocking)
    (async () => {
      try {
        const { saveAll } = await import('./services/dualSync');
        saveAll(state).catch(e => console.warn('remote save failed', e));
      } catch (e) { console.warn('dualSync import failed', e); }
    })();
  }, [state]);

  useEffect(() => {
  (async () => {
    const base = await getBaseFolder();
    if (base) {
      const synced = await hydrateStateFromDisk(state);
      if (synced) setState(synced);
    }
  })();
}, []);
  const loc = useLocation();
  return (
    <>
      <div className="app-shell">
        {/* Hide sidebar on liveupdate pages */}
        {!loc.pathname.startsWith('/liveupdate') && <Sidebar />}
        <div className="main">
          <Routes>
            <Route path="/" element={<Dashboard state={state} />} />
            <Route path="/checkin" element={<CheckIn state={state} setState={setState} locationState={{}} />} />
            <Route path="/checkout" element={<CheckOut state={state} setState={setState} />} />
            <Route path="/reservations" element={<Reservations state={state} setState={setState} />} />
            <Route path="/storage" element={<StorageSetup setState={setState} state={state} />} />
            <Route path="/accounts" element={<Accounts state={state} setState={setState} />} />
            <Route path="/analysis" element={<Analysis />} />
            <Route path="/rent-payments" element={<RentPayments />} /> 
            <Route path="/expense-payments" element={<ExpensePayments />} />
            <Route path="/checkout-list" element={<CheckoutListPage />} /> 
            <Route path="/liveupdate" element={<LiveUpdate />} />
            <Route path="/liveupdate/reservations" element={<LiveUpdate />} />
            <Route path="/liveupdate/checkout" element={<LiveUpdate />} />
            <Route path="/liveupdate/rentpayment" element={<LiveUpdate />} />
            <Route path="/liveupdate/expenses" element={<LiveUpdate />} />
          </Routes>
        </div>
      </div>
    </>
  );
}
