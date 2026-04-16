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
      name: 'SnapfzzOculusPlugin',
      formats: ['umd'],
      fileName: () => 'index.js',
    },
    outDir: 'dist',
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
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
