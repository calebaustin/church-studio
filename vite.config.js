import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const daemon = 'http://127.0.0.1:4317';

export default defineConfig({
  root: 'src/ui',
  base: './',
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy: { '/api': daemon, '/media': daemon } },
  build: { outDir: '../../dist/ui', emptyOutDir: true },
});
