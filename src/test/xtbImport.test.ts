import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import initSqlJs from 'sql.js';
import { buildXtbImport } from '@/services/importers/xtbImporter';
import { recalculateItems, getKostprijs } from '@/services/calculation/calculator';
import type { CostItem } from '@/types/costModel';

// The IBIS-TRAD acceptance fixtures live OUTSIDE the repo (they are not
// redistributable). Resolve them relative to the repo root and skip the
// whole suite gracefully when they are not present (e.g. CI), so the test
// is safe to commit while still fully exercising the importer locally.
const nodeRequire = createRequire(import.meta.url);
const REPO_ROOT = resolve(__dirname, '..', '..');
const IBIS_DIR = resolve(REPO_ROOT, '..', 'verification-files', 'Begrotingen', 'IBIS');

const CASES = [
  {
    file: 'C-OF260051 Vinkseweg brandschade.xtb',
    expectedKostprijs: 24352.35,
    expectedTopChapters: 14,
  },
  {
    file: 'C-OF260060 - Burg van Haarenlaan 1441 Schiedam-TB-P04-P2-W04.xtb',
    expectedKostprijs: 100032.12,
    expectedTopChapters: 18,
  },
];

const filesPresent = existsSync(IBIS_DIR) && CASES.every((c) => existsSync(resolve(IBIS_DIR, c.file)));

async function importXtb(absPath: string): Promise<CostItem[]> {
  const wasmPath = nodeRequire.resolve('sql.js/dist/sql-wasm.wasm');
  const SQL = await initSqlJs({ locateFile: () => wasmPath });
  const db = new SQL.Database(new Uint8Array(readFileSync(absPath)));
  // buildXtbImport closes the db internally.
  const { items } = buildXtbImport(db as never);
  return recalculateItems(items);
}

describe.skipIf(!filesPresent)('IBIS-TRAD .xtb importer (acceptance)', () => {
  for (const c of CASES) {
    it(`imports ${c.file} with correct kostprijs and chapter count`, async () => {
      const items = await importXtb(resolve(IBIS_DIR, c.file));

      const topChapters = items.filter(
        (i) => i.parentId === null && i.rowType === 'chapter',
      );
      expect(topChapters.length).toBe(c.expectedTopChapters);

      const kostprijs = getKostprijs(items);
      expect(kostprijs).toBeCloseTo(c.expectedKostprijs, 0); // within 0.5
      expect(Math.abs(kostprijs - c.expectedKostprijs)).toBeLessThanOrEqual(0.5);

      // Middelen-uitsplitsing: elke post krijgt detailregels per kostencomponent.
      const regels = items.filter((i) => i.rowType === 'regel');
      expect(regels.length).toBeGreaterThan(0);
      expect(regels.some((r) => r.resourceType === 'arbeid')).toBe(true);
      expect(regels.some((r) => r.resourceType === 'materiaal')).toBe(true);
    });
  }
});

if (!filesPresent) {
  // Surface why the suite was skipped without failing the run.
  // eslint-disable-next-line no-console
  console.warn(`[xtbImport.test] Skipped: IBIS fixtures not found in ${IBIS_DIR}`);
}
