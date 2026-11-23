// Issue #96: meetregels (aantal × lengte × breedte × hoogte) onder een post.
// De hoeveelheid van de post is hun som; de middelen eronder schalen mee;
// zelf een andere hoeveelheid invullen haalt de regels weg; BC3 neemt ze
// mee in beide richtingen.
import { beforeEach, describe, expect, it } from 'vitest';
import { lineValue, measurementSum, newMeasurementLine, quantityMatchesLines, subtotalValue } from '@/services/measurement/measurementLines';
import { importBc3 } from '@/services/importers/bc3Importer';
import { buildBc3Bytes, buildBc3 } from '@/services/export/bc3Exporter';
import { importBc3File } from '@/services/importers/bc3Importer';
import { recalculateItems } from '@/services/calculation/calculator';
import { makeCostItem } from '@/services/importers/core';
import { useAppStore } from '@/state/appStore';
import type { CostItem, CostSchedule } from '@/types/costModel';

const line = (count: number | null, length: number | null = null, width: number | null = null, height: number | null = null, description = '') =>
  newMeasurementLine({ count, length, width, height, description });

describe('rekenen met meetregels', () => {
  it('rondt elke regel en de som half-up af op 3 decimalen, zoals DS in BC3', () => {
    expect(lineValue(line(3, 1.3333, null, 1.3333))).toBe(5.333);
    expect(lineValue(line(1, 0.0005))).toBe(0.001);
    expect(lineValue(line(-1, 0.0005))).toBe(-0.001);
    expect(measurementSum([line(0.1), line(0.2)])).toBe(0.3);
    expect(measurementSum([line(3, 1.3333, null, 1.3333), line(3, 1.3333, null, 1.3333)])).toBe(10.666);
  });

  it('ziet of de hoeveelheid de som van de regels is', () => {
    const lines = [line(2, 10, null, 3)];
    expect(quantityMatchesLines({ quantity: 60, measurementLines: lines })).toBe(true);
    expect(quantityMatchesLines({ quantity: 60.0004, measurementLines: lines })).toBe(true);
    expect(quantityMatchesLines({ quantity: 61, measurementLines: lines })).toBe(false);
    expect(quantityMatchesLines({ quantity: 5, measurementLines: undefined })).toBe(true);
  });

  it('vermenigvuldigt de ingevulde vakken; lege vakken tellen niet mee', () => {
    expect(lineValue(line(1, 10, null, 3))).toBe(30);
    expect(lineValue(line(4, 12, 0.8, 0.6))).toBeCloseTo(23.04, 10);
    expect(lineValue(line(null, 7.4))).toBe(7.4);
  });

  it('een regel met alleen een omschrijving is 0', () => {
    expect(lineValue(newMeasurementLine({ description: 'Fachada' }))).toBe(0);
  });

  it('een negatief aantal trekt af', () => {
    const lines = [line(1, 10, null, 3), line(-1, null, null, 8.04)];
    expect(measurementSum(lines)).toBeCloseTo(21.96, 10);
  });

  it('tussentotalen tellen niet mee en tonen de som sinds het vorige (of vanaf het begin)', () => {
    const lines = [
      line(2), line(3),
      newMeasurementLine({ subtotal: 'partial' }),
      line(10),
      newMeasurementLine({ subtotal: 'partial' }),
      newMeasurementLine({ subtotal: 'cumulative' }),
    ];
    expect(measurementSum(lines)).toBe(15);
    expect(subtotalValue(lines, 2)).toBe(5);
    expect(subtotalValue(lines, 4)).toBe(10);
    expect(subtotalValue(lines, 5)).toBe(15);
  });
});

describe('store: setMeasurementLines', () => {
  const s = () => useAppStore.getState();
  const item = (id: string) => s().items.find((i) => i.id === id)!;

  beforeEach(() => {
    const post = makeCostItem({ id: 'p', rowType: 'begrotingspost', code: '01.01', description: 'Fábrica', unit: 'm²', quantity: 96 });
    const r1 = makeCostItem({ id: 'r1', rowType: 'regel', parentId: 'p', quantity: 96, normQuantity: 0.25, normFactor: 1, normUnitPrice: 20, resourceType: 'arbeid' });
    const r2 = makeCostItem({ id: 'r2', rowType: 'regel', parentId: 'p', quantity: 5, normQuantity: 1, normFactor: 1, normUnitPrice: 100, resourceType: 'materiaal' });
    useAppStore.setState({ items: recalculateItems([post, r1, r2]) } as never);
  });

  it('de hoeveelheid wordt de som en het totaal beweegt mee via de middelen', () => {
    const before = item('p').total;
    s().setMeasurementLines('p', [line(2, 10, null, 3, 'Fachada norte'), line(2, 7.4, null, 3), line(-1, null, null, 8.04)]);
    expect(item('p').quantity).toBeCloseTo(96.36, 10);
    expect(item('p').measurementLines).toHaveLength(3);
    // r1 volgde de post (96) en volgt nu de som; r2 had een eigen aantal.
    expect(item('r1').quantity).toBeCloseTo(96.36, 10);
    expect(item('r2').quantity).toBe(5);
    expect(item('p').total).toBeGreaterThan(before);
  });

  it('een koppeling als bron van de hoeveelheid vervalt', () => {
    s().updateItem('p', 'excelLink', { filePath: 'x.xlsx', sheet: 'Blad1', cell: 'A1' });
    s().setMeasurementLines('p', [line(10)]);
    expect(item('p').excelLink).toBeNull();
    expect(item('p').quantityLink).toBeNull();
  });

  it('een koppeling zetten haalt de meetregels weg, ook bij dezelfde hoeveelheid', () => {
    s().setMeasurementLines('p', [line(96)]);
    s().updateItem('p', 'quantityLink', { source: 'pdf', measurementId: 'm1', kind: 'area' });
    expect(item('p').measurementLines).toBeUndefined();
    s().setMeasurementLines('p', [line(96)]);
    s().updateItem('p', 'excelLink', { filePath: 'x.xlsx', sheet: 'Blad1', cell: 'A1' });
    expect(item('p').measurementLines).toBeUndefined();
    // Een koppeling weghalen laat de regels juist staan.
    s().setMeasurementLines('p', [line(96)]);
    s().updateItem('p', 'excelLink', null);
    expect(item('p').measurementLines).toHaveLength(1);
  });

  it('vanaf een lege of 0-hoeveelheid schaalt geen middel mee', () => {
    const post = makeCostItem({ id: 'p', rowType: 'begrotingspost', code: '01.01', quantity: 0 });
    const zero = makeCostItem({ id: 'r0', rowType: 'regel', parentId: 'p', quantity: 0, normQuantity: 1, normFactor: 1, normUnitPrice: 10 });
    const empty = makeCostItem({ id: 're', rowType: 'regel', parentId: 'p', quantity: null, normQuantity: 1, normFactor: 1, normUnitPrice: 10 });
    useAppStore.setState({ items: recalculateItems([post, zero, empty]) } as never);
    s().setMeasurementLines('p', [line(5)]);
    expect(item('p').quantity).toBe(5);
    expect(item('r0').quantity).toBe(0);
    expect(item('re').quantity).toBeNull();
  });

  it('zelf een andere hoeveelheid invullen haalt de regels weg; dezelfde laat ze staan', () => {
    s().setMeasurementLines('p', [line(10), line(5)]);
    s().updateItem('p', 'quantity', 15);
    expect(item('p').measurementLines).toHaveLength(2);
    s().updateItem('p', 'quantity', 20);
    expect(item('p').measurementLines).toBeUndefined();
    expect(item('p').quantity).toBe(20);
  });

  it('regels weghalen laat de hoeveelheid staan', () => {
    s().setMeasurementLines('p', [line(12)]);
    s().setMeasurementLines('p', null);
    expect(item('p').measurementLines).toBeUndefined();
    expect(item('p').quantity).toBe(12);
  });

  it('alleen op (bewakings)posten', () => {
    s().setMeasurementLines('r1', [line(3)]);
    expect(item('r1').measurementLines).toBeUndefined();
  });
});

describe('BC3', () => {
  const header = '~V|SOFT|FIEBDC-3/2016|Test||ANSI|\r\n~K|\\2\\2\\3\\2\\2\\2\\2\\EUR\\|0|\r\n';
  const bc3 = (m: string) => header + [
    '~C|OBRA##||Obra|1000|',
    '~C|01#||Capítulo|1000|',
    '~C|01.01|m2|Fábrica|10|',
    '~D|OBRA##|01#\\1\\1\\|',
    '~D|01#|01.01\\1\\1\\|',
    m,
  ].join('\r\n') + '\r\n';
  const post = (r: { items: CostItem[] }) => r.items.find((i) => i.code === '01.01')!;

  it('neemt de meetregels over als ze samen de meting zijn', () => {
    const r = importBc3(bc3('~M|01#\\01.01|1\\1\\|96.36|\\Fachada norte\\2\\10\\\\3\\\\\\2\\7.4\\\\3\\\\A deducir huecos\\-1\\\\\\8.04\\|'));
    const p = post(r);
    expect(p.quantity).toBeCloseTo(96.36, 10);
    expect(p.measurementLines?.map((l) => [l.description, l.count, l.length, l.width, l.height])).toEqual([
      ['Fachada norte', 2, 10, null, 3],
      ['', 2, 7.4, null, 3],
      ['A deducir huecos', -1, null, null, 8.04],
    ]);
  });

  it('0 in een vak is "niet ingevuld" (pyCost schrijft 0 waar Presto leeg laat)', () => {
    const r = importBc3(bc3('~M|01#\\01.01|1\\1\\|210.25|\\\\1\\14.5\\14.5\\0\\|'));
    expect(post(r).measurementLines?.[0]).toMatchObject({ count: 1, length: 14.5, width: 14.5, height: null });
  });

  it('regels die niet op de meting uitkomen of een formule hebben: alleen de hoeveelheid, met melding', () => {
    const off = importBc3(bc3('~M|01#\\01.01|1\\1\\|50|\\Muro\\1\\10\\\\3\\|'));
    expect(post(off).quantity).toBe(50);
    expect(post(off).measurementLines).toBeUndefined();
    expect(off.warnings.some((w) => w.includes('meetregels'))).toBe(true);

    const formula = importBc3(bc3('~M|01#\\01.01|1\\1\\|30|3\\a*b\\1\\10\\\\3\\|'));
    expect(post(formula).measurementLines).toBeUndefined();
  });

  it('exporteert de regels en leest ze terug', () => {
    const schedule: CostSchedule = {
      id: 's', name: 'T', description: '', status: 'DRAFT', predefinedType: 'BUDGET', currency: 'EUR',
      projectName: 'T', projectNumber: '', client: '', author: '', ifcGuid: 'g',
      uitvoeringskosten: 0, algemeneKosten: 0, winstRisico: 0,
    } as CostSchedule;
    const chapter = makeCostItem({ rowType: 'chapter', code: '01', description: 'Capítulo' });
    const lines = [line(2, 10, null, 3, 'Fachada | norte'), line(-1, null, null, 8.04, 'Huecos')];
    const p = makeCostItem({
      rowType: 'begrotingspost', parentId: chapter.id, code: '01.01', description: 'Fábrica', unit: 'm²',
      quantity: measurementSum(lines), normUnitPrice: 10, measurementLines: lines,
    });
    const items = recalculateItems([chapter, p]);
    expect(buildBc3(schedule, items)).toContain('|\\Fachada   norte\\2\\10\\\\3\\\\Huecos\\-1\\\\\\8.04\\|');
    const back = importBc3File(buildBc3Bytes(schedule, items).bytes.buffer as ArrayBuffer);
    const q = back.items.find((i) => i.code === '01.01')!;
    expect(q.quantity).toBeCloseTo(51.96, 10);
    expect(q.measurementLines?.map((l) => [l.count, l.length, l.width, l.height])).toEqual([[2, 10, null, 3], [-1, null, null, 8.04]]);
  });
});
