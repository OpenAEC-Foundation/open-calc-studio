import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { changeLanguage } from '@/i18n/config';
import {
  getOwnLibrary, indexedDbBackend, isOwnLibraryId, listOwnLibraries, loadOwnLibraries, memoryBackend, ownLibraryItems, ownLibraryJson,
  ownLibraryLoadError, removeOwnLibrary, renameOwnLibrary, saveOwnLibrary, setOwnLibraryBackend, subscribeOwnLibraries, tauriFileBackend,
  type OwnLibraryBackend,
} from '@/services/pricing/ownLibraries';
import { OwnLibraryFileError, prepareOwnLibrary } from '@/services/pricing/ownLibraryImport';
import { builtInLibraryItems, PRICE_LIBRARY_COUNTRIES } from '@/services/pricing/priceLibraries';
import { PRICE_LIBRARY_FILES } from '@/data/price-libraries';

// Issue #104: own price libraries, imported once and kept on this computer.

const json = (extra: Record<string, unknown> = {}) => JSON.stringify({
  version: 3, name: 'Our rates 2026', currency: 'EUR', region: 'NL',
  resources: [
    { id: 'L1', code: 'L1', description: 'Carpenter', unit: 'uur', resourceType: 'arbeid', category: 'Labour', defaultUnitPrice: 55, source: 'Own rates', priceDate: '2026-01-01' },
    { id: 'M1', code: 'M1', description: 'Concrete C30/37', unit: 'm3', resourceType: 'materiaal', category: 'Concrete', defaultUnitPrice: null, referenceUnitPrice: 140, source: 'Quote', priceDate: null },
  ],
  ...extra,
});

const bmecat = `<?xml version="1.0"?><BMECAT><T_NEW_CATALOG>
  <ARTICLE><SUPPLIER_AID>A-100</SUPPLIER_AID><ARTICLE_DETAILS><DESCRIPTION_SHORT>Brick red</DESCRIPTION_SHORT></ARTICLE_DETAILS>
    <ARTICLE_ORDER_DETAILS><ORDER_UNIT>C62</ORDER_UNIT></ARTICLE_ORDER_DETAILS><ARTICLE_PRICE_DETAILS><ARTICLE_PRICE><PRICE_AMOUNT>0.85</PRICE_AMOUNT></ARTICLE_PRICE></ARTICLE_PRICE_DETAILS></ARTICLE>
</T_NEW_CATALOG></BMECAT>`;

async function install(fileName: string, content: string | Uint8Array, updateId?: string) {
  const prepared = prepareOwnLibrary(fileName, content, { updateId, now: new Date('2026-11-23T10:00:00Z') });
  await saveOwnLibrary(prepared.library);
  return prepared;
}

let backend: ReturnType<typeof memoryBackend>;
beforeEach(async () => {
  await changeLanguage('en');
  backend = memoryBackend();
  setOwnLibraryBackend(backend);
  await loadOwnLibraries();
});
afterEach(() => setOwnLibraryBackend(memoryBackend()));

describe('import a library file', () => {
  it('reads library JSON with the same article IDs as a built-in library', async () => {
    const { library, items, replaces } = await install('rates.json', json());
    expect(replaces).toBeUndefined();
    expect(library).toMatchObject({ id: 'Our rates 2026', name: 'Our rates 2026', version: '3', currency: 'EUR', region: 'NL', origin: 'json', count: 2, fileName: 'rates.json', importedAt: '2026-11-23T10:00:00.000Z' });
    expect(items[0].id).toBe('Our%20rates%202026:L1');
    expect(items[0].catalogueId).toBe('Our rates 2026');
    // Same price rules as the built-in library: an unverified reference is never the price.
    expect(items[1]).toMatchObject({ defaultUnitPrice: null, referenceUnitPrice: 140 });
    expect(ownLibraryItems('Our rates 2026')).toEqual(items);
  });

  it('prefers the library id over its name, so a renamed file keeps its price links', () => {
    const { library, items } = prepareOwnLibrary('x.json', json({ id: 'oc-rates' }));
    expect(library.id).toBe('oc-rates');
    expect(items[0].id).toBe('oc-rates:L1');
  });

  it('never takes the catalogue ID of a built-in library', () => {
    const nlName = (PRICE_LIBRARY_FILES as Record<string, { name: string }>)[PRICE_LIBRARY_COUNTRIES[0]].name;
    const { library, items } = prepareOwnLibrary('copy.json', json({ name: nlName }));
    expect(library.id).toBe(`${nlName} (2)`);
    expect(items.some(item => builtInLibraryItems('NL').some(nl => nl.id === item.id))).toBe(false);
  });

  it('reads a CSV price list with Dutch decimals and optional columns', () => {
    const csv = 'Code;Omschrijving;Eenheid;Prijs;Soort;Categorie;Prijsdatum\nS-1;Steiger huur;week;1.250,50;equipment;Scaffolding;2026-03-01\nS-2;Afval container;st;;;Waste;\n';
    const { library, items } = prepareOwnLibrary('Supplier X 2026.csv', csv);
    expect(library).toMatchObject({ id: 'Supplier X 2026', origin: 'table', count: 2, version: 'unversioned' });
    expect(items[0]).toMatchObject({ code: 'S-1', description: 'Steiger huur', unit: 'week', defaultUnitPrice: 1250.5, resourceType: 'materieel', category: 'Scaffolding', priceDate: '2026-03-01', source: 'Supplier X 2026.csv' });
    expect(items[1]).toMatchObject({ code: 'S-2', defaultUnitPrice: null });
  });

  it('reads an Excel price list', () => {
    const sheet = XLSX.utils.aoa_to_sheet([['Code', 'Description', 'Unit', 'Price'], ['E-1', 'Excavator', 'uur', 85]]);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Prices');
    const bytes = new Uint8Array(XLSX.write(book, { type: 'array', bookType: 'xlsx' }));
    const { items } = prepareOwnLibrary('rates.xlsx', bytes);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ code: 'E-1', description: 'Excavator', unit: 'uur', defaultUnitPrice: 85 });
  });

  it('turns a BMEcat catalogue into its own library instead of merging it into another one', () => {
    const { library, items } = prepareOwnLibrary('wholesaler.xml', bmecat);
    expect(library.origin).toBe('bmecat');
    expect(items[0]).toMatchObject({ id: 'wholesaler:A-100', code: 'A-100', description: 'Brick red', defaultUnitPrice: 0.85 });
  });

  it('explains what is wrong with an unusable file', () => {
    expect(() => prepareOwnLibrary('x.json', '{"name":"x"}')).toThrow(/not a usable price library: expected a JSON object/);
    expect(() => prepareOwnLibrary('x.json', json({ resources: [] }))).toThrow('This file has no resources.');
    expect(() => prepareOwnLibrary('x.csv', 'Foo;Bar\n1;2\n')).toThrow(/needs at least the columns code and description. Found: Foo, Bar/);
    expect(() => prepareOwnLibrary('x.csv', 'Code;Description;Price\nA;B;cheap\n')).toThrow(/row 2: price "cheap" is not a number/);
    expect(() => prepareOwnLibrary('x.json', json({ resources: [{ id: 'A', code: 'A' }, { id: 'A', code: 'A' }] }))).toThrow(OwnLibraryFileError);
  });
});

describe('re-import a newer version', () => {
  it('keeps the catalogue ID and name of the library, also from a file with another name', async () => {
    await install('Supplier X 2026.csv', 'Code;Description;Price\nA;Brick;1\nB;Sand;2\n');
    await renameOwnLibrary('Supplier X 2026', 'Supplier X');
    const update = await install('Supplier X 2027.csv', 'Code;Description;Price\nA;Brick;1,10\nC;Gravel;3\n', 'Supplier X 2026');
    expect(update.replaces?.id).toBe('Supplier X 2026');
    expect(update.library).toMatchObject({ id: 'Supplier X 2026', name: 'Supplier X', fileName: 'Supplier X 2027.csv' });
    expect(update.items[0].id).toBe('Supplier%20X%202026:A');
    expect(update.dropped).toEqual(['B']);
    expect(listOwnLibraries()).toHaveLength(1);
    expect(ownLibraryItems('Supplier X 2026')!.map(i => [i.code, i.defaultUnitPrice])).toEqual([['A', 1.1], ['C', 3]]);
  });

  it('a file with the same library id replaces that library in its place', async () => {
    await install('a.json', json({ id: 'a' }));
    await install('b.json', json({ id: 'b' }));
    const again = await install('a2.json', json({ id: 'a', version: 4 }));
    expect(again.replaces?.id).toBe('a');
    expect(listOwnLibraries().map(l => [l.id, l.version])).toEqual([['a', '4'], ['b', '3']]);
  });

  it('refuses to update a library that is gone', () => {
    expect(() => prepareOwnLibrary('x.json', json(), { updateId: 'gone' })).toThrow('The own library to update is no longer on this computer.');
  });
});

describe('kept on this computer', () => {
  it('stores, renames and removes libraries, and tells listeners', async () => {
    const listener = vi.fn();
    const stop = subscribeOwnLibraries(listener);
    await install('rates.json', json({ id: 'r' }));
    expect(backend.stored.map(l => l.id)).toEqual(['r']);
    const before = listOwnLibraries();
    expect(listOwnLibraries()).toBe(before); // stable for useSyncExternalStore

    await renameOwnLibrary('r', '  Our rates  ');
    expect(getOwnLibrary('r')?.name).toBe('Our rates');
    expect(ownLibraryJson('r')).toMatchObject({ id: 'r', name: 'Our rates' });
    expect(ownLibraryItems('r')![0].id).toBe('r:L1');

    await removeOwnLibrary('r');
    expect(isOwnLibraryId('r')).toBe(false);
    expect(ownLibraryItems('r')).toBeNull();
    expect(backend.stored).toEqual([]);
    expect(listener).toHaveBeenCalledTimes(3);
    stop();
  });

  it('hands out copies, so editing an article in the store never changes the stored library', async () => {
    await install('rates.json', json({ id: 'r' }));
    ownLibraryItems('r')![0].description = 'changed';
    expect(ownLibraryItems('r')![0].description).toBe('Carpenter');
  });

  it('two quick changes both arrive', async () => {
    await Promise.all([install('a.json', json({ id: 'a' })), install('b.json', json({ id: 'b' }))]);
    expect(backend.stored.map(l => l.id)).toEqual(['a', 'b']);
  });

  it('a failed write keeps the libraries as they were and says why', async () => {
    const failing: OwnLibraryBackend = { loadAll: async () => [], saveAll: async () => { throw Error('disk full'); } };
    setOwnLibraryBackend(failing);
    await loadOwnLibraries();
    await expect(install('a.json', json())).rejects.toThrow('The library could not be saved on this computer: disk full');
    expect(listOwnLibraries()).toEqual([]);
  });

  it('an unreadable store is never overwritten', async () => {
    const saveAll = vi.fn();
    setOwnLibraryBackend({ loadAll: async () => { throw Error('bad JSON'); }, saveAll });
    await loadOwnLibraries();
    expect(ownLibraryLoadError()).toBe('bad JSON');
    await expect(install('a.json', json())).rejects.toThrow(/could not be read \(bad JSON\), so nothing is saved/);
    expect(saveAll).not.toHaveBeenCalled();
  });

  it('skips damaged entries but keeps the good ones', async () => {
    const good = prepareOwnLibrary('a.json', json({ id: 'a' })).library;
    setOwnLibraryBackend({ loadAll: async () => ({ version: 1, libraries: [{ id: 'x' }, good, null] }), saveAll: async () => undefined });
    await loadOwnLibraries();
    expect(listOwnLibraries().map(l => l.id)).toEqual(['a']);
  });

  it('web: IndexedDB keeps the libraries over a reload', async () => {
    setOwnLibraryBackend(indexedDbBackend());
    await loadOwnLibraries();
    await install('a.json', json({ id: 'a' }));
    await install('b.json', json({ id: 'b' }));
    await removeOwnLibrary('a');
    setOwnLibraryBackend(indexedDbBackend()); // "restart"
    await loadOwnLibraries();
    expect(listOwnLibraries().map(l => l.id)).toEqual(['b']);
    expect(ownLibraryItems('b')).toHaveLength(2);
  });

  it('desktop: one file in the app-data folder', async () => {
    const files = new Map<string, string>();
    vi.doMock('@tauri-apps/api/path', () => ({ appDataDir: async () => '/appdata', join: async (...p: string[]) => p.join('/') }));
    vi.doMock('@tauri-apps/plugin-fs', () => ({
      exists: async (p: string) => files.has(p),
      readTextFile: async (p: string) => files.get(p)!,
      writeTextFile: async (p: string, v: string) => { files.set(p, v); },
      mkdir: async () => undefined,
    }));
    try {
      setOwnLibraryBackend(tauriFileBackend());
      await loadOwnLibraries();
      expect(listOwnLibraries()).toEqual([]);
      await install('a.json', json({ id: 'a' }));
      expect(JSON.parse(files.get('/appdata/price-libraries.json')!)).toMatchObject({ version: 1, libraries: [{ id: 'a', library: { id: 'a' } }] });
      setOwnLibraryBackend(tauriFileBackend());
      await loadOwnLibraries();
      expect(listOwnLibraries().map(l => l.id)).toEqual(['a']);
    } finally {
      vi.doUnmock('@tauri-apps/api/path');
      vi.doUnmock('@tauri-apps/plugin-fs');
    }
  });
});
