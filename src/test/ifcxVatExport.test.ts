import { describe, it, expect } from 'vitest';
import { generateIfcxJson } from '@/services/ifc/ifcxJsonGenerator';
import { makeCostItem } from '@/services/importers/core';
import { createDefaultSchedule } from '@/data/defaultBudget';
import type { CostItem } from '@/types/costModel';

// Het btw-tarief in 'ifcx::cost::currency' moet uit de staartregel 'Btw hoog'
// komen, niet vast 21 % zijn.

function chapter(): CostItem {
  return makeCostItem({ parentId: null, sortOrder: 0, depth: 0, rowType: 'chapter', code: '01', description: 'H' });
}

function btwHoog(pct: number): CostItem {
  return makeCostItem({ parentId: null, sortOrder: 9008, depth: 0, rowType: 'staart_btw', description: 'Btw hoog:', staartPercentage: pct });
}

function btwLaag(pct: number): CostItem {
  return makeCostItem({ parentId: null, sortOrder: 9007, depth: 0, rowType: 'staart_btw_laag', description: 'Btw laag:', staartPercentage: pct });
}

/** Zoek het currency-attribuut van het kostenschema in de gegenereerde IfcX. */
function currencyAttr(items: CostItem[]): Record<string, unknown> {
  const doc = JSON.parse(generateIfcxJson({ ...createDefaultSchedule(), name: 'btw' }, items));
  let found: Record<string, unknown> | undefined;
  const walk = (v: unknown): void => {
    if (found || !v || typeof v !== 'object') return;
    const o = v as Record<string, unknown>;
    if (o['ifcx::cost::currency']) { found = o['ifcx::cost::currency'] as Record<string, unknown>; return; }
    Object.values(o).forEach(walk);
  };
  walk(doc);
  expect(found).toBeDefined();
  return found!;
}

describe('ifcx export: btw-tarief', () => {
  it('21 % btw → vatRate 21', () => {
    expect(currencyAttr([chapter(), btwLaag(9), btwHoog(21)]).vatRate).toBe(21);
  });

  it('9 % als hoog tarief → vatRate 9 (niet 21)', () => {
    expect(currencyAttr([chapter(), btwHoog(9)]).vatRate).toBe(9);
  });

  it('expliciete 0 % blijft 0, ook met een laag tarief erbij', () => {
    const cur = currencyAttr([chapter(), btwLaag(9), btwHoog(0)]);
    expect(cur.vatRate).toBe(0);
    expect(cur.currency).toBe('EUR');
    expect(cur.vatIncluded).toBe(false);
  });

  it('alleen een laag tarief → geen vatRate (laag telt niet als hoog)', () => {
    expect('vatRate' in currencyAttr([chapter(), btwLaag(9)])).toBe(false);
  });

  it('zonder btw-regel geen verzonnen vatRate', () => {
    const cur = currencyAttr([chapter()]);
    expect('vatRate' in cur).toBe(false);
    expect(cur.currency).toBe('EUR');
    expect(cur.vatIncluded).toBe(false);
  });
});
