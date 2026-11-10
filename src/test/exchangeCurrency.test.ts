import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { importBc3 } from '@/services/importers/bc3Importer';
import { buildBc3 } from '@/services/export/bc3Exporter';
import { importGaeb } from '@/services/importers/gaebImporter';
import { generateIfcCostFile } from '@/services/ifc/ifcCostGenerator';
import { parseIfcCostFile } from '@/services/ifc/ifcCostParser';
import { buildInschrijfstaatRows } from '@/services/export/inschrijfstaatExporter';
import { importInschrijfstaatFile } from '@/services/importers/inschrijfstaatImporter';
import { exportCuf, exportRsx, exportTradxml } from '@/services/exporters';
import { makeCostItem } from '@/services/importers/core';
import { recalculateItems } from '@/services/calculation/calculator';
import { createDefaultSchedule } from '@/data/defaultBudget';
import type { CostSchedule } from '@/types/costModel';

/**
 * Valuta per begroting (#65) in de uitwisselformaten: een formaat met een
 * valutaveld leest en schrijft hem; een formaat zonder valutaveld meldt het
 * bij een andere valuta dan EUR. Bedragen worden nooit omgerekend.
 */

function sample() {
  const chapter = makeCostItem({ parentId: null, sortOrder: 0, depth: 0, rowType: 'chapter', code: '01', description: 'Grondwerk' });
  const post = makeCostItem({ parentId: chapter.id, sortOrder: 1, depth: 1, rowType: 'begrotingspost', code: '01.01', description: 'Ontgraven', unit: 'm³', quantity: 10, materialPrice: 12.5 });
  const lump = makeCostItem({ parentId: chapter.id, sortOrder: 2, depth: 1, rowType: 'begrotingspost', code: '01.02', description: 'Stelpost', unit: 'post', quantity: 1, materialPrice: 500 });
  return recalculateItems([chapter, post, lump]);
}

function schedule(currency: string): CostSchedule {
  return { ...createDefaultSchedule(), name: 'Valuta', projectName: 'Valuta', currency };
}

describe('BC3 (~K DIVISA)', () => {
  it('reads the currency from the ~K record', () => {
    const text = [
      '~V||FIEBDC-3/2004|Test||ANSI|',
      '~K|\\2\\2\\3\\2\\2\\2\\2\\USD\\|0\\0\\0\\0\\0|',
      '~C|ROOT##||Project|0||0|',
      '~D|ROOT##|P1\\1\\2\\|',
      '~C|P1|m2|Item|10||0|',
    ].join('\r\n');
    expect(importBc3(text).schedule.currency).toBe('USD');
  });

  it('leaves the currency unset without ~K', () => {
    const text = ['~V||FIEBDC-3/2004|Test||ANSI|', '~C|ROOT##||Project|0||0|', '~D|ROOT##|P1\\1\\2\\|', '~C|P1|m2|Item|10||0|'].join('\r\n');
    expect(importBc3(text).schedule.currency).toBeUndefined();
  });

  it('writes ~K only for a non-euro estimate and reads it back, amounts unchanged', () => {
    expect(buildBc3(schedule('EUR'), sample(), 'ANSI')).not.toContain('~K|');
    const text = buildBc3(schedule('GBP'), sample(), 'ANSI');
    expect(text).toContain('~K|2\\2\\2\\3\\2\\2\\2\\2\\GBP\\|');
    const back = importBc3(text);
    expect(back.schedule.currency).toBe('GBP');
    const total = recalculateItems(back.items).filter((i) => i.parentId === null).reduce((s, i) => s + i.total, 0);
    expect(total).toBeCloseTo(10 * 12.5 + 500, 6);
  });
});

describe('GAEB (<Cur>)', () => {
  const gaeb = (cur: string) => `<?xml version="1.0" encoding="UTF-8"?>
<GAEB xmlns="http://www.gaeb.de/GAEB_DA_XML/DA83/3.3">
  <PrjInfo><NamePrj>P</NamePrj><Cur>${cur}</Cur></PrjInfo>
  <Award><DP>83</DP><BoQ><BoQBody><Itemlist><Item RNoPart="0010"><Qty>1</Qty><QU>m3</QU>
    <Description><CompleteText><OutlineText><OutlTxt><TextOutlTxt><p>X</p></TextOutlTxt></OutlTxt></OutlineText></CompleteText></Description>
  </Item></Itemlist></BoQBody></BoQ></Award>
</GAEB>`;
  it('takes a valid code and falls back to EUR otherwise', () => {
    expect(importGaeb(gaeb('chf')).schedule.currency).toBe('CHF');
    expect(importGaeb(gaeb('DM')).schedule.currency).toBe('EUR');
  });
});

describe('IFC (IfcMonetaryUnit)', () => {
  it('writes and reads the estimate currency', () => {
    const ifc = generateIfcCostFile(schedule('USD'), sample());
    expect(ifc).toContain("IFCMONETARYUNIT('USD')");
    expect(parseIfcCostFile(ifc).schedule.currency).toBe('USD');
  });

  it('reads the IFC2x3 enum form and keeps EUR for garbage', () => {
    const wrap = (unit: string) => `ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\n#1=${unit};\n#2=IFCCOSTSCHEDULE('g',$,'S','',$,$,$,$,$,.ESTIMATE.,.DRAFT.,0.);\nENDSEC;\nEND-ISO-10303-21;`;
    expect(parseIfcCostFile(wrap('IFCMONETARYUNIT(.JPY.)')).schedule.currency).toBe('JPY');
    expect(parseIfcCostFile(wrap("IFCMONETARYUNIT('euro')")).schedule.currency).toBe('EUR');
  });
});

describe('Inschrijfstaat (currency as lump-sum unit)', () => {
  it('writes the currency as unit of a lump-sum item and reads it back', async () => {
    const rows = buildInschrijfstaatRows(schedule('CHF'), sample());
    const lumpRow = rows.find((r) => r[2] === '01.02');
    expect(lumpRow?.[5]).toBe('CHF');

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Bijlage');
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
    const back = await importInschrijfstaatFile(buf);
    expect(back.schedule.currency).toBe('CHF');
    const lump = back.items.find((i) => i.code === '01.02');
    expect(lump?.unit).toBe('post');
    expect(lump?.total).toBe(500);
  });

  it('keeps EUR for a euro estimate', async () => {
    const rows = buildInschrijfstaatRows(schedule('EUR'), sample());
    expect(rows.find((r) => r[2] === '01.02')?.[5]).toBe('EUR');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Bijlage');
    const back = await importInschrijfstaatFile(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer);
    expect(back.schedule.currency).toBe('EUR');
  });
});

describe('CUF, TradXML and RSX (no currency field)', () => {
  it.each([
    ['CUF-XML', exportCuf],
    ['TRADXML', exportTradxml],
    ['RSX', exportRsx],
  ] as const)('%s warns for a non-euro estimate and writes the amounts unchanged', (format, exporter) => {
    const usd = exporter({ schedule: schedule('USD'), items: sample() });
    expect(usd.warnings.filter((w) => w.includes(format) && w.includes('USD'))).toHaveLength(1);
    expect(usd.xml).toContain('12,50');
    expect(exporter({ schedule: schedule('EUR'), items: sample() }).warnings).toEqual([]);
  });
});
