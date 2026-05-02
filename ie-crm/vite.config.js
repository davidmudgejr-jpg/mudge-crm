import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

const manualChunkGroups = [
  ['vendor-three', ['three', '@react-three/fiber', '@react-three/drei', '@react-three/postprocessing']],
  ['vendor-motion', ['framer-motion', 'gsap']],
  ['vendor-react', ['react', 'react-dom', 'react-router-dom']],
];

function manualChunks(id) {
  if (!id.includes('node_modules')) return undefined;
  for (const [chunkName, packages] of manualChunkGroups) {
    if (packages.some((pkg) => id.includes(`/node_modules/${pkg}/`))) {
      return chunkName;
    }
  }
  return undefined;
}

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
      output: {
        manualChunks,
      },
    },
  },
  server: {
    port: 5173,
    host: '127.0.0.1',
    strictPort: true,
    hmr: {
      protocol: 'ws',
      host: 'localhost',
      port: 5173,
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
