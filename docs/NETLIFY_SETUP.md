Netlify setup for LiveUpdate -> VITE_MONGO_API_BASE

1) Add/confirm your backend public URL
   - If your backend is reachable at https://api.example.com (with endpoints like /api/ping and /api/state)
     set the environment variable VITE_MONGO_API_BASE to https://api.example.com/api

2) How to set the var in Netlify (recommended)
   - Go to your site in the Netlify dashboard
   - Site settings -> Build & deploy -> Environment -> Environment variables
   - Add a new variable:
       Key: VITE_MONGO_API_BASE
       Value: https://api.example.com/api
   - Save and trigger a redeploy (Deploys -> Trigger deploy -> Clear cache and deploy site)

3) Alternative quick runtime approach (not recommended long-term)
   - Edit `index.html` and add before your main bundle loads:
     <script>window.__MONGO_API_BASE__ = 'https://api.example.com/api';</script>
   - Commit and deploy (this still requires a redeploy to take effect on Netlify)

4) Verify after deploy
   - Visit https://your-site.netlify.app/liveupdate
   - Open browser console and run:
     fetch(window.__MONGO_API_BASE__ + '/ping').then(r=>r.json()).then(console.log).catch(console.error)

5) CORS
   - Ensure your backend allows cross-origin requests from your Netlify site if it is on a different domain.
   - The backend currently uses `cors()` middleware which allows all origins by default; verify there are no network-level blocks.

6) Security
   - Do not put DB credentials in `VITE_*` variables. Keep sensitive credentials on the server side only.

If you want, I can:
- Update `index.html` now with the runtime snippet (quick), or
- Update `netlify.toml` with your actual backend URL if you give it now (not recommended to store credentials here).
