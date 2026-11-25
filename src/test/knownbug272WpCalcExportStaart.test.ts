import { describe, it, expect } from 'vitest';
import { buildExportRequest } from '@/services/export/wpcalcExporter';
import { classifyWpCalcStaartLabel } from '@/services/importers/wpcalcImporter';
import { createDefaultSchedule } from '@/data/defaultBudget';
import { makeStaartItem } from '@/services/calculation/staartDefaults';
import { makeCostItem } from '@/services/importers/core';
import { recalculateItems } from '@/services/calculation/calculator';
import type { CostSchedule, StagartRow } from '@/types/costModel';

// Knownbug 272: de export haalde alle staartregels weg en stuurde de
// staartRows van de import mee, zodat het bestand de oude percentages kreeg
// in plaats van de staart zoals die nu in de app staat.
const stale: StagartRow = {
  label: 'Uitvoeringskosten:', percentage: 6, loon: null, materiaal: null, materieel: null,
  stelpost: null, onderaanneming: null, bedrag: 1000, subtotaal: 60, totaal: 1060, itemtype: 1,
};

function setup() {
  const schedule = { ...createDefaultSchedule(), name: 'Test', staartRows: [stale] } as CostSchedule;
  const chapter = makeCostItem({ id: 'h1', rowType: 'chapter', description: 'Grondwerk', depth: 0 });
  const post = makeCostItem({
    id: 'p1', parentId: 'h1', rowType: 'begrotingspost', depth: 1, description: 'Ontgraven',
    quantity: 10, materialPrice: 100, unitPrice: 100, unit: 'm³',
  });
  const items = recalculateItems([
    chapter, post,
    makeStaartItem('staart_ukk', 'Uitvoeringskosten:', 10, 10),
    makeStaartItem('staart_btw', 'Btw hoog:', 21, 11),
    makeStaartItem('staart_afronding', 'Afronding', null, 12),
  ], schedule.tarieven);
  return buildExportRequest(schedule, items);
}

describe('WpCalc-export: staart zoals in de app (knownbug 272)', () => {
  const rows = setup().schedule.staartRows!;

  it('schrijft het huidige percentage en bedrag, niet de staart van de import', () => {
    const ukk = rows.find((r) => classifyWpCalcStaartLabel(r.label) === 'ukk')!;
    expect(ukk.percentage).toBe(10);
    expect(ukk.bedrag).toBeCloseTo(1000, 6);
    expect(ukk.subtotaal).toBeCloseTo(100, 6);
    expect(ukk.totaal).toBeCloseTo(1100, 6);
  });

  it('neemt btw en afronding mee, met labels die de import weer herkent', () => {
    const btw = rows.find((r) => classifyWpCalcStaartLabel(r.label) === 'btw')!;
    expect(btw.percentage).toBe(21);
    expect(btw.subtotaal).toBeCloseTo(231, 6);
    expect(btw.itemtype).toBe(64);
    expect(rows.some((r) => classifyWpCalcStaartLabel(r.label) === 'afronding')).toBe(true);
    expect(rows[0].label).toBe('Totaal kolommen:');
    expect(rows[rows.length - 1].label).toBe('Totaalprijs incl. btw.:');
    expect(rows[rows.length - 1].totaal).toBeCloseTo(1331, 6);
  });

  it('stuurt geen staart mee zonder staartregels (Rust maakt dan de standaardkop)', () => {
    const schedule = { ...createDefaultSchedule(), name: 'Leeg', staartRows: [stale] } as CostSchedule;
    expect(buildExportRequest(schedule, []).schedule.staartRows).toBeNull();
  });
});
