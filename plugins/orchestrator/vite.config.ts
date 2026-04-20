import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'SnapfzzOrchestratorPlugin',
      formats: ['umd'],
      fileName: () => 'index.js',
    },
    outDir: 'dist',
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      // react/react-dom/jsx-runtime are provided by window.__snapfzz_shared (UMD globals).
      // react-router-dom, i18next, react-i18next, and zustand are NOT in __snapfzz_shared,
      // so they are bundled into the plugin UMD. This adds ~120 kB gzipped to the bundle.
      // TODO: if the shell ever hoists these to shared globals, add them to external + globals.
      external: ['react', 'react-dom', 'react/jsx-runtime'],
      output: {
        globals: {
          'react': 'window.__snapfzz_shared.React',
          'react-dom': 'window.__snapfzz_shared.ReactDOM',
          'react/jsx-runtime': 'window.__snapfzz_shared.jsxRuntime',
        },
      },
    },
  },
});
