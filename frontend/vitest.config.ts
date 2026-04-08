import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./packages/shared/src/__tests__/setup.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
