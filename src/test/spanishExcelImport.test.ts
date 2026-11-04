import { describe, it, expect } from 'vitest';
import { parseCsv, autoDetectMapping, buildFromMapping } from '@/services/importers';
import { recalculateItems } from '@/services/calculation/calculator';
import { computeResourceTotals } from '@/services/grid/resourceTotals';
import { importBasCalcFile, NotBasCalcError } from '@/services/importers/bascalcImporter';
import * as XLSX from 'xlsx';

// Issue #40: Spaanse begrotingen in Excel (kolomindeling zoals Presto/BC3),
// met een splitsing in mano de obra, materiales en maquinaria.
describe('Spaanse Excel/CSV-import', () => {
  const csv = [
    'Código;Resumen;Ud.;Medición;Mano de obra;Materiales;Maquinaria;Importe',
    '01;MOVIMIENTO DE TIERRAS;;;;;;',
    '01.01;Excavación a cielo abierto;m3;100;4,00;1,50;6,25;1175,00',
  ].join('\n');

  it('herkent Spaanse kolomkoppen, ook met accenten en leestekens', () => {
    const data = parseCsv(csv, 'presupuesto');
    expect(autoDetectMapping(data.headers)).toEqual([
      'code', 'description', 'unit', 'quantity', 'laborPrice', 'materialPrice', 'equipmentPrice', 'total',
    ]);
  });

  it('herkent ook Descripción, Cantidad en Precio', () => {
    expect(autoDetectMapping(['Descripción', 'Unidad', 'Cantidad', 'Precio'])).toEqual([
      'description', 'unit', 'quantity', 'unitPrice',
    ]);
  });

  it('legt mano de obra, materiales en maquinaria vast als aparte kostensoorten', () => {
    const data = parseCsv(csv, 'presupuesto');
    const items = recalculateItems(buildFromMapping(data, autoDetectMapping(data.headers)).items);

    const post = items.find((i) => i.code === '01.01')!;
    expect(post.rowType).toBe('begrotingspost');
    expect(post.quantity).toBe(100);
    expect(post.total).toBeCloseTo(1175);
    expect(post.unitPrice).toBeCloseTo(11.75);

    const regels = items.filter((i) => i.parentId === post.id);
    expect(regels.map((r) => r.resourceType)).toEqual(['arbeid', 'materiaal', 'materieel']);

    const totals = computeResourceTotals(items).get(post.id)!;
    expect(totals.arbeidTotal).toBeCloseTo(400);
    expect(totals.materiaalTotal).toBeCloseTo(150);
    expect(totals.materieelTotal).toBeCloseTo(625);

    const chapter = items.find((i) => i.rowType === 'chapter')!;
    expect(chapter.description).toBe('MOVIMIENTO DE TIERRAS');
    expect(chapter.total).toBeCloseTo(1175);
  });

  it('bouwt capítulos en subcapítulos op uit hiërarchische codes', () => {
    const data = parseCsv([
      'Código;Resumen;Ud.;Medición;Precio',
      '01;ALBAÑILERÍA;;;',
      '01.01;Fábricas;;;',
      '01.01.001;Tabique de ladrillo;m2;85;22,40',
      '01.01.002;Muro de bloque;m2;40;26,30',
      '01.02;Revestimientos;;;',
      '01.02.001;Enfoscado;m2;170;12,10',
      '02;CARPINTERÍA;;;',
      '02.001;Puerta de paso;ud;6;245,00',
    ].join('\n'), 'x');
    const items = recalculateItems(buildFromMapping(data, autoDetectMapping(data.headers)).items);
    const byCode = (code: string) => items.find((i) => i.code === code)!;
    const parentCode = (code: string) => items.find((i) => i.id === byCode(code).parentId)?.code ?? null;

    expect(parentCode('01')).toBeNull();
    expect(parentCode('01.01')).toBe('01');
    expect(parentCode('01.01.001')).toBe('01.01');
    expect(parentCode('01.02.001')).toBe('01.02');
    expect(parentCode('02.001')).toBe('02');
    expect(byCode('01.01').rowType).toBe('chapter');
    expect(byCode('01.01.001').depth).toBe(2);
    expect(byCode('01.01').total).toBeCloseTo(85 * 22.4 + 40 * 26.3);
    expect(byCode('01').total).toBeCloseTo(85 * 22.4 + 40 * 26.3 + 170 * 12.1);
  });

  it('behoudt het restant van Precio als er alleen Maquinaria is gesplitst', () => {
    const data = parseCsv(['Resumen;Medición;Maquinaria;Precio', 'Hormigón;10;7,50;120,50'].join('\n'), 'x');
    const items = recalculateItems(buildFromMapping(data, autoDetectMapping(data.headers)).items);
    const post = items.find((i) => i.rowType === 'begrotingspost')!;
    expect(post.total).toBeCloseTo(1205);
    expect(items.filter((i) => i.parentId === post.id).map((r) => r.resourceType)).toEqual(['materiaal', 'materieel']);
  });

  it('maakt geen lege regels voor kostensoorten met 0', () => {
    const data = parseCsv(['Resumen;Medición;Mano de obra;Materiales;Maquinaria', 'Grúa;5;0;0;80', 'Acero;100;0,45;1,10;0'].join('\n'), 'x');
    const items = buildFromMapping(data, autoDetectMapping(data.headers)).items;
    expect(items.filter((i) => i.rowType === 'regel').map((r) => r.resourceType)).toEqual(['materieel']);
    const acero = items.find((i) => i.description === 'Acero')!;
    expect(acero.laborPrice).toBe(0.45);
    expect(acero.materialPrice).toBe(1.1);
  });

  it('laat posten zonder materieel ongewijzigd (één kale post)', () => {
    const data = parseCsv(['Resumen;Medición;Mano de obra;Materiales', 'Muro;10;20;30'].join('\n'), 'x');
    const items = buildFromMapping(data, autoDetectMapping(data.headers)).items;
    expect(items).toHaveLength(1);
    expect(items[0].laborPrice).toBe(20);
    expect(items[0].materialPrice).toBe(30);
  });
});

// Openen valt alleen terug op het koppelvenster als het bestand geen
// BasCalc-werkmap is; andere BasCalc-fouten moeten zichtbaar blijven (#40).
describe('BasCalc-herkenning bij Openen', () => {
  const workbook = (sheetNames: string[]): ArrayBuffer => {
    const wb = XLSX.utils.book_new();
    for (const name of sheetNames) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Código', 'Resumen'], ['01', 'Capítulo']]), name);
    return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  };

  it('geeft NotBasCalcError als het blad "Kostprijs" ontbreekt', () => {
    expect(() => importBasCalcFile(workbook(['Presupuesto']))).toThrow(NotBasCalcError);
  });

  it('geeft geen NotBasCalcError voor een werkmap mét een Kostprijs-blad', () => {
    let error: unknown;
    try { importBasCalcFile(workbook(['Kostprijs'])); } catch (e) { error = e; }
    expect(error).not.toBeInstanceOf(NotBasCalcError);
  });
});
