import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { assetFileName } from '../../build/assetFileNames';

// Issue #80: de PDF-worker als `.mjs` kreeg op de webserver het MIME-type
// application/octet-stream, waarna de browser hem weigerde en PDF's niet laadden.
describe('asset file names (issue #80)', () => {
  it('emits .mjs assets such as the PDF worker as .js', () => {
    expect(assetFileName({ names: ['pdf.worker.min.mjs'] })).toBe('assets/[name]-[hash].js');
    expect(assetFileName({ name: 'pdf.worker.min.mjs' })).toBe('assets/[name]-[hash].js');
  });
  it('keeps the extension of other assets', () => {
    expect(assetFileName({ names: ['logo.svg'] })).toBe('assets/[name]-[hash][extname]');
    expect(assetFileName({ names: [] })).toBe('assets/[name]-[hash][extname]');
  });
  it('is used by the app, embed-frame and library builds', () => {
    for (const config of ['vite.config.ts', 'vite.frame.config.ts', 'vite.lib.config.ts']) {
      const source = fs.readFileSync(path.resolve(__dirname, '../..', config), 'utf8');
      expect(source, config).toMatch(/assetFileName\b/);
    }
  });
});
