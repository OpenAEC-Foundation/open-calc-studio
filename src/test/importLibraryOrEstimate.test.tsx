import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, onTestFinished, vi } from 'vitest';
import Backstage from '@/components/backstage/Backstage';
import { ResourcePicker } from '@/components/library/ResourcePicker';
import { useAppStore } from '@/state/appStore';
import i18next from '@/i18n/config';
import { createDefaultSchedule } from '@/data/defaultBudget';
import { listOwnLibraries, loadOwnLibraries, memoryBackend, setOwnLibraryBackend } from '@/services/pricing/ownLibraries';
import { activeLibrariesOf, builtInLibraryItems } from '@/services/pricing/priceLibraries';

// Backstage → Import says what a file becomes (a new estimate, the open
// estimate, a price library), a price list opened as an estimate is offered
// as a price library instead, and a ZSX price list becomes an own price
// library like BMEcat (#104) instead of being merged into the loaded library.

const newFile = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useFileOperations', () => ({ useFileOperations: () => ({ newFile, saveFile: vi.fn(), saveFileAs: vi.fn(), openFile: vi.fn(), openRecentFile: vi.fn() }) }));
// jsdom has no workers: read the table directly.
vi.mock('@/services/importers/importWorkerClient', async () => {
  const { parseCsv } = await import('@/services/importers/genericTabularImporter');
  return { runImportWorker: async (_kind: string, data: ArrayBuffer, fileName: string) => parseCsv(new TextDecoder().decode(data), fileName) };
});

const zsx = readFileSync(join(process.cwd(), 'src/test/fixtures/imports/sample.zsx'), 'utf8');
let node: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18next.changeLanguage('en');
  setOwnLibraryBackend(memoryBackend());
  await loadOwnLibraries();
  useAppStore.setState({
    schedule: createDefaultSchedule(), items: [], undoStack: [], redoStack: [],
    documents: [{ id: 'doc', fileName: 'a.ifcCalc', filePath: null, isModified: false, items: [], schedule: createDefaultSchedule() } as never], activeDocumentId: 'doc',
    resourceLibrary: builtInLibraryItems('NL'), resourcePickerOpen: false, resourcePickerNotice: null,
  });
  node = document.createElement('div');
  document.body.appendChild(node);
  root = createRoot(node);
});
afterEach(async () => {
  await act(async () => root.unmount());
  node.remove();
  newFile.mockClear();
  vi.restoreAllMocks();
  setOwnLibraryBackend(memoryBackend());
});

/** Open Backstage → Import; the file dialog gets `file`. */
async function openImport(file?: File) {
  vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (this: HTMLInputElement) {
    if (!file || this.type !== 'file') return;
    Object.defineProperty(this, 'files', { value: [file], configurable: true });
    this.onchange?.({ target: this } as unknown as Event);
  });
  await act(async () => root.render(<Backstage open onClose={() => {}} onOpenSettings={() => {}} />));
  const importMenu = [...node.querySelectorAll<HTMLButtonElement>('.backstage-item')]
    .find(b => b.querySelector('.backstage-item-label')?.textContent === i18next.t('import', { ns: 'backstage' }))!;
  await act(async () => importMenu.click());
}
const group = (key: string) => node.querySelector<HTMLElement>(`[data-import-group="${key}"]`)!;
const buttonWith = (scope: ParentNode, text: string) => [...scope.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.includes(text))!;

it('the import panel says what a file becomes: new estimate, the open estimate, price library or other', async () => {
  await openImport();
  expect([...node.querySelectorAll('[data-import-group] h3')].map(h => h.textContent)).toEqual(['New estimate', 'Into the open estimate', 'Price library', 'Other']);
  expect(group('estimate').textContent).toContain('Excel / CSV');
  expect(group('estimate').textContent).toContain('FIEBDC-3 (.bc3)');
  expect(group('open').textContent).toContain('GAEB offer (.x84)');
  const library = group('library');
  expect(library.querySelector('[data-library-import]')?.textContent).toContain('Price list (Excel / CSV / JSON)');
  expect(library.textContent).toContain('Price list (ZSX)');
  expect(library.textContent).toContain('Price catalog (BMEcat/DICO)');
  expect(library.textContent).toContain('Does not create an estimate.');
  expect(group('other').textContent).toContain('Norms (NSX)');
});

it('a price list opened via Excel / CSV offers the price library instead, with the same file', async () => {
  const before = useAppStore.getState().items;
  await openImport(new File(['Code;Omschrijving;Eenheid;Prijs\nA-1;Mortel;kg;0,40\nA-2;Steen;st;0,85\n'], 'leverancier.csv', { type: 'text/csv' }));
  await act(async () => buttonWith(group('estimate'), 'Excel / CSV').click());
  const hint = await vi.waitFor(() => { const el = document.querySelector<HTMLElement>('.cmd-suggestion'); expect(el).not.toBeNull(); return el!; });
  expect(hint.textContent).toContain('This looks like a price list: codes and prices, no quantities.');
  vi.spyOn(window, 'alert').mockImplementation(() => {});
  await act(async () => buttonWith(hint, 'Import as price library instead').click());
  // The library column preview opens with the same table; confirm it.
  const confirm = await vi.waitFor(() => {
    const dialogs = document.querySelectorAll('.column-mapping-dialog');
    expect(dialogs).toHaveLength(1);
    expect(dialogs[0].textContent).toContain('leverancier.csv');
    return dialogs[0].querySelector<HTMLButtonElement>('.cmd-btn-primary')!;
  });
  await act(async () => confirm.click());
  await vi.waitFor(() => expect(listOwnLibraries()).toHaveLength(1));
  expect(listOwnLibraries()[0]).toMatchObject({ id: 'leverancier', origin: 'table', count: 2 });
  expect(activeLibrariesOf(useAppStore.getState().schedule)).toContain('own:leverancier');
  await vi.waitFor(() => expect(useAppStore.getState().resourcePickerNotice).toContain('“leverancier” imported: 2 resources.'));
  // No estimate was made from it.
  expect(newFile).not.toHaveBeenCalled();
  expect(useAppStore.getState().items).toBe(before);
});

it('Price library → Price list goes straight to the file, the column preview and the library', async () => {
  const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
  const before = useAppStore.getState().items;
  await openImport(new File(['Code;Omschrijving;Eenheid;Prijs\nA-1;Mortel;kg;0,40\nA-2;Steen;st;0,85\n'], 'leverancier.csv', { type: 'text/csv' }));
  await act(async () => group('library').querySelector<HTMLButtonElement>('[data-library-import]')!.click());
  // Not the library dialog: the column preview for this file.
  expect(useAppStore.getState().resourcePickerOpen).toBeFalsy();
  const confirm = await vi.waitFor(() => {
    const dialog = document.querySelector('.column-mapping-dialog');
    expect(dialog?.textContent).toContain('leverancier.csv');
    return dialog!.querySelector<HTMLButtonElement>('.cmd-btn-primary')!;
  });
  await act(async () => confirm.click());
  await vi.waitFor(() => expect(listOwnLibraries()).toHaveLength(1));
  expect(listOwnLibraries()[0]).toMatchObject({ id: 'leverancier', origin: 'table', count: 2 });
  expect(activeLibrariesOf(useAppStore.getState().schedule)).toContain('own:leverancier');
  // Afterwards the library dialog opens and says what was imported.
  await vi.waitFor(() => expect(useAppStore.getState().resourcePickerOpen).toBe(true));
  expect(useAppStore.getState().resourcePickerNotice).toContain('“leverancier” imported: 2 resources.');
  expect(alert).not.toHaveBeenCalled();
  expect(newFile).not.toHaveBeenCalled();
  expect(useAppStore.getState().items).toBe(before);
});

it('an estimate via Excel / CSV gets no price-list hint', async () => {
  await openImport(new File(['Code;Omschrijving;Eenheid;Hoeveelheid;Prijs\nA-1;Metselwerk;m2;12;45\n'], 'begroting.csv', { type: 'text/csv' }));
  await act(async () => buttonWith(group('estimate'), 'Excel / CSV').click());
  await vi.waitFor(() => expect(document.querySelector('.column-mapping-dialog')).not.toBeNull());
  expect(document.querySelector('.cmd-suggestion')).toBeNull();
});

it('Backstage → Import → ZSX keeps the price list as an own library and switches it on', async () => {
  const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
  // The ZSX file is named .xml: it must still be read as ZSX.
  await openImport(new File([zsx], 'leverancier.xml', { type: 'text/xml' }));
  await act(async () => buttonWith(group('library'), 'Price list (ZSX)').click());
  await vi.waitFor(() => expect(listOwnLibraries()).toHaveLength(1));

  const [library] = listOwnLibraries();
  // Read as ZSX although the file is .xml, and the name the user sees is the real file name.
  expect(library).toMatchObject({ id: 'leverancier', origin: 'zsx', fileName: 'leverancier.xml', count: 2 });
  expect(activeLibrariesOf(useAppStore.getState().schedule)).toEqual(['country', 'own:leverancier']);
  await vi.waitFor(() => expect(useAppStore.getState().resourceLibrary.map(i => i.id)).toContain('leverancier:A001'));
  expect(useAppStore.getState().resourcePickerOpen).toBe(true);
  expect(useAppStore.getState().resourcePickerNotice).toContain('“leverancier” imported: 2 resources.');
  expect(alert).not.toHaveBeenCalled();
});

it('the library dialog shows the import message it was opened with, and not the next time', async () => {
  // jsdom has no scrollIntoView; the picker scrolls its selected row into view.
  const scroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
  onTestFinished(() => { if (scroll) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', scroll); else delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView; });
  useAppStore.getState().openResourcePicker(null, '“leverancier” imported: 2 resources.');
  await act(async () => root.render(<ResourcePicker />));
  expect(node.querySelector('.rp-banners')?.textContent).toContain('“leverancier” imported: 2 resources.');
  await act(async () => useAppStore.getState().closeResourcePicker());
  await act(async () => useAppStore.getState().openResourcePicker(null));
  expect(node.querySelector('.rp-banners')?.textContent ?? '').not.toContain('imported');
});
