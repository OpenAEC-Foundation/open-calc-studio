import { describe, expect, it } from 'vitest';
import { importCuf } from '@/services/importers/cufImporter';
import { importTradxml } from '@/services/importers/tradxmlImporter';
import { exportCuf } from '@/services/exporters/cufExporter';
import { exportTradxml } from '@/services/exporters/tradxmlExporter';
import { recalculateItems } from '@/services/calculation/calculator';
import { makeCostItem } from '@/services/importers/core';
import type { CostItem, CostSchedule } from '@/types/costModel';

/** Hoofdstuk → subhoofdstuk → subsubhoofdstuk → post met twee regels, plus een post direct in het hoofdstuk. */
function nestedBudget(): CostItem[] {
  const h1 = makeCostItem({ id: 'h1', rowType: 'chapter', code: '01', description: 'Ruwbouw' });
  const h2 = makeCostItem({ id: 'h2', parentId: 'h1', rowType: 'chapter', code: '01.1', description: 'Fundering' });
  const h3 = makeCostItem({ id: 'h3', parentId: 'h2', rowType: 'chapter', code: '01.1.1', description: 'Palen' });
  const p1 = makeCostItem({ id: 'p1', parentId: 'h3', rowType: 'begrotingspost', code: '01.1.1.01', description: 'Heipalen', unit: 'st', quantity: 10 });
  const r1 = makeCostItem({ id: 'r1', parentId: 'p1', rowType: 'regel', code: 'M1', description: 'Paal', unit: 'st', quantity: 10, normUnitPrice: 125, resourceType: 'materiaal' });
  const r2 = makeCostItem({ id: 'r2', parentId: 'p1', rowType: 'regel', code: 'A1', description: 'Heien', unit: 'uur', quantity: 3, normUnitPrice: 82.5, resourceType: 'arbeid' });
  const p2 = makeCostItem({ id: 'p2', parentId: 'h1', rowType: 'begrotingspost', code: '01.01', description: 'Bouwplaats', unit: 'post', quantity: 1, normUnitPrice: 500 });
  return recalculateItems([h1, h2, h3, p1, r1, r2, p2]);
}

const schedule = { name: 'Nest' } as CostSchedule;
const summary = (items: CostItem[]) => {
  const byId = new Map(items.map((i) => [i.id, i]));
  return items.map((i) => ({
    rowType: i.rowType,
    code: i.code,
    parent: i.parentId ? byId.get(i.parentId)?.code : null,
    total: Math.round(i.total * 100) / 100,
  }));
};

describe('CUF: geneste hoofdstukken en regels overleven export → import (knownbug 103)', () => {
  it('leest subhoofdstukken, posten en regels terug met dezelfde bedragen', () => {
    const source = nestedBudget();
    const back = recalculateItems(importCuf(exportCuf({ schedule, items: source }).xml).items);
    const expected = summary(source);
    expect(summary(back)).toEqual(expect.arrayContaining(expected));
    expect(back).toHaveLength(source.length);
    const totalOf = (items: CostItem[]) => items.filter((i) => !i.parentId).reduce((s, i) => s + i.total, 0);
    expect(totalOf(back)).toBeCloseTo(totalOf(source), 2);
    expect(totalOf(source)).toBeCloseTo(10 * 125 + 3 * 82.5 + 500, 2);
  });
});

describe('TradXML: meer dan één Element-niveau (knownbug 274)', () => {
  it('leest geneste Elementen terug als subhoofdstukken', () => {
    const source = nestedBudget().filter((i) => i.rowType !== 'regel');
    for (const p of source) if (p.id === 'p1') { p.normUnitPrice = 150; }
    const items = recalculateItems(source);
    const back = recalculateItems(importTradxml(exportTradxml({ schedule, items }).xml).items);
    expect(summary(back)).toEqual(expect.arrayContaining(summary(items)));
    expect(back).toHaveLength(items.length);
  });

  it('hangt een Activiteit in een diep Element onder dat Element', () => {
    const xml = `<?xml version="1.0"?><Begroting><Kop><Projectnaam>T</Projectnaam></Kop>
      <Hoofdstuk code="H" omschrijving="H"><Element code="E1" omschrijving="E1"><Element code="E2" omschrijving="E2">
        <Activiteit code="A" omschrijving="A"><Hoeveelheid>2</Hoeveelheid><Eenheid>m3</Eenheid><Eenheidsprijs>10,00</Eenheidsprijs></Activiteit>
      </Element></Element></Hoofdstuk></Begroting>`;
    const r = importTradxml(xml);
    const byCode = Object.fromEntries(r.items.map((i) => [i.code, i]));
    expect(byCode.E2?.parentId).toBe(byCode.E1.id);
    expect(byCode.A?.parentId).toBe(byCode.E2.id);
    expect(byCode.A.depth).toBe(3);
  });
});
