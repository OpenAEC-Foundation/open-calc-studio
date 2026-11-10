import { browserAliases } from './build/browserAliases';
import { assetFileName } from './build/assetFileNames';
import { hostedHtmlPolicy } from './build/hostedHtmlPolicy';
import { siteToolsManifest } from './build/siteToolsManifest';
import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import pkg from './package.json' with { type: 'json' };
import { distributionPlugin } from './scripts/distribution-notices.mjs';

// Local, untracked checkout of another app that sometimes sits in the repo root:
// keep it out of the dev-server scan, the file watcher and the test run.
const foreignCheckouts = ['UniversalEstimateandValuation/**'];

export default defineConfig({
  base: './',
  worker: { format: 'es' },
  plugins: [react(), hostedHtmlPolicy(), siteToolsManifest(), distributionPlugin('web')],
  resolve: {
    alias: {
      ...browserAliases,
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    'global': 'globalThis',
    'process.env': '{}',
    'process.browser': 'true',
    'process.version': '"v18.0.0"',
    '__APP_VERSION__': JSON.stringify(pkg.version),
  },
  optimizeDeps: {
    // Vite's default HTML entry scan, minus the foreign checkouts.
    entries: ['**/*.html', '!**/__tests__/**', '!**/coverage/**', ...foreignCheckouts.map(glob => `!${glob}`)],
    esbuildOptions: {
      define: {
        global: 'globalThis',
        'process.env': '{}',
        'process.browser': 'true',
        'process.version': '"v18.0.0"',
      },
    },
  },
  clearScreen: false,
  server: {
    port: 4200,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**', ...foreignCheckouts.map(glob => `**/${glob}`)],
    },
  },
  env: {
    envPrefix: ['VITE_', 'TAURI_'],
  },
  build: {
    manifest: true,
    // Same language baseline as the SDK/frame. Older Safari-target lowering
    // cannot transform the IFC worker's destructuring with current esbuild.
    target: 'es2020',
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_DEBUG,
    chunkSizeWarningLimit: 2048,
    // PDF-worker als .js: zie build/assetFileNames.ts (issue #80).
    rollupOptions: { output: { assetFileNames: assetFileName } },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    exclude: [...configDefaults.exclude, 'tests/**', 'libs/**', ...foreignCheckouts],
    // UI tests render real dialogs; under parallel load several sit near the 5 s default.
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});
