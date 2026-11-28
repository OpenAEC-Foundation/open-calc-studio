import { afterEach, beforeEach, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useAppStore } from '@/state/appStore';
import { SubSheetEditor } from '@/components/grid/SubSheetEditor';
import { setNumberFormatPreference } from '@/utils/formatting';

// knownbug 275: een deelbladcel met 1,234 (NL) kopiëren en terugplakken gaf
// 1234, omdat het klembord "1.234" kreeg (JS-notatie) en plakken dat in de
// notatie van de app leest.
const initial = useAppStore.getState();
let sheetId = '';
let clip = '';
let node: HTMLDivElement;
let root: Root;
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  useAppStore.setState(initial, true);
  setNumberFormatPreference('nl-NL');
  clip = '';
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: async (text: string) => { clip = text; },
      readText: async () => clip,
    },
  });
  sheetId = useAppStore.getState().addSubSheet('Klembord');
  node = document.createElement('div');
  document.body.append(node);
  root = createRoot(node);
});

afterEach(async () => {
  await act(async () => root.unmount());
  node.remove();
  setNumberFormatPreference(null);
  if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
  else delete (navigator as { clipboard?: unknown }).clipboard;
});

const cellEl = (ref: string) => {
  const col = ref.charCodeAt(0) - 65;
  const row = parseInt(ref.slice(1), 10);
  return node.querySelectorAll('tbody tr')[row - 1].querySelectorAll('td.subsheet-cell')[col] as HTMLElement;
};
const select = async (ref: string) => {
  await act(async () => cellEl(ref).dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })));
};
const key = async (k: string) => {
  const container = node.querySelector<HTMLElement>('.subsheet-container')!;
  await act(async () => {
    container.dispatchEvent(new KeyboardEvent('keydown', { key: k, ctrlKey: true, bubbles: true, cancelable: true }));
  });
};
const computed = (ref: string) =>
  useAppStore.getState().subSheets.find((s) => s.id === sheetId)!.cells[ref]?.computed;

it('kopieert een getal in de notatie van de app, zodat terugplakken dezelfde waarde geeft', async () => {
  useAppStore.getState().setSubSheetCell(sheetId, 'A1', '1,234');
  expect(computed('A1')).toBe(1.234);

  await act(async () => root.render(<SubSheetEditor sheetId={sheetId} />));
  await select('A1');
  await key('c');
  expect(clip).toBe('1,234');

  // Opnieuw openen (bv. via de begroting terug naar het blad): de interne
  // kopie is weg, plakken leest het klembord.
  await act(async () => root.unmount());
  root = createRoot(node);
  await act(async () => root.render(<SubSheetEditor sheetId={sheetId} />));
  await select('A2');
  await key('v');
  expect(computed('A2')).toBe(1.234);
});
