// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { parseDbf, buildDncImport, type DbfRecord } from '@/services/importers/dncImporter';
import { recalculateItems } from '@/services/calculation/calculator';

// ── Synthetische DBF bytes (dBASE III): 2 velden, 2 records ────────────────
function makeDbf(): Uint8Array {
  const fields = [
    { name: 'CODE', type: 'C', len: 6 },
    { name: 'HOEV', type: 'C', len: 5 },
  ];
  const recordSize = 1 + fields.reduce((s, f) => s + f.len, 0); // 1 delete-flag
  const headerSize = 32 + fields.length * 32 + 1;
  const rows = [['ABC', '24'], ['DEF', '1074']];
  const buf = new Uint8Array(headerSize + rows.length * recordSize + 1);
  buf[0] = 0x03;
  const w32 = (o: number, v: number) => { buf[o] = v & 255; buf[o + 1] = (v >> 8) & 255; buf[o + 2] = (v >> 16) & 255; buf[o + 3] = (v >> 24) & 255; };
  const w16 = (o: number, v: number) => { buf[o] = v & 255; buf[o + 1] = (v >> 8) & 255; };
  w32(4, rows.length);
  w16(8, headerSize);
  w16(10, recordSize);
  let p = 32;
  for (const f of fields) {
    for (let i = 0; i < f.name.length; i++) buf[p + i] = f.name.charCodeAt(i);
    buf[p + 11] = f.type.charCodeAt(0);
    buf[p + 16] = f.len;
    p += 32;
  }
  buf[p++] = 0x0d; // terminator
  for (const row of rows) {
    buf[p++] = 0x20; // niet verwijderd
    for (let fi = 0; fi < fields.length; fi++) {
      const s = (row[fi] ?? '').padEnd(fields[fi].len, ' ');
      for (let i = 0; i < fields[fi].len; i++) buf[p + i] = s.charCodeAt(i);
      p += fields[fi].len;
    }
  }
  buf[p] = 0x1a; // EOF
  return buf;
}

describe('parseDbf', () => {
  it('leest velden en records uit een DBF', () => {
    const { fields, records } = parseDbf(makeDbf());
    expect(fields.map(f => f.name)).toEqual(['CODE', 'HOEV']);
    expect(records).toHaveLength(2);
    expect(records[0]).toEqual({ CODE: 'ABC', HOEV: '24' });
    expect(records[1]).toEqual({ CODE: 'DEF', HOEV: '1074' });
  });
});

// ── Mapping: post + middelen (arbeid/materiaal/onderaanneming) ─────────────
const VU: DbfRecord[] = [{ OMSCHRIJF: '0e uurtarief', WAARDE: '55.00' }];

// Binnendeur-post zoals in het referentievoorbeeld: 24 st, totaal 11.638
const binnendeurKK: DbfRecord = {
  CODE2: '30.33.11-a.01>a', TITEL: 'Stompe binnendeur stomp, HPL', HOEV1: '24', EENH: 'st',
  TOTAAL: '11638.00', TOT1: '2838.00', TOT2: '8400.00', TOT4: '400.00',
};
const binnendeurKU: DbfRecord[] = [
  { CODE2: '30.33.11-a.01>a', TITEL: 'Binnendeur, stomp', HOEV1: '24', EENH: 'st', GETAL1: '0', GETAL2: '270', GETAL3: '0', GETAL4: '0', CATCODE: 'Xi0.105.2110' },
  { CODE2: '30.33.11-a.01>a', TITEL: 'Afhangen stompe deur', HOEV1: '24', EENH: 'st', GETAL1: '2', GETAL2: '0', GETAL3: '0', GETAL4: '0', CATCODE: 'Xi0.105.0104' },
  { CODE2: '30.33.11-a.01>a', TITEL: 'Opperwerk deuren', HOEV1: '24', EENH: 'st', GETAL1: '0.15', GETAL2: '0', GETAL3: '0', GETAL4: '0', CATCODE: 'Xi0.105.0104' },
  { CODE2: '30.33.11-a.01>a', TITEL: 'Toeslag 1230 mm', HOEV1: '24', EENH: 'st', GETAL1: '0', GETAL2: '80', GETAL3: '0', GETAL4: '0', CATCODE: 'Xi0.105.0104' },
  { CODE2: '30.33.11-a.01>a', TITEL: 'Toeslag glasopening', HOEV1: '5', EENH: 'st', GETAL1: '0', GETAL2: '0', GETAL3: '0', GETAL4: '80', CATCODE: 'Xi0.105.0104' },
];

describe('buildDncImport', () => {
  it('bouwt hoofdstuk → post → middelen en rekent het posttotaal exact', () => {
    const { items } = buildDncImport({ KK: [binnendeurKK], KU: binnendeurKU, VU }, { projectName: 'Test' });
    const recalced = recalculateItems(items);

    const chapter = recalced.find(i => i.rowType === 'chapter');
    expect(chapter?.code).toBe('30');
    expect(chapter?.description).toBe('KOZIJNEN, RAMEN EN DEUREN');

    const post = recalced.find(i => i.rowType === 'begrotingspost' && i.code === '30.33.11-a.01>a');
    expect(post?.description).toBe('Stompe binnendeur stomp, HPL');
    // 24×270 + 24×2×55 + 24×0.15×55 + 24×80 + 5×80 = 11638
    expect(post!.total).toBeCloseTo(11638, 2);
    expect(chapter!.total).toBeCloseTo(11638, 2);

    // resourceType-toewijzing
    const regels = recalced.filter(i => i.rowType === 'regel');
    expect(regels.find(r => r.description === 'Binnendeur, stomp')?.resourceType).toBe('materiaal');
    expect(regels.find(r => r.description === 'Afhangen stompe deur')?.resourceType).toBe('arbeid');
    expect(regels.find(r => r.description === 'Toeslag glasopening')?.resourceType).toBe('onderaannemer');
  });

  it('valt terug op samenvattende regels als posten dezelfde code delen', () => {
    const a: DbfRecord = { CODE2: '23.42.11-a.01>a', TITEL: 'Kanaalplaatvloer', HOEV1: '1074', EENH: 'm2', TOTAAL: '74975.94', TOT1: '18311.70', TOT2: '56664.24', TOT4: '0' };
    const b: DbfRecord = { CODE2: '23.42.11-a.01>a', TITEL: 'Toeslag details', HOEV1: '1074', EENH: 'm2', TOTAAL: '2685.00', TOT1: '0', TOT2: '0', TOT4: '2685.00' };
    // middelen aanwezig op de gedeelde code → koppeling is ambigu → waarschuwing + samenvatting
    const ku: DbfRecord[] = [
      { CODE2: '23.42.11-a.01>a', TITEL: 'Kanaalplaatvloeren', HOEV1: '1074', EENH: 'm2', GETAL2: '48' },
    ];
    const { items, warnings } = buildDncImport({ KK: [a, b], KU: ku, VU }, { projectName: 'T' });
    const recalced = recalculateItems(items);
    const posts = recalced.filter(i => i.rowType === 'begrotingspost');
    expect(posts).toHaveLength(2);
    expect(posts[0].total).toBeCloseTo(74975.94, 1);
    expect(posts[1].total).toBeCloseTo(2685.0, 1);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('leest uurtarief en staartpercentages', () => {
    const VT: DbfRecord[] = [
      { OMSCHRIJF: 'Algemene Kosten', WAARDE: '7.00' },
      { OMSCHRIJF: 'Winst en risico', WAARDE: '4.00' },
    ];
    const { schedule } = buildDncImport({ KK: [binnendeurKK], KU: binnendeurKU, VU, VT }, { projectName: 'T' });
    expect(schedule.tarieven).toEqual({ A: 55 });
    expect(schedule.algemeneKosten).toBe(7);
    expect(schedule.winstRisico).toBe(4);
  });
});
