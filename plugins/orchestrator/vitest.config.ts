import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Spark packages (@agentscope-ai/design, @agentscope-ai/chat) ship only the `module`
  // entry and omit `main`/`exports`, so Vite's default resolver fails. Order mainFields
  // so `module` is tried first, matching what bundlers like webpack historically used.
  resolve: {
    mainFields: ['module', 'jsnext:main', 'jsnext', 'browser', 'main'],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    exclude: ['**/node_modules/**', '**/dist/**'],
    // Spark's icons package ships a side-effect CSS import; make vitest route it through
    // Vite's CSS handler instead of Node's native ESM loader.
    css: true,
    server: {
      deps: {
        inline: [/@agentscope-ai\//],
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
      },
    },
  },
});
