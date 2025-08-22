# Deploy backend to Render (quick guide)

This guide shows how to create a Render service for the `server` folder and set the necessary environment variables for MongoDB.

Prerequisites:
- You have a Render account and an API key (Dashboard → Account → API Keys).
- Your GitHub repo is connected to Render (or you can use the Render UI to connect it during service creation).

Quick steps (recommended):

1. From your machine, set these environment variables in PowerShell:

```powershell
$env:RENDER_API_KEY = 'your-render-api-key'
# Optionally provide your Mongo URI to be set automatically (safer: set it in the Render dashboard)
$env:RENDER_MONGO_URI = 'your-mongo-connection-string'
$env:RENDER_DB_NAME = 'hotel_surya'
$env:RENDER_COLLECTION = 'app_state'
```

2. Run the helper script shipped with the repo:

```powershell
cd path\to\hotel-app
server\deploy_render.ps1 -RepoOwner 'your-github-user' -RepoName 'hotel-surya' -Branch 'main' -ServiceName 'hotel-app-backend'
```

3. Open the Render dashboard and confirm the service build.

4. If you did not pass `RENDER_MONGO_URI` into the script, set the environment variables in Render UI:
- MONGO_URI
- DB_NAME (default: `hotel_surya`)
- COLLECTION (default: `app_state`)

5. After the service is live, copy its URL (for example `https://hotel-app-backend.onrender.com`) and set your Netlify site variable `VITE_MONGO_API_BASE` to `${SERVICE_URL}/api`.

6. Redeploy Netlify (or trigger a manual deploy). Your `/liveupdate` page will now fetch data from the Render-hosted backend.

Troubleshooting:
- If the script fails to create a service due to GitHub permissions, open the Render dashboard, connect your GitHub repo, then re-run the script or create the service in the UI.
- If uploads fail, check Render logs (Logs → Live) and ensure `MONGO_URI` is correct and points to an accessible MongoDB (Atlas IP whitelist, credentials, etc).

Security note:
- Do not commit your Mongo credentials to the repo. Use Render environment variables to store secrets.

If you'd like, I can continue and attempt to create the Render service for you — you'll need to either provide an API key here (not recommended) or run the `deploy_render.ps1` locally with your API key. Let me know which you prefer.
