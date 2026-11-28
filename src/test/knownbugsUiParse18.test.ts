import { describe, expect, it } from 'vitest';
import { parseLocaleNumber, parseNlNumber } from '@/utils/formatting';
import { parseNumericInput } from '@/utils/numericInput';
import { recalcSheetCells } from '@/state/slices/subSheetSlice';

describe('knownbug 18: parseNlNumber/parseLocaleNumber zijn strikt', () => {
  it('weigert twee decimaaltekens en tekst achter het getal', () => {
    expect(parseNlNumber('1,234,567')).toBeNull();
    expect(parseNlNumber('12abc')).toBeNull();
    expect(parseLocaleNumber('12.5.3', '.')).toBeNull();
    expect(parseLocaleNumber('1.234,56,7', ',')).toBeNull();
    expect(parseNumericInput('12abc', ',')).toBeNull();
  });

  it('gewone notaties blijven werken', () => {
    expect(parseNlNumber('1.234,56')).toBe(1234.56);
    expect(parseNlNumber('1.234.567')).toBe(1234567);
    expect(parseNlNumber('-15,5')).toBe(-15.5);
    expect(parseNlNumber('12,')).toBe(12);
    expect(parseNlNumber(',5')).toBe(0.5);
    expect(parseLocaleNumber('1,234,567', '.')).toBe(1234567);
    expect(parseLocaleNumber('5e-7', '.')).toBe(5e-7);
    expect(parseLocaleNumber('+3', '.')).toBe(3);
  });
});

describe('knownbug 18: gevolg voor subbladen (bewust)', () => {
  // Tekst met een eenheid of procentteken is geen getal meer. Een formule die
  // ernaar verwijst geeft een fout, zoals #WAARDE! in Excel (knownbug 53):
  // liever een zichtbare fout dan een stille 0 in de begroting.
  // Opgeslagen cellen met een berekende waarde houden die waarde.
  it('"12 m" en "10%" zonder berekende waarde maken een formule ongeldig, een opgeslagen waarde blijft', () => {
    const fresh = recalcSheetCells({ A1: { value: '12 m' }, A2: { value: '10%' }, B1: { value: '=A1+A2' } });
    expect(fresh.B1.computed).toBeUndefined();
    const saved = recalcSheetCells({ A1: { value: '12 m', computed: 12 }, B1: { value: '=A1*2' } });
    expect(saved.B1.computed).toBe(24);
  });
});
