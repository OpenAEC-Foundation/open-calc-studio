import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { importBc3, importBc3File } from '@/services/importers/bc3Importer';
import { buildBc3 } from '@/services/export/bc3Exporter';
import { recalculateItems } from '@/services/calculation/calculator';
import type { ImportResult } from '@/services/importers/types';
import type { CostItem, CostSchedule } from '@/types/costModel';

/**
 * Indirecte kosten (CI, ~K veld 2) uit een BC3 (vervolg op #83). CYPE telt
 * ze bij de prijs van elke partida op — ook een partida zonder samenstelling,
 * niet bij een hoofdstuk — en rekent daarna aantal × prijs. De import maakt
 * daar een zichtbare %-regel "Costes indirectos" van.
 */

const schedule = (r: ImportResult): CostSchedule => ({
  id: 'ci', name: '', description: '', status: 'DRAFT', predefinedType: 'BUDGET',
  projectName: '', projectNumber: '', client: '', clientAddress: '', clientPostcode: '', clientCity: '',
  location: '', date: '', author: '', checker: '', version: '1', currency: 'EUR',
  ...r.schedule,
} as CostSchedule);

const calc = (r: ImportResult): CostItem[] => recalculateItems(r.items, undefined, r.schedule.priceRounding);
const roots = (items: CostItem[]): CostItem[] => items.filter((i) => i.parentId == null);
const total = (items: CostItem[]): number => Math.round(roots(items).reduce((s, i) => s + i.total, 0) * 100) / 100;
const ciRows = (items: CostItem[]): CostItem[] => items.filter((i) => i.code === '%CI');
const toArrayBuffer = (buf: Buffer): ArrayBuffer =>
  buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;

// Eén hoofdstuk met een partida met samenstelling (3 % medios auxiliares, zoals
// CYPE) en een kale partida. Directe kosten 2,53 → met 2 % CI 2,58;
// kale partida 15,69 → 16,00.
const fixture = (k: string, extra = ''): string => String.raw`~V|SOFT|FIEBDC-3/2016|Prueba||ANSI|
${k}
~C|OBRA##||Obra|0||0|
~C|CAP#||Capitulo|0||0|
~D|OBRA##|CAP#\1\1\|
~C|EXC|m3|Excavacion|2.53||0|
~C|MAQ|h|Retro|33||2|
~C|PEON|h|Peon|18||1|
~C|CAM|h|Camion|31||2|
~C|%003|%|3 % Medios auxiliares|0||%|
~D|EXC|MAQ\1\0.03\PEON\1\0.03\CAM\1\0.03\%003\1\0.03\|
~C|TIERRA|m3|Tierra vegetal|15.69||0|
~D|CAP#|EXC\1\5210\TIERRA\1\106.599\|
${extra}`;

const WITH_CI = String.raw`~K|-9\2\3\3\2\2\2\2\EUR\|2\13\6\\21|\2\\\3\\2\2\2\-9\2\3\EUR\||`;
const WITHOUT_CI = String.raw`~K|-9\2\3\3\2\2\2\2\EUR\|0\13\6\\21|\2\\\3\\2\2\2\-9\2\3\EUR\||`;

describe('BC3: indirecte kosten (CI) uit ~K', () => {
  it('voegt onder elke partida een regel "Costes indirectos" toe en rekent zoals CYPE', () => {
    const r = importBc3(fixture(WITH_CI));
    const items = calc(r);
    const exc = items.find((i) => i.code === 'EXC' && i.rowType === 'begrotingspost')!;
    const tierra = items.find((i) => i.code === 'TIERRA' && i.rowType === 'begrotingspost')!;
    expect(exc.unitPrice).toBeCloseTo(2.58, 6);
    expect(exc.total).toBeCloseTo(5210 * 2.58, 6);
    expect(tierra.unitPrice).toBeCloseTo(16.0, 6);
    expect(tierra.total).toBeCloseTo(1705.58, 6);
    const ci = ciRows(items);
    expect(ci).toHaveLength(2);
    expect(ci.every((c) => c.unit === '%' && c.normQuantity === 0.02)).toBe(true);
    expect(ci.map((c) => c.parentId).sort()).toEqual([exc.id, tierra.id].sort());
    // De CI-regel staat onderaan de post.
    const excKids = items.filter((i) => i.parentId === exc.id);
    expect(excKids[excKids.length - 1].code).toBe('%CI');
    expect(r.warningCodes?.find((w) => w.code === 'indirectCosts')?.params).toEqual({ percent: '2', n: 2 });
    // Prijzen op ~C zijn zonder CI: geen prijsmelding.
    expect(r.warningCodes?.some((w) => w.code === 'priceMismatch')).toBe(false);
  });

  it('laat een bestand zonder CI ongemoeid', () => {
    for (const k of [WITHOUT_CI, '']) {
      const r = importBc3(fixture(k));
      const items = calc(r);
      expect(ciRows(items)).toHaveLength(0);
      expect(items.find((i) => i.code === 'EXC' && i.rowType === 'begrotingspost')!.unitPrice).toBeCloseTo(2.53, 6);
      const tierra = items.find((i) => i.code === 'TIERRA' && i.rowType === 'begrotingspost')!;
      expect(tierra.normUnitPrice).toBe(15.69);
      expect(items.filter((i) => i.parentId === tierra.id)).toHaveLength(0);
      expect(r.warningCodes?.some((w) => w.code === 'indirectCosts')).toBe(false);
    }
  });

  it('telt niet dubbel als de samenstelling zelf al een regel voor indirecte kosten heeft', () => {
    const text = fixture(WITH_CI)
      .replace(String.raw`%003\1\0.03\|`, String.raw`%003\1\0.03\%CIX\1\0.02\|`)
      .replace('~C|TIERRA', '~C|%CIX|%|Costes indirectos|0||%|\n~C|TIERRA');
    const items = calc(importBc3(text));
    const exc = items.find((i) => i.code === 'EXC' && i.rowType === 'begrotingspost')!;
    expect(items.filter((i) => i.parentId === exc.id && i.code === '%CI')).toHaveLength(0);
    expect(exc.unitPrice).toBeCloseTo(2.58, 6);
  });

  it('export en herimport geven hetzelfde totaal, zonder tweede CI-regel', () => {
    const A = importBc3(fixture(WITH_CI));
    const itemsA = calc(A);
    const text = buildBc3(schedule(A), itemsA, 'ANSI');
    const B = importBc3(text);
    const itemsB = calc(B);
    expect(total(itemsB)).toBe(total(itemsA));
    // De CI-regel komt terug als gewone %-regel; ~K van de export heeft geen CI.
    expect(ciRows(itemsB)).toHaveLength(2);
    expect(B.warningCodes?.some((w) => w.code === 'indirectCosts')).toBe(false);
  });

  it('opslagregels bewegen mee als een prijs in de post verandert', () => {
    const r = importBc3(fixture(WITH_CI));
    const items = calc(r);
    const exc = items.find((i) => i.code === 'EXC' && i.rowType === 'begrotingspost')!;
    const kids = items.filter((i) => i.parentId === exc.id);
    expect(kids.filter((k) => k.percentageBase).map((k) => `${k.code}:${k.percentageBase}`)).toEqual(['%003:running', '%CI:subtotal']);
    // Peon 18 → 28 per uur: regels 0,99 + 0,84 + 0,93 = 2,76; 3 % = 0,08 → 2,84;
    // 2 % CI = 0,06 → 2,90.
    const edited = items.map((i) => (i.code === 'PEON' && i.parentId === exc.id ? { ...i, normUnitPrice: 28 } : i));
    const after = recalculateItems(edited, undefined, r.schedule.priceRounding);
    const exc2 = after.find((i) => i.id === exc.id)!;
    const kids2 = after.filter((i) => i.parentId === exc.id);
    expect(kids2.find((k) => k.code === '%003')!.normUnitPrice).toBeCloseTo(2.76, 9);
    expect(kids2.find((k) => k.code === '%CI')!.normUnitPrice).toBeCloseTo(2.84, 9);
    expect(exc2.unitPrice).toBeCloseTo(2.9, 9);
    expect(exc2.total).toBeCloseTo(5210 * 2.9, 6);
    // Export van de gewijzigde begroting: herimport geeft dezelfde prijs.
    const B = importBc3(buildBc3(schedule(r), after, 'ANSI'));
    const excB = calc(B).find((i) => i.code === 'EXC' && i.rowType === 'begrotingspost')!;
    expect(excB.unitPrice).toBeCloseTo(2.9, 9);
  });

  it('opslagregel blijft het percentage van de voorgaande bedragen als het aantal van de post wijzigt', () => {
    // De regels schalen niet mee met het aantal van de post; de opslag moet
    // dan het percentage over de regelbedragen blijven (review 1f79c52).
    const r = importBc3(fixture(WITH_CI));
    const exc = r.items.find((i) => i.code === 'EXC' && i.rowType === 'begrotingspost')!;
    for (const postQty of [10420, 2605]) {
      const items = recalculateItems(r.items.map((i) => (i.id === exc.id ? { ...i, quantity: postQty } : i)));
      const kids = items.filter((i) => i.parentId === exc.id);
      const direct = kids.filter((k) => !k.percentageBase).reduce((s, k) => s + k.total, 0);
      const aux = kids.find((k) => k.code === '%003')!;
      expect(aux.total / direct, `aantal ${postQty}`).toBeCloseTo(0.03, 9);
    }
    // Met afronding: de grondslag per eenheid van de post is de som van de
    // per eenheid afgeronde regels: 0,495 → 0,50 + 0,27 + 0,465 → 0,47 = 1,24
    // (niet 2,46, de grondslag bij het oude aantal).
    const items = recalculateItems(
      r.items.map((i) => (i.id === exc.id ? { ...i, quantity: 10420 } : i)), undefined, r.schedule.priceRounding,
    );
    const aux = items.find((i) => i.parentId === exc.id && i.code === '%003')!;
    expect(aux.normUnitPrice! * aux.quantity! / 10420).toBeCloseTo(1.24, 9);
  });

  it('opslagregel zonder afrondingsregel: percentage over de som van de voorgaande regels', () => {
    const r = importBc3(fixture(WITH_CI));
    const exc = r.items.find((i) => i.code === 'EXC' && i.rowType === 'begrotingspost')!;
    const items = recalculateItems(
      r.items.map((i) => (i.code === 'MAQ' && i.parentId === exc.id ? { ...i, normUnitPrice: 40 } : i)),
    );
    const kids = items.filter((i) => i.parentId === exc.id);
    const direct = kids.filter((k) => !k.percentageBase).reduce((s, k) => s + k.total, 0);
    const aux = kids.find((k) => k.code === '%003')!;
    const ci = kids.find((k) => k.code === '%CI')!;
    expect(aux.total).toBeCloseTo(direct * 0.03, 9);
    expect(ci.total).toBeCloseTo((direct + aux.total) * 0.02, 9);
  });

  it('CI over de directe kosten afgerond als eenheidsprijs, ook als regels fijner afronden', () => {
    // DI 3, DP/DC 2: regel 2,5349 → 2,535; directe kosten 2,54; CI 2 % → 2,59.
    const text = String.raw`~V|SOFT|FIEBDC-3/2016|Prueba||ANSI|
~K|-9\2\3\3\3\2\2\2\EUR\|2|
~C|OBRA##||Obra|0||0|
~C|CAP#||Capitulo|0||0|
~D|OBRA##|CAP#\1\1\|
~C|P1|m3|Partida|2.54||0|
~C|MAQ|h|Retro|2.5349||2|
~D|P1|MAQ\1\1\|
~D|CAP#|P1\1\100\|
`;
    const r = importBc3(text);
    expect(r.schedule.priceRounding).toEqual({ line: 3, unitPrice: 2, total: 2 });
    const items = calc(r);
    const p1 = items.find((i) => i.code === 'P1')!;
    expect(items.find((i) => i.code === '%CI')!.normUnitPrice).toBe(2.54);
    expect(p1.unitPrice).toBeCloseTo(2.59, 9);
    expect(p1.total).toBeCloseTo(259, 9);
  });

  it('export van een partida zonder samenstelling verwijst niet naar zichzelf en houdt zijn code', () => {
    const A = importBc3(fixture(WITH_CI));
    const itemsA = calc(A);
    const tierra = itemsA.find((i) => i.code === 'TIERRA')!;
    expect(itemsA.filter((i) => i.parentId === tierra.id).map((i) => i.code)).toEqual(['TIERRA.CD', '%CI']);
    const text = buildBc3(schedule(A), itemsA, 'ANSI');
    for (const d of text.split('\r\n').filter((l) => l.startsWith('~D|'))) {
      const [, parent, parts] = d.split('|');
      const kids = parts.split('\\').filter((_, i) => i % 3 === 0).filter(Boolean);
      expect(kids, d).not.toContain(parent);
    }
    const itemsB = calc(importBc3(text));
    const tierraB = itemsB.find((i) => i.code === 'TIERRA' && i.rowType === 'begrotingspost')!;
    expect(tierraB.unitPrice).toBeCloseTo(16, 9);
  });

  it('herkent een bestaande CI-regel ook aan de code %CI', () => {
    const text = fixture(WITH_CI)
      .replace(String.raw`%003\1\0.03\|`, String.raw`%003\1\0.03\%CI\1\0.02\|`)
      .replace('~C|TIERRA', '~C|%CI|%|CI|0||%|\n~C|TIERRA');
    const items = calc(importBc3(text));
    const exc = items.find((i) => i.code === 'EXC' && i.rowType === 'begrotingspost')!;
    expect(items.filter((i) => i.parentId === exc.id && i.code === '%CI')).toHaveLength(1);
    expect(exc.unitPrice).toBeCloseTo(2.58, 6);
  });

  it('een partida zonder prijs en samenstelling krijgt geen CI-regels', () => {
    const text = fixture(WITH_CI)
      .replace(String.raw`TIERRA\1\106.599\|`, String.raw`TIERRA\1\106.599\NOTA\1\1\|`)
      .replace('~C|TIERRA', '~C|NOTA||Nota sin precio|0||0|\n~C|TIERRA');
    const r = importBc3(text);
    const items = calc(r);
    const nota = items.find((i) => i.code === 'NOTA')!;
    expect(items.filter((i) => i.parentId === nota.id)).toHaveLength(0);
    expect(r.warningCodes?.find((w) => w.code === 'indirectCosts')?.params).toEqual({ percent: '2', n: 2 });
  });

  const BCCA = path.resolve(process.cwd(), 'verification', 'bc3', 'BCCA2023_V02.bc3');
  it.skipIf(!existsSync(BCCA))('BCCA 2023 (Presto, CI 13 %): prijzen gelijk aan de gepubliceerde prijslijst', () => {
    // "03.- LISTADO DE PRECIOS UNITARIOS" (Junta de Andalucía): suma de la
    // partida + costes indirectos 13 % = total partida.
    const items = calc(importBc3File(toArrayBuffer(readFileSync(BCCA))));
    const price = (code: string): number | undefined =>
      items.find((i) => i.rowType === 'begrotingspost' && i.code === code)?.unitPrice;
    expect(price('04CAS00001')).toBeCloseTo(430.06, 9);
    expect(price('04CAS00002')).toBeCloseTo(608.32, 9);
    expect(price('04CCP00001')).toBeCloseTo(37.8, 9);
  });

  const FILE = path.resolve(process.cwd(), 'verification', 'bc3', 'pycost_test_file_05.bc3');
  it.skipIf(!existsSync(FILE))('CYPE Arquímedes (CI 2 %): totaal en hoofdstukken gelijk aan het bestand', () => {
    const r = importBc3File(toArrayBuffer(readFileSync(FILE)));
    const items = calc(r);
    expect(total(items)).toBe(697444.6);
    expect(r.warningCodes?.some((w) => w.code === 'totalMismatch')).toBe(false);
    const byCode = (code: string): CostItem => items.find((i) => i.rowType === 'chapter' && i.code === code)!;
    expect(byCode('CAP1.1').total).toBeCloseTo(38433.52, 6);
    expect(byCode('CAP1.7').total).toBeCloseTo(34462.08, 6);
    expect(byCode('CAPITULO2').total).toBeCloseTo(18720, 6);
  });
});
