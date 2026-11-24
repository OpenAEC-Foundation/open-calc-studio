import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Backstage from '@/components/backstage/Backstage';
import { useAppStore } from '@/state/appStore';
import i18next from '@/i18n/config';
import { createDefaultSchedule } from '@/data/defaultBudget';
import { listOwnLibraries, loadOwnLibraries, memoryBackend, setOwnLibraryBackend } from '@/services/pricing/ownLibraries';
import { activeLibrariesOf, builtInLibraryItems } from '@/services/pricing/priceLibraries';

// A ZSX price list from Backstage → Import becomes an own price library, like
// BMEcat (#104), instead of being merged by code into the loaded library.

vi.mock('@/hooks/useFileOperations', () => ({ useFileOperations: () => ({ newFile: vi.fn(), saveFile: vi.fn(), saveFileAs: vi.fn(), openFile: vi.fn(), openRecentFile: vi.fn() }) }));

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
    resourceLibrary: builtInLibraryItems('NL'),
  });
  node = document.createElement('div');
  document.body.appendChild(node);
  root = createRoot(node);
});
afterEach(async () => {
  await act(async () => root.unmount());
  node.remove();
  vi.restoreAllMocks();
  setOwnLibraryBackend(memoryBackend());
});

it('Backstage → Import → ZSX keeps the price list as an own library and switches it on', async () => {
  const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
  // The file dialog: hand the ZSX file (named .xml) to the input the button creates.
  vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (this: HTMLInputElement) {
    Object.defineProperty(this, 'files', { value: [new File([zsx], 'leverancier.xml', { type: 'text/xml' })] });
    this.onchange?.({ target: this } as unknown as Event);
  });
  await act(async () => root.render(<Backstage open onClose={() => {}} onOpenSettings={() => {}} />));
  const importMenu = [...node.querySelectorAll<HTMLButtonElement>('.backstage-item')]
    .find(b => b.querySelector('.backstage-item-label')?.textContent === i18next.t('import', { ns: 'backstage' }))!;
  await act(async () => importMenu.click());
  const zsxButton = [...node.querySelectorAll<HTMLButtonElement>('.bs-panel-option')]
    .find(b => b.textContent?.includes(i18next.t('importPanel.zsxTitle', { ns: 'backstage' })))!;
  await act(async () => zsxButton.click());
  await vi.waitFor(() => expect(listOwnLibraries()).toHaveLength(1));

  const [library] = listOwnLibraries();
  // Read as ZSX although the file is .xml, and the name the user sees is the real file name.
  expect(library).toMatchObject({ id: 'leverancier', origin: 'zsx', fileName: 'leverancier.xml', count: 2 });
  expect(activeLibrariesOf(useAppStore.getState().schedule)).toEqual(['country', 'own:leverancier']);
  await vi.waitFor(() => expect(useAppStore.getState().resourceLibrary.map(i => i.id)).toContain('leverancier:A001'));
  expect(alert).toHaveBeenCalledWith(expect.stringContaining('“leverancier” imported: 2 resources.'));
});
