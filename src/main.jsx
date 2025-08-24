// main.jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { BrowserRouter } from 'react-router-dom'
import './index.postcss'

// Determine API base:
// - If VITE_MONGO_API_BASE is set at build time (Netlify/Vercel), use it
// - Else, if running locally (hostname includes 'localhost'), use local server
// - Else, fallback to your Render URL
const BUILD_BASE =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_MONGO_API_BASE)
    ? import.meta.env.VITE_MONGO_API_BASE
    : null;

const isLocal =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

window.__MONGO_API_BASE__ =
  BUILD_BASE
  || (isLocal ? 'http://localhost:4000/api' : 'https://hotel-app-backend-2gxi.onrender.com/api');

try {
  console.info('API base:', window.__MONGO_API_BASE__ || '(none)');
} catch (e) { /* ignore */ }

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
