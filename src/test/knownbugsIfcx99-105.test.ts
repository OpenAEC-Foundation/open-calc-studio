import { describe, it, expect } from 'vitest';
import { generateIfcxJson } from '@/services/ifc/ifcxJsonGenerator';
import { generateIfcCostFile } from '@/services/ifc/ifcCostGenerator';
import { importIfcx } from '@/services/importers/ifcxImporter';
import { getGrandTotal, recalculateItems } from '@/services/calculation/calculator';
import { variantCalculatedItems } from '@/services/grid/variantTotals';
import { makeCostItem } from '@/services/importers/core';
import { createDefaultItems, createDefaultSchedule } from '@/data/defaultBudget';
import type { CostItem, CostSchedule } from '@/types/costModel';

function chapterWithPosts(codes: string[]): CostItem[] {
  const chapter = makeCostItem({ parentId: null, sortOrder: 0, depth: 0, rowType: 'chapter', code: 'H', description: 'Hoofdstuk' });
  return [chapter, ...codes.map((code, i) => makeCostItem({ parentId: chapter.id, sortOrder: i + 1, depth: 1, rowType: 'begrotingspost', code, description: `Post ${code}`, unit: 'st', quantity: 1, materialPrice: 1 }))];
}

describe('knownbug 99: volgorde blijft behouden als codes op getallen lijken', () => {
  it('B,20,10,1a,2 komt in dezelfde volgorde terug (ook op het hoogste niveau)', () => {
    const schedule = { ...createDefaultSchedule(), name: 'volgorde' };
    const nested = chapterWithPosts(['B', '20', '10', '1a', '2']);
    const top = ['B', '20', '10', '1a', '2'].map((code, i) => makeCostItem({ parentId: null, sortOrder: 100 + i, depth: 0, rowType: 'chapter', code, description: code }));
    const res = importIfcx(generateIfcxJson(schedule, [...nested, ...top]));
    const byOrder = [...res.items].sort((a, b) => a.sortOrder - b.sortOrder);
    expect(byOrder.filter((i) => i.rowType === 'begrotingspost').map((i) => i.code)).toEqual(['B', '20', '10', '1a', '2']);
    expect(byOrder.filter((i) => i.rowType === 'chapter' && i.code !== 'H').map((i) => i.code)).toEqual(['B', '20', '10', '1a', '2']);
  });
});

describe('knownbug 104: IFCX importeren en dan IFC exporteren', () => {
  it('lege tekstvelden worden geen undefined die de standaardwaarden overschrijven', () => {
    const schedule = { ...createDefaultSchedule(), name: 'leeg', description: '', projectNumber: '', author: '', client: '', projectName: '' };
    const res = importIfcx(generateIfcxJson(schedule, recalculateItems(chapterWithPosts(['01']))));
    expect(Object.entries(res.schedule).filter(([, v]) => v === undefined).map(([k]) => k)).toEqual([]);
    // Zoals de Backstage-import: samenvoegen met de bestaande schedule en dan naar IFC STEP.
    const merged = { ...createDefaultSchedule(), ...res.schedule } as CostSchedule;
    expect(() => generateIfcCostFile(merged, recalculateItems(res.items))).not.toThrow();
  });
});

describe('knownbug 105: btw-tarief, variant, notities en eenheid overleven IFCX', () => {
  it('per regel btwTarief, branchId, notes en de eenheid van een post zonder hoeveelheid', () => {
    const schedule: CostSchedule = {
      ...createDefaultSchedule(), name: 'varianten', branchesEnabled: true, activeBranchId: 'alt',
      branches: [{ id: 'main', parentId: null, name: 'Main' }, { id: 'alt', parentId: 'main', name: 'Alternatief' }],
    };
    const [chapter, laag, variant] = chapterWithPosts(['01', '02']);
    laag.btwTarief = 'laag'; laag.notes = 'Regel één\nregel twee';
    variant.branchId = 'alt';
    const leeg = makeCostItem({ parentId: chapter.id, sortOrder: 9, depth: 1, rowType: 'begrotingspost', code: '03', description: 'Nog in te vullen', unit: 'm²', quantity: null });
    const items0 = recalculateItems([chapter, laag, variant, leeg, ...createDefaultItems().map((s, i) => ({ ...s, sortOrder: 50 + i }))]);
    const res = importIfcx(generateIfcxJson(schedule, items0));
    const find = (code: string) => res.items.find((i) => i.code === code && i.rowType === 'begrotingspost')!;
    expect(find('01').btwTarief).toBe('laag');
    expect(find('01').notes).toBe('Regel één\nregel twee');
    expect(find('02').branchId).toBe('alt');
    expect(find('03').unit).toBe('m²');
    expect(res.schedule.branches).toEqual(schedule.branches);
    expect(res.schedule.branchesEnabled).toBe(true);
    expect(res.schedule.activeBranchId).toBe('alt');
    // Het totaal zoals de statusbalk het toont blijft gelijk, voor elke variant.
    for (const active of ['main', 'alt']) {
      const before = getGrandTotal(variantCalculatedItems(items0, { ...schedule, activeBranchId: active }));
      const merged = { ...createDefaultSchedule(), ...res.schedule, activeBranchId: active } as CostSchedule;
      const after = getGrandTotal(variantCalculatedItems(recalculateItems(res.items), merged));
      expect(after).toBeCloseTo(before, 2);
    }
  });
});
