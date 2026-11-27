import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { changeLanguage } from '@/i18n/config';
import { loadOwnLibraries, memoryBackend, setOwnLibraryBackend } from '@/services/pricing/ownLibraries';
import { OwnLibraryFileError, OWN_LIBRARY_FILE_TYPES, prepareOwnLibrary } from '@/services/pricing/ownLibraryImport';
import { bc3PriceList } from '@/services/importers/bc3Importer';

// Issue #127: a BC3 price database (banco de precios) becomes an own price
// library. Before, a .bc3 file in the library import was read as JSON and
// failed with "expected a JSON object with a list “resources”".

/** A small price database in Windows-1252, as Presto writes it (ANSI). */
const BASE = [
  '~V|Test|FIEBDC-3/2020|Presto 22||ANSI||2||||',
  '~K|\\2\\3\\3\\2\\2\\2\\2\\EUR\\|13\\0\\0\\0\\21|',
  '~C|BASE##||Banco de precios|0|010124|0|',
  '~D|BASE##|01#\\1\\1\\MO\\1\\1\\|',
  '~C|01#||Albañilería|0|010124|0|',
  '~D|01#|01.01\\1\\1\\NEG1\\1\\1\\|',
  '~C|01.01|m2|Fábrica de ladrillo|45.5|15032023|0|',
  '~D|01.01|MO001\\0.5\\1\\MT001\\30\\1\\MQ001\\0.1\\1\\%CI\\0.03\\1\\|',
  // A chapter without the # suffix: no unit, a decomposition, never measured.
  '~C|MO||Mano de obra|0||0|',
  '~D|MO|MO001\\1\\1\\|',
  '~C|MO001|h|Oficial 1ª|22.4|150323|1|',
  '~C|MT001|ud|Ladrillo perforado|0.12|150323|3|',
  '~C|MQ001|h|Hormigonera|3.1||2|',
  '~C|%CI|%|Costes indirectos|0.03||%|',
  '~C|NEG1|ud|Abono|-5||3|',
].join('\r\n') + '\r\n';
const ansi = (text: string) => Uint8Array.from(text, ch => ch.charCodeAt(0));

beforeEach(async () => {
  await changeLanguage('en');
  setOwnLibraryBackend(memoryBackend());
  await loadOwnLibraries();
});

describe('BC3 price database as own library (#127)', () => {
  it('the file dialogs offer .bc3', () => {
    expect(OWN_LIBRARY_FILE_TYPES.split(',')).toContain('.bc3');
  });

  it('reads every priced concept, with type, unit, chapter, date and currency', () => {
    const { library, items, warnings } = prepareOwnLibrary('banco.bc3', ansi(BASE), { now: new Date('2026-11-27T10:00:00Z') });
    expect(library).toMatchObject({ id: 'banco', name: 'banco', origin: 'bc3', count: 4, fileName: 'banco.bc3' });
    const byCode = Object.fromEntries(items.map(i => [i.code, i]));
    // Root, chapters (with and without #) and the surcharge are no articles.
    expect(Object.keys(byCode).sort()).toEqual(['01.01', 'MO001', 'MQ001', 'MT001']);
    expect(byCode.MO001).toMatchObject({ description: 'Oficial 1ª', unit: 'uur', resourceType: 'arbeid', defaultUnitPrice: 22.4, category: 'Mano de obra', priceDate: '2023-03-15', currency: 'EUR' });
    expect(byCode.MT001).toMatchObject({ description: 'Ladrillo perforado', unit: 'st', resourceType: 'materiaal', defaultUnitPrice: 0.12 });
    expect(byCode.MQ001).toMatchObject({ resourceType: 'materieel', priceDate: null });
    // A partida keeps its unit price as one article.
    expect(byCode['01.01']).toMatchObject({ description: 'Fábrica de ladrillo', unit: 'm²', resourceType: 'overig', defaultUnitPrice: 45.5, category: 'Albañilería', priceDate: '2023-03-15' });
    expect(warnings).toEqual(['Left out because the price is negative (1): NEG1']);
  });

  it('a price of 0 becomes an article without a price, with a warning', () => {
    const text = BASE.replace('~C|MQ001|h|Hormigonera|3.1||2|', '~C|MQ001|h|Hormigonera|0||2|');
    const { items, warnings } = prepareOwnLibrary('banco.bc3', text);
    expect(items.find(i => i.code === 'MQ001')?.defaultUnitPrice).toBeNull();
    expect(warnings).toContain('Imported without a price because the price in the file is 0 (1): MQ001');
  });

  it('warns when the file states no currency (old files are in pesetas)', () => {
    const { library, warnings } = prepareOwnLibrary('antiguo.bc3', BASE.replace(/~K[^~]*/, ''));
    expect(library.currency).toBeUndefined();
    expect(warnings[0]).toContain('does not state its currency');
    expect(prepareOwnLibrary('banco.bc3', BASE).warnings.join()).not.toContain('currency');
  });

  it('mu is per thousand, an unknown unit is kept, a priced partida without unit is an article', () => {
    const text = [
      '~V|x|FIEBDC-3/2020|||ANSI|', '~K|\\2\\3\\3\\2\\2\\2\\2\\EUR\\|',
      '~C|C#||Capítulo|0||0|', '~D|C#|LAD\\1\\1\\RES\\1\\1\\P1\\1\\1\\|',
      '~C|LAD|mu|Ladrillo|340||3|', '~C|RES|l|Resina|12.5||3|',
      '~C|P1||Control dimensional|392.01||0|', '~D|P1|LAD\\0.1\\1\\|',
    ].join('\r\n');
    const { items } = prepareOwnLibrary('b.bc3', text);
    const byCode = Object.fromEntries(items.map(i => [i.code, i]));
    expect(byCode.LAD).toMatchObject({ unit: 'st', defaultUnitPrice: 0.34 });
    expect(byCode.RES).toMatchObject({ originalUnit: 'l', unitSupported: false, defaultUnitPrice: 12.5 });
    expect(byCode.P1).toMatchObject({ defaultUnitPrice: 392.01, category: 'Capítulo' });
    expect(Object.keys(byCode).sort()).toEqual(['LAD', 'P1', 'RES']);
  });

  it('keeps the file codes as article IDs, so a newer version updates linked prices', () => {
    const { items } = prepareOwnLibrary('banco.bc3', ansi(BASE));
    expect(items.find(i => i.code === 'MO001')?.id).toBe('banco:MO001');
  });

  it('recognises BC3 without the .bc3 extension, and as text (MCP)', () => {
    expect(prepareOwnLibrary('banco', ansi(BASE)).library.origin).toBe('bc3');
    expect(prepareOwnLibrary('banco.bc3', BASE).library.count).toBe(4);
  });

  it('a file without extension is read as bytes, so BC3 keeps its accents', async () => {
    vi.doMock('@/services/pricing/installOwnLibrary', () => ({ installOwnLibrary: async () => true }));
    const { importOwnLibraryFile } = await import('@/components/library/importOwnLibraryFile');
    const prepared = await importOwnLibraryFile(new File([ansi(BASE)], 'banco'));
    expect(prepared!.library.origin).toBe('bc3');
    expect(prepared!.items.find(i => i.code === 'MO001')?.description).toBe('Oficial 1ª');
    vi.doUnmock('@/services/pricing/installOwnLibrary');
  });

  it('a .bc3 file that is not BC3 gets a BC3 message, not a JSON one', () => {
    expect(() => prepareOwnLibrary('x.bc3', '{"resources":[]}')).toThrow(OwnLibraryFileError);
    expect(() => prepareOwnLibrary('x.bc3', '{"resources":[]}')).toThrow('is this a BC3 file?');
  });

  it('reads two-digit, five-digit and invalid dates', () => {
    const dates = (date: string) => bc3PriceList(`~V|x|FIEBDC-3/2020|||ANSI|\n~C|A|ud|A|1|${date}|3|\n`).entries[0].priceDate;
    expect(dates('150385')).toBe('1985-03-15');
    expect(dates('10124')).toBe('2024-01-01');
    expect(dates('1012024')).toBe('2024-01-01');
    expect(dates('310223')).toBeUndefined();
    // Day 00: month and year only; month 00: year only.
    expect(dates('00032023')).toBe('2023-03-01');
    expect(dates('00002023')).toBe('2023-01-01');
    expect(dates('')).toBeUndefined();
  });

  it('reads a real price database (BCCA 2023, Junta de Andalucía)', () => {
    const buffer = readFileSync(join(process.cwd(), 'verification/bc3/BCCA2023_V02.bc3'));
    const { library, items } = prepareOwnLibrary('BCCA2023_V02.bc3', new Uint8Array(buffer));
    expect(library.origin).toBe('bc3');
    expect(library.count).toBeGreaterThan(1000);
    expect(items.find(i => i.code === '004600100')).toMatchObject({
      description: 'SENSOR TEMPERATURA AMBIENTE STR100', unit: 'st', resourceType: 'materiaal', defaultUnitPrice: 21.65, priceDate: '2023-03-15', currency: 'EUR',
    });
    // mu (millar) is a price per thousand: per piece divided by 1000.
    expect(items.find(i => i.code === 'FB01100')).toMatchObject({ unit: 'st', defaultUnitPrice: 0.34 });
    // A unit the app does not know stays as it is and is marked, not silently 'st'.
    expect(items.find(i => i.code === 'AGM01800')).toMatchObject({ originalUnit: 'l', unitSupported: false });
    // A priced partida without unit is an article in a price database, not a chapter.
    expect(items.find(i => i.code === '18BTA00010')?.defaultUnitPrice).toBe(392.01);
    // Chapters such as -BAS# and A (no unit, a decomposition) are no articles.
    expect(items.some(i => i.code.startsWith('-') || i.code === 'A')).toBe(false);
    expect(items.every(i => (i.defaultUnitPrice ?? 0) >= 0)).toBe(true);
    // Accents decoded from Windows-1252.
    expect(items.some(i => /[áéíóúñ]/i.test(i.description))).toBe(true);
  });
});
