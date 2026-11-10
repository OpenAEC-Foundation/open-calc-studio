import { describe, it, expect } from 'vitest';
import { exportCuf, exportRsx, exportTradxml } from '@/services/exporters';
import { importCuf } from '@/services/importers/cufImporter';
import { importRsx } from '@/services/importers/rsxImporter';
import { importTradxml } from '@/services/importers/tradxmlImporter';
import { makeCostItem } from '@/services/importers/core';
import type { CostItem, CostSchedule } from '@/types/costModel';
import type { ImportResult } from '@/services/importers/types';

/**
 * Knownbug 59: CUF, TradXML en RSX schreven alleen bovenste hoofdstukken, dus
 * posten zonder hoofdstuk vielen stil weg. Ze komen nu in een eigen hoofdstuk
 * (zonder code, met de naam van de begroting) op hun plek in de volgorde.
 */

function budget(): CostItem[] {
  const loose1 = makeCostItem({ parentId: null, sortOrder: 0, depth: 0, rowType: 'begrotingspost', code: 'A1', description: 'Los vooraf', unit: 'st', quantity: 2, unitPrice: 10, total: 20 });
  const chapter = makeCostItem({ parentId: null, sortOrder: 1, depth: 0, rowType: 'chapter', code: '01', description: 'Grondwerk' });
  const inChapter = makeCostItem({ parentId: chapter.id, sortOrder: 2, depth: 1, rowType: 'begrotingspost', code: '01.01', description: 'Ontgraven', unit: 'm³', quantity: 3, unitPrice: 20, total: 60 });
  const loose2 = makeCostItem({ parentId: null, sortOrder: 3, depth: 0, rowType: 'begrotingspost', code: 'B1', description: 'Los achteraf', unit: 'm', quantity: 4, unitPrice: 30, total: 120 });
  const loose3 = makeCostItem({ parentId: null, sortOrder: 4, depth: 0, rowType: 'bewakingspost', code: 'B2', description: 'Bewaking', unit: 'st', quantity: 1, unitPrice: 5, total: 5 });
  const staart = makeCostItem({ parentId: null, sortOrder: 5, depth: 0, rowType: 'staart_ak', description: 'AK', staartPercentage: 8 });
  return [loose1, chapter, inChapter, loose2, loose3, staart];
}

const schedule = { name: 'Losse posten', currency: 'EUR' } as CostSchedule;

const posts = (r: ImportResult) => r.items.filter((i) => i.rowType === 'begrotingspost');

describe.each([
  ['CUF', exportCuf, importCuf],
  ['TradXML', exportTradxml, importTradxml],
  ['RSX', exportRsx, importRsx],
] as const)('%s export of posts without a chapter', (_name, exporter, importer) => {
  it('exports them in their own chapter, in document order, and keeps them on re-import', () => {
    const out = exporter({ schedule, items: budget() });
    for (const code of ['A1', '01.01', 'B1', 'B2']) expect(out.xml).toContain(code);
    expect(out.warnings).toEqual([]);

    const back = importer(out.xml);
    expect(posts(back).map((p) => p.code)).toEqual(['A1', '01.01', 'B1', 'B2']);
    expect(posts(back).reduce((s, p) => s + p.total, 0)).toBe(20 + 60 + 120 + 5);

    const chapters = back.items.filter((i) => i.rowType === 'chapter' && i.parentId === null);
    expect(chapters.map((c) => c.description)).toEqual(['Losse posten', 'Grondwerk', 'Losse posten']);
    const [first, , last] = chapters;
    expect(posts(back).find((p) => p.code === 'A1')?.parentId).toBe(first.id);
    expect(posts(back).filter((p) => p.parentId === last.id).map((p) => p.code)).toEqual(['B1', 'B2']);
  });

  it('writes nothing extra when every post is in a chapter', () => {
    const items = budget().filter((i) => i.parentId !== null || i.rowType === 'chapter');
    const back = importer(exporter({ schedule, items }).xml);
    expect(back.items.filter((i) => i.rowType === 'chapter').map((c) => c.description)).toEqual(['Grondwerk']);
  });
});
