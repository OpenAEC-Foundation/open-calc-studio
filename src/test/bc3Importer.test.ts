import { describe, it, expect } from 'vitest';
import { importBc3 } from '@/services/importers/bc3Importer';
import { buildBc3 } from '@/services/export/bc3Exporter';
import { recalculateItems, getKostprijs } from '@/services/calculation/calculator';

// Compacte maar representatieve FIEBDC-3: root (##), hoofdstuk (#), een
// partida met decompositie (arbeid + materiaal), een kale partida, metingen
// (~M) en een ~T-tekst.
const SAMPLE = [
  '~V||FIEBDC-3/2004|TestSoft||ANSI|||||',
  '~C|PROY##||Proyecto de prueba|13.85||0|',
  '~C|CAP01#||Movimiento de tierras|13.85||0|',
  '~C|PART1|m3|Excavación en zanja|11.85||0|',
  '~C|PART2|ud|Partida alzada|1.00||0|',
  '~C|MO001|h|Peón ordinario|15.50||1|',
  '~C|MAT01|m3|Arena de río|20.00||3|',
  '~D|PROY##|CAP01#\\1\\1\\|',
  '~D|CAP01#|PART1\\1\\1\\PART2\\1\\1\\|',
  '~D|PART1|MO001\\1\\0.5\\MAT01\\1\\0.2\\|',
  '~M|CAP01#\\PART1||10.00||',
  '~M|CAP01#\\PART2||2.00||',
  '~T|PART1|Excavación mecánica en terreno compacto.|',
].join('\r\n');

describe('FIEBDC-3 (.bc3) import', () => {
  it('bouwt de hiërarchie hoofdstuk → partida → regels', () => {
    const result = importBc3(SAMPLE);
    expect(result.schedule.projectName).toBe('Proyecto de prueba');

    const chapter = result.items.find(i => i.rowType === 'chapter')!;
    expect(chapter.description).toBe('Movimiento de tierras');
    expect(chapter.code).toBe('CAP01');

    const posten = result.items.filter(i => i.rowType === 'begrotingspost');
    expect(posten.map(p => p.code)).toEqual(['PART1', 'PART2']);
    expect(posten[0].parentId).toBe(chapter.id);
    expect(posten[0].quantity).toBe(10);
    expect(posten[0].notes).toContain('terreno compacto');

    const regels = result.items.filter(i => i.rowType === 'regel');
    expect(regels).toHaveLength(2);
    const mo = regels.find(r => r.code === 'MO001')!;
    expect(mo.resourceType).toBe('arbeid');
    expect(mo.unit).toBe('uur');
    expect(mo.quantity).toBe(10);      // partida-meting
    expect(mo.normQuantity).toBe(0.5); // rendimiento
    expect(mo.normUnitPrice).toBe(15.5);
    const mat = regels.find(r => r.code === 'MAT01')!;
    expect(mat.resourceType).toBe('materiaal');
  });

  it('rekent de juiste totalen (meting × rendement × prijs)', () => {
    const result = importBc3(SAMPLE);
    const items = recalculateItems(result.items);
    // PART1: 10 × (0.5×15.50 + 0.2×20.00) = 10 × 11.75 = 117.50
    const p1 = items.find(i => i.code === 'PART1')!;
    expect(p1.total).toBeCloseTo(117.5, 2);
    // PART2 (kaal): 2 × 1.00 = 2.00
    const p2 = items.find(i => i.code === 'PART2')!;
    expect(p2.total).toBeCloseTo(2, 2);
    expect(getKostprijs(items)).toBeCloseTo(119.5, 2);
  });

  it('importeert een prijzenboek zonder structuur onder één hoofdstuk', () => {
    const boek = [
      '~V||FIEBDC-3/2004|X||ANSI|||||',
      '~C|A1|ud|Concepto suelto|5.00||0|',
      '~C|A2|m|Otro concepto|7.50||3|',
    ].join('\r\n');
    const result = importBc3(boek);
    expect(result.warnings.some(w => w.includes('prijzenboek') || w.includes('Prijzenboek'))).toBe(true);
    expect(result.items.filter(i => i.rowType === 'begrotingspost')).toHaveLength(2);
  });

  it('meldt het wanneer een bestand geen prijzen bevat (mediciones-bibliotheek)', () => {
    // Posten mét hoeveelheden maar zonder prijzen — zonder melding lijkt de
    // import mislukt omdat het totaal € 0 blijft.
    const zonderPrijzen = [
      '~V||FIEBDC-3/2012|TestSoft||ANSI|||||',
      '~C|BIB##||Biblioteca de mediciones|0||0|',
      '~C|CAP1#||Cerramientos|0||0|',
      '~C|P001|m2|Fachada ventilada|0||0|',
      '~D|BIB##|CAP1#\\1\\1\\|',
      '~D|CAP1#|P001\\1\\1\\|',
      '~M|CAP1#\\P001||25.00||',
    ].join('\r\n');
    const result = importBc3(zonderPrijzen);
    expect(result.warnings.some(w => w.includes('geen prijzen'))).toBe(true);
    // De structuur en hoeveelheden komen wél gewoon binnen.
    expect(result.items.find(i => i.code === 'P001')?.quantity).toBe(25);
  });

  it('meldt niets over prijzen wanneer die er wél zijn', () => {
    expect(importBc3(SAMPLE).warnings.some(w => w.includes('geen prijzen'))).toBe(false);
  });

  it('round-trip: export → import behoudt structuur en kostprijs', () => {
    const eerste = importBc3(SAMPLE);
    const items1 = recalculateItems(eerste.items);
    const bc3 = buildBc3(
      { projectName: 'Proyecto de prueba', name: 'Proyecto de prueba' } as any,
      items1,
    );
    const tweede = importBc3(bc3);
    const items2 = recalculateItems(tweede.items);
    expect(items2.filter(i => i.rowType === 'chapter')).toHaveLength(1);
    expect(items2.filter(i => i.rowType === 'begrotingspost')).toHaveLength(2);
    expect(getKostprijs(items2)).toBeCloseTo(getKostprijs(items1), 2);
  });
});
