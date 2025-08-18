const express = require('express');
const cors = require('cors');
const { nanoid } = require('nanoid');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const os = require('os');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '5mb' }));

const STORE_DIR = path.join(__dirname, 'snapshots');
if (!fs.existsSync(STORE_DIR)) fs.mkdirSync(STORE_DIR, { recursive: true });

// Register a permanent sharing id and store initial state
app.post('/register', async (req, res) => {
  try {
    const id = nanoid(10);
    const token = nanoid(8);
    const data = req.body || {};
  const file = path.join(STORE_DIR, id + '.json');
  // allow creating a public snapshot (no token required to view) if requested
  const isPublic = !!data.public;
  // compute advertised base early so we can persist it
  function detectLanIp() {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) return net.address;
      }
    }
    return null;
  }
  // allow caller to request a specific advertised host (useful when auto-detection fails)
  const configured = process.env.PUBLIC_HOST || process.env.SHARE_HOST || null;
  const bodyHost = (data && (data.host || data.publicHost)) ? String(data.host || data.publicHost) : null;
  const detectedIp = detectLanIp();
  const port = process.env.PORT || req.socket.localPort || (req.get('host') && req.get('host').split(':')[1]) || 4000;
  const publicHost = bodyHost || configured || (detectedIp ? `${detectedIp}:${port}` : req.get('host'));
  const advertisedBase = isPublic ? `${req.protocol}://${publicHost}` : null;
  const snapshot = { id, token, public: isPublic, advertisedBase, state: data.state || null, rents: data.rents || [], expenses: data.expenses || [], reservations: data.reservations || [], created: Date.now() };
  try { fs.writeFileSync(file, JSON.stringify(snapshot, null, 2)); } catch (e) { console.error('write failed', e); }
    // compute a base URL to advertise for public links.
    // priority: process.env.PUBLIC_HOST (can include :port) -> detected LAN IPv4 + port -> req.get('host')
    function detectLanIp() {
      const nets = os.networkInterfaces();
      for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
          if (net.family === 'IPv4' && !net.internal) return net.address;
        }
      }
      return null;
    }

  const base = `${req.protocol}://${req.get('host')}`;
  const secureUrl = `${base}/s/${id}?k=${token}`;
  const publicUrl = isPublic ? (advertisedBase + '/m/' + id) : null;
  res.json({ id, url: secureUrl, token, publicUrl, advertisedBase: advertisedBase || undefined });
  } catch (err) {
    console.error('register failed', err);
    res.status(500).json({ error: String(err) });
  }
});

// Update state for an existing id and notify SSE clients
app.post('/update/:id', async (req, res) => {
  try {
    const id = req.params.id;
    // validate token (query param 'k' or header 'x-share-token')
    const provided = req.query.k || req.get('x-share-token');
    const data = req.body || {};
    const file = path.join(STORE_DIR, id + '.json');
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'id-not-found' });
  let parsed = {};
  try { parsed = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { parsed = {}; }
  if (parsed.token && String(parsed.token) !== String(provided)) return res.status(403).json({ error: 'invalid-token' });
  parsed.state = data.state || parsed.state;
  // accept optional top-level rents/expenses/reservations
  if (data.rents) parsed.rents = data.rents;
  if (data.expenses) parsed.expenses = data.expenses;
  if (data.reservations) parsed.reservations = data.reservations;
  parsed.updated = Date.now();
  try { fs.writeFileSync(file, JSON.stringify(parsed, null, 2)); } catch (e) { console.error('update write failed', e); }
    // broadcast to SSE clients
    const clients = sseClients[id] || [];
      const payload = JSON.stringify({ type: 'update', state: parsed.state, rents: parsed.rents || [], expenses: parsed.expenses || [], reservations: parsed.reservations || [], updated: parsed.updated });
      for (const resStream of clients) {
        try { resStream.write(`data: ${payload}\n\n`); } catch (e) { /* ignore */ }
      }
    res.json({ ok: true });
  } catch (err) {
    console.error('update failed', err);
    res.status(500).json({ error: String(err) });
  }
});

// SSE clients map: id -> array of response streams
const sseClients = {};

app.get('/sse/:id', (req, res) => {
  const id = req.params.id;
  const provided = req.query.k || req.get('x-share-token');
  const file = path.join(STORE_DIR, id + '.json');
  if (!fs.existsSync(file)) return res.status(404).send('Not found');
  // validate token unless snapshot is public
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!parsed.public && parsed.token && String(parsed.token) !== String(provided)) return res.status(403).send('invalid-token');
  } catch(e) { }
  // Headers for SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });
  res.write('\n');
  // send initial state
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    const payload = JSON.stringify({ type: 'init', state: parsed.state, rents: parsed.rents || [], expenses: parsed.expenses || [], reservations: parsed.reservations || [], created: parsed.created, updated: parsed.updated || null });
    res.write(`data: ${payload}\n\n`);
  } catch (e) { /* ignore */ }

  // register client
  sseClients[id] = sseClients[id] || [];
  sseClients[id].push(res);

  // cleanup on close
  req.on('close', () => {
    sseClients[id] = (sseClients[id] || []).filter(r => r !== res);
  });
});

// Serve a simple viewer page that connects to SSE for live updates
app.get('/s/:id', (req, res) => {
  const id = req.params.id;
  const provided = req.query.k || req.get('x-share-token');
  const file = path.join(STORE_DIR, id + '.json');
  if (!fs.existsSync(file)) return res.status(404).send('Not found');
  // validate token for viewer unless snapshot is public
  try { const parsed = JSON.parse(fs.readFileSync(file, 'utf8')); if (!parsed.public && parsed.token && String(parsed.token) !== String(provided)) return res.status(403).send('invalid-token'); } catch(e) { }
  const serverBase = `${req.protocol}://${req.get('host')}`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Live View ${id}</title>
  <style>
    :root{--bg:#f6f6f6;--card:#fff;--muted:#666;--accent:#0b74de}
    html,body{height:100%;margin:0;font-family:system-ui,Segoe UI,Roboto,Arial;background:var(--bg);color:#111}
    .wrap{max-width:1100px;margin:12px auto;padding:12px}
    header{display:flex;align-items:center;justify-content:space-between;gap:12px}
    h1{font-size:18px;margin:0}
    .meta{font-size:13px;color:var(--muted)}
    .grid{display:grid;grid-template-columns:1fr 360px;gap:12px;margin-top:12px}
    .card{background:var(--card);padding:12px;border-radius:8px;margin-bottom:8px;box-shadow:0 2px 10px rgba(0,0,0,0.04)}
    .rooms{display:flex;flex-direction:column;gap:10px}
    .floor{margin-bottom:6px}
    .floor-title{font-weight:700;margin-bottom:6px}
    .room-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
    .room{height:56px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff}
    .room.free{background:#e9ecef;color:#222}
    .room.occupied{background:#2e8b57}
    .room.reserved{background:#ff8c00}
    .legend{display:flex;gap:8px;align-items:center;margin-top:8px}
    .legend .item{display:flex;gap:6px;align-items:center;font-size:13px}
    .dot{width:14px;height:14px;border-radius:4px}
    .list{display:flex;flex-direction:column;gap:8px;max-height:60vh;overflow:auto}
    .list .row{display:flex;justify-content:space-between;align-items:center;padding:8px;border-radius:6px;background:linear-gradient(180deg,rgba(0,0,0,0.01),transparent)}
    .controls{display:flex;gap:8px;margin-bottom:8px}
    input[type="search"], select{padding:8px;border-radius:6px;border:1px solid #ddd;flex:1}
    @media(max-width:900px){.grid{grid-template-columns:1fr}.wrap{padding:8px}}
  </style>
  </head><body>
    <div class="wrap">
    <header>
      <div>
        <h1>Hotel Surya — Live View</h1>
        <div id="meta" class="meta">Connecting...</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px">
        <div style="display:flex;gap:6px;">
          <button onclick="openPage('checkouts')" style="padding:8px 10px;border-radius:6px;border:1px solid #ddd;background:#fff;">Checkouts</button>
          <button onclick="openPage('reservations')" style="padding:8px 10px;border-radius:6px;border:1px solid #ddd;background:#fff;">Reservations</button>
          <button onclick="openPage('rents')" style="padding:8px 10px;border-radius:6px;border:1px solid #ddd;background:#fff;">Rents</button>
          <button onclick="openPage('expenses')" style="padding:8px 10px;border-radius:6px;border:1px solid #ddd;background:#fff;">Expenses</button>
        </div>
        <div style="text-align:right">
          <div id="created" class="meta"></div>
          <div id="updated" class="meta"></div>
        </div>
      </div>
    </header>
    <div class="grid">
      <div>
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <strong>Rooms</strong>
            <div class="legend">
              <div class="item"><div class="dot" style="background:#2e8b57"></div>Occupied</div>
              <div class="item"><div class="dot" style="background:#ff8c00"></div>Reserved</div>
              <div class="item"><div class="dot" style="background:#e9ecef;border:1px solid #bbb"></div>Free</div>
            </div>
          </div>
        </div>
        <div id="rooms" class="card rooms">Loading rooms...</div>
        <div id="reservations" class="card">Loading reservations...</div>
      </div>

      <div>
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <strong>Current Guests</strong>
            <div style="font-size:13px;color:var(--muted)" id="guest-count"></div>
          </div>
          <div class="controls"><input id="guest-search" type="search" placeholder="Search guests..." /></div>
          <div id="guest-list" class="list">Waiting for data...</div>
        </div>

        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <strong>Checkouts</strong>
            <div style="font-size:13px;color:var(--muted)" id="checkout-count"></div>
          </div>
          <div class="controls"><input id="checkout-search" type="search" placeholder="Search checkouts..." /></div>
          <div id="checkout-list" class="list">Waiting for data...</div>
        </div>

        <div class="card">
          <strong>Recent Rent Payments</strong>
          <div class="controls"><input id="rent-search" type="search" placeholder="Search rents..." /></div>
          <div id="rent-list" class="list">Waiting for data...</div>
        </div>

        <div class="card">
          <strong>Recent Expenses</strong>
          <div class="controls"><input id="expense-search" type="search" placeholder="Search expenses..." /></div>
          <div id="expense-list" class="list">Waiting for data...</div>
        </div>
      </div>
    </div>
    <!-- full-page overlays for focused views -->
    <div id="page-overlay" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:80;padding:18px;box-sizing:border-box">
      <div style="max-width:1100px;margin:0 auto;background:var(--card);border-radius:8px;padding:12px;position:relative;height:90vh;overflow:auto">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <strong id="page-title">Details</strong>
          <div><button onclick="closePage()" style="padding:6px 10px;border-radius:6px;border:1px solid #ddd;background:#fff">Close</button></div>
        </div>
        <div id="page-checkouts" style="display:none"></div>
        <div id="page-reservations" style="display:none"></div>
        <div id="page-rents" style="display:none"></div>
        <div id="page-expenses" style="display:none"></div>
      </div>
    </div>
  </div>

  <script>
  const SERVER_BASE = ${JSON.stringify(serverBase)}; // absolute share server base so viewer can be hosted elsewhere
  const id = ${JSON.stringify(id)};
    let currentState = {};
    let createdTs = null;
    let updatedTs = null;

    const metaEl = document.getElementById('meta');
    const createdEl = document.getElementById('created');
    const updatedEl = document.getElementById('updated');

    function fmt(ts){ if(!ts) return ''; try { return new Date(ts).toLocaleString(); } catch(e){return ''} }

    function renderRooms(state){
      const roomsEl = document.getElementById('rooms');
      const floors = state.floors || {};
      const keys = Object.keys(floors).sort((a,b)=>Number(a)-Number(b));
      if(keys.length===0){ roomsEl.innerHTML = '<div style="color:var(--muted)">No room data</div>'; return }
      // build a set of reserved rooms from state.reservations for today (if any)
      var reservedSet = new Set();
      try {
        const todayISO = new Date().toISOString().slice(0,10);
        const resList = state.reservations || [];
        for(var i=0;i<resList.length;i++){ const rr = resList[i]; if(String(rr.date||'').slice(0,10) === todayISO) reservedSet.add(Number(rr.room)); }
      } catch(e) { }

      roomsEl.innerHTML = keys.map(function(f){
        var roomsHtml = (floors[f]||[]).map(function(r){
          var cls = r.status || 'free';
          // if room is free but reserved for today, mark as reserved
          if((!r.status || r.status==='free') && reservedSet.has(Number(r.number))) cls = 'reserved';
          return '<div class="room ' + cls + '">' + (r.number) + '</div>';
        }).join('');
        return '<div class="floor">' +
          '<div class="floor-title">Floor ' + f + '</div>' +
          '<div class="room-grid">' + roomsHtml + '</div>' +
        '</div>';
      }).join('');
    }

    function buildGuestList(state){
      const list = [];
      for(const floorArr of Object.values(state.floors||{})){
        for(const r of floorArr){
          if(r.status==='occupied' && r.guest){
            list.push({ name: r.guest.name, contact: r.guest.contact, room: r.number });
          }
        }
      }
      return list;
    }

    function renderGuests(state){
      const guests = buildGuestList(state);
      document.getElementById('guest-count').textContent = guests.length ? guests.length + ' guests' : '';
      const q = (document.getElementById('guest-search').value||'').toLowerCase().trim();
      var out = guests.filter(g => !q || Object.values(g).some(v=>String(v||'').toLowerCase().includes(q))).map(function(g){
        return '<div class="row"><div><div style="font-weight:700">' + escapeHtml(g.name) + '</div><div style="font-size:12px;color:var(--muted)">Room ' + g.room + ' — ' + escapeHtml(g.contact||'') + '</div></div></div>';
      }).join('') || '<div style="color:var(--muted)">No guests</div>';
      document.getElementById('guest-list').innerHTML = out;
    }

    function renderCheckouts(state){
      const rows = [];
      for(const floorArr of Object.values(state.floors||{})){
        for(const r of floorArr){
          if(r.status==='occupied') rows.push({ room: r.number, guest: r.guest||{} });
        }
      }
      document.getElementById('checkout-count').textContent = rows.length ? rows.length + ' rooms' : '';
      const q = (document.getElementById('checkout-search').value||'').toLowerCase().trim();
      var out = rows.filter(c=> !q || (String(c.room).includes(q) || (c.guest && Object.values(c.guest).some(v=>String(v||'').toLowerCase().includes(q)))) ).map(function(c){
        return '<div class="row"><div><div style="font-weight:700">' + escapeHtml(c.guest.name||'Unknown') + '</div><div style="font-size:12px;color:var(--muted)">Room ' + c.room + '</div></div><div style="font-size:12px;color:var(--muted)">' + escapeHtml(c.guest.contact||'') + '</div></div>';
      }).join('') || '<div style="color:var(--muted)">No checkouts</div>';
      document.getElementById('checkout-list').innerHTML = out;
    }

    function renderRents(state){
      const rents = state.rents || state.payments || [];
      const q = (document.getElementById('rent-search').value||'').toLowerCase().trim();
      var out = (rents||[]).filter(r=> !q || Object.values(r).some(v=>String(v||'').toLowerCase().includes(q))).map(function(r){
        return '<div class="row"><div><div style="font-weight:700">' + escapeHtml(r.name||r.description||'') + '</div><div style="font-size:12px;color:var(--muted)">' + escapeHtml(r._dateFolder||r.date||'') + '</div></div><div style="font-weight:800">₹' + escapeHtml(r.amount||'0') + '</div></div>';
      }).join('') || '<div style="color:var(--muted)">No rent records</div>';
      document.getElementById('rent-list').innerHTML = out;
    }

    function renderExpenses(state){
      const ex = state.expenses || [];
      const q = (document.getElementById('expense-search').value||'').toLowerCase().trim();
      var out = (ex||[]).filter(e=> !q || Object.values(e).some(v=>String(v||'').toLowerCase().includes(q))).map(function(e){
        return '<div class="row"><div><div style="font-weight:700">' + escapeHtml(e.description||'') + '</div><div style="font-size:12px;color:var(--muted)">' + escapeHtml(e._dateFolder||e.date||'') + '</div></div><div style="font-weight:800">₹' + escapeHtml(e.amount||'0') + '</div></div>';
      }).join('') || '<div style="color:var(--muted)">No expenses</div>';
      document.getElementById('expense-list').innerHTML = out;
    }

    function escapeHtml(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

    function renderAll(){
      renderRooms(currentState);
      renderGuests(currentState);
      renderCheckouts(currentState);
      renderRents(currentState);
      renderExpenses(currentState);
      createdEl.textContent = createdTs ? 'Created: ' + fmt(createdTs) : '';
      updatedEl.textContent = updatedTs ? 'Last update: ' + fmt(updatedTs) : '';
    }

    document.getElementById('guest-search').addEventListener('input', ()=>renderGuests(currentState));
    document.getElementById('checkout-search').addEventListener('input', ()=>renderCheckouts(currentState));
    document.getElementById('rent-search').addEventListener('input', ()=>renderRents(currentState));
    document.getElementById('expense-search').addEventListener('input', ()=>renderExpenses(currentState));

  // include token if present in query string when opening SSE
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('k');
  const sseUrl = SERVER_BASE + '/sse/' + id + (token ? ('?k=' + encodeURIComponent(token)) : '');
  const evt = new EventSource(sseUrl);
    evt.onopen = () => { metaEl.textContent = 'Connected'; };
    evt.onmessage = (ev) => {
      try{
        const msg = JSON.parse(ev.data);
        if(msg.type === 'init'){
          createdTs = msg.created || null;
          updatedTs = msg.updated || null;
          currentState = msg.state || {};
          // attach rents/expenses/reservations if present
          if(msg.rents) currentState.rents = msg.rents;
          if(msg.expenses) currentState.expenses = msg.expenses;
          if(msg.reservations) currentState.reservations = msg.reservations;
          metaEl.textContent = 'Initialized';
        } else if(msg.type === 'update'){
          updatedTs = msg.updated || Date.now();
          currentState = msg.state || currentState;
          if(msg.rents) currentState.rents = msg.rents;
          if(msg.expenses) currentState.expenses = msg.expenses;
          if(msg.reservations) currentState.reservations = msg.reservations;
          metaEl.textContent = 'Updated';
        }
        renderAll();
      }catch(e){ console.error(e) }
    };
    evt.onerror = (e)=>{ metaEl.textContent = 'Disconnected - retrying...'; };

    // page overlay open/close logic
    function openPage(which){
      document.getElementById('page-overlay').style.display = 'block';
      document.getElementById('page-title').textContent = which.charAt(0).toUpperCase() + which.slice(1);
      ['checkouts','reservations','rents','expenses'].forEach(k=>{
        const el = document.getElementById('page-' + k);
        if(!el) return;
        el.style.display = (k === which) ? 'block' : 'none';
      });
      // populate content
      if(which === 'checkouts') renderPageCheckouts(currentState);
      if(which === 'reservations') renderPageReservations(currentState);
      if(which === 'rents') renderPageRents(currentState);
      if(which === 'expenses') renderPageExpenses(currentState);
    }
    function closePage(){ document.getElementById('page-overlay').style.display = 'none'; }

    function renderPageCheckouts(state){
      const out = [];
      for(const floorArr of Object.values(state.floors||{})){
        for(const r of floorArr){ if(r.status === 'occupied') out.push(r); }
      }
      const el = document.getElementById('page-checkouts');
      el.innerHTML = out.map(r=> '<div style="padding:8px;border-bottom:1px solid #eee"><div style="font-weight:700">' + escapeHtml((r.guest && r.guest.name) || 'Unknown') + '</div><div style="font-size:13px;color:var(--muted)">Room ' + escapeHtml(r.number) + (r.guest && r.guest.contact ? ' — ' + escapeHtml(r.guest.contact) : '') + '</div></div>').join('') || '<div style="color:var(--muted)">No checkouts</div>';
    }

    function renderPageReservations(state){
      const res = state.reservations || state.bookings || [];
      const el = document.getElementById('page-reservations');
      el.innerHTML = (res||[]).map(r=> '<div style="padding:8px;border-bottom:1px solid #eee"><div style="font-weight:700">' + escapeHtml(r.name||r.guest||'Reservation') + '</div><div style="font-size:13px;color:var(--muted)">' + escapeHtml(r._dateFolder||r.date||'') + ' — ' + escapeHtml(r.room||r.roomNumber||'') + '</div></div>').join('') || '<div style="color:var(--muted)">No reservations</div>';
    }

    function renderPageRents(state){
      const rents = state.rents || state.payments || [];
      const el = document.getElementById('page-rents');
      el.innerHTML = (rents||[]).map(r=> '<div style="padding:8px;border-bottom:1px solid #eee"><div style="font-weight:700">' + escapeHtml(r.name||r.description||'') + '</div><div style="font-size:13px;color:var(--muted)">' + escapeHtml(r._dateFolder||r.date||'') + '</div><div style="font-weight:800">₹' + escapeHtml(r.amount||'0') + '</div></div>').join('') || '<div style="color:var(--muted)">No rent records</div>';
    }

    function renderPageExpenses(state){
      const ex = state.expenses || [];
      const el = document.getElementById('page-expenses');
      el.innerHTML = (ex||[]).map(e=> '<div style="padding:8px;border-bottom:1px solid #eee"><div style="font-weight:700">' + escapeHtml(e.description||'') + '</div><div style="font-size:13px;color:var(--muted)">' + escapeHtml(e._dateFolder||e.date||'') + '</div><div style="font-weight:800">₹' + escapeHtml(e.amount||'0') + '</div></div>').join('') || '<div style="color:var(--muted)">No expenses</div>';
    }
  </script>
  </body></html>`;
  res.send(html);
});

// Public mobile-friendly viewer (no token required) - intended for sharing to phones/devices
app.get('/m/:id', (req, res) => {
  const id = req.params.id;
  const file = path.join(STORE_DIR, id + '.json');
  if (!fs.existsSync(file)) return res.status(404).send('Not found');
  // try to read advertised base from snapshot (if the registrar returned advertisedBase)
  let serverBase = `${req.protocol}://${req.get('host')}`;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (parsed.advertisedBase) serverBase = parsed.advertisedBase;
  } catch (e) { /* ignore */ }
  // Serve a streamlined mobile-first viewer; same content as /s/:id but without token validation
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mobile View ${id}</title>
  <style>
    :root{--bg:#f6f6f6;--card:#fff;--muted:#666;--accent:#0b74de}
    html,body{height:100%;margin:0;font-family:system-ui,Segoe UI,Roboto,Arial;background:var(--bg);color:#111}
    .wrap{padding:12px;max-width:900px;margin:0 auto}
    header{display:flex;align-items:center;justify-content:space-between;gap:8px}
    h1{font-size:18px;margin:0}
    .rooms{display:flex;flex-direction:column;gap:8px}
    .room-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
    .room{height:64px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff;font-size:15px}
    .free{background:#e9ecef;color:#222}
    .occupied{background:#2e8b57}
    .reserved{background:#ff8c00}
    .card{background:var(--card);padding:12px;border-radius:10px;margin-bottom:10px;box-shadow:0 6px 18px rgba(0,0,0,0.06)}
    .list{display:flex;flex-direction:column;gap:8px}
    .row{display:flex;justify-content:space-between;align-items:center}
    .controls{display:flex;gap:8px;margin-bottom:8px}
    .muted{font-size:12px;color:var(--muted)}
    .btn{padding:8px 10px;border-radius:8px;border:1px solid #ddd;background:#fff}
    .btn.primary{background:var(--accent);color:#fff;border:0}
    .status{font-size:12px;color:var(--muted);margin-top:6px}
    @media(max-width:420px){ .room{height:72px;font-size:16px} .room-grid{grid-template-columns:repeat(3,1fr)} }
  </style>
  </head><body>
  <div class="wrap">
    <header>
      <div>
        <h1>Hotel Surya</h1>
        <div class="muted">Mobile Live View — permanent public link</div>
        <div id="conn-status" class="status">Connecting...</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end">
        <div style="display:flex;gap:8px">
          <button class="btn" onclick="openPage('reservations')">Reservations</button>
          <button class="btn" onclick="openPage('checkouts')">Checkouts</button>
        </div>
        <div style="margin-top:8px;display:flex;gap:8px">
          <button class="btn" id="shareBtn">Share</button>
          <button class="btn primary" onclick="location.reload()">Refresh</button>
        </div>
      </div>
    </header>

    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center"><strong>Rooms</strong><div class="muted" id="rooms-meta"></div></div>
      <div id="rooms" class="rooms">Loading...</div>
    </div>

    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center"><strong>Current Guests</strong><div id="guest-count" style="font-size:12px;color:var(--muted)"></div></div>
      <div class="controls"><input id="guest-search" placeholder="Search guests..." /></div>
      <div id="guest-list" class="list">Loading...</div>
    </div>

    <div id="page-overlay" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:80;padding:12px;box-sizing:border-box">
      <div style="max-width:920px;margin:0 auto;background:var(--card);border-radius:8px;padding:12px;position:relative;height:90vh;overflow:auto">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><strong id="page-title">Details</strong><button class="btn" onclick="closePage()">Close</button></div>
        <div id="page-checkouts" style="display:none"></div>
        <div id="page-reservations" style="display:none"></div>
        <div id="page-rents" style="display:none"></div>
        <div id="page-expenses" style="display:none"></div>
      </div>
    </div>

  <script>
    const SERVER_BASE = ${JSON.stringify(serverBase)};
    const id = ${JSON.stringify(id)};
    let state = {};
    const publicLink = SERVER_BASE + '/m/' + id;
    function escapeHtml(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    function renderRooms(){ const roomsEl = document.getElementById('rooms'); const floors = state.floors||{}; const keys = Object.keys(floors).sort((a,b)=>Number(a)-Number(b)); if(!keys.length){ roomsEl.innerHTML='<div style="color:var(--muted)">No rooms</div>'; return };
      const today = new Date().toISOString().slice(0,10); const reservedSet = new Set((state.reservations||[]).filter(r=>String(r.date||'').slice(0,10)===today).map(r=>Number(r.room)));
      let total=0, occ=0, resv=0;
      const html = keys.map(f=> { const roomsHtml = (floors[f]||[]).map(r=>{ total++; let cls = (r.status||'free')==='occupied'?'occupied':((r.status||'free')==='reserved'?'reserved':'free'); if((!r.status||r.status==='free') && reservedSet.has(Number(r.number))) { cls='reserved'; resv++; } if(cls==='occupied') occ++; return '<div class="room '+cls+'">'+escapeHtml(r.number)+'</div>'; }).join(''); return '<div style="margin-bottom:8px"><div style="font-weight:700">Floor '+f+'</div><div class="room-grid">'+roomsHtml+'</div></div>'; }).join('');
      roomsEl.innerHTML = html; document.getElementById('rooms-meta').textContent = total + ' rooms — ' + occ + ' occupied · ' + resv + ' reserved';
    }
    function buildGuestList(){ const out=[]; for(const fa of Object.values(state.floors||{})){ for(const r of fa){ if(r.status==='occupied' && r.guest) out.push({name:r.guest.name, contact:r.guest.contact, room:r.number, checkIn:r.guest.checkIn||r.guest.checkInDate||''}); } } return out; }
    function renderGuests(){ const g = buildGuestList(); document.getElementById('guest-count').textContent = g.length? g.length+' guests':''; const q=(document.getElementById('guest-search').value||'').toLowerCase().trim(); const out = g.filter(x=>!q||Object.values(x).some(v=>String(v||'').toLowerCase().includes(q))).map(x=>'<div class="row"><div><div style="font-weight:700">'+escapeHtml(x.name)+'</div><div style="font-size:12px;color:var(--muted)">Room '+escapeHtml(x.room)+' — '+escapeHtml(x.contact||'')+'</div></div><div><button onclick="openId(\''+encodeURIComponent(x.name)+'\')">Open ID</button></div></div>').join('')||'<div style="color:var(--muted)">No guests</div>'; document.getElementById('guest-list').innerHTML = out; }
    function openId(name){ try{ window.open('/','_blank'); }catch(e){} }
    function renderAll(){ renderRooms(); renderGuests(); }
    document.getElementById('guest-search').addEventListener('input', ()=>renderGuests());

    const evt = new EventSource(SERVER_BASE + '/sse/' + id);
    evt.onmessage = (ev)=>{ try{ const msg=JSON.parse(ev.data); if(msg.type==='init' || msg.type==='update'){ state = msg.state||{}; if(msg.rents) state.rents=msg.rents; if(msg.expenses) state.expenses=msg.expenses; if(msg.reservations) state.reservations=msg.reservations; } renderAll(); }catch(e){} };
    evt.onerror = ()=>{};
    evt.onopen = ()=>{ const s=document.getElementById('conn-status'); if(s) s.textContent = 'Connected'; };
    evt.onclose = ()=>{ const s=document.getElementById('conn-status'); if(s) s.textContent = 'Disconnected'; };
    // share button copies the public link
    document.addEventListener('DOMContentLoaded', ()=>{
      const b = document.getElementById('shareBtn'); if(!b) return; b.addEventListener('click', ()=>{ try{ navigator.share ? navigator.share({ title: 'Hotel Surya Live', url: publicLink }) : (navigator.clipboard && navigator.clipboard.writeText(publicLink)); b.textContent = 'Copied'; setTimeout(()=>b.textContent='Share',1500); }catch(e){ try{ navigator.clipboard && navigator.clipboard.writeText(publicLink); b.textContent='Copied'; setTimeout(()=>b.textContent='Share',1500); }catch(_){} } });
    });
    function openPage(which){ document.getElementById('page-overlay').style.display='block'; document.getElementById('page-title').textContent = which; ['checkouts','reservations','rents','expenses'].forEach(k=>{ const el=document.getElementById('page-'+k); el.style.display = (k===which)?'block':'none'; }); if(which==='checkouts') renderPageCheckouts(); if(which==='reservations') renderPageReservations(); if(which==='rents') renderPageRents(); if(which==='expenses') renderPageExpenses(); }
    function closePage(){ document.getElementById('page-overlay').style.display='none'; }
    function renderPageCheckouts(){ const out=[]; for(const fa of Object.values(state.floors||{})){ for(const r of fa){ if(r.status==='occupied') out.push(r); } } const el=document.getElementById('page-checkouts'); el.innerHTML = out.map(r=>'<div style="padding:8px;border-bottom:1px solid #eee"><div style="font-weight:700">'+escapeHtml((r.guest&&r.guest.name)||'Unknown')+'</div><div style="font-size:12px;color:var(--muted)">Room '+escapeHtml(r.number)+'</div></div>').join('')||'<div style="color:var(--muted)">No checkouts</div>'; }
    function renderPageReservations(){ const res = state.reservations||[]; const el=document.getElementById('page-reservations'); el.innerHTML = (res||[]).map(r=>'<div style="padding:8px;border-bottom:1px solid #eee"><div style="font-weight:700">'+escapeHtml(r.name||'')+'</div><div style="font-size:12px;color:var(--muted)">'+escapeHtml(r.date||r._dateFolder||'')+' — '+escapeHtml(r.room||'')+'</div></div>').join('')||'<div style="color:var(--muted)">No reservations</div>'; }
    function renderPageRents(){ const rents = state.rents||[]; const el=document.getElementById('page-rents'); el.innerHTML = (rents||[]).map(r=>'<div style="padding:8px;border-bottom:1px solid #eee"><div style="font-weight:700">'+escapeHtml(r.name||r.description||'')+'</div><div style="font-size:12px;color:var(--muted)">'+escapeHtml(r._dateFolder||r.date||'')+'</div><div style="font-weight:800">₹'+escapeHtml(r.amount||'0')+'</div></div>').join('')||'<div style="color:var(--muted)">No rent records</div>'; }
    function renderPageExpenses(){ const ex = state.expenses||[]; const el=document.getElementById('page-expenses'); el.innerHTML = (ex||[]).map(e=>'<div style="padding:8px;border-bottom:1px solid #eee"><div style="font-weight:700">'+escapeHtml(e.description||'')+'</div><div style="font-size:12px;color:var(--muted)">'+escapeHtml(e._dateFolder||e.date||'')+'</div><div style="font-weight:800">₹'+escapeHtml(e.amount||'0')+'</div></div>').join('')||'<div style="color:var(--muted)">No expenses</div>'; }
  </script>
  </div></body></html>`;
  res.send(html);
});

const port = process.env.PORT || 4000;
app.get('/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

app.listen(port, '0.0.0.0', () => console.log(`Share server running on port ${port} (bound 0.0.0.0)`));
