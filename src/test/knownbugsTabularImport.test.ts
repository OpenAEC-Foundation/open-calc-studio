import { afterEach, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { parseCsv, parseXlsxTabular, autoDetectMapping, decodeCsvText } from '@/services/importers/genericTabularImporter';
import { importBudgetTable } from '@/services/exchange/tabularBudget';

function xlsxBytes(rows: unknown[][]): Uint8Array {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Blad1');
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
}

describe('generieke CSV-import: aanhalingstekens (knownbug 60)', () => {
  it('houdt een " midden in een veld als gewoon teken', () => {
    const data = parseCsv('Omschrijving;Hoeveelheid;Eenheid\nBuis 4" PVC;10;m', 'csv');
    expect(data.rows).toEqual([['Buis 4" PVC', '10', 'm']]);
  });

  it('leest een geciteerd veld over meerdere regels als één cel', () => {
    const data = parseCsv('Omschrijving;Hoeveelheid;Eenheid\r\n"Regel 1\r\nRegel 2";10;m\r\nVolgende;2;st', 'csv');
    // Het regeleinde in de cel wordt "\n": een "\r" kwam als _x000d_ in een xlsx-export.
    expect(data.rows).toEqual([['Regel 1\nRegel 2', '10', 'm'], ['Volgende', '2', 'st']]);
  });

  it('maakt van een los "\\r" in een geciteerd veld ook "\\n"', () => {
    const data = parseCsv('Omschrijving;Hoeveelheid\r"A\rB";1', 'csv');
    expect(data.rows).toEqual([['A\nB', '1']]);
  });

  it('houdt dubbele aanhalingstekens binnen een geciteerd veld en slaat lege regels over', () => {
    const data = parseCsv('Omschrijving,Prijs\n\n"Deur ""Plus""",12\n\n', 'csv');
    expect(data.rows).toEqual([['Deur "Plus"', '12']]);
  });
});

describe('generieke Excel-import: titelregel en lege kopcellen (knownbug 81)', () => {
  it('slaat een titelregel boven de kop over', () => {
    const data = parseXlsxTabular(xlsxBytes([
      ['Begroting nieuwbouw'],
      ['Omschrijving', 'Eenheid', 'Hoeveelheid', 'Prijs'],
      ['Beton', 'm3', 10, 95],
    ]), 'x.xlsx');
    expect(data.headers).toEqual(['Omschrijving', 'Eenheid', 'Hoeveelheid', 'Prijs']);
    expect(data.rows).toEqual([['Beton', 'm3', '10', '95']]);
  });

  it('vult een lege kopcel aan, zodat elke kolom te koppelen is', () => {
    const data = parseXlsxTabular(xlsxBytes([
      ['Omschrijving', null, 'Hoeveelheid'],
      ['Beton', 'm3', 10],
    ]), 'x.xlsx');
    expect(data.headers).toHaveLength(3);
    expect(Object.keys(data.headers)).toEqual(['0', '1', '2']);
    expect(data.headers[1]).toBe('');
    expect(data.rows[0]).toEqual(['Beton', 'm3', '10']);
  });

  it('meldt een probleemcel na een titelregel op de juiste rij', () => {
    const ws = XLSX.utils.aoa_to_sheet([['Titel'], ['Omschrijving', 'Hoeveelheid'], ['Beton', 1]]);
    ws.B3 = { t: 'e', v: 0x07, w: '#DIV/0!' };
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Blad1');
    const data = parseXlsxTabular(new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer), 'x.xlsx');
    expect(data.cellIssues).toEqual([expect.objectContaining({ row: 0, col: 1, address: 'Blad1!B3', kind: 'error' })]);
  });
});

describe('automatische kopherkenning (knownbug 85)', () => {
  it('herkent koppen met valutateken, eenheid tussen haakjes en afkortingen', () => {
    expect(autoDetectMapping(['Omschrijving', 'Eenh.', 'Hoeveelheid (m2)', 'Prijs (€)', 'Totaal €']))
      .toEqual(['description', 'unit', 'quantity', 'unitPrice', 'total']);
    expect(autoDetectMapping(['Omschrijving', 'Prijs/eh'])).toEqual(['description', 'unitPrice']);
  });
});

describe('profielimport: eenheden zonder hoofdlettergevoeligheid (knownbug 86)', () => {
  it('leest St en M als st en m', () => {
    const bytes = xlsxBytes([
      ['Omschrijving', 'Eenheid', 'Hoeveelheid', 'Prijs'],
      ['Deur', 'St', 2, 100],
      ['Plint', 'M', 10, 5],
    ]);
    const { project } = importBudgetTable(bytes, 'x.xlsx', {
      sheet: 'Blad1', firstRow: 2, lastRow: 3, currency: 'EUR', decimalSeparator: ',',
      columns: { description: 0, unit: 1, quantity: 2, price: 3 },
    });
    expect(project.items.filter((i) => i.rowType === 'begrotingspost').map((i) => i.unit)).toEqual(['st', 'm']);
  });
});

describe('CSV-codering (knownbug 260)', () => {
  it('leest een Windows-1252-CSV uit Nederlandse Excel zonder vervangingstekens', () => {
    // "Omschrijving;Prijs\nGevelbekleding €;12" met é en € in Windows-1252.
    const bytes = new Uint8Array([...new TextEncoder().encode('Omschrijving;Prijs\nCaf'), 0xe9, ...new TextEncoder().encode(' '), 0x80, ...new TextEncoder().encode(';12')]);
    expect(decodeCsvText(bytes)).toBe('Omschrijving;Prijs\nCafé €;12');
  });

  it('houdt UTF-8 als UTF-8', () => {
    expect(decodeCsvText(new TextEncoder().encode('Café €'))).toBe('Café €');
  });
});

describe('CSV die met "PK" begint (knownbug 102)', () => {
  const realWorker = globalThis.Worker;
  afterEach(() => { (globalThis as { Worker?: unknown }).Worker = realWorker; });

  it('gaat naar de importworker in plaats van als ongeldige ZIP geweigerd te worden', async () => {
    const posted = vi.fn();
    class FakeWorker {
      onmessage: ((e: { data: unknown }) => void) | null = null;
      onerror: (() => void) | null = null;
      postMessage(message: unknown) { posted(message); queueMicrotask(() => this.onmessage?.({ data: { ok: true, result: 'ok' } })); }
      terminate() {}
    }
    (globalThis as { Worker?: unknown }).Worker = FakeWorker;
    const { runImportWorker } = await import('@/services/importers/importWorkerClient');
    const csv = new TextEncoder().encode('PK-nummer;Omschrijving\n1;Beton');
    await expect(runImportWorker('tabular', csv.buffer, 'lijst.csv')).resolves.toBe('ok');
    expect(posted).toHaveBeenCalledOnce();
  });
});

describe('review-vervolg: onafgesloten quote en kop met één kolomnaam', () => {
  it('een quote die nooit sluit slokt de rest van het bestand niet op', () => {
    const data = parseCsv(['Omschrijving;Hoeveelheid;Eenheid', '"12 inch buis;10;m', 'Beton;2;m3', 'Zand;3;m3'].join(String.fromCharCode(10)), 'csv');
    expect(data.rows).toEqual([['"12 inch buis', '10', 'm'], ['Beton', '2', 'm3'], ['Zand', '3', 'm3']]);
  });

  it('herstelt ook na een eerder geldig geciteerd veld', () => {
    const data = parseCsv(['Omschrijving,Prijs', '"Deur, groot",12', '"Raam,5', 'Kozijn,7'].join(String.fromCharCode(10)), 'csv');
    expect(data.rows).toEqual([['Deur, groot', '12'], ['"Raam', '5'], ['Kozijn', '7']]);
  });

  it('neemt een kopregel met één bekende kolomnaam als kop', () => {
    const data = parseXlsxTabular(xlsxBytes([
      ['Omschrijving', null],
      ['Beton', 10],
      ['Zand', 3],
    ]), 'x.xlsx');
    expect(data.headers).toEqual(['Omschrijving', '']);
    expect(data.rows).toEqual([['Beton', '10'], ['Zand', '3']]);
  });
});
