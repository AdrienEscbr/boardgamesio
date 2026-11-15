import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves the site from /<repository>/ (override with BASE_PATH).
// three.js only ships with the lazily loaded home hero.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? (process.env.BASE_PATH ?? '/boardgamesio/') : '/',
  plugins: [react()],
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
}));
