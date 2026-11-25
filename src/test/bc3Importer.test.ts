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
  it('bewaart een ~T-tekst die vóór zijn ~C-record staat (knownbug 75)', () => {
    const text = SAMPLE.replace('\r\n~T|PART1|Excavación mecánica en terreno compacto.|', '')
      .replace('~C|PROY##', '~T|PART1|Excavación mecánica en terreno compacto.|\r\n~C|PROY##');
    expect(text.indexOf('~T|PART1')).toBeLessThan(text.indexOf('~C|PART1'));
    const post = importBc3(text).items.find(i => i.code === 'PART1')!;
    expect(post.notes).toContain('terreno compacto');
  });

  it('een ~T zonder ~C wordt geen extra post in een prijzenboek (knownbug 75, review)', () => {
    const text = [
      '~V||FIEBDC-3/2004|TestSoft||ANSI|||||',
      '~C|MO001|h|Peón ordinario|15.50||1|',
      '~C|MAT01|m3|Arena de río|20.00||3|',
      '~T|GHOST|Tekst bij een code zonder ~C.|',
    ].join('\r\n');
    const posten = importBc3(text).items.filter(i => i.rowType === 'begrotingspost');
    expect(posten.map(p => p.code)).toEqual(['MO001', 'MAT01']);
  });

  it('een ~T op een aliascode vóór de ~C blokkeert de alias niet (knownbug 75, review)', () => {
    const text = [
      '~V||FIEBDC-3/2004|TestSoft||ANSI|||||',
      '~C|PROY##||Proyecto|20.00||0|',
      '~C|CAP01#||Capítulo|20.00||0|',
      '~T|ALIAS1|Tekst via de alias.|',
      '~C|PART1\\ALIAS1|m3|Excavación|10.00||0|',
      '~C|MO001|h|Peón ordinario|10.00||1|',
      '~D|PROY##|CAP01#\\1\\1\\|',
      '~D|CAP01#|ALIAS1\\1\\2\\|',
      '~D|PART1|MO001\\1\\1\\|',
    ].join('\r\n');
    const result = importBc3(text);
    const post = result.items.find(i => i.rowType === 'begrotingspost')!;
    expect(post.code).toBe('PART1');
    expect(post.description).toBe('Excavación');
    expect(post.notes).toContain('via de alias');
    expect(result.items.filter(i => i.rowType === 'regel').map(r => r.code)).toEqual(['MO001']);
  });

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

// #83: CYPE Arquímedes rondt elke regel (norm × prijs) en de eenheidsprijs af
// op centen. Het voorbeeld uit het issue: ~C 47,28, onafgerond 47,2665.
// Letterlijk uit het issue (rounding-final.bc3), incl. de kapotte ~K en de
// over regels verdeelde ~D-records.
const CYPE_ROUNDING = String.raw`~V|CYPE INGENIEROS, S.A.|FIEBDC-3/2004|ARQUIMEDES||ANSI|Presupuesto|2|
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

describe('FIEBDC-3 afronding (#83)', () => {
  it('rekent het voorbeeld uit het issue zoals het bestand: 47,28 en 4.431,65, zonder meldingen', () => {
    const res = importBc3(CYPE_ROUNDING);
    // De kapotte ~K (een verschoven coëfficiëntenblok) geeft de standaard.
    expect(res.schedule.priceRounding).toEqual({ line: 2, unitPrice: 2, total: 2 });
    const items = recalculateItems(res.items, undefined, res.schedule.priceRounding);
    const post = items.find((i) => i.code === 'P01')!;
    expect(post.unitPrice).toBe(47.28);
    expect(post.total).toBe(4431.65);
    expect(getKostprijs(items)).toBeCloseTo(4431.65, 9);
    // De hoeveelheid wordt nooit afgerond.
    expect(post.quantity).toBe(93.732);
    expect(res.warningCodes?.some((c) => ['roundingDiff', 'totalMismatch', 'priceMismatch'].includes(c.code))).toBe(false);
  });

  it('rondt 0,7 × 18,35 half-up af ondanks float-ruis (12,845 → 12,85)', () => {
    // Zonder de marge zou de afgeronde som 47,27 zijn; dan zou het totaal
    // 4.430,72 worden en niet meer op het bestand uitkomen.
    const res = importBc3(CYPE_ROUNDING);
    const items = recalculateItems(res.items, undefined, res.schedule.priceRounding);
    // Aantal × 12,85, plus zijn deel van het restje naar rato (± 0,0003);
    // met 12,84 zou het 0,94 lager uitkomen.
    expect(items.find((i) => i.code === 'R01')!.total).toBeCloseTo(93.732 * 12.85, 3);
  });

  it('meldt het totaal van het bestand als het niet uitkomt op wat de app toont', () => {
    const res = importBc3(CYPE_ROUNDING.replace(/\|4431\.65\|/g, '|4400.00|'));
    const code = res.warningCodes?.find((c) => c.code === 'totalMismatch');
    expect(code?.params).toEqual({ file: '4400.00', calculated: '4431.65', difference: '31.65' });
  });

  it('meldt een ~C-prijs die meer dan 2% van de afgeronde samenstelling afwijkt', () => {
    const res = importBc3(CYPE_ROUNDING.replace('|47.28|', '|50.00|'));
    const code = res.warningCodes?.find((c) => c.code === 'priceMismatch');
    expect(code?.params).toEqual({ count: 1, examples: 'P01 (~C 50.00, ~D 47.28)' });
  });

  it('valt zonder ~K terug op de FIEBDC-standaard (2/2/2)', () => {
    const res = importBc3(CYPE_ROUNDING.replace(/~K\|[^\r\n]*\r\n/, ''));
    expect(res.schedule.priceRounding).toEqual({ line: 2, unitPrice: 2, total: 2 });
  });

  it('leest de decimalen uit veld 3 (nieuw) vóór veld 1 (oud), per waarde', () => {
    const k = (rec: string) => importBc3(CYPE_ROUNDING.replace(String.raw`~K|0\13\6\\21|`, rec)).schedule.priceRounding;
    // Presto 22 (BCCA): beide groepen, gelijk.
    expect(k(String.raw`~K|\2\3\3\2\2\2\2\EUR\|13\0\0\0\21|3\2\\3\3\\2\2\2\2\2\3\2\2\EUR\|`))
      .toEqual({ line: 2, unitPrice: 2, total: 2 });
    // pyCost: veld 3 DC=2 (totaal), DUO=2, DI=4; veld 1 zegt DI=4 ook.
    expect(k(String.raw`~K|3\3\4\3\4\2\2\2\EUR\|0.0\6\13\0\0|3\2\\2\3\\2\4\5\3\3\4\4\3\EUR\|`))
      .toEqual({ line: 4, unitPrice: 2, total: 2 });
    // Veld 3 wint van veld 1 waar ze verschillen.
    expect(k(String.raw`~K|\2\3\3\2\2\2\2\EUR\|0|3\1\\3\3\\0\3\2\2\2\3\2\2\EUR\|`))
      .toEqual({ line: 3, unitPrice: 0, total: 1 });
    // Alleen veld 1: DI, min(DP, DC), DM.
    expect(k(String.raw`~K|\2\3\3\3\3\2\4\EUR\|0|`)).toEqual({ line: 3, unitPrice: 2, total: 4 });
    expect(k(String.raw`~K|-9\3\3\3\2\3\2\2\EUR\|0\13\6\\21|`)).toEqual({ line: 2, unitPrice: 2, total: 2 });
    // Leeg of onzin in veld 3 → veld 1 voor die waarde (CYPE 2004: DRC leeg).
    expect(k(String.raw`~K|\2\3\3\3\2\2\4\EUR\|0|\\\\\\\x\\\\\\EUR\|`)).toEqual({ line: 3, unitPrice: 2, total: 4 });
    // Negatief = "ten hoogste zoveel"; meer dan 6 is bij ons onafgerond (6).
    expect(k(String.raw`~K|\2\3\3\-3\-2\-2\-9\EUR\|0|`)).toEqual({ line: 3, unitPrice: 2, total: 6 });
    // Alles leeg (TCQ) of onzin → standaard.
    expect(k(String.raw`~K|\\\\\\\| 0|`)).toEqual({ line: 2, unitPrice: 2, total: 2 });
    expect(k(String.raw`~K|2\2\2\3\13\2.5\x\7\EUR\|`)).toEqual({ line: 2, unitPrice: 2, total: 2 });
  });

  it('rekent een opslagregel over de afgeronde som van de voorgaande regels', () => {
    // Regels: 0,7 × 18,35 = 12,845 → 12,85 en 1,05 × 21,21 = 22,2705 → 22,27;
    // afgerond 35,12, onafgerond 35,1155. 3% daarover: 1,0536 → 1,05 (over
    // de onafgeronde som zou het 1,053465 zijn). Eenheidsprijs 36,17.
    const src = String.raw`~V||FIEBDC-3/2016|X||ANSI|
~K|\2\3\3\2\2\2\2\EUR\|0|3\2\\3\3\\2\2\2\2\2\3\2\2\EUR\|
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
    const res = importBc3(src);
    const opslag = res.items.find((i) => i.code === '%MA')!;
    expect(opslag.normUnitPrice).toBe(35.12);
    const items = recalculateItems(res.items, undefined, res.schedule.priceRounding);
    const post = items.find((i) => i.code === 'P1')!;
    expect(post.unitPrice).toBe(36.17);
    expect(post.total).toBe(3390.29); // round2(93,732 × 36,17) = 3.390,286…
    expect(res.warningCodes?.some((c) => c.code === 'totalMismatch' || c.code === 'priceMismatch')).toBe(false);
  });
});
