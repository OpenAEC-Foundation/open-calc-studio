/**
 * Build van het inbouwpakket `@openaec/open-calc-studio` (packages/embed).
 *
 *   npm run build:lib
 *
 * Verschillen met de app-build (vite.config.ts):
 * - één ESM-entry (src/lib/index.tsx) met alle afhankelijkheden extern —
 *   de gastsite installeert die zelf via package.json;
 * - alle CSS gescoped onder `.ocs-embed` (src/lib/cssScope.ts), zodat de
 *   opmaak van de app de gastpagina niet raakt;
 * - geen lettertypen: de gastsite levert Inter (of laat het systeemfont);
 * - typedeclaraties via vite-plugin-dts.
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dts from 'vite-plugin-dts';
import path from 'path';
import pkg from './package.json' with { type: 'json' };
import { cssScopePlugin } from './src/lib/cssScope';

const externals = [
  ...Object.keys(pkg.dependencies).filter((n) => !n.startsWith('@types/')),
  'react/jsx-runtime',
  'react-dom/client',
];
const isExternal = (id: string) => externals.some((n) => id === n || id.startsWith(`${n}/`));

export default defineConfig({
  plugins: [
    react(),
    dts({
      include: ['src'],
      exclude: ['src/test/**', 'src/main.tsx'],
      // Spiegelt src/ onder dist/: het entrytype staat op dist/lib/index.d.ts.
      entryRoot: 'src',
      tsconfigPath: './tsconfig.json',
    }),
  ],
  // Geen kopie van public/ (fonts, voorbeelddata, icoon): die horen bij de app.
  publicDir: false,
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  define: {
    global: 'globalThis',
    'process.env': '{}',
    'process.browser': 'true',
    'process.version': '"v18.0.0"',
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  css: {
    postcss: { plugins: [cssScopePlugin()] },
  },
  build: {
    outDir: 'packages/embed/dist',
    emptyOutDir: true,
    sourcemap: false,
    cssCodeSplit: false,
    target: 'es2020',
    chunkSizeWarningLimit: 2048,
    lib: {
      entry: path.resolve(__dirname, 'src/lib/index.tsx'),
      formats: ['es'],
      fileName: () => 'index.js',
      cssFileName: 'style',
    },
    rollupOptions: {
      external: isExternal,
      output: {
        chunkFileNames: 'chunks/[name]-[hash].js',
        // Eén stylesheet met een vaste naam (package.json: ./style.css).
        assetFileNames: (info) =>
          (info.names ?? []).some((n) => n.endsWith('.css')) ? 'style.css' : 'assets/[name]-[hash][extname]',
      },
    },
  },
});
