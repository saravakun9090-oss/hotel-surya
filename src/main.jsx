// main.jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.postcss' // This must include @tailwind base/components/utilities

// Ensure frontend points to backend API in development to avoid Vite serving index.html
// If you prefer proxying via Vite, remove this and add a proxy in vite.config.js instead.
window.__MONGO_API_BASE__ = window.__MONGO_API_BASE__ || 'http://localhost:4000/api';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
