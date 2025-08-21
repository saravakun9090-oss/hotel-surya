Deploying the backend (quick options)

This repo contains a minimal Express backend at `server/index.js` that proxies MongoDB (GridFS) operations.

Option A — Render (recommended, free tier available):
 1. Create a new Web Service on Render.
 2. Connect your GitHub repo and point to the `server` folder. Set the build command to `npm ci` and start command to `npm start`.
 3. Set these environment variables in Render:
    - MONGO_URI (your Atlas connection string)
    - DB_NAME (optional, default: hotel_surya)
    - COLLECTION (optional, default: app_state)
    - PORT (optional)
 4. Deploy. Render will give you a public URL like https://your-backend.onrender.com — set this in Netlify as described earlier (VITE_MONGO_API_BASE).

Option B — Railway, Fly, or any host that supports Node.js
 - Use the same approach: set env vars and set start command to `npm start`.

Option C — Docker hosting
 - Build and run the Dockerfile: `docker build -t hotel-backend . && docker run -p 4000:4000 -e MONGO_URI=... hotel-backend`

If you want, I can deploy this server for you to Render now (I will need access to connect your GitHub or you can give me a repo URL). Alternatively supply your Atlas MONGO_URI and I'll show exact Netlify env to set after deploy.
