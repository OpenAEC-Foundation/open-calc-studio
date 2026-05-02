import { describe, it, expect } from 'vitest';
import { computeKostprijsBreakdown } from '@/services/calculation/calculator';
import type { CostItem } from '@/types/costModel';

const mkRegel = (rt: string, total: number, parentId = 'p1'): CostItem => ({
  id: crypto.randomUUID(),
  parentId,
  sortOrder: 0,
  code: '',
  description: '',
  unit: 'st',
  quantity: 1,
  materialPrice: null,
  laborPrice: null,
  unitPrice: total,
  total,
  isCollapsed: false,
  depth: 2,
  notes: '',
  ifcGuid: '',
  rowType: 'regel',
  staartPercentage: null,
  nr: '',
  normQuantity: null,
  normFactor: null,
  normDivisor: null,
  normUnitPrice: null,
  resourceType: rt as any,
  resourceLibraryId: null,
  verrekenbaar: null,
  tariefGroep: null,
});

describe('computeKostprijsBreakdown', () => {
  it('groups regel totals by resourceType', () => {
    const items: CostItem[] = [
      mkRegel('arbeid', 1000),
      mkRegel('materiaal', 2000),
      mkRegel('materieel', 500),
      mkRegel('overig', 100),
      mkRegel('onderaannemer', 5000),
    ];
    const b = computeKostprijsBreakdown(items);
    expect(b.loon).toBe(1000);
    expect(b.materiaal).toBe(2000);
    expect(b.materieel).toBe(500);
    expect(b.stelpost).toBe(100);
    expect(b.onderaanneming).toBe(5000);
  });

  it('treats null resourceType as materiaal', () => {
    const items: CostItem[] = [mkRegel('', 750)];
    items[0].resourceType = null;
    const b = computeKostprijsBreakdown(items);
    expect(b.materiaal).toBe(750);
  });

  it('splits regel with laborPrice into loon + resource column', () => {
    const r: CostItem = mkRegel('materiaal', 0);
    r.quantity = 10;
    r.laborPrice = 30;       // 10 * 30 = 300 loon
    r.normUnitPrice = 50;    // 10 * 50 = 500 materiaal
    r.total = 800;
    const b = computeKostprijsBreakdown([r]);
    expect(b.loon).toBe(300);
    expect(b.materiaal).toBe(500);
  });

  it('onderaannemer: full amount to onderaanneming, no labor split', () => {
    const r: CostItem = mkRegel('onderaannemer', 1000);
    r.laborPrice = 100;
    r.normUnitPrice = 200;
    r.quantity = 5;
    r.total = 1500;
    const b = computeKostprijsBreakdown([r]);
    expect(b.onderaanneming).toBe(1500);
    expect(b.loon).toBe(0);
    expect(b.materiaal).toBe(0);
  });

  it('skips non-regel rows', () => {
    const ch: CostItem = { ...mkRegel('arbeid', 9999), rowType: 'chapter', total: 9999 };
    const b = computeKostprijsBreakdown([ch]);
    expect(b.loon).toBe(0);
  });
});
