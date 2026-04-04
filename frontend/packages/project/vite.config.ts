import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@snapfzz/chat-plugin': path.resolve(__dirname, '../../../plugins/chat/src/index.ts'),
    },
  },
  build: {
    outDir: '../../dist/project',
    emptyDirFirst: true,
  },
  server: {
    port: 5174,
    strictPort: true,
  },
  optimizeDeps: {
    exclude: ['@tauri-apps/api'],
  },
});
