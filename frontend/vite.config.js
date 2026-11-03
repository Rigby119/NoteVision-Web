import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Puerto fijo: el backend solo permite CORS desde http://localhost:5173
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  // pdfjs-dist 4.x usa sintaxis moderna (top-level await): evita que esbuild la rechace
  optimizeDeps: { exclude: ['pdfjs-dist'] },
  build: { target: 'esnext' },
});