import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { importBasCalcFile } from '@/services/importers/bascalcImporter';
import { recalculateItems, getKostprijs } from '@/services/calculation/calculator';

/**
 * BasCalc-import: de bedragen uit kolom N zijn de bron van waarheid en moeten
 * een herberekening exact overleven (regressie: normvelden die het bedrag
 * niet reproduceerden lieten de kostprijs met tienduizenden euro's wegdrijven).
 */
function makeBasCalcXls(): ArrayBuffer {
  // Kostprijs-sheet: kolommen A..N (idx 0..13)
  const kp: (string | number | null)[][] = [
    ['%_bascalc_%kp', null, null, null, null, null, null, null, null, null, null, null, null, null],
    // Hoofdstuk 1
    ['ih', '0', '1', 'VOORBEREIDEND', null, null, null, null, null, null, null, null, null, null],
    // Post 110010: Excel-bedrag 1040, maar aantal(E)=8 × eh.prijs(M)=1040 zou
    // 8320 geven — de klassieke drift. Kolom N moet winnen.
    ['ih', '0', '110010', 'Opbreken verharding', null, null, null, null, 1, 'week', 'N', null, 1040, 1040],
    ['cb', '', null, 'Materieel', null, null, null, null, null, null, null, null, null, null],
    // cn: E=8, F=null, H=null, L=130, M=1040, N=1040 → E×L=1040 ✓ (mapping-kandidaat L klopt)
    ['cn', '', '30105', 'Kraan', 8, null, '/', null, 8, 'uur', 'm', 130, 1040, 1040],
    ['cp', '', null, null, null, 'hv-post', null, 1, null, null, null, null, null, null],
    // Post 110020: cn waarvan GEEN mapping klopt (E=4, L=10, M=25, N=333) → pin
    ['ih', '0', '110020', 'Afvoer', null, null, null, null, 1, 'post', 'N', null, 333, 333],
    ['cb', '', null, 'Afvoer', null, null, null, null, null, null, null, null, null, null],
    ['cn', '', '40201', 'Container', 4, null, '/', null, 4, 'st', 'm', 10, 25, 333],
    ['cp', '', null, null, null, 'hv-post', null, 1, null, null, null, null, null, null],
    // Hoofdstuk 9 STAART
    ['ih', '0', '9', 'STAARTKOSTEN', null, null, null, null, null, null, null, null, null, null],
    // Staartregel met phantom-kinderen (moeten overgeslagen worden)
    ['ih', '0', '929990', 'Uitvoeringskosten', null, null, null, null, 6, '%', 'V', null, 0, 0],
    ['cb', '', null, 'Uitvoeringskosten', null, null, null, null, 6, '%', null, null, 0, 0],
    ['cn', '', '99101', 'Uitvoeringskosten', 1, null, '/', null, 0, 0, 'h', 0, 0, 0],
    ['cp', '', null, null, null, 'hv-post', null, null, null, null, null, null, null, null],
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['%_vrij_%']]), 'Menu');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(kp), 'Kostprijs');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['%_bascalc_%eb']]), 'Eindblad');
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return out;
}

describe('BasCalc bron-getrouwe bedragen', () => {
  const { schedule, items } = importBasCalcFile(makeBasCalcXls());
  const recalced = recalculateItems(items, (schedule as any).tarieven);

  it('kostprijs overleeft herberekening exact (kolom N is leidend)', () => {
    // 1040 + 333 = 1373 — vóór de fix werd dit 8×1040 + 4×25 = 8420.
    expect(Math.round(getKostprijs(recalced) * 100) / 100).toBe(1373);
  });

  it('consistente normvelden blijven behouden (kraan: 8 × €130)', () => {
    const kraan = recalced.find((i) => i.code === '30105');
    expect(kraan?.normUnitPrice).toBe(130);
    expect(kraan?.quantity).toBe(8);
    expect(Math.round((kraan?.total ?? 0) * 100) / 100).toBe(1040);
  });

  it('inconsistente normvelden worden gepind op het bronbedrag', () => {
    const container = recalced.find((i) => i.code === '40201');
    expect(Math.round((container?.total ?? 0) * 100) / 100).toBe(333);
    expect(container?.normQuantity).toBeNull();
  });

  it('cp-afsluitregels worden geen phantom-regels', () => {
    const phantom = recalced.filter((i) => i.rowType === 'regel' && !i.code && !i.description);
    expect(phantom.length).toBe(0);
  });

  it('staartregels krijgen geen phantom-kinderen', () => {
    const staart = recalced.find((i) => i.rowType === 'staart_ukk');
    expect(staart).toBeTruthy();
    const kinderen = recalced.filter((i) => i.parentId === staart!.id);
    expect(kinderen.length).toBe(0);
    expect(staart!.staartPercentage).toBe(6);
  });
});
