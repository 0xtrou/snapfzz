import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Spark packages (@agentscope-ai/*) expose only the `module` field; push it ahead of `main`.
  resolve: {
    mainFields: ['module', 'jsnext:main', 'jsnext', 'browser', 'main'],
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    globals: true,
    // Route Spark's side-effect CSS imports through Vite's CSS handler (node's native
    // ESM loader rejects .css imports).
    css: true,
    server: {
      deps: {
        inline: [/@agentscope-ai\//],
      },
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.*', 'src/**/index.ts', 'src/__tests__/**'],
      thresholds: { branches: 90, lines: 90, functions: 90 },
    },
  },
});
