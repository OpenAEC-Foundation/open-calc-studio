import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { importBasCalcFile } from '@/services/importers/bascalcImporter';
import { recalculateItems } from '@/services/calculation/calculator';

// Knownbug 87: een tweede cb-blok in een post kwam binnen het eerste te
// hangen (cp werd overgeslagen en alleen ih haalde niveaus van de stapel).
// Daardoor stond Materiaal onder Arbeid en werd Arbeid 300 i.p.v. 100.
type Row = (string | number | null)[];
function toXls(kp: Row[]): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['%_vrij_%']]), 'Menu');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(kp), 'Kostprijs');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

function makeXls(): ArrayBuffer {
  return toXls([
    ['%_bascalc_%kp'],
    ['ih', '0', '1', 'GRONDWERK', null, null, null, null, null, null, null, null, null, null],
    ['ih', '0', '110010', 'Ontgraven', null, null, null, null, 1, 'post', 'N', null, 300, 300],
    ['cb', '', null, 'Arbeid', null, null, null, null, null, null, null, null, null, 100],
    ['cn', '', '10001', 'Grondwerker', 2, null, '/', null, 2, 'uur', 'm', 50, 100, 100],
    ['cp', '', null, null, null, 'hv-post', null, 1, null, null, null, null, null, null],
    ['cb', '', null, 'Materiaal', null, null, null, null, null, null, null, null, null, 200],
    ['cn', '', '20001', 'Zand', 4, null, '/', null, 4, 'm3', 'h', 50, 200, 200],
    ['cp', '', null, null, null, 'hv-post', null, 1, null, null, null, null, null, null],
  ]);
}

describe('BasCalc: meerdere cb-blokken in één post (knownbug 87)', () => {
  const { items } = importBasCalcFile(makeXls());
  const recalced = recalculateItems(items, undefined);
  const post = recalced.find((i) => i.code === '110010')!;
  const arbeid = recalced.find((i) => i.rowType === 'bewakingspost' && i.description === 'Arbeid')!;
  const materiaal = recalced.find((i) => i.rowType === 'bewakingspost' && i.description === 'Materiaal')!;

  it('hangt beide blokken direct onder de post', () => {
    expect(arbeid.parentId).toBe(post.id);
    expect(materiaal.parentId).toBe(post.id);
    expect(materiaal.depth).toBe(arbeid.depth);
  });

  it('houdt de subbloktotalen apart', () => {
    expect(arbeid.total).toBeCloseTo(100, 6);
    expect(materiaal.total).toBeCloseTo(200, 6);
    expect(post.total).toBeCloseTo(300, 6);
  });

  it('zet de middelen onder hun eigen blok', () => {
    expect(recalced.find((i) => i.code === '10001')!.parentId).toBe(arbeid.id);
    expect(recalced.find((i) => i.code === '20001')!.parentId).toBe(materiaal.id);
  });
});

// Review-follow-up: een opmerking (cb met code 'opm') binnen een blok sluit
// dat blok niet; de cn-regel erna hoort nog bij Arbeid.
describe('BasCalc: opmerking binnen een cb-blok (knownbug 87)', () => {
  const { items } = importBasCalcFile(toXls([
    ['%_bascalc_%kp'],
    ['ih', '0', '1', 'GRONDWERK', null, null, null, null, null, null, null, null, null, null],
    ['ih', '0', '110010', 'Ontgraven', null, null, null, null, 1, 'post', 'N', null, 300, 300],
    ['cb', '', null, 'Arbeid', null, null, null, null, null, null, null, null, null, 300],
    ['cn', '', '10001', 'Grondwerker', 2, null, '/', null, 2, 'uur', 'm', 50, 100, 100],
    ['cb', '', 'opm', 'Let op: handwerk bij kabels', null, null, null, null, null, null, null, null, null, null],
    ['cn', '', '10002', 'Machinist', 4, null, '/', null, 4, 'uur', 'm', 50, 200, 200],
    ['cp', '', null, null, null, 'hv-post', null, 1, null, null, null, null, null, null],
  ]));
  const recalced = recalculateItems(items, undefined);
  const arbeid = recalced.find((i) => i.rowType === 'bewakingspost' && i.description === 'Arbeid')!;

  it('houdt de cn-regels na de opmerking onder het blok', () => {
    expect(recalced.find((i) => i.code === '10001')!.parentId).toBe(arbeid.id);
    expect(recalced.find((i) => i.code === '10002')!.parentId).toBe(arbeid.id);
    expect(recalced.find((i) => i.rowType === 'tekstregel')!.parentId).toBe(arbeid.id);
    expect(arbeid.total).toBeCloseTo(300, 6);
  });
});
