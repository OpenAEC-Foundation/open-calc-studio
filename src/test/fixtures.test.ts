import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { deserializeProject } from '@/services/file/fileService';
import { parseDbf, buildDncImport } from '@/services/importers/dncImporter';
import { buildXtbImport } from '@/services/importers/xtbImporter';
import { importRsx } from '@/services/importers/rsxImporter';
import { importBasCalcFile } from '@/services/importers/bascalcImporter';
import { recalculateItems } from '@/services/calculation/calculator';

const DIR = path.resolve(__dirname, '../../test/fixtures/import-formats');
const manifest: { file: string; total: number }[] = JSON.parse(
  fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8'),
);
const expected = (f: string) => manifest.find(m => m.file === f)!.total;
const read = (f: string) => fs.readFileSync(path.join(DIR, f));
const chapterSum = (items: any[]) =>
  recalculateItems(items, undefined).filter(i => i.rowType === 'chapter').reduce((s, i) => s + i.total, 0);

// 7z uitpakken zonder de Vite `?url`-wrapper (werkt direct in node/jsdom).
async function dncTables(buf: Buffer): Promise<Record<string, any[]>> {
  const SevenZip = (await import('7z-wasm')).default as any;
  const sz = await SevenZip({ print: () => {}, printErr: () => {} });
  sz.FS.writeFile('a.dnc', new Uint8Array(buf));
  sz.callMain(['x', 'a.dnc', '-y']);
  const tables: Record<string, any[]> = {};
  for (const f of sz.FS.readdir('/').filter((n: string) => /\.DBF$/i.test(n))) {
    const prefix = f.slice(0, 2).toUpperCase();
    if (!['KK', 'KU', 'VU', 'VT', 'VD'].includes(prefix)) continue;
    tables[prefix] = parseDbf(sz.FS.readFile(f)).records;
  }
  return tables;
}

async function loadDb(buf: Buffer) {
  const initSqlJs = (await import('sql.js')).default;
  const SQL = await initSqlJs({ locateFile: () => path.resolve(__dirname, '../../node_modules/sql.js/dist/sql-wasm.wasm') });
  return new SQL.Database(new Uint8Array(buf)) as any;
}

describe('test-fixtures: alle 10 importeren via de echte importeurs', () => {
  it('manifest bevat 10 fixtures', () => {
    expect(manifest).toHaveLength(10);
  });

  for (const f of ['01-ifccalc-klein.ifcCalc', '02-ifccalc-staart.ifcCalc', '03-ifccalc-kengetallen.ifcCalc']) {
    it(`importeert ${f} (.ifcCalc)`, () => {
      const parsed = deserializeProject(read(f).toString('utf8'));
      expect(parsed.items.length).toBeGreaterThan(0);
      expect(chapterSum(parsed.items)).toBeCloseTo(expected(f), -1); // ±~5
    });
  }

  for (const f of ['04-dnc-stabu.dnc', '05-dnc-stabu-groot.dnc']) {
    it(`importeert ${f} (.dnc)`, async () => {
      const { items } = buildDncImport(await dncTables(read(f)), { projectName: f });
      expect(items.filter(i => i.rowType === 'begrotingspost').length).toBeGreaterThan(0);
      expect(chapterSum(items)).toBeCloseTo(expected(f), -1);
    });
  }

  for (const f of ['06-xtb-ibis.xtb', '07-xtb-ibis-groot.xtb']) {
    it(`importeert ${f} (.xtb)`, async () => {
      const db = await loadDb(read(f));
      const { items } = buildXtbImport(db);
      expect(items.length).toBeGreaterThan(0);
      // tolerantie 1% (ehprijs-afronding bij xtb)
      const total = chapterSum(items);
      expect(Math.abs(total - expected(f)) / expected(f)).toBeLessThan(0.01);
    });
  }

  for (const f of ['08-rsx-raw.rsx', '09-rsx-raw-klein.rsx']) {
    it(`importeert ${f} (.rsx)`, () => {
      const { items } = importRsx(read(f).toString('utf8'));
      const posts = items.filter(i => i.rowType === 'begrotingspost');
      expect(posts.length).toBeGreaterThan(0);
      // RSX zet total direct op de post (geen recalc)
      const total = posts.reduce((s, i) => s + i.total, 0);
      expect(total).toBeCloseTo(expected(f), -1);
    });
  }

  it('importeert 10-xls-bascalc.xls (.xls)', () => {
    const ab = read('10-xls-bascalc.xls');
    const { items } = importBasCalcFile(Uint8Array.from(ab).buffer); // tight ArrayBuffer, zoals file.arrayBuffer()
    const posts = items.filter(i => i.rowType === 'begrotingspost');
    expect(posts.length).toBeGreaterThan(0);
    const total = posts.reduce((s, i) => s + i.total, 0);
    expect(total).toBeCloseTo(expected('10-xls-bascalc.xls'), -1);
  });
});
