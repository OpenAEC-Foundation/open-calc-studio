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
  it('schrijft getallen zonder drijvende-kommaruis en zonder overbodige nullen', () => {
    // Een opgetelde kostprijs als 434687.42649000004 hoort als 434687.42649
    // in het bestand (6 decimalen zodra die het getal reproduceren). Echte
    // bestanden hebben rendementen met 4–15 decimalen; afronden op 3 (of
    // altijd op 6) verschuift totalen in de miljoenen met centen tot
    // tientallen euro's, dus een getal dat echt meer decimalen heeft houdt ze.
    const { text, first, second } = roundtrip(budget(12.3456, [
      { normQuantity: 0.0025, normUnitPrice: 14000 },
      { normQuantity: 0.02999999932945, normUnitPrice: 1234.5678 },
      { normQuantity: 0.119760479041916, normUnitPrice: 874523 },
      { normQuantity: 1, normUnitPrice: 434687.42649000004 },
      { normQuantity: 2.5, normUnitPrice: 100 },
    ]));
    expect(text).toContain('\\1\\0.0025\\');
    expect(text).toContain('\\1\\0.02999999932945\\');
    expect(text).toContain('\\1\\0.119760479041916\\');
    expect(text).toContain('|434687.42649||');
    expect(text).toContain('\\1\\2.5\\');
    expect(text).toContain('|100||');
    expect(text).toContain('|12.3456||');
    // Nergens een 16e/17e ruisdigit (kostprijs van post en hoofdstuk).
    expect(text).not.toMatch(/\d\.\d{16,}/);
    expect(text).not.toMatch(/\d{7,}\.\d{10,}/);
    expect(getKostprijs(second)).toBeCloseTo(getKostprijs(first), 6);
    expect(second.map((i) => i.total.toFixed(2))).toEqual(first.map((i) => i.total.toFixed(2)));
  });

  it('schrijft geen exponentnotatie voor heel kleine of heel grote getallen', () => {
    const { text } = roundtrip(budget(1, [
      { normQuantity: 0.0000009, normUnitPrice: 10 },
      { normQuantity: 1, normUnitPrice: 1234567890123.5 },
    ]));
    expect(text).not.toMatch(/\d[eE][+-]?\d/);
    expect(text).toContain('\\1\\0.0000009\\');
    expect(text).toContain('|1234567890123.5||');
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

  it('schrijft een hulpprijs die als post én als middel voorkomt als één concept met de middelprijs', () => {
    // BCCA/Arquímedes: DEXZANJAT staat als partida met samenstelling
    // (3,054465) in het ene hoofdstuk en als middel met de op 2 decimalen
    // afgeronde catalogusprijs 3,06 in andere partida's. Dat is één concept;
    // een `_1`-suffix zou de code veranderen zonder dat er iets anders is.
    const src = [
      '~V||FIEBDC-3/2004|ARQUIMEDES||ANSI|',
      '~C|OBRA##||Obra|0||0|',
      '~C|CAP1.2#||Drenaje|0||0|',
      '~C|CAP1.4#||Alumbrado|0||0|',
      '~C|DEXZANJAT|M3|Excavación en zanja|3.06||0|',
      '~C|PEON|H|Peón Ordinario|12.7||1|',
      '~C|URETR0101|H.|Retroexcavadora|26.48||2|',
      '~C|CIMENTA01|Ud.|Cimentación de farola|90.06||0|',
      '~D|OBRA##|CAP1.2\\1\\1\\CAP1.4\\1\\1\\|',
      '~D|CAP1.2#|DEXZANJAT\\\\209.85\\|',
      '~D|CAP1.4#|CIMENTA01\\\\18\\|',
      '~D|DEXZANJAT|PEON\\\\0.025\\URETR0101\\\\0.1\\|',
      '~D|CIMENTA01|PEON\\\\1.3\\DEXZANJAT\\\\0.6\\|',
    ].join('\r\n');
    const first = recalculateItems(importBc3(src).items);
    const text = buildBc3(schedule(), first);
    expect(text.match(/~C\|DEXZANJAT\|/g)).toHaveLength(1);
    expect(text).toContain('~C|DEXZANJAT|m³|Excavación en zanja|3.06||');
    expect(text).toContain('~D|DEXZANJAT|PEON\\1\\0.025\\URETR0101\\1\\0.1\\|');
    expect(text).not.toContain('DEXZANJAT_1');
    const second = recalculateItems(importBc3(text).items);
    expect(second.map((i) => i.code)).toEqual(first.map((i) => i.code));
    expect(second.map((i) => i.total.toFixed(6))).toEqual(first.map((i) => i.total.toFixed(6)));
    // De post rekent bottom-up (0,025 × 12,70 + 0,1 × 26,48 = 2,9655), het middel met 3,06.
    expect(second.find((i) => i.rowType === 'begrotingspost' && i.code === 'DEXZANJAT')!.unitPrice).toBeCloseTo(2.9655, 6);
    expect(second.find((i) => i.rowType === 'regel' && i.code === 'DEXZANJAT')!.normUnitPrice).toBeCloseTo(3.06, 6);
  });

  it('laat een kale post zijn eigen prijs houden naast een middel met dezelfde code', () => {
    // Zelfde kop, andere prijs, géén samenstelling: bij herimport zou de post
    // anders de middelprijs krijgen. Dan liever een suffix.
    const chapter = makeCostItem({ rowType: 'chapter', code: '01', description: 'H' });
    const bare = makeCostItem({ rowType: 'begrotingspost', parentId: chapter.id, code: 'A', description: 'Ding', unit: 'st', quantity: 2, normUnitPrice: 10 });
    const post = makeCostItem({ rowType: 'begrotingspost', parentId: chapter.id, code: 'P', description: 'Post', unit: 'st', quantity: 1 });
    const regel = makeCostItem({
      rowType: 'regel', parentId: post.id, code: 'A', description: 'Ding', unit: 'st',
      quantity: 1, normQuantity: 1, normFactor: 1, normUnitPrice: 12, resourceType: 'materiaal',
    });
    const { first, second } = roundtrip([chapter, bare, post, regel]);
    expect(getKostprijs(first)).toBeCloseTo(32, 2);
    expect(getKostprijs(second)).toBeCloseTo(32, 2);
    expect(second.find((i) => i.rowType === 'begrotingspost' && i.code === 'A')!.unitPrice).toBeCloseTo(10, 2);
  });

  it('houdt een opslag over alleen de arbeid (TCQ A%) na de rondreis', () => {
    const src = [
      '~V||FIEBDC-3/98|TCQ 2.1||ANSI|',
      '~C|01##||Obra|||',
      '~C|C1\\||Capítulo|||',
      '~C|EE1\\|ML|Demolición|6607||0|',
      '~C|A1|H|Oficial|1418||1|',
      '~C|B1|M3|Arena|350||3|',
      '~C|A%NAAC||Despeses auxiliars|1||3|',
      '~D|01##|C1\\\\\\|',
      '~D|C1|EE1\\1\\2\\|',
      '~D|EE1|A1\\1\\1\\B1\\1\\1\\A%NAAC\\1\\.04\\|',
      '~M|C1\\EE1|1\\1\\|2|',
    ].join('\r\n');
    const first = recalculateItems(importBc3(src).items);
    expect(getKostprijs(first)).toBeCloseTo(2 * (1418 + 350 + 0.04 * 1418), 2);
    const text = buildBc3(schedule(), first);
    expect(text).toContain('~C|A%NAAC|%|Despeses auxiliars|0||0|');
    expect(text).toContain('A1\\1\\1\\B1\\1\\1\\A%NAAC\\1\\0.04\\|');
    const second = recalculateItems(importBc3(text).items);
    expect(getKostprijs(second)).toBeCloseTo(getKostprijs(first), 6);
    expect(second.find((i) => i.code === 'A%NAAC')!.resourceType).toBe('overig');
  });

  it('houdt spaties in codes en verwijdert alleen #', () => {
    const { text, second } = roundtrip(budget(1, [{ normQuantity: 1, normUnitPrice: 1 }], { code: 'AJUSTE PPTO#' }));
    expect(text).toContain('~C|AJUSTE PPTO|');
    expect(second.find((i) => i.rowType === 'begrotingspost')!.code).toBe('AJUSTE PPTO');
  });
});

// #83: CYPE Arquímedes rondt elke regel en de eenheidsprijs af (~C 47,28,
// onafgerond 47,2665); de kapotte ~K geeft de standaard 2/2/2.
const CYPE_ROUNDING = String.raw`~V|CYPE INGENIEROS, S.A.|FIEBDC-3/2004|ARQUIMEDES||ANSI|Presupuesto|2|
~K|0\13\6\\21|
~C|TEST##||TEST ESTIMATE|4431.65|260113|0|
~D|TEST##|01#\\1\|
~C|01#||CHAPTER|4431.65|260113|0|
~D|01#|P01\\1\|
~C|P01|m2|ITEM WITH DECOMPOSITION|47.28|260113|0|
~D|P01|R01\\0.7\R02\\0.7\R03\\1.05\R04\\1.5\|
~C|R01|h|Oficial 1a|18.35|260113|1|
~C|R02|h|Peon ordinario|17.08|260113|1|
~C|R03|m2|Baldosa|21.21|260113|3|
~C|R04|kg|Cemento cola|0.13|260113|3|
~M|01#\P01|1\1\|93.732|`.replace(/\r?\n/g, '\r\n');

describe('FIEBDC-3 export met afronding (#83)', () => {
  /** Importeren, rekenen met de regel uit het bestand, exporteren en terug. */
  const viaRule = (src: string) => {
    const a = importBc3(src);
    const sched = schedule({ ...a.schedule, currency: 'EUR' });
    const first = recalculateItems(a.items, undefined, a.schedule.priceRounding);
    const text = buildBc3(sched, first);
    const b = importBc3(text);
    const second = recalculateItems(b.items, undefined, b.schedule.priceRounding);
    return { a, first, text, b, second };
  };

  it('schrijft de regel in ~K, de afgeronde eenheidsprijs in ~C en de kale normen in ~D', () => {
    const { text, first } = viaRule(CYPE_ROUNDING);
    // Op de grootste regel staat het restje van de post; het rendement in het
    // bestand moet toch de norm zijn (0,7), niet 0,70003.
    expect(first.find((i) => i.code === 'R03')!.total).not.toBeCloseTo(93.732 * 22.27, 9);
    expect(text).toContain(String.raw`~K|-9\-9\-9\-9\2\2\2\2\EUR\|`);
    expect(text).toContain('~C|P01|m²|ITEM WITH DECOMPOSITION|47.28||0|');
    expect(text).toContain(String.raw`~D|P01|R01\1\0.7\R02\1\0.7\R03\1\1.05\R04\1\1.5\|`);
    expect(text).toContain('|93.732||');
    expect(text).toContain('~C|OCS##||TEST ESTIMATE|4431.65||0|');
  });

  it('houdt regel, rendementen en totalen na de rondreis', () => {
    const { a, b, first, second } = viaRule(CYPE_ROUNDING);
    expect(b.schedule.priceRounding).toEqual(a.schedule.priceRounding);
    const post = second.find((i) => i.code === 'P01')!;
    expect(post.unitPrice).toBe(47.28);
    expect(post.total).toBe(4431.65);
    expect(post.quantity).toBe(93.732);
    expect(second.filter((i) => i.rowType === 'regel').map((i) => i.normQuantity)).toEqual([0.7, 0.7, 1.05, 1.5]);
    expect(second.filter((i) => i.rowType === 'regel').map((i) => i.total))
      .toEqual(first.filter((i) => i.rowType === 'regel').map((i) => i.total));
    expect(getKostprijs(second)).toBeCloseTo(4431.65, 9);
    expect(b.warningCodes?.some((c) => c.code === 'totalMismatch' || c.code === 'priceMismatch')).toBe(false);
  });

  it('schrijft andere decimalen en de valuta mee, en leest ze terug', () => {
    const a = importBc3(CYPE_ROUNDING);
    const rule = { line: 3, unitPrice: 2, total: 1 };
    const sched = schedule({ ...a.schedule, currency: 'GBP', priceRounding: rule });
    const text = buildBc3(sched, recalculateItems(a.items, undefined, rule));
    expect(text).toContain(String.raw`~K|-9\-9\-9\-9\3\2\2\1\GBP\|`);
    const b = importBc3(text);
    expect(b.schedule.priceRounding).toEqual(rule);
    expect(b.schedule.currency).toBe('GBP');
  });

  it('houdt een opslagregel over de afgeronde som na de rondreis', () => {
    const src = String.raw`~V||FIEBDC-3/2016|X||ANSI|
~C|R##||Obra|3390.29||0|
~C|C1#||Capítulo|3390.29||0|
~C|P1|m2|Partida|36.17||0|
~C|MO|h|Oficial|18.35||1|
~C|MAT|m2|Baldosa|21.21||3|
~C|%MA|%|Medios auxiliares|0||%|
~D|R##|C1#\1\1\|
~D|C1#|P1\1\1\|
~D|P1|MO\1\0.7\MAT\1\1.05\%MA\1\0.03\|
~M|C1#\P1|1\1\|93.732|`.replace(/\r?\n/g, '\r\n');
    const { text, first, second, b } = viaRule(src);
    expect(text).toContain('~C|P1|m²|Partida|36.17||0|');
    expect(text).toContain(String.raw`MO\1\0.7\MAT\1\1.05\%MA\1\0.03\|`);
    expect(b.items.find((i) => i.code === '%MA')!.normUnitPrice).toBe(35.12);
    expect(second.find((i) => i.code === 'P1')!.total).toBe(3390.29);
    expect(getKostprijs(second)).toBeCloseTo(getKostprijs(first), 9);
  });

  it('schrijft zonder regel geen ~K voor een begroting in euro', () => {
    const items = recalculateItems(importBc3(CYPE_ROUNDING).items);
    expect(buildBc3(schedule(), items)).not.toContain('~K|');
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
