import { browserAliases } from './build/browserAliases';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import pkg from './package.json' with { type: 'json' };
import { cssScopePlugin } from './src/lib/cssScope';
import { distributionPlugin } from './scripts/distribution-notices.mjs';
export default defineConfig({
  worker: { format: 'es' },
  root: path.resolve(__dirname, 'packages/embed/frame'),
  base: './',
  publicDir: false,
  plugins: [react(), distributionPlugin('embed-frame')],
  resolve: { alias: { ...browserAliases, '@': path.resolve(__dirname, 'src') } },
  define: { global: 'globalThis', 'process.env': '{}', 'process.browser': 'true', 'process.version': '"v18.0.0"', __APP_VERSION__: JSON.stringify(pkg.version) },
  css: { postcss: { plugins: [cssScopePlugin()] } },
  build: { outDir: '../dist/frame', emptyOutDir: true, target: 'es2020', chunkSizeWarningLimit: 2048 },
});
