import { describe, it, expect } from 'vitest';
import { parseCsv, autoDetectMapping, buildFromMapping } from '@/services/importers';
import { recalculateItems } from '@/services/calculation/calculator';
import { computeResourceTotals } from '@/services/grid/resourceTotals';

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

  it('laat posten zonder materieel ongewijzigd (één kale post)', () => {
    const data = parseCsv(['Resumen;Medición;Mano de obra;Materiales', 'Muro;10;20;30'].join('\n'), 'x');
    const items = buildFromMapping(data, autoDetectMapping(data.headers)).items;
    expect(items).toHaveLength(1);
    expect(items[0].laborPrice).toBe(20);
    expect(items[0].materialPrice).toBe(30);
  });
});
