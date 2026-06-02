import { describe, it, expect } from 'vitest';
import { recalculateItems } from '@/services/calculation/calculator';
import type { CostItem } from '@/types/costModel';

describe('recalculateItems integrates staart breakdowns', () => {
  it('staart items get staartItemBreakdown filled', () => {
    const items: CostItem[] = [
      // chapter
      { id: 'c1', parentId: null, sortOrder: 0, code: '01', description: 'Chap', unit: 'st',
        quantity: 1, materialPrice: null, laborPrice: null, unitPrice: 0, total: 0,
        isCollapsed: false, depth: 0, notes: '', ifcGuid: '', rowType: 'chapter',
        staartPercentage: null, nr: '', normQuantity: null, normFactor: null,
        normDivisor: null, normUnitPrice: null, resourceType: null,
        resourceLibraryId: null, verrekenbaar: null, tariefGroep: null } as CostItem,
      // begrotingspost
      { id: 'p1', parentId: 'c1', sortOrder: 1, code: '01.01', description: 'Post', unit: 'st',
        quantity: 1, materialPrice: null, laborPrice: null, unitPrice: 0, total: 0,
        isCollapsed: false, depth: 1, notes: '', ifcGuid: '', rowType: 'begrotingspost',
        staartPercentage: null, nr: '', normQuantity: null, normFactor: null,
        normDivisor: null, normUnitPrice: null, resourceType: null,
        resourceLibraryId: null, verrekenbaar: null, tariefGroep: null } as CostItem,
      // regel arbeid 100000
      { id: 'r1', parentId: 'p1', sortOrder: 2, code: '', description: 'R', unit: 'st',
        quantity: 1, materialPrice: null, laborPrice: null, unitPrice: 100000, total: 100000,
        isCollapsed: false, depth: 2, notes: '', ifcGuid: '', rowType: 'regel',
        staartPercentage: null, nr: '', normQuantity: null, normFactor: null,
        normDivisor: null, normUnitPrice: 100000, resourceType: 'arbeid',
        resourceLibraryId: null, verrekenbaar: null, tariefGroep: null } as CostItem,
      // staart btw 21%
      { id: 's1', parentId: null, sortOrder: 100, code: '', description: 'BTW', unit: '%',
        quantity: 21, materialPrice: null, laborPrice: null, unitPrice: 0, total: 0,
        isCollapsed: false, depth: 0, notes: '', ifcGuid: '', rowType: 'staart_btw',
        staartPercentage: 21, nr: '', normQuantity: null, normFactor: null,
        normDivisor: null, normUnitPrice: null, resourceType: null,
        resourceLibraryId: null, verrekenbaar: null, tariefGroep: null } as CostItem,
    ];
    const result = recalculateItems(items);
    const btw = result.find(i => i.id === 's1');
    expect(btw?.staartItemBreakdown).toBeDefined();
    expect(btw?.staartItemBreakdown?.subtotaal).toBeCloseTo(21000, 2);
    expect(btw?.staartItemBreakdown?.totaal).toBeCloseTo(121000, 2);
  });
});
