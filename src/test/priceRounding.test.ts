import { describe, it, expect } from 'vitest';
import { importBc3 } from '@/services/importers/bc3Importer';
import { makeCostItem } from '@/services/importers/core';
import {
  recalculateItems, getKostprijs, computeKostprijsBreakdown,
} from '@/services/calculation/calculator';
import {
  FIEBDC_DEFAULT_ROUNDING, normalizePriceRounding, roundHalfUp,
} from '@/services/calculation/priceRounding';
import type { CostItem } from '@/types/costModel';

// Het voorbeeld uit #83 (CYPE Arquímedes): ~C 47,28 per m², onafgerond 47,2665.
const CYPE = String.raw`~V|CYPE INGENIEROS, S.A.|FIEBDC-3/2004|ARQUIMEDES||ANSI|Presupuesto|2|
~K|0\13\6\\21|
~C|TEST##||TEST ESTIMATE|4431.65|260113|0|
~D|TEST##
|01#\\1
\|
~C|01#||CHAPTER|4431.65|260113|0|
~D|01#
|P01\\1
\|
~C|P01|m2|ITEM WITH DECOMPOSITION|47.28|260113|0|
~D|P01
|R01\\0.7
\R02\\0.7
\R03\\1.05
\R04\\1.5
\|
~C|R01|h|Oficial 1a|18.35|260113|1|
~C|R02|h|Peon ordinario|17.08|260113|1|
~C|R03|m2|Baldosa|21.21|260113|3|
~C|R04|kg|Cemento cola|0.13|260113|3|
~M|01#\P01|1\1\|93.732|`.replace(/\r?\n/g, '\r\n');

const sum = (xs: number[]) => xs.reduce((s, v) => s + v, 0);

describe('roundHalfUp', () => {
  it('rondt half-up af ondanks float-ruis', () => {
    expect(roundHalfUp(0.7 * 18.35, 2)).toBe(12.85); // 12,8449999… in een double
    expect(roundHalfUp(0.7 * 17.08, 2)).toBe(11.96);
    expect(roundHalfUp(1.05 * 21.21, 2)).toBe(22.27);
    expect(roundHalfUp(1.5 * 0.13, 2)).toBe(0.2);
    expect(roundHalfUp(1.005, 2)).toBe(1.01);
    expect(roundHalfUp(2.675, 2)).toBe(2.68);
  });

  it('rondt van nul af bij negatieve bedragen', () => {
    expect(roundHalfUp(-12.845, 2)).toBe(-12.85);
    expect(roundHalfUp(-12.844, 2)).toBe(-12.84);
  });

  it('laat <5 staan, ook bij grote bedragen en andere decimalen', () => {
    expect(roundHalfUp(1234567.125, 2)).toBe(1234567.13);
    expect(roundHalfUp(1234567.1249, 2)).toBe(1234567.12);
    expect(roundHalfUp(0.1234549, 5)).toBe(0.12345);
    expect(roundHalfUp(0.123455, 5)).toBe(0.12346);
    expect(roundHalfUp(47.2665, 0)).toBe(47);
  });
});

describe('normalizePriceRounding', () => {
  it('geeft null zonder regel en vult onzin aan met de FIEBDC-standaard', () => {
    expect(normalizePriceRounding(null)).toBeNull();
    expect(normalizePriceRounding(undefined)).toBeNull();
    expect(normalizePriceRounding({ line: 13, unitPrice: -1, total: 2.5 })).toEqual(FIEBDC_DEFAULT_ROUNDING);
    expect(normalizePriceRounding({ line: 5, unitPrice: 2, total: 2 })).toEqual({ line: 5, unitPrice: 2, total: 2 });
  });
});

describe('recalculateItems met priceRounding (#83)', () => {
  it('komt op het voorbeeld uit het issue uit op 47,28 en 4.431,65', () => {
    const items = recalculateItems(importBc3(CYPE).items, undefined, FIEBDC_DEFAULT_ROUNDING);
    const post = items.find(i => i.code === 'P01')!;
    expect(post.unitPrice).toBe(47.28);
    expect(post.total).toBe(4431.65);
    expect(getKostprijs(items)).toBeCloseTo(4431.65, 9);
  });

  it('laat de regels precies optellen tot de post, en de staartkolommen tot de kostprijs', () => {
    const items = recalculateItems(importBc3(CYPE).items, undefined, FIEBDC_DEFAULT_ROUNDING);
    const post = items.find(i => i.code === 'P01')!;
    const regels = items.filter(i => i.parentId === post.id);
    expect(sum(regels.map(r => r.total))).toBeCloseTo(4431.65, 9);
    const k = computeKostprijsBreakdown(items);
    expect(k.loon + k.materiaal + k.materieel + k.stelpost + k.onderaanneming).toBeCloseTo(4431.65, 9);
    // Elke regel: aantal × afgerond bedrag per eenheid, plus zijn deel van het
    // restje (4.431,65 − 93,732 × 47,28 = 0,00104) naar rato van zijn bedrag.
    const rest = 4431.65 - 93.732 * 47.28;
    const perEenheid: Record<string, number> = { R01: 12.85, R02: 11.96, R03: 22.27, R04: 0.2 };
    for (const r of regels) {
      const bedrag = 93.732 * perEenheid[r.code];
      expect(r.total, r.code).toBeCloseTo(bedrag + rest * bedrag / (93.732 * 47.28), 9);
    }
  });

  it('rekent zonder regel precies zoals voorheen', () => {
    const imported = importBc3(CYPE).items;
    const before = recalculateItems(imported);
    expect(recalculateItems(imported, undefined, null)).toEqual(before);
    expect(before.find(i => i.code === 'P01')!.total).toBeCloseTo(4430.383578, 6);
  });

  it('is stabiel: nog een keer herberekenen verandert niets', () => {
    const once = recalculateItems(importBc3(CYPE).items, undefined, FIEBDC_DEFAULT_ROUNDING);
    const twice = recalculateItems(once, undefined, FIEBDC_DEFAULT_ROUNDING);
    expect(twice.map(i => [i.code, i.total, i.unitPrice])).toEqual(once.map(i => [i.code, i.total, i.unitPrice]));
  });

  it('houdt een post zonder aantal onafgerond, en een post met alleen een subpost op de som daarvan', () => {
    const ch = makeCostItem({ id: 'h', rowType: 'chapter', parentId: null, code: '01' });
    const leeg = makeCostItem({ id: 'p0', rowType: 'begrotingspost', parentId: 'h', quantity: 0 });
    const r0 = makeCostItem({ id: 'r0', rowType: 'regel', parentId: 'p0', quantity: 0, normQuantity: 0.7, normFactor: 1, normUnitPrice: 18.35 });
    const p1 = makeCostItem({ id: 'p1', rowType: 'begrotingspost', parentId: 'h', quantity: 2 });
    const sub = makeCostItem({ id: 'p2', rowType: 'begrotingspost', parentId: 'p1', quantity: 1, normUnitPrice: 0.333 });
    const items: CostItem[] = [ch, leeg, r0, p1, sub];
    const out = recalculateItems(items, undefined, FIEBDC_DEFAULT_ROUNDING);
    expect(out.find(i => i.id === 'p0')!.total).toBe(0);
    // De kale subpost rondt zelf af (0,333 → 0,33); de post erboven heeft geen
    // regels om een restje op te vangen en houdt de som van zijn subposten.
    expect(out.find(i => i.id === 'p2')!.total).toBe(0.33);
    expect(out.find(i => i.id === 'p1')!.total).toBe(0.33);
    expect(out.find(i => i.id === 'p1')!.unitPrice).toBe(0.165);
  });
});
