import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    exclude: ['**/node_modules/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.*', 'src/**/index.ts', 'src/main.tsx'],
      thresholds: { branches: 90, lines: 90, functions: 90 },
    },
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
