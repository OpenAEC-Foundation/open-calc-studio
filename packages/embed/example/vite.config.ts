// Dev-server voor de voorbeeld-gastpagina. Draait vanuit de repo-root met de
// Vite/React van de root (geen eigen node_modules nodig):
//
//   node node_modules/vite/bin/vite.js -c packages/embed/example/vite.config.ts --port 4310
//
// Het pakket komt via een alias uit ../dist; een echte gebruiker installeert
// het uit npm of uit de .tgz van de GitHub-release.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, '../dist');

export default defineConfig({
  root: here,
  plugins: [react()],
  resolve: {
    alias: {
      '@openaec/open-calc-studio/style.css': path.join(dist, 'style.css'),
      '@openaec/open-calc-studio': path.join(dist, 'index.js'),
    },
    dedupe: ['react', 'react-dom'],
  },
  server: { port: 4310, strictPort: true, fs: { allow: [path.resolve(here, '../../..')] } },
});
