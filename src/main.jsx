// main.jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.postcss' // This must include @tailwind base/components/utilities

// Ensure frontend points to backend API in development to avoid Vite serving index.html
// If you prefer proxying via Vite, remove this and add a proxy in vite.config.js instead.
window.__MONGO_API_BASE__ = window.__MONGO_API_BASE__ || 'http://localhost:4000/api';
// helpful debug: print where the frontend will attempt to call the API
try {
  const buildBase = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_MONGO_API_BASE) ? import.meta.env.VITE_MONGO_API_BASE : null;
  console.info('API base:', buildBase || window.__MONGO_API_BASE__ || '(none)');
} catch (e) { /* ignore */ }

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
