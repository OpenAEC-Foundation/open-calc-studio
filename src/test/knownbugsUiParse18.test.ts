import { describe, expect, it } from 'vitest';
import { parseLocaleNumber, parseNlNumber } from '@/utils/formatting';
import { parseNumericInput } from '@/utils/numericInput';

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
