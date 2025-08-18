import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
host: true, // listen on all interfaces
port: 3000, // or your port
allowedHosts: true, // allow all external hosts (ngrok, etc.)
strictPort: false, // optional
},
base: '/',
});
