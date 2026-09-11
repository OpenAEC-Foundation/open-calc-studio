import { describe, it, expect } from 'vitest';
import { importBc3, importBc3File, decodeBc3 } from '@/services/importers/bc3Importer';
import { buildBc3, buildBc3Bytes, encodeWindows1252 } from '@/services/export/bc3Exporter';
import { fitsWindows1252, decodeWindows1252 } from '@/services/importers/windows1252';
import { recalculateItems, getKostprijs } from '@/services/calculation/calculator';
import { makeCostItem } from '@/services/importers/core';
import type { CostItem, CostSchedule } from '@/types/costModel';

/**
 * Gedrag van de BC3-exporter dat bij de rondreis over echte bestanden
 * (src/test/bc3Roundtrip.test.ts, verification/bc3/) aan het licht kwam.
 * Elk geval hier was ooit een verschil tussen import A en herimport B.
 */

const schedule = (extra: Partial<CostSchedule> = {}): CostSchedule => ({
  id: 's', name: 'Test', description: '', status: 'DRAFT', predefinedType: 'BUDGET',
  currency: 'EUR', projectName: 'Testproject', projectNumber: '', client: '', author: '',
  ifcGuid: 'g', uitvoeringskosten: 0, algemeneKosten: 0, winstRisico: 0, ...extra,
});

const roundtrip = (items: CostItem[], extra: Partial<CostSchedule> = {}) => {
  const first = recalculateItems(items);
  const { bytes } = buildBc3Bytes(schedule(extra), first);
  const back = importBc3File(bytes.buffer as ArrayBuffer);
  return { first, text: buildBc3(schedule(extra), first), back, second: recalculateItems(back.items) };
};

/** Hoofdstuk met één post en de opgegeven regels. */
const budget = (postQty: number, regels: Partial<CostItem>[], post: Partial<CostItem> = {}): CostItem[] => {
  const chapter = makeCostItem({ rowType: 'chapter', code: '01', description: 'Hoofdstuk' });
  const p = makeCostItem({
    rowType: 'begrotingspost', parentId: chapter.id, code: 'P1', description: 'Post', unit: 'm²',
    quantity: postQty, ...post,
  });
  const kids = regels.map((r, i) => makeCostItem({
    rowType: 'regel', parentId: p.id, code: `R${i + 1}`, description: `Regel ${i + 1}`, unit: 'uur',
    quantity: postQty, normFactor: 1, resourceType: 'arbeid', ...r,
  }));
  return [chapter, p, ...kids];
};

describe('FIEBDC-3 (.bc3) export', () => {
  it('schrijft rendementen, prijzen en hoeveelheden zonder af te ronden', () => {
    // Echte bestanden hebben rendementen met 4–15 decimalen; afronden op 3
    // decimalen verschoof totalen in de miljoenen met tientallen euro's.
    const { text, first, second } = roundtrip(budget(12.3456, [
      { normQuantity: 0.0025, normUnitPrice: 14000 },
      { normQuantity: 0.02999999932945, normUnitPrice: 1234.5678 },
    ]));
    expect(text).toContain('\\1\\0.0025\\');
    expect(text).toContain('\\1\\0.02999999932945\\');
    expect(text).toContain('|12.3456||');
    expect(getKostprijs(second)).toBeCloseTo(getKostprijs(first), 6);
  });

  it('schrijft geen exponentnotatie voor heel kleine getallen', () => {
    const { text } = roundtrip(budget(1, [{ normQuantity: 0.0000001, normUnitPrice: 10 }]));
    expect(text).not.toMatch(/e-\d/);
    expect(text).toContain('\\1\\0.0000001\\');
  });

  it('houdt regeleinden in ~T-teksten', () => {
    const items = budget(1, [{ normQuantity: 1, normUnitPrice: 1 }], { notes: 'Eerste regel.\nTweede regel.' });
    const { text, second } = roundtrip(items);
    expect(text).toContain('~T|P1|Eerste regel.\r\nTweede regel.|');
    expect(second.find((i) => i.code === 'P1')!.notes).toBe('Eerste regel.\nTweede regel.');
  });

  it('schrijft een middel dat in meerdere posten zit als één concept', () => {
    const chapter = makeCostItem({ rowType: 'chapter', code: '01', description: 'H' });
    const items: CostItem[] = [chapter];
    for (const [code, qty] of [['P1', 2], ['P2', 5]] as const) {
      const p = makeCostItem({ rowType: 'begrotingspost', parentId: chapter.id, code, description: code, unit: 'm', quantity: qty });
      items.push(p, makeCostItem({
        rowType: 'regel', parentId: p.id, code: 'MO001', description: 'Peón', unit: 'uur',
        quantity: qty, normQuantity: 0.5, normFactor: 1, normUnitPrice: 15.5, resourceType: 'arbeid',
      }));
    }
    const { text, second } = roundtrip(items);
    expect(text.match(/~C\|MO001\|/g)).toHaveLength(1);
    expect(text).not.toContain('MO001_1');
    expect(second.filter((i) => i.code === 'MO001')).toHaveLength(2);
  });

  it('geeft dezelfde partida op twee plekken in één hoofdstuk elk zijn eigen meting', () => {
    // Zonder positiepad in ~M zou de importer beide metingen optellen.
    const chapter = makeCostItem({ rowType: 'chapter', code: '01', description: 'H' });
    const items: CostItem[] = [chapter];
    for (const qty of [3, 5]) {
      items.push(makeCostItem({
        rowType: 'begrotingspost', parentId: chapter.id, code: 'P', description: 'Zelfde post', unit: 'st',
        quantity: qty, normUnitPrice: 10,
      }));
    }
    const { text, second } = roundtrip(items);
    expect(text.match(/~C\|P\|/g)).toHaveLength(1);
    expect(text).toContain('~M|01#\\P|1\\1\\|3||');
    expect(text).toContain('~M|01#\\P|1\\2\\|5||');
    expect(second.filter((i) => i.code === 'P').map((i) => i.quantity)).toEqual([3, 5]);
    expect(getKostprijs(second)).toBeCloseTo(80, 2);
  });

  it('exporteert de projectomschrijving als ~T op de wortel', () => {
    const { text, back } = roundtrip(budget(1, [{ normQuantity: 1, normUnitPrice: 1 }]), { description: 'Omschrijving van het werk' });
    expect(text).toContain('~T|OCS##|Omschrijving van het werk|');
    expect(back.schedule.description).toBe('Omschrijving van het werk');
    expect(back.schedule.projectName).toBe('Testproject');
  });

  it('houdt de eenheidsprijs van een post zonder hoeveelheid', () => {
    // Voorheen: prijs = totaal ÷ hoeveelheid = 0 ÷ 0 → 0.
    const { text, second } = roundtrip(budget(0, [], { normUnitPrice: 12.5 }));
    expect(text).toContain('~C|P1|m²|Post|12.5||0|');
    expect(second.find((i) => i.code === 'P1')!.unitPrice).toBeCloseTo(12.5, 2);
  });

  it('schrijft een regel met directe prijs (zonder norm) als rendement 1 met prijs + loon', () => {
    // Direct-model van de calculator: bedrag = aantal × (prijs + loon).
    const { text, first, second } = roundtrip(budget(4, [{ normQuantity: null, normUnitPrice: 5, laborPrice: 3, unit: 'st', resourceType: 'materiaal' }]));
    expect(text).toContain('~C|R1|st|Regel 1|8||3|');
    expect(text).toContain('~D|P1|R1\\1\\1\\|');
    expect(getKostprijs(first)).toBeCloseTo(32, 2);
    expect(getKostprijs(second)).toBeCloseTo(32, 2);
  });

  it('neemt een bewakingspost onder een post mee in de decompositie', () => {
    const chapter = makeCostItem({ rowType: 'chapter', code: '01', description: 'H' });
    const post = makeCostItem({ rowType: 'begrotingspost', parentId: chapter.id, code: 'P1', description: 'Post', unit: 'm²', quantity: 2 });
    const bp = makeCostItem({ rowType: 'bewakingspost', parentId: post.id, code: 'B1', description: 'Bewaking', unit: 'st', quantity: 1 });
    const regel = makeCostItem({
      rowType: 'regel', parentId: bp.id, code: 'R1', description: 'Regel', unit: 'uur',
      quantity: 2, normQuantity: 1, normFactor: 1, normUnitPrice: 10, resourceType: 'arbeid',
    });
    const { text, first, second } = roundtrip([chapter, post, bp, regel]);
    expect(getKostprijs(first)).toBeCloseTo(20, 2);
    expect(text).toContain('~D|P1|B1\\1\\1\\|');
    expect(text).toContain('~C|B1|st|Bewaking|10||0|');
    expect(getKostprijs(second)).toBeCloseTo(20, 2);
  });

  it('schrijft een opslagregel als %-concept met de fractie in ~D en prijs 0', () => {
    const src = [
      '~V||FIEBDC-3/2004|X||ANSI|',
      '~C|PR##||Obra|10.60||0|',
      '~C|CAP#||Capítulo|10.60||0|',
      '~C|0001|m2|Partida|10.60||0|',
      '~C|MO|h|Peón|10||1|',
      '~C|CI|%|Costes indirectos|6||0|',
      '~D|PR##|CAP#\\1\\1\\|',
      '~D|CAP#|0001\\1\\1\\|',
      '~D|0001|MO\\1\\1\\CI\\1\\0.06\\|',
      '~M|CAP#\\0001|1\\1\\|1|',
    ].join('\r\n');
    const first = recalculateItems(importBc3(src).items);
    expect(getKostprijs(first)).toBeCloseTo(10.6, 2);
    const text = buildBc3(schedule(), first);
    expect(text).toContain('~C|CI|%|Costes indirectos|0||0|');
    expect(text).toContain('MO\\1\\1\\CI\\1\\0.06\\|');
    const second = recalculateItems(importBc3(text).items);
    expect(getKostprijs(second)).toBeCloseTo(10.6, 2);
    expect(second.find((i) => i.code === 'CI')!.resourceType).toBe('overig');
  });

  it('valt terug op UTF-8 als de tekst niet in Windows-1252 past', () => {
    const ok = buildBc3Bytes(schedule(), recalculateItems(budget(1, [{ normQuantity: 1, normUnitPrice: 1, description: 'Peón, 12 € — “ok”' }])));
    expect(ok.charset).toBe('ANSI');
    const { bytes, charset } = buildBc3Bytes(schedule(), recalculateItems(budget(1, [{ normQuantity: 1, normUnitPrice: 1, description: 'Płyta ≤ 5 mm' }])));
    expect(charset).toBe('UTF-8');
    const back = importBc3File(bytes.buffer as ArrayBuffer);
    expect(decodeBc3(bytes.buffer as ArrayBuffer)).toContain('~V||FIEBDC-3/2004|Open Calc Studio||UTF-8|');
    expect(back.items.some((i) => i.description === 'Płyta ≤ 5 mm')).toBe(true);
  });

  it('houdt spaties in codes en verwijdert alleen #', () => {
    const { text, second } = roundtrip(budget(1, [{ normQuantity: 1, normUnitPrice: 1 }], { code: 'AJUSTE PPTO#' }));
    expect(text).toContain('~C|AJUSTE PPTO|');
    expect(second.find((i) => i.rowType === 'begrotingspost')!.code).toBe('AJUSTE PPTO');
  });
});

describe('Windows-1252 zonder TextDecoder', () => {
  it('codeert en decodeert €, aanhalingstekens en gedachtestreepjes symmetrisch', () => {
    const s = 'Precio: 12 € — “entre comillas” … ñ Ç';
    expect(fitsWindows1252(s)).toBe(true);
    const bytes = encodeWindows1252(s);
    expect(Array.from(bytes.subarray(11, 14))).toEqual([0x80, 0x20, 0x97]);
    expect(decodeWindows1252(bytes)).toBe(s);
  });

  it('vervangt tekens buiten Windows-1252 door ?', () => {
    expect(fitsWindows1252('Płyta')).toBe(false);
    expect(decodeWindows1252(encodeWindows1252('Płyta'))).toBe('P?yta');
  });
});
