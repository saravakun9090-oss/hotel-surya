// src/services/upload.js
export async function uploadFileToServer(file) {
  const API_BASE = window.__MONGO_API_BASE__ || '/api';
  const fd = new FormData();
  fd.append('file', file, file.name || 'scan');
  const res = await fetch(`${API_BASE}/upload`, { method: 'POST', body: fd });
  if (!res.ok) {
    const t = await res.text();
    throw new Error('Upload failed: ' + t);
  }
  return await res.json();
}

export function downloadUrlForId(id) {
  const API_BASE = window.__MONGO_API_BASE__ || '/api';
  return `${API_BASE.replace(/\/api$/, '')}/api/download/${id}`; // ensure full path
}
