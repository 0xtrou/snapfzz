import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Per A007/MultiLayout: preferences window gets its own Vite entry point and port 5175.
// Independent build target ensures separate frame budget from project window.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../../dist/preferences',
    emptyDirFirst: true,
  },
  server: {
    port: 5175,
    strictPort: true,
  },
  optimizeDeps: {
    exclude: ['@tauri-apps/api'],
  },
});
