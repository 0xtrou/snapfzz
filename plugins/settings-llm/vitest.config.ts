import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Per project/SparkDesignFirst: Spark packages publish only a `module` field. Vitest/Vite's
  // default resolver needs `module` pushed before `main` so it can locate the entry when
  // shared's barrel pulls Spark packages transitively. Scoped to only Spark packages to avoid
  // collateral on @testing-library + friends.
  resolve: {
    alias: [
      {
        find: /^@agentscope-ai\/design$/,
        replacement: '@agentscope-ai/design/lib/index.js',
      },
      {
        find: /^@agentscope-ai\/chat$/,
        replacement: '@agentscope-ai/chat/lib/index.js',
      },
    ],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/__tests__/**', 'src/tabs/analytics/index.ts', 'src/routing/index.ts'],
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
    },
  },
});
