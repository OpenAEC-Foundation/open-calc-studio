import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { changeLanguage } from '@/i18n/config';
import { ResourcePicker } from '@/components/library/ResourcePicker';
import { useAppStore } from '@/state/appStore';
import { createDefaultSchedule } from '@/data/defaultBudget';
import { deserializeProject, serializeProject } from '@/services/file/fileService';
import { activateAllLibraries, activateOwnLibrary, choosePriceCountry, setActiveLibraries, toggleLibrary } from '@/services/pricing/choosePriceCountry';
import { loadOwnLibraries, memoryBackend, removeOwnLibrary, saveOwnLibrary, setOwnLibraryBackend } from '@/services/pricing/ownLibraries';
import { prepareOwnLibrary } from '@/services/pricing/ownLibraryImport';
import { activeLibrariesOf, builtInLibraryItems, missingOwnLibraries, withActiveLibraries } from '@/services/pricing/priceLibraries';
import type { ResourceLibraryItem } from '@/types/costModel';

// Issue #104: an estimate uses several price libraries at once.

const loose: ResourceLibraryItem = {
  id: 'zsx-1', code: 'Z.001', description: 'Imported loose', unit: 'st', resourceType: 'materiaal', defaultUnitPrice: 12, category: 'Imported',
};
const rates = (id: string, name = id) => JSON.stringify({
  id, name, version: 1, currency: 'EUR',
  resources: [
    { id: 'L1', code: `${id}-L1`, description: `${name} carpenter`, unit: 'uur', resourceType: 'arbeid', category: 'Labour', defaultUnitPrice: 55, source: 'Own', priceDate: '2026-01-01' },
    { id: 'M1', code: `${id}-M1`, description: `${name} brick`, unit: 'st', resourceType: 'materiaal', category: 'Masonry', defaultUnitPrice: 0.8, source: 'Own', priceDate: '2026-01-01' },
  ],
});
const install = async (id: string, name = id) => saveOwnLibrary(prepareOwnLibrary(`${id}.json`, rates(id, name)).library);
const codes = () => useAppStore.getState().resourceLibrary.map(i => i.code);
const NL_COUNT = builtInLibraryItems('NL').length;

beforeEach(async () => {
  await changeLanguage('en');
  setOwnLibraryBackend(memoryBackend());
  await loadOwnLibraries();
  useAppStore.setState({
    schedule: createDefaultSchedule(), items: [], undoStack: [], redoStack: [],
    documents: [{ id: 'doc', fileName: 'a.ifcCalc', filePath: null, isModified: false, items: [], schedule: createDefaultSchedule() } as never], activeDocumentId: 'doc',
    resourceLibrary: [...builtInLibraryItems('NL'), loose],
    resourcePickerOpen: false, resourcePickerParentId: null,
  });
});
afterEach(() => setOwnLibraryBackend(memoryBackend()));

describe('active libraries of an estimate', () => {
  it('is only the country library when unset, as with #93', () => {
    expect(activeLibrariesOf(createDefaultSchedule())).toEqual(['country']);
    expect(activeLibrariesOf({ priceLibraries: ['own:a', 'country', 'own:a', 'bogus', 'own:', 7 as never] })).toEqual(['own:a', 'country']);
    expect(activeLibrariesOf({ priceLibraries: [] })).toEqual([]);
  });

  it('lists the articles of each active library in order, then loose resources', async () => {
    await install('a');
    await install('b');
    const list = withActiveLibraries([...builtInLibraryItems('NL'), loose], { priceLibraries: ['own:b', 'country', 'own:a'] });
    expect(list.slice(0, 2).map(i => i.code)).toEqual(['b-L1', 'b-M1']);
    expect(list[2].id).toBe(builtInLibraryItems('NL')[0].id);
    expect(list.slice(-3).map(i => i.code)).toEqual(['a-L1', 'a-M1', 'Z.001']);
  });

  it('switching libraries on and off is one undo step each and swaps the list', async () => {
    await install('a');
    activateOwnLibrary('a');
    let s = useAppStore.getState();
    expect(s.schedule.priceLibraries).toEqual(['country', 'own:a']);
    expect(codes()).toHaveLength(NL_COUNT + 3);
    expect(s.documents[0].isModified).toBe(true);

    toggleLibrary('country', false);
    expect(codes()).toEqual(['a-L1', 'a-M1', 'Z.001']);
    expect(useAppStore.getState().undoStack).toHaveLength(2);

    useAppStore.getState().undo();
    expect(activeLibrariesOf(useAppStore.getState().schedule)).toEqual(['country', 'own:a']);
    expect(codes()).toHaveLength(NL_COUNT + 3);
    useAppStore.getState().undo();
    expect(activeLibrariesOf(useAppStore.getState().schedule)).toEqual(['country']);
    expect(codes()).toHaveLength(NL_COUNT + 1);
    useAppStore.getState().redo();
    expect(codes()).toHaveLength(NL_COUNT + 3);
    s = useAppStore.getState();
    expect(s.undoStack).toHaveLength(1);
  });

  it('activating an active library or setting the same list does nothing', async () => {
    await install('a');
    activateOwnLibrary('a');
    activateOwnLibrary('a');
    setActiveLibraries(['country', 'own:a']);
    expect(useAppStore.getState().undoStack).toHaveLength(1);
  });

  it('"All libraries" switches on everything on this computer and keeps the order', async () => {
    await install('a');
    await install('b');
    setActiveLibraries(['own:b']);
    activateAllLibraries(['a', 'b']);
    expect(activeLibrariesOf(useAppStore.getState().schedule)).toEqual(['own:b', 'country', 'own:a']);
  });

  it('a country choice and the library list undo independently', async () => {
    await install('a');
    activateOwnLibrary('a');
    choosePriceCountry('IN');
    expect(codes()).toEqual(['a-L1', 'a-M1', 'Z.001']);
    useAppStore.getState().undo();
    expect(codes()).toHaveLength(NL_COUNT + 3);
  });

  it('a library imported, updated or removed while in use updates the list at once', async () => {
    await install('a');
    activateOwnLibrary('a');
    await saveOwnLibrary(prepareOwnLibrary('a2.json', JSON.stringify({ id: 'a', name: 'a', version: 2, resources: [{ id: 'L1', code: 'a-L1', description: 'x', unit: 'uur', defaultUnitPrice: 60 }] })).library);
    expect(codes().filter(c => c.startsWith('a-'))).toEqual(['a-L1']);
    await removeOwnLibrary('a');
    expect(codes().some(c => c.startsWith('a-'))).toBe(false);
    expect(codes()).toContain('Z.001');
    expect(missingOwnLibraries(useAppStore.getState().schedule)).toEqual(['a']);
  });

  it('an estimate whose own library is not on this computer gets no articles for it, never others instead', () => {
    useAppStore.getState().addDocument({ id: 'other', fileName: 'other.ifcCalc', items: [], schedule: { ...createDefaultSchedule(), priceLibraries: ['own:Supplier X'] } });
    expect(codes()).toEqual(['Z.001']);
    expect(missingOwnLibraries(useAppStore.getState().schedule)).toEqual(['Supplier X']);
    useAppStore.getState().setActiveDocument('doc');
    expect(codes()).toHaveLength(NL_COUNT + 1);
  });

  it('is saved in the project file', () => {
    const saved = deserializeProject(serializeProject({ ...createDefaultSchedule(), priceLibraries: ['country', 'own:a'] }, []));
    expect(saved.schedule.priceLibraries).toEqual(['country', 'own:a']);
  });
});

describe('library dialog', () => {
  let container: HTMLDivElement;
  let root: Root | undefined;
  beforeEach(() => { Element.prototype.scrollIntoView = vi.fn(); });
  afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; container?.remove(); vi.restoreAllMocks(); });

  async function open() {
    useAppStore.setState({ resourcePickerOpen: true });
    container = document.createElement('div'); document.body.append(container); root = createRoot(container);
    await act(async () => { root!.render(<ResourcePicker />); });
  }
  const $ = <T extends Element>(selector: string) => container.querySelector<T>(selector)!;
  const rows = () => container.querySelectorAll('.resource-picker-row');

  it('imports a library file, uses it in this estimate and labels the rows by library', async () => {
    await open();
    const input = $<HTMLInputElement>('[data-testid="own-library-file"]');
    const file = new File([rates('sup', 'Supplier X')], 'supplier.json', { type: 'application/json' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });

    expect(container.querySelector('[role="status"]')?.textContent).toContain('“Supplier X” imported: 2 resources.');
    expect(activeLibrariesOf(useAppStore.getState().schedule)).toEqual(['country', 'own:sup']);
    expect(rows()).toHaveLength(NL_COUNT + 3);
    const badges = [...container.querySelectorAll('.rp-lib-badge')].map(b => b.textContent);
    expect(badges).toContain('Supplier X');
    expect(badges).toContain('Netherlands');
    expect($<HTMLInputElement>('#rp-lib-own-sup').checked).toBe(true);
  });

  it('switches a library off with its checkbox', async () => {
    await install('a', 'Our rates');
    activateOwnLibrary('a');
    await open();
    await act(async () => { $<HTMLInputElement>('#rp-lib-country').click(); });
    expect(activeLibrariesOf(useAppStore.getState().schedule)).toEqual(['own:a']);
    expect(rows()).toHaveLength(3);
    // Library articles are labelled, loose resources are not.
    expect([...container.querySelectorAll('.rp-lib-badge')].map(b => b.textContent)).toEqual(['Our rates', 'Our rates']);
    expect(container.textContent).not.toContain('Starter library');
  });

  it('removes an own library after confirmation', async () => {
    await install('a', 'Our rates');
    activateOwnLibrary('a');
    await open();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await act(async () => { $<HTMLButtonElement>('[aria-label="Remove: Our rates"]').click(); });
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
    expect(container.querySelector('[data-library="a"]')).toBeNull();
    expect(activeLibrariesOf(useAppStore.getState().schedule)).toEqual(['country']);
    expect(rows()).toHaveLength(NL_COUNT + 1);
  });

  it('says when a library of the estimate is missing and can drop it from the estimate', async () => {
    useAppStore.getState().setSchedule({ priceLibraries: ['country', 'own:Supplier X'] });
    await open();
    expect(container.textContent).toContain('“Supplier X” is not on this computer.');
    const drop = [...container.querySelectorAll('button')].find(b => b.textContent === 'Remove from this estimate')!;
    await act(async () => { drop.click(); });
    expect(activeLibrariesOf(useAppStore.getState().schedule)).toEqual(['country']);
    expect(container.textContent).not.toContain('is not on this computer');
  });

  it('shows a bad file as an error, without changing anything', async () => {
    await open();
    const input = $<HTMLInputElement>('[data-testid="own-library-file"]');
    Object.defineProperty(input, 'files', { value: [new File(['Foo;Bar\n1;2\n'], 'x.csv')], configurable: true });
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('needs at least the columns code and description');
    expect(useAppStore.getState().undoStack).toHaveLength(0);
  });
});
