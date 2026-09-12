import { describe, it, expect } from 'vitest';
import { recalculateItems, getGrandTotal } from '@/services/calculation/calculator';
import type { CostItem } from '@/types/costModel';

function makeItem(overrides: Partial<CostItem> = {}): CostItem {
  return {
    id: crypto.randomUUID(),
    parentId: null,
    sortOrder: 0,
    code: '',
    description: '',
    unit: 'st',
    quantity: null,
    materialPrice: null,
    laborPrice: null,
    unitPrice: 0,
    total: 0,
    isCollapsed: false,
    depth: 0,
    notes: '',
    ifcGuid: 'test',
    rowType: 'begrotingspost' as const,
    staartPercentage: null,
    nr: '',
    normQuantity: null,
    normFactor: null,
    normDivisor: null,
    normUnitPrice: null,
    resourceType: null,
    resourceLibraryId: null,
    verrekenbaar: null,
    tariefGroep: null,
    ...overrides,
  };
}

describe('recalculateItems', () => {
  it('calculates unitPrice as materialPrice + laborPrice', () => {
    const items = [makeItem({ materialPrice: 10, laborPrice: 5, quantity: 1 })];
    const result = recalculateItems(items);
    expect(result[0].unitPrice).toBe(15);
  });

  it('calculates total as quantity * unitPrice', () => {
    const items = [makeItem({ materialPrice: 20, laborPrice: 10, quantity: 3 })];
    const result = recalculateItems(items);
    expect(result[0].total).toBe(90);
  });

  it('handles null quantity as 0', () => {
    const items = [makeItem({ materialPrice: 20, laborPrice: 10, quantity: null })];
    const result = recalculateItems(items);
    expect(result[0].total).toBe(0);
  });

  it('handles null prices as 0', () => {
    const items = [makeItem({ materialPrice: null, laborPrice: null, quantity: 5 })];
    const result = recalculateItems(items);
    expect(result[0].unitPrice).toBe(0);
    expect(result[0].total).toBe(0);
  });

  it('calculates chapter totals from children', () => {
    const chapter = makeItem({ id: 'ch1', rowType: 'chapter' });
    const child1 = makeItem({ parentId: 'ch1', materialPrice: 10, laborPrice: 5, quantity: 2, depth: 1 });
    const child2 = makeItem({ parentId: 'ch1', materialPrice: 20, laborPrice: 0, quantity: 3, depth: 1 });
    const result = recalculateItems([chapter, child1, child2]);

    expect(result[1].total).toBe(30); // 2 * 15
    expect(result[2].total).toBe(60); // 3 * 20
    expect(result[0].total).toBe(90); // 30 + 60
  });

  it('calculates nested chapter totals', () => {
    const h1 = makeItem({ id: 'h1', rowType: 'chapter' });
    const h1_1 = makeItem({ id: 'h1_1', parentId: 'h1', rowType: 'chapter', depth: 1 });
    const leaf = makeItem({ parentId: 'h1_1', materialPrice: 100, laborPrice: 0, quantity: 1, depth: 2 });

    const result = recalculateItems([h1, h1_1, leaf]);
    expect(result[2].total).toBe(100);
    expect(result[1].total).toBe(100);
    expect(result[0].total).toBe(100);
  });

  it('does not mutate input array', () => {
    const items = [makeItem({ materialPrice: 10, laborPrice: 5, quantity: 2 })];
    const origTotal = items[0].total;
    recalculateItems(items);
    expect(items[0].total).toBe(origTotal);
  });
});

describe('getGrandTotal', () => {
  it('sums only top-level items', () => {
    const h1 = makeItem({ id: 'h1', rowType: 'chapter', total: 100 });
    const h2 = makeItem({ id: 'h2', rowType: 'chapter', total: 200 });
    const child = makeItem({ parentId: 'h1', total: 50, depth: 1 });
    expect(getGrandTotal([h1, child, h2])).toBe(300);
  });

  it('returns 0 for empty items', () => {
    expect(getGrandTotal([])).toBe(0);
  });
});

describe('begrotingspost op het hoogste niveau (zonder hoofdstuk)', () => {
  it('krijgt een afgeleide eenheidsprijs = totaal / hoeveelheid, net als onder een hoofdstuk', () => {
    const post = makeItem({ id: 'p', rowType: 'begrotingspost', quantity: 4, unit: 'm²' });
    const regel = makeItem({ id: 'r', parentId: 'p', depth: 1, rowType: 'regel', quantity: 1, normQuantity: 0, normUnitPrice: 250, laborPrice: 0 });
    const [top] = recalculateItems([post, regel]);
    expect(top.total).toBe(250);
    expect(top.unitPrice).toBe(62.5);
  });

  it('bewakingspost op het hoogste niveau telt de eenheidsprijzen van zijn kinderen op', () => {
    const bew = makeItem({ id: 'b', rowType: 'bewakingspost', quantity: 2 });
    const r1 = makeItem({ id: 'r1', parentId: 'b', depth: 1, rowType: 'regel', quantity: 1, normQuantity: 0, normUnitPrice: 10 });
    const r2 = makeItem({ id: 'r2', parentId: 'b', depth: 1, rowType: 'regel', quantity: 1, normQuantity: 0, normUnitPrice: 5 });
    const [top] = recalculateItems([bew, r1, r2]);
    expect(top.total).toBe(15);
    expect(top.unitPrice).toBe(15);
  });

  it('valt terug op de eigen postprijs als de kinderen niets opleveren', () => {
    const post = makeItem({ id: 'p', rowType: 'begrotingspost', quantity: 3, normUnitPrice: 100 });
    const tekst = makeItem({ id: 't', parentId: 'p', depth: 1, rowType: 'tekstregel' });
    const [top] = recalculateItems([post, tekst]);
    expect(top.total).toBe(300);
    expect(top.unitPrice).toBe(100);
  });
});

