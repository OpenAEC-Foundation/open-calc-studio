import { browserAliases } from './build/browserAliases';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import pkg from './package.json' with { type: 'json' };
import { distributionPlugin } from './scripts/distribution-notices.mjs';

export default defineConfig({
  base: './',
  worker: { format: 'es' },
  plugins: [react(), distributionPlugin('web')],
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
      ignored: ['**/src-tauri/**'],
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
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['**/node_modules/**', 'tests/**', 'libs/**'],
  },
});
