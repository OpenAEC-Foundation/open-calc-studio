import { describe, it, expect } from 'vitest';
import { parseAmount, parseNumber } from '@/services/importers/core';
import { buildFromMapping } from '@/services/importers/genericTabularImporter';

// Knownbug 82: bedragen met een valutateken kwamen stil als 0 binnen.
describe('parseAmount', () => {
  it.each<[string, number, string | null]>([
    ['€ 1.234,56', 1234.56, 'EUR'],
    ['€1.234,56', 1234.56, 'EUR'],
    ['1.234,56 EUR', 1234.56, 'EUR'],
    ['eur 12,50', 12.5, 'EUR'],
    ['USD 1,234.56', 1234.56, 'USD'],
    ['$1,234.56', 1234.56, null],
    ['US$ 99', 99, 'USD'],
    ['£12', 12, 'GBP'],
    ['1 234,56 zł', 1234.56, 'PLN'],
    ['1\u00a0234,56\u00a0€', 1234.56, 'EUR'],
    ['-€ 12,50', -12.5, 'EUR'],
    ['€ -12,50', -12.5, 'EUR'],
    ['CHF 1\'234.50', 1234.5, 'CHF'],
    ['₡ 1.234,56', 1234.56, 'CRC'],
    // Valutateken + één scheidingsteken voor drie cijfers = duizendtal.
    ['€ 1.250', 1250, 'EUR'],
    ['$1,234', 1234, null],
    ['USD 1.234', 1234, 'USD'],
    ['₩1,000', 1000, 'KRW'],
    ['€ 12,50', 12.5, 'EUR'],
    ['€ 0,125', 0.125, 'EUR'],
    // Komma + drie cijfers bij de euro: Nederlandse prijs met drie decimalen.
    ['€ 1,500', 1.5, 'EUR'],
    ['£1,000', 1000, 'GBP'],
    ['1,250 zł', 1.25, 'PLN'],
    // C$ is zowel Canadese dollar als Nicaraguaanse córdoba.
    ['C$ 1.500,00', 1500, null],
    ['1.234,56 CRC', 1234.56, 'CRC'],
  ])('%s → %d', (raw, value, currency) => {
    const r = parseAmount(raw);
    expect(r.value).toBeCloseTo(value, 10);
    expect(r.invalid).toBe(false);
    expect(r.currency).toBe(currency);
  });

  it('keeps the existing plain-number rules', () => {
    expect(parseNumber('12,5')).toBe(12.5);
    expect(parseNumber('1234.56')).toBe(1234.56);
    expect(parseNumber('1.234,56')).toBe(1234.56);
    expect(parseNumber('1.234.567')).toBe(1234567);
    expect(parseNumber('1,234,567')).toBe(1234567);
    expect(parseNumber(42)).toBe(42);
    expect(parseNumber('')).toBe(0);
    expect(parseNumber(null)).toBe(0);
  });

  it('marks non-empty text that is no number as invalid (value 0)', () => {
    expect(parseAmount('n.v.t.')).toEqual({ value: 0, invalid: true, currency: null });
    expect(parseAmount('€')).toMatchObject({ value: 0, invalid: true });
    expect(parseAmount('   ')).toEqual({ value: 0, invalid: false, currency: null });
  });
});

describe('generic tabular import with currency amounts', () => {
  const mapping = ['code', 'description', 'quantity', 'unit', 'unitPrice'] as const;

  it('reads € amounts, takes the currency and warns about unreadable values', () => {
    const result = buildFromMapping({
      sourceName: 'Prijzen',
      headers: ['Code', 'Omschrijving', 'Hoeveelheid', 'Eenheid', 'Prijs'],
      rows: [
        ['01', 'Grondwerk', '', '', ''],
        ['01.01', 'Ontgraven', '10', 'm3', '€ 1.234,56'],
        ['01.02', 'Afvoeren', 'p.m.', 'm3', '€ 5,00'],
      ],
    }, [...mapping]);
    const posts = result.items.filter((i) => i.rowType === 'begrotingspost');
    expect(posts[0].materialPrice).toBeCloseTo(1234.56, 10);
    expect(posts[0].total).toBeCloseTo(12345.6, 6);
    expect(result.schedule.currency).toBe('EUR');
    expect(result.warnings.some((w) => w.includes('1 values') && w.includes('"p.m."'))).toBe(true);
  });

  it('sets a non-euro currency from the amounts, without converting', () => {
    const result = buildFromMapping({
      sourceName: 'Prices',
      headers: ['Description', 'Qty', 'Price'],
      rows: [['Concrete', '2', 'USD 1,000.00'], ['Steel', '1', '250.50 USD']],
    }, ['description', 'quantity', 'unitPrice']);
    expect(result.schedule.currency).toBe('USD');
    expect(result.items.map((i) => i.materialPrice)).toEqual([1000, 250.5]);
    expect(result.warnings).toEqual([]);
  });

  it('keeps the default currency when the amounts mix currencies or name none', () => {
    const mixed = buildFromMapping({
      sourceName: 'Mixed', headers: ['Description', 'Price'],
      rows: [['A', '€ 1'], ['B', '£ 2']],
    }, ['description', 'unitPrice']);
    expect(mixed.schedule.currency).toBeUndefined();
    const plain = buildFromMapping({
      sourceName: 'Plain', headers: ['Description', 'Price'],
      rows: [['A', '1,50']],
    }, ['description', 'unitPrice']);
    expect(plain.schedule.currency).toBeUndefined();
    expect(plain.items[0].materialPrice).toBe(1.5);
  });
});
