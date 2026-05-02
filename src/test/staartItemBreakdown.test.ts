import { describe, it, expect } from 'vitest';
import { computeStaartItemBreakdowns } from '@/services/calculation/calculator';
import type { CostItem } from '@/types/costModel';

function mkRegel(rt: string, total: number): CostItem {
  return {
    id: crypto.randomUUID(), parentId: null, sortOrder: 0,
    code: '', description: '', unit: 'st', quantity: 1,
    materialPrice: null, laborPrice: null, unitPrice: total, total,
    isCollapsed: false, depth: 2, notes: '', ifcGuid: '',
    rowType: 'regel', staartPercentage: null, nr: '',
    normQuantity: null, normFactor: null, normDivisor: null, normUnitPrice: null,
    resourceType: rt as any, resourceLibraryId: null,
    verrekenbaar: null, tariefGroep: null,
  };
}

function mkStaart(rt: string, pct: number | null): CostItem {
  return {
    id: crypto.randomUUID(), parentId: null, sortOrder: 100,
    code: '', description: rt, unit: '%', quantity: pct,
    materialPrice: null, laborPrice: null, unitPrice: 0, total: 0,
    isCollapsed: false, depth: 0, notes: '', ifcGuid: '',
    rowType: rt as any, staartPercentage: pct, nr: '',
    normQuantity: null, normFactor: null, normDivisor: null, normUnitPrice: null,
    resourceType: null, resourceLibraryId: null,
    verrekenbaar: null, tariefGroep: null,
  };
}

describe('computeStaartItemBreakdowns', () => {
  it('empty budget: all staart breakdowns zero', () => {
    const items: CostItem[] = [
      mkStaart('staart_ak_oa', 9),
      mkStaart('staart_btw', 21),
      mkStaart('staart_afronding', null),
    ];
    const result = computeStaartItemBreakdowns(items);
    const akoa = result.find(i => i.rowType === 'staart_ak_oa');
    expect(akoa?.staartItemBreakdown?.subtotaal).toBe(0);
    expect(akoa?.staartItemBreakdown?.totaal).toBe(0);
    const btw = result.find(i => i.rowType === 'staart_btw');
    expect(btw?.staartItemBreakdown?.subtotaal).toBe(0);
  });

  it('AK over OA = 9% of onderaanneming-kolom', () => {
    const items: CostItem[] = [
      mkRegel('onderaannemer', 100000),
      mkStaart('staart_ak_oa', 9),
    ];
    const result = computeStaartItemBreakdowns(items);
    const akoa = result.find(i => i.rowType === 'staart_ak_oa');
    expect(akoa?.staartItemBreakdown?.onderaanneming).toBeCloseTo(9000, 2);
    expect(akoa?.staartItemBreakdown?.subtotaal).toBeCloseTo(9000, 2);
  });

  it('ABK = 6% of (loon + materiaal + materieel)', () => {
    const items: CostItem[] = [
      mkRegel('arbeid', 50000),
      mkRegel('materiaal', 30000),
      mkRegel('materieel', 20000),
      mkRegel('onderaannemer', 100000),
      mkStaart('staart_abk', 6),
    ];
    const result = computeStaartItemBreakdowns(items);
    const abk = result.find(i => i.rowType === 'staart_abk');
    // 6% of (50000+30000+20000) = 6% of 100000 = 6000
    expect(abk?.staartItemBreakdown?.subtotaal).toBeCloseTo(6000, 2);
    expect(abk?.staartItemBreakdown?.loon).toBeCloseTo(3000, 2);
    expect(abk?.staartItemBreakdown?.materiaal).toBeCloseTo(1800, 2);
    expect(abk?.staartItemBreakdown?.materieel).toBeCloseTo(1200, 2);
    expect(abk?.staartItemBreakdown?.onderaanneming).toBe(0);
  });

  it('Risico = 3% of cumulative-up-to-here', () => {
    const items: CostItem[] = [
      mkRegel('arbeid', 100000),
      mkStaart('staart_risico', 3),
    ];
    const result = computeStaartItemBreakdowns(items);
    const r = result.find(i => i.rowType === 'staart_risico');
    expect(r?.staartItemBreakdown?.bedrag).toBeCloseTo(100000, 2);
    expect(r?.staartItemBreakdown?.subtotaal).toBeCloseTo(3000, 2);
  });

  it('BTW 21% on aanneemsom excl', () => {
    const items: CostItem[] = [
      mkRegel('arbeid', 100000),
      mkStaart('staart_btw', 21),
    ];
    const result = computeStaartItemBreakdowns(items);
    const btw = result.find(i => i.rowType === 'staart_btw');
    expect(btw?.staartItemBreakdown?.subtotaal).toBeCloseTo(21000, 2);
    expect(btw?.staartItemBreakdown?.totaal).toBeCloseTo(121000, 2);
  });

  it('afronding rounds to 2 decimals', () => {
    const items: CostItem[] = [
      mkRegel('arbeid', 100000.456),
      mkStaart('staart_btw', 21),
      mkStaart('staart_afronding', null),
    ];
    const result = computeStaartItemBreakdowns(items);
    const af = result.find(i => i.rowType === 'staart_afronding');
    // (100000.456 * 1.21) = 121000.55176; rounded = 121000.55; afronding = -0.00176
    expect(af?.staartItemBreakdown?.subtotaal).toBeCloseTo(-0.00176, 4);
    expect(af?.staartItemBreakdown?.totaal).toBeCloseTo(121000.55, 2);
  });
});
