import { beforeEach, describe, expect, it } from 'vitest';
import { executeDesktopCommand } from '@/services/mcp/desktopCommand';
import { useAppStore } from '@/state/appStore';
import { createDefaultSchedule } from '@/data/defaultBudget';
import { loadOwnLibraries, listOwnLibraries, memoryBackend, ownLibraryItems, ownLibraryJson, setOwnLibraryBackend } from '@/services/pricing/ownLibraries';
import { detectLibraryMapping, prepareOwnLibrary } from '@/services/pricing/ownLibraryImport';
import { recalledLibraryMapping, rememberLibraryMapping } from '@/services/pricing/libraryColumnMappings';
import { localStore } from '@/utils/browserStorage';

const content = 'SKU;Naam;EH;Tarief;Soort;Groep;Datum;Bron;Valuta;BTW\nA;Carpenter;uur;52,50;labour;Labour;2026-11-24;Own quote;eur;excl\nB;Check price;st;;material;Material;;;;unknown';
const columnMapping = ['code', 'description', 'unit', 'unitPrice', 'type', 'category', 'priceDate', 'source', 'currency', 'vatBasis'];

beforeEach(async () => {
  localStore.removeItem('ocs-library-column-mappings-v1');
  setOwnLibraryBackend(memoryBackend());
  await loadOwnLibraries();
  useAppStore.setState({ schedule: createDefaultSchedule(), items: [], documents: [], activeDocumentId: '', undoStack: [], redoStack: [] });
});

describe('own price library column mapping and MCP (#104)', () => {
  it('maps custom headers, metadata and decimal prices without inventing missing prices', () => {
    const prepared = prepareOwnLibrary('rates.csv', content, { columnMapping: columnMapping as never });
    expect(prepared.items[0]).toMatchObject({ code: 'A', defaultUnitPrice: 52.5, resourceType: 'arbeid', currency: 'EUR', source: 'Own quote', priceDate: '2026-11-24' });
    expect(prepared.library.library.resources[0]).toMatchObject({ vatBasis: 'excl' });
    expect(prepared.items[1].defaultUnitPrice).toBeNull();
  });

  it('detects optional library columns and refuses duplicate, missing or unknown mappings', () => {
    expect(detectLibraryMapping(['Code', 'Description', 'Unit', 'Price', 'Type', 'Category', 'Price date', 'Source', 'Currency', 'VAT basis'])).toEqual(columnMapping);
    for (const mapping of [['code'], ['code', 'code', ...columnMapping.slice(2)], ['code', 'description', 'bogus', ...columnMapping.slice(3)]]) {
      expect(() => prepareOwnLibrary('rates.csv', content, { columnMapping: mapping as never })).toThrow();
    }
  });

  it('remembers layouts by exact headers, without storing data rows, and bounds the cache', () => {
    rememberLibraryMapping(['a', 'b'], ['code', 'description']);
    expect(recalledLibraryMapping(['a', 'b'])).toEqual(['code', 'description']);
    expect(recalledLibraryMapping(['b', 'a'])).toBeUndefined();
    for (let n = 0; n < 21; n++) rememberLibraryMapping([String(n)], ['code']);
    expect(recalledLibraryMapping(['a', 'b'])).toBeUndefined();
    expect(JSON.parse(localStore.getItem('ocs-library-column-mappings-v1')!)).toHaveLength(20);
  });

  it('imports, lists, renames and reimports persistently without changing the estimate', async () => {
    const imported = await executeDesktopCommand('libraries.import', { fileName: 'rates.csv', content, columnMapping }) as { library: { id: string } };
    const id = imported.library.id;
    const originalId = ownLibraryItems(id)![0].id;
    expect(useAppStore.getState().items).toEqual([]);
    expect((await executeDesktopCommand('libraries.list') as { libraries: unknown[] }).libraries).toHaveLength(1);
    await executeDesktopCommand('libraries.rename', { id, name: 'Company rates' });
    await expect(executeDesktopCommand('libraries.import', { fileName: 'renamed.csv', content, columnMapping, updateId: id })).rejects.toThrow(/replace/);
    await executeDesktopCommand('libraries.import', { fileName: 'renamed.csv', content: content.replace('52,50', '55,00'), columnMapping, updateId: id, replace: true });
    expect(ownLibraryItems(id)![0]).toMatchObject({ id: originalId, defaultUnitPrice: 55 });
    expect(ownLibraryJson(id)?.name).toBe('Company rates');
    await loadOwnLibraries();
    expect(listOwnLibraries()[0].id).toBe(id);
    await executeDesktopCommand('libraries.remove', { id });
    expect(listOwnLibraries()).toEqual([]);
  });

  it('validates country and all selected keys before changing the document; selection is undoable', async () => {
    await executeDesktopCommand('libraries.import', { fileName: 'rates.csv', content, columnMapping });
    const schedule = createDefaultSchedule();
    useAppStore.setState({ schedule, documents: [{ id: 'doc', fileName: 'Test.ifcCalc', filePath: null, isModified: false, items: [], schedule } as never], activeDocumentId: 'doc' });
    await expect(executeDesktopCommand('libraries.select', { country: 'BE', keys: ['own:missing'] })).rejects.toThrow(/keys/);
    expect(useAppStore.getState().schedule).toBe(schedule);
    await executeDesktopCommand('libraries.select', { keys: ['own:rates'] });
    expect(useAppStore.getState().schedule.priceLibraries).toEqual(['own:rates']);
    expect(useAppStore.getState().documents[0].isModified).toBe(true);
    useAppStore.getState().undo();
    expect(useAppStore.getState().schedule.priceLibraries).toEqual(['country']);
    await expect(executeDesktopCommand('libraries.select', { country: 'invalid' })).rejects.toThrow(/country/);
  });

  it('rejects malformed API requests and exposes all operations in the action catalogue', async () => {
    for (const [action, params] of [
      ['libraries.import', { fileName: 'rates.csv', content, dataBase64: 'QQ==' }],
      ['libraries.import', { fileName: 'rates.csv', content, columnMapping: 'bad' }],
      ['libraries.import', { fileName: 'rates.csv', content, replace: 'yes' }],
      ['libraries.import', { fileName: 'rates.xlsx', content: 123, dataBase64: 'QQ==' }],
      ['libraries.list', { unknown: true }], ['libraries.missing', {}],
    ] as const) await expect(executeDesktopCommand(action, params)).rejects.toThrow();
    const actions = await executeDesktopCommand('listActions') as { workspaceActions: Record<string, unknown> };
    for (const name of ['list', 'import', 'select', 'rename', 'remove']) expect(actions.workspaceActions[`libraries.${name}`]).toBeDefined();
  });
});
