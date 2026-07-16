import { describe, it, expect } from 'vitest';
import { parseNumericInput } from '@/utils/numericInput';
import { parseNlNumber, formatNumberForEdit } from '@/utils/formatting';

describe('parseNlNumber decimalen-heuristiek', () => {
  it('één punt zonder komma is decimaal, behalve bij duizendtal-patroon', () => {
    expect(parseNlNumber('60.5')).toBe(60.5);
    expect(parseNlNumber('6.66')).toBe(6.66);
    expect(parseNlNumber('12.25')).toBe(12.25);
    expect(parseNlNumber('1988.25')).toBe(1988.25);
    expect(parseNlNumber('1.234')).toBe(1234); // exact 3 cijfers na punt = duizendtal
    expect(parseNlNumber('1.234.567')).toBe(1234567);
  });

  it('komma-notatie blijft leidend', () => {
    expect(parseNlNumber('6,66')).toBe(6.66);
    expect(parseNlNumber('1.234,56')).toBe(1234.56);
  });
});

describe('editor round-trip (komma-wegval-bug)', () => {
  it('formatNumberForEdit → parseNumericInput levert exact hetzelfde getal', () => {
    for (const v of [6.66, 60.5, 1988.25, 17.7, 103.4, 0.001, 12345.67, 42]) {
      expect(parseNumericInput(formatNumberForEdit(v))).toBe(v);
    }
  });

  it('formatNumberForEdit gebruikt komma en geen duizendtal-separator', () => {
    expect(formatNumberForEdit(6.66)).toBe('6,66');
    expect(formatNumberForEdit(1988.25)).toBe('1988,25');
    expect(formatNumberForEdit(0)).toBe('');
    expect(formatNumberForEdit(null)).toBe('');
  });
});

describe('parseNumericInput formules', () => {
  it('evalueert formules met =', () => {
    expect(parseNumericInput('=12,2*2,22')).toBeCloseTo(27.084, 10);
    expect(parseNumericInput('=12.2*2.22')).toBeCloseTo(27.084, 10);
    expect(parseNumericInput('=1.234,56*2')).toBeCloseTo(2469.12, 10);
    expect(parseNumericInput('= 6,66')).toBe(6.66);
  });

  it('evalueert formules zonder = zodra er een operator staat', () => {
    expect(parseNumericInput('12.2*2.2')).toBeCloseTo(26.84, 10);
    expect(parseNumericInput('17,7+5')).toBeCloseTo(22.7, 10);
    expect(parseNumericInput('2*(3+4,5)')).toBe(15);
    expect(parseNumericInput('10/4')).toBe(2.5);
    expect(parseNumericInput('100-12,5')).toBe(87.5);
  });

  it('gewone getallen blijven NL-geparsed', () => {
    expect(parseNumericInput('6,66')).toBe(6.66);
    expect(parseNumericInput('1.234')).toBe(1234); // duizendtal, geen formule
    expect(parseNumericInput('-15,5')).toBe(-15.5);
    expect(parseNumericInput('')).toBeNull();
    expect(parseNumericInput('   ')).toBeNull();
  });

  it('ongeldige invoer geeft null', () => {
    expect(parseNumericInput('abc')).toBeNull();
    expect(parseNumericInput('=2*')).toBeNull();
    expect(parseNumericInput('=(2+3')).toBeNull();
    expect(parseNumericInput('=2/0')).toBeNull();
    expect(parseNumericInput('=1,2,3*2')).toBeNull();
    expect(parseNumericInput('=')).toBeNull();
  });

  it('unaire min en haakjes', () => {
    expect(parseNumericInput('=-5+3')).toBe(-2);
    expect(parseNumericInput('=2*-3')).toBe(-6);
    expect(parseNumericInput('=(1+2)*(3+4)')).toBe(21);
  });
});
