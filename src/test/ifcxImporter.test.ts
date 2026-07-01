import { describe, it, expect } from 'vitest';
import { generateIfcxJson } from '@/services/ifc/ifcxJsonGenerator';
import { importIfcx } from '@/services/importers/ifcxImporter';
import { recalculateItems, getGrandTotal } from '@/services/calculation/calculator';
import { makeCostItem } from '@/services/importers/core';
import { createDefaultSchedule } from '@/data/defaultBudget';

function sampleItems() {
  const chapter = makeCostItem({ parentId: null, sortOrder: 0, depth: 0, rowType: 'chapter', code: '01', description: 'Grondwerk' });
  const post = makeCostItem({ parentId: chapter.id, sortOrder: 1, depth: 1, rowType: 'begrotingspost', code: '01.01', description: 'Ontgraven', unit: 'm³', quantity: 10 });
  const r1 = makeCostItem({ parentId: post.id, sortOrder: 2, depth: 2, rowType: 'regel', code: '01.01.01', description: 'Grondwerker', unit: 'm³', quantity: 10, normQuantity: 1, normFactor: 1, normDivisor: 1, normUnitPrice: 5, resourceType: 'arbeid' });
  const r2 = makeCostItem({ parentId: post.id, sortOrder: 3, depth: 2, rowType: 'regel', code: '01.01.02', description: 'Afvoer', unit: 'm³', quantity: 10, normQuantity: 1, normFactor: 1, normDivisor: 1, normUnitPrice: 8, resourceType: 'materiaal' });
  return [chapter, post, r1, r2];
}

describe('ifcx importer (round-trip)', () => {
  it('generate → import preserves structure, codes and totals', () => {
    const schedule = { ...createDefaultSchedule(), name: 'RT ifcx', projectName: 'RT proj', projectNumber: 'P-9' };
    const items0 = recalculateItems(sampleItems());
    const total0 = getGrandTotal(items0);
    expect(total0).toBeCloseTo(130, 2); // 10×5 + 10×8

    const json = importIfcx(generateIfcxJson(schedule, items0));

    expect(json.format).toBe('ifcx');
    expect(json.schedule.name).toBe('RT ifcx');
    expect(json.schedule.projectNumber).toBe('P-9');

    const items1 = recalculateItems(json.items);
    expect(items1.filter((i) => i.rowType === 'chapter')).toHaveLength(1);
    expect(items1.filter((i) => i.rowType === 'begrotingspost')).toHaveLength(1);
    const regels = items1.filter((i) => i.rowType === 'regel');
    expect(regels).toHaveLength(2);
    expect(regels.map((r) => r.code).sort()).toEqual(['01.01.01', '01.01.02']);
    expect(regels.some((r) => r.resourceType === 'arbeid')).toBe(true);
    expect(regels.some((r) => r.resourceType === 'materiaal')).toBe(true);

    // hierarchy intact: regels under the post, post under the chapter
    const chapter = items1.find((i) => i.rowType === 'chapter')!;
    const post = items1.find((i) => i.rowType === 'begrotingspost')!;
    expect(post.parentId).toBe(chapter.id);
    expect(regels.every((r) => r.parentId === post.id)).toBe(true);

    expect(getGrandTotal(items1)).toBeCloseTo(total0, 2);
  });

  it('preserves siblings with duplicate codes (generator key dedup)', () => {
    const schedule = { ...createDefaultSchedule(), name: 'dup' };
    const chapter = makeCostItem({ parentId: null, sortOrder: 0, depth: 0, rowType: 'chapter', code: '01', description: 'H' });
    const post = makeCostItem({ parentId: chapter.id, sortOrder: 1, depth: 1, rowType: 'begrotingspost', code: '01.01', description: 'P', unit: 'st', quantity: 1 });
    // Drie regels die dezelfde CODE delen (zoals CUF-regels onder één post).
    const mk = (i: number, rt: 'arbeid' | 'materiaal' | 'materieel', price: number) =>
      makeCostItem({ parentId: post.id, sortOrder: 1 + i, depth: 2, rowType: 'regel', code: '01.01', description: `R${i}`, unit: 'st', quantity: 1, normQuantity: 1, normFactor: 1, normDivisor: 1, normUnitPrice: price, resourceType: rt });
    const items0 = recalculateItems([chapter, post, mk(1, 'arbeid', 10), mk(2, 'materiaal', 20), mk(3, 'materieel', 30)]);

    const res = importIfcx(generateIfcxJson(schedule, items0));
    const items1 = recalculateItems(res.items);
    expect(items1.filter((i) => i.rowType === 'regel')).toHaveLength(3); // niets verloren
    expect(getGrandTotal(items1)).toBeCloseTo(60, 2); // 10 + 20 + 30
  });

  it('throws on invalid JSON', () => {
    expect(() => importIfcx('{not json')).toThrow();
  });
});
