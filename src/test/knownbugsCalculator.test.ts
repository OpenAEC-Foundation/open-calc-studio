import { describe, expect, it } from 'vitest';
import { computeBtwLaagDirect, recalculateItems } from '@/services/calculation/calculator';
import { makeStaartItem } from '@/services/calculation/staartDefaults';
import type { CostItem, RowType } from '@/types/costModel';

// Rekenbugs uit knownbugs.md (punten 1, 2 en 4 van de codereview van 6 nov 2026).

function item(overrides: Partial<CostItem> & { id: string; rowType: RowType }): CostItem {
  return {
    parentId: null, sortOrder: 0, code: '', description: overrides.id, unit: 'st', quantity: null,
    materialPrice: null, laborPrice: null, unitPrice: 0, total: 0, isCollapsed: false, depth: 0,
    notes: '', ifcGuid: '', staartPercentage: null, nr: '', normQuantity: null, normFactor: null,
    normDivisor: null, normUnitPrice: null, resourceType: null, resourceLibraryId: null,
    verrekenbaar: null, tariefGroep: null, ...overrides,
  };
}

const regel = (id: string, parentId: string, total: number) =>
  item({ id, parentId, rowType: 'regel', quantity: 1, normQuantity: 1, normFactor: 1, normUnitPrice: total, resourceType: 'materiaal' });

describe('punt 1: leeg hoofdstuk', () => {
  it('zet het totaal terug naar 0 als het laatste kind weg is', () => {
    const chapter = item({ id: 'h', rowType: 'chapter' });
    const first = recalculateItems([chapter, regel('r', 'h', 250)]);
    expect(first.find((i) => i.id === 'h')!.total).toBe(250);

    // Het kind is verwijderd; het hoofdstuk komt binnen met zijn oude totaal.
    const stale = { ...first.find((i) => i.id === 'h')! };
    const after = recalculateItems([stale]);
    expect(after.find((i) => i.id === 'h')!.total).toBe(0);
    expect(after.find((i) => i.id === 'h')!.unitPrice).toBe(0);
  });

  it('laat een kale post met eigen prijs wel staan', () => {
    const post = item({ id: 'p', rowType: 'begrotingspost', quantity: 2, normUnitPrice: 100 });
    const out = recalculateItems([post]);
    expect(out[0].total).toBe(200);
  });
});

describe('punt 2: laag btw-tarief en een post met alleen een tekstregel', () => {
  it('telt de eigen prijs van de post mee in de grondslag laag', () => {
    const a = item({ id: 'a', rowType: 'begrotingspost', quantity: 1, normUnitPrice: 1000, btwTarief: 'laag' });
    const b = item({ id: 'b', rowType: 'begrotingspost', quantity: 1, normUnitPrice: 1000, btwTarief: 'laag' });
    const tekst = item({ id: 't', parentId: 'b', rowType: 'tekstregel' });
    const out = recalculateItems([a, b, tekst]);
    expect(out.find((i) => i.id === 'b')!.total).toBe(1000);
    expect(computeBtwLaagDirect(out)).toBe(2000);
  });

  it('kijkt bij een post met echte regels nog steeds naar de regels', () => {
    const post = item({ id: 'p', rowType: 'begrotingspost', quantity: 1, btwTarief: 'laag' });
    const hoog = { ...regel('r1', 'p', 300), btwTarief: 'hoog' as const };
    const out = recalculateItems([post, hoog, regel('r2', 'p', 700)]);
    expect(computeBtwLaagDirect(out)).toBe(700);
  });
});

describe('punt 4: eenheidsprijs van staartregels', () => {
  it('is de grondslag gedeeld door 100, zodat percentage × eenheidsprijs = totaal', () => {
    const garanties = makeStaartItem('staart_garanties', 'Garanties:', 2, 100);
    const risico = makeStaartItem('staart_risico', 'Risico:', 3, 101);
    const btw = makeStaartItem('staart_btw', 'Btw:', 21, 102);
    const out = recalculateItems([regel('r', null as unknown as string, 100), garanties, risico, btw]);
    for (const row of out.filter((i) => i.rowType.startsWith('staart_'))) {
      expect(row.total, row.rowType).toBeCloseTo((row.quantity ?? 0) * row.unitPrice, 6);
      expect(row.unitPrice, row.rowType).toBeCloseTo((row.staartItemBreakdown?.bedrag ?? 0) / 100, 6);
    }
    // Garanties 2% over 100 = 2; risico 3% over 102 = 3,06; btw 21% over 105,06.
    expect(out.find((i) => i.rowType === 'staart_garanties')!.total).toBeCloseTo(2, 6);
    expect(out.find((i) => i.rowType === 'staart_risico')!.unitPrice).toBeCloseTo(1.02, 6);
    expect(out.find((i) => i.rowType === 'staart_btw')!.unitPrice).toBeCloseTo(1.0506, 6);
  });
});
