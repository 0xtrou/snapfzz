import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@snapfzz/chat-plugin': path.resolve(__dirname, '../../../plugins/chat/src/index.ts'),
      '@snapfzz/settings-general': path.resolve(__dirname, '../../../plugins/settings-general/src/index.ts'),
      '@snapfzz/settings-performance': path.resolve(__dirname, '../../../plugins/settings-performance/src/index.ts'),
      '@snapfzz/settings-processes': path.resolve(__dirname, '../../../plugins/settings-processes/src/index.ts'),
      '@snapfzz/settings-vault': path.resolve(__dirname, '../../../plugins/settings-vault/src/index.ts'),
      '@snapfzz/settings-plugins': path.resolve(__dirname, '../../../plugins/settings-plugins/src/index.ts'),
      '@snapfzz/settings-advanced': path.resolve(__dirname, '../../../plugins/settings-advanced/src/index.ts'),
    },
  },
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
