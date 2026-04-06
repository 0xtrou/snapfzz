import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
  build: {
    outDir: '../../dist/preferences',
  },
  server: {
    port: 5175,
    strictPort: true,
  },
  optimizeDeps: {
    exclude: ['@tauri-apps/api'],
  },
});
