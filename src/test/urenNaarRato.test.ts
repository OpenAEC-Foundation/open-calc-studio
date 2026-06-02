import { describe, it, expect } from 'vitest';
import {
  prorateUrenForTariefGroep,
  totalUrenForTariefGroep,
  prorateUrenAll,
  totalUrenAll,
  prorateUrenForChapter,
  totalUrenForChapter,
} from '@/services/calculation/urenProrate';
import type { CostItem } from '@/types/costModel';

function makeRegel(overrides: Partial<CostItem> = {}): CostItem {
  return {
    id: crypto.randomUUID(),
    parentId: 'p1',
    sortOrder: 0,
    code: '',
    description: '',
    unit: 'uur',
    quantity: 1,
    materialPrice: null,
    laborPrice: null,
    unitPrice: 0,
    total: 0,
    isCollapsed: false,
    depth: 1,
    notes: '',
    ifcGuid: '',
    rowType: 'regel',
    staartPercentage: null,
    nr: '',
    normQuantity: 1,
    normFactor: 1,
    normDivisor: null,
    normUnitPrice: null,
    resourceType: 'arbeid',
    resourceLibraryId: null,
    verrekenbaar: null,
    tariefGroep: 'A',
    ...overrides,
  };
}

describe('totalUrenForTariefGroep', () => {
  it('sums uren = qty × norm / cap over matching regels', () => {
    const items: CostItem[] = [
      makeRegel({ quantity: 1, normQuantity: 10, normFactor: 1, tariefGroep: 'A' }),
      makeRegel({ quantity: 2, normQuantity: 10, normFactor: 1, tariefGroep: 'A' }),
      makeRegel({ quantity: 1, normQuantity: 30, normFactor: 1, tariefGroep: 'A' }),
      makeRegel({ quantity: 1, normQuantity: 100, normFactor: 1, tariefGroep: 'B' }), // other group
    ];
    expect(totalUrenForTariefGroep(items, 'A')).toBe(60); // 10 + 20 + 30
    expect(totalUrenForTariefGroep(items, 'B')).toBe(100);
    expect(totalUrenForTariefGroep(items, 'C')).toBe(0);
  });

  it('respects normFactor (productiecapaciteit) as divisor', () => {
    const items: CostItem[] = [
      makeRegel({ quantity: 2, normQuantity: 8, normFactor: 2, tariefGroep: 'A' }), // 8
    ];
    expect(totalUrenForTariefGroep(items, 'A')).toBe(8);
  });

  it('ignores non-regel rows', () => {
    const items: CostItem[] = [
      makeRegel({ quantity: 1, normQuantity: 10, tariefGroep: 'A' }),
      makeRegel({ rowType: 'chapter', quantity: 1, normQuantity: 999, tariefGroep: 'A' }),
    ];
    expect(totalUrenForTariefGroep(items, 'A')).toBe(10);
  });
});

describe('prorateUrenForTariefGroep — normal case (60 → 90)', () => {
  it('scales each regel normQuantity by factor newTotal/currentTotal', () => {
    const items: CostItem[] = [
      makeRegel({ id: 'r1', quantity: 1, normQuantity: 10, normFactor: 1, tariefGroep: 'A' }),
      makeRegel({ id: 'r2', quantity: 1, normQuantity: 20, normFactor: 1, tariefGroep: 'A' }),
      makeRegel({ id: 'r3', quantity: 1, normQuantity: 30, normFactor: 1, tariefGroep: 'A' }),
    ];
    expect(totalUrenForTariefGroep(items, 'A')).toBe(60);

    const out = prorateUrenForTariefGroep(items, 'A', 90);
    expect(out.find((i) => i.id === 'r1')!.normQuantity).toBeCloseTo(15);
    expect(out.find((i) => i.id === 'r2')!.normQuantity).toBeCloseTo(30);
    expect(out.find((i) => i.id === 'r3')!.normQuantity).toBeCloseTo(45);
    expect(totalUrenForTariefGroep(out, 'A')).toBeCloseTo(90);
  });

  it('does not mutate the input array', () => {
    const items: CostItem[] = [
      makeRegel({ id: 'r1', quantity: 1, normQuantity: 10, normFactor: 1, tariefGroep: 'A' }),
    ];
    prorateUrenForTariefGroep(items, 'A', 20);
    expect(items[0].normQuantity).toBe(10); // untouched
  });

  it('leaves regels in other tariefgroepen untouched', () => {
    const items: CostItem[] = [
      makeRegel({ id: 'a1', quantity: 1, normQuantity: 10, tariefGroep: 'A' }),
      makeRegel({ id: 'b1', quantity: 1, normQuantity: 50, tariefGroep: 'B' }),
    ];
    const out = prorateUrenForTariefGroep(items, 'A', 30);
    expect(out.find((i) => i.id === 'a1')!.normQuantity).toBe(30);
    expect(out.find((i) => i.id === 'b1')!.normQuantity).toBe(50);
  });

  it('handles regels with normFactor (capaciteit) > 1', () => {
    // uren = qty × norm / cap
    const items: CostItem[] = [
      makeRegel({ id: 'r1', quantity: 4, normQuantity: 8, normFactor: 2, tariefGroep: 'A' }), // 16
      makeRegel({ id: 'r2', quantity: 2, normQuantity: 8, normFactor: 1, tariefGroep: 'A' }), // 16
    ];
    expect(totalUrenForTariefGroep(items, 'A')).toBe(32);
    const out = prorateUrenForTariefGroep(items, 'A', 16); // factor 0.5
    expect(out.find((i) => i.id === 'r1')!.normQuantity).toBeCloseTo(4);
    expect(out.find((i) => i.id === 'r2')!.normQuantity).toBeCloseTo(4);
    expect(totalUrenForTariefGroep(out, 'A')).toBeCloseTo(16);
  });
});

describe('prorateUrenForTariefGroep — edge cases', () => {
  it('current total = 0, target > 0 → distributes evenly over regels with qty > 0', () => {
    const items: CostItem[] = [
      makeRegel({ id: 'r1', quantity: 1, normQuantity: 0, normFactor: 1, tariefGroep: 'A' }),
      makeRegel({ id: 'r2', quantity: 1, normQuantity: 0, normFactor: 1, tariefGroep: 'A' }),
    ];
    expect(totalUrenForTariefGroep(items, 'A')).toBe(0);

    const out = prorateUrenForTariefGroep(items, 'A', 100);
    // 100 / 2 regels = 50 uren each, with qty=1 cap=1 → norm=50
    expect(out.find((i) => i.id === 'r1')!.normQuantity).toBeCloseTo(50);
    expect(out.find((i) => i.id === 'r2')!.normQuantity).toBeCloseTo(50);
    expect(totalUrenForTariefGroep(out, 'A')).toBeCloseTo(100);
  });

  it('current total = 0, target = 0 → still zeros out norms (no-op effectively)', () => {
    const items: CostItem[] = [
      makeRegel({ id: 'r1', quantity: 1, normQuantity: 0, tariefGroep: 'A' }),
    ];
    const out = prorateUrenForTariefGroep(items, 'A', 0);
    expect(out[0].normQuantity).toBe(0);
  });

  it('current total = 0 with no qty > 0 regels → returns items untouched', () => {
    const items: CostItem[] = [
      makeRegel({ id: 'r1', quantity: 0, normQuantity: 5, tariefGroep: 'A' }),
    ];
    const out = prorateUrenForTariefGroep(items, 'A', 100);
    expect(out).toEqual(items); // truly no-op
  });

  it('target = 0 → all matching normQuantities become 0', () => {
    const items: CostItem[] = [
      makeRegel({ id: 'r1', quantity: 1, normQuantity: 10, tariefGroep: 'A' }),
      makeRegel({ id: 'r2', quantity: 1, normQuantity: 20, tariefGroep: 'A' }),
      makeRegel({ id: 'r3', quantity: 1, normQuantity: 5, tariefGroep: 'B' }),
    ];
    const out = prorateUrenForTariefGroep(items, 'A', 0);
    expect(out.find((i) => i.id === 'r1')!.normQuantity).toBe(0);
    expect(out.find((i) => i.id === 'r2')!.normQuantity).toBe(0);
    expect(out.find((i) => i.id === 'r3')!.normQuantity).toBe(5); // untouched
    expect(totalUrenForTariefGroep(out, 'A')).toBe(0);
  });

  it('negative target → clamped to 0', () => {
    const items: CostItem[] = [
      makeRegel({ id: 'r1', quantity: 1, normQuantity: 10, tariefGroep: 'A' }),
    ];
    const out = prorateUrenForTariefGroep(items, 'A', -50);
    expect(out[0].normQuantity).toBe(0);
  });

  it('no matching regels → returns items unchanged', () => {
    const items: CostItem[] = [
      makeRegel({ id: 'b1', quantity: 1, normQuantity: 10, tariefGroep: 'B' }),
    ];
    const out = prorateUrenForTariefGroep(items, 'A', 100);
    expect(out).toEqual(items);
  });

  it('preserves relative shares (10:20:30 stays 1:2:3)', () => {
    const items: CostItem[] = [
      makeRegel({ id: 'r1', quantity: 1, normQuantity: 10, tariefGroep: 'A' }),
      makeRegel({ id: 'r2', quantity: 1, normQuantity: 20, tariefGroep: 'A' }),
      makeRegel({ id: 'r3', quantity: 1, normQuantity: 30, tariefGroep: 'A' }),
    ];
    const out = prorateUrenForTariefGroep(items, 'A', 600); // 10× factor
    const n1 = out.find((i) => i.id === 'r1')!.normQuantity!;
    const n2 = out.find((i) => i.id === 'r2')!.normQuantity!;
    const n3 = out.find((i) => i.id === 'r3')!.normQuantity!;
    expect(n2 / n1).toBeCloseTo(2);
    expect(n3 / n1).toBeCloseTo(3);
  });
});

describe('prorateUrenForTariefGroep — interaction with recalculator', () => {
  it('after rescale, recalculated regel totals reflect new norm', async () => {
    // Smoke test: import the real calculator, rescale, then recalculate
    const { recalculateItems } = await import('@/services/calculation/calculator');
    const items: CostItem[] = [
      makeRegel({
        id: 'r1',
        quantity: 1,
        normQuantity: 10,
        normFactor: 1,
        tariefGroep: 'A',
        laborPrice: 66,
      }),
      makeRegel({
        id: 'r2',
        quantity: 1,
        normQuantity: 20,
        normFactor: 1,
        tariefGroep: 'A',
        laborPrice: 66,
      }),
    ];
    const rescaled = prorateUrenForTariefGroep(items, 'A', 60);
    // After rescale: r1.norm=20, r2.norm=40 (60 total)
    expect(rescaled.find((i) => i.id === 'r1')!.normQuantity).toBeCloseTo(20);
    expect(rescaled.find((i) => i.id === 'r2')!.normQuantity).toBeCloseTo(40);

    // Run calculator with tarieven (A=66). Calculator recomputes laborPrice = norm * tarief.
    const recalced = recalculateItems(rescaled, { A: 66, B: 43, C: 82 });
    expect(recalced.find((i) => i.id === 'r1')!.laborPrice).toBeCloseTo(20 * 66);
    expect(recalced.find((i) => i.id === 'r2')!.laborPrice).toBeCloseTo(40 * 66);
  });
});

describe('prorateUrenAll (grand total across all groups)', () => {
  it('scales every regel proportionally to a new grand total', () => {
    const items: CostItem[] = [
      makeRegel({ id: 'a1', quantity: 1, normQuantity: 10, normFactor: 1, tariefGroep: 'A' }), // 10
      makeRegel({ id: 'b1', quantity: 1, normQuantity: 20, normFactor: 1, tariefGroep: 'B' }), // 20
      makeRegel({ id: 'c1', quantity: 1, normQuantity: 30, normFactor: 1, tariefGroep: 'C' }), // 30
    ];
    expect(totalUrenAll(items)).toBeCloseTo(60);
    // Double the grand total → 120; factor 2
    const rescaled = prorateUrenAll(items, 120);
    expect(rescaled.find((i) => i.id === 'a1')!.normQuantity).toBeCloseTo(20);
    expect(rescaled.find((i) => i.id === 'b1')!.normQuantity).toBeCloseTo(40);
    expect(rescaled.find((i) => i.id === 'c1')!.normQuantity).toBeCloseTo(60);
    expect(totalUrenAll(rescaled)).toBeCloseTo(120);
  });

  it('preserves each group\'s relative share', () => {
    const items: CostItem[] = [
      makeRegel({ id: 'a1', quantity: 2, normQuantity: 5, normFactor: 1, tariefGroep: 'A' }), // 10
      makeRegel({ id: 'b1', quantity: 1, normQuantity: 30, normFactor: 1, tariefGroep: 'B' }), // 30
    ];
    const rescaled = prorateUrenAll(items, 80); // factor 2
    expect(totalUrenForTariefGroep(rescaled, 'A')).toBeCloseTo(20);
    expect(totalUrenForTariefGroep(rescaled, 'B')).toBeCloseTo(60);
  });

  it('handles currentTotal=0 by distributing evenly over regels with qty>0', () => {
    const items: CostItem[] = [
      makeRegel({ id: 'a1', quantity: 4, normQuantity: 0, normFactor: 1, tariefGroep: 'A' }),
      makeRegel({ id: 'b1', quantity: 2, normQuantity: 0, normFactor: 1, tariefGroep: 'B' }),
    ];
    const rescaled = prorateUrenAll(items, 100);
    expect(totalUrenAll(rescaled)).toBeCloseTo(100);
  });

  it('zeroes all norms when target is 0', () => {
    const items: CostItem[] = [
      makeRegel({ id: 'a1', quantity: 1, normQuantity: 10, normFactor: 1, tariefGroep: 'A' }),
    ];
    const rescaled = prorateUrenAll(items, 0);
    expect(rescaled.find((i) => i.id === 'a1')!.normQuantity).toBe(0);
  });
});

describe('prorateUrenForChapter (per hoofdstuk)', () => {
  function chapter(id: string): CostItem {
    return makeRegel({ id, rowType: 'chapter', parentId: null, tariefGroep: null, resourceType: null, normQuantity: null, quantity: null });
  }
  function post(id: string, parentId: string): CostItem {
    return makeRegel({ id, rowType: 'begrotingspost', parentId, tariefGroep: null, resourceType: null, normQuantity: null, quantity: null });
  }

  it('rescales only regels within the given chapter, nested through posts', () => {
    const items: CostItem[] = [
      chapter('ch1'),
      post('p1', 'ch1'),
      makeRegel({ id: 'r1', parentId: 'p1', quantity: 1, normQuantity: 10, normFactor: 1, tariefGroep: 'A' }), // 10
      makeRegel({ id: 'r2', parentId: 'p1', quantity: 1, normQuantity: 30, normFactor: 1, tariefGroep: 'B' }), // 30
      // Another chapter, must NOT be touched
      chapter('ch2'),
      post('p2', 'ch2'),
      makeRegel({ id: 'r3', parentId: 'p2', quantity: 1, normQuantity: 50, normFactor: 1, tariefGroep: 'A' }), // 50
    ];
    expect(totalUrenForChapter(items, 'ch1')).toBeCloseTo(40);

    const rescaled = prorateUrenForChapter(items, 'ch1', 80); // factor 2
    expect(rescaled.find((i) => i.id === 'r1')!.normQuantity).toBeCloseTo(20);
    expect(rescaled.find((i) => i.id === 'r2')!.normQuantity).toBeCloseTo(60);
    // ch2's regel untouched
    expect(rescaled.find((i) => i.id === 'r3')!.normQuantity).toBeCloseTo(50);
    expect(totalUrenForChapter(rescaled, 'ch1')).toBeCloseTo(80);
    expect(totalUrenForChapter(rescaled, 'ch2')).toBeCloseTo(50);
  });

  it('handles deeply nested sub-chapters', () => {
    const items: CostItem[] = [
      chapter('ch1'),
      chapter('sub'), // sub-chapter
      makeRegel({ id: 'r1', parentId: 'sub', quantity: 2, normQuantity: 5, normFactor: 1 }), // 10
    ];
    // fix parentId of sub
    items[1] = { ...items[1], parentId: 'ch1' };
    const rescaled = prorateUrenForChapter(items, 'ch1', 30); // factor 3
    expect(rescaled.find((i) => i.id === 'r1')!.normQuantity).toBeCloseTo(15);
  });

  it('returns items untouched when chapter has no regels', () => {
    const items: CostItem[] = [chapter('ch1'), post('p1', 'ch1')];
    const rescaled = prorateUrenForChapter(items, 'ch1', 100);
    expect(rescaled).toEqual(items);
  });
});
