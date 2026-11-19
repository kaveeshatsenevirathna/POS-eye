import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  root: 'apps/web',
  plugins: [tailwindcss()],
  server: { proxy: { '/api': 'http://127.0.0.1:3001' } },
  build: { outDir: '../../dist/web', emptyOutDir: true },
});
