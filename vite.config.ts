import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Cross-Origin-Isolation: notwendig fuer SharedArrayBuffer und damit fuer den
 * Multithread-Core von ffmpeg.wasm. Ohne diese Header faellt die App
 * automatisch auf den Single-Thread-Core zurueck (siehe src/worker/engine.ts).
 */
const crossOriginIsolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

export default defineConfig({
  plugins: [react()],
  server: { headers: crossOriginIsolation, host: true },
  preview: { headers: crossOriginIsolation, host: true },
  worker: { format: 'es' },
  // ffmpeg.wasm startet intern eigene Worker – Vite darf das Paket nicht vorbuendeln.
  optimizeDeps: { exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'] },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 4096,
  },
});
