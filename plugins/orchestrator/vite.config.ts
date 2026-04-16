import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: () => 'index.js',
    },
    outDir: 'dist',
    emptyOutDir: true,
    // Single file output — asset:// can't resolve relative chunk imports
    cssCodeSplit: false,
    rollupOptions: {
      external: [
        'react',
        'react-dom',
        'react/jsx-runtime',
      ],
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
