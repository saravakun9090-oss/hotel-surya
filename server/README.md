Quick share server for Hotel Surya snapshots

1. Install dependencies

   npm install

2. Run server

   node index.js

The server listens on port 4000 by default and exposes:
- POST /share  -> accepts JSON body: { state: <app-state> } and returns { id, url }
- GET /s/:id  -> serves a read-only HTML page showing the snapshot

This is a minimal, insecure server for quick local sharing. For production, secure storage, auth and cleanup are required.
