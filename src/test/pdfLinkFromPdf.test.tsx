import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PdfViewer } from '@/components/viewers/PdfViewer';
import { useAppStore } from '@/state/appStore';
import { createDefaultItems } from '@/data/defaultBudget';
import i18next from '@/i18n/config';
import type { PdfSource } from '@/types/pdfWorkspace';

// Linking a measurement to an estimate row from the PDF side (measurement list → "Link to estimate row…").
vi.mock('pdfjs-dist', () => ({ GlobalWorkerOptions: { workerSrc: '' }, getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => ({ getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }), render: () => ({ promise: Promise.resolve(), cancel: () => {} }) }) }), destroy: async () => {} }) }));

const initial = useAppStore.getState();
let root: Root, node: HTMLDivElement;
let wall: string, floor: string, roof: string, post: string;
const source: PdfSource = { id: 'pdf', fileName: 'plan.pdf', dataBase64: 'JVBERi0=', pageScales: { '1': 10 }, measurements: [
  { id: 'm-area', label: 'Ground floor', page: 1, type: 'area', value: 12.5, mmPerPoint: 10, origin: 'open-calc-studio', points: [] },
  { id: 'm-len', label: 'Facade', page: 1, type: 'length', value: 7.25, mmPerPoint: 10, origin: 'open-calc-studio', points: [] },
] };
const tr = (key: string) => i18next.t('workspace.' + key, { defaultValue: i18next.t(key) });
const item = (id: string) => useAppStore.getState().items.find(i => i.id === id)!;
const dialog = () => document.querySelector<HTMLElement>('[role=dialog]');
const options = () => [...document.querySelectorAll<HTMLElement>('[role=option]')];
const option = (text: string) => options().find(o => o.textContent?.includes(text));
const search = () => dialog()!.querySelector<HTMLInputElement>('input[role=combobox]')!;
const linkButtons = () => [...node.querySelectorAll<HTMLButtonElement>('button')].filter(b => b.getAttribute('aria-label') === tr('pdf.linkToRow'));
const rowOf = (label: string) => [...node.querySelectorAll<HTMLElement>('.pdf-ws-row')].find(r => r.textContent?.includes(label))!;

async function render(readOnly = false) { await act(async () => root.render(<PdfViewer readOnly={readOnly} />)); }
async function openPicker(index = 0) { await act(async () => linkButtons()[index].click()); expect(dialog()).toBeTruthy(); }
async function type(text: string) {
  const input = search();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function key(name: string, target: EventTarget = search()) {
  await act(async () => target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true })));
}

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18next.changeLanguage('en');
  useAppStore.setState(initial, true);
  const s = useAppStore.getState();
  s.addDocument({ id: 'link-from-pdf', items: createDefaultItems() });
  const chapter = s.addChapter(null);
  s.updateItem(chapter, 'description', 'Shell');
  post = s.addItem(chapter);
  s.updateItem(post, 'description', 'Masonry');
  wall = s.addRegel(post); s.updateItem(wall, 'description', 'Brick wall'); s.updateItem(wall, 'unit', 'st'); s.updateItem(wall, 'quantity', 3);
  floor = s.addRegel(post); s.updateItem(floor, 'description', 'Floor screed');
  roof = s.addRegel(post); s.updateItem(roof, 'description', 'Roof tiles');
  s.setSchedule({ pdfWorkspace: { version: 1, activeSourceId: source.id, sources: [structuredClone(source)] } });
  useAppStore.setState({ undoStack: [], redoStack: [], activeItemId: null });
  node = document.createElement('div'); document.body.append(node); root = createRoot(node);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(new Proxy({}, { get: () => () => {} }) as unknown as CanvasRenderingContext2D); // every drawing call is a no-op
});
afterEach(async () => { await act(async () => root.unmount()); node.remove(); vi.restoreAllMocks(); });

it('the link button opens a labelled modal picker with focus in the search box', async () => {
  await render();
  expect(linkButtons()).toHaveLength(2);
  await openPicker();
  const d = dialog()!;
  expect(d.getAttribute('aria-modal')).toBe('true');
  expect(document.getElementById(d.getAttribute('aria-labelledby')!)?.textContent).toBe(tr('pdf.linkTitle'));
  expect(d.textContent).toContain('Ground floor');
  expect(d.textContent).toContain('m²');
  expect(document.activeElement).toBe(search());
  // Only rows that can take a quantity: the post and its three lines, no chapter or surcharge rows.
  expect(options().map(o => o.querySelector('.pdf-link-desc')?.textContent)).toEqual(['Masonry', 'Brick wall', 'Floor screed', 'Roof tiles']);
  expect(option('Brick wall')!.querySelector('.pdf-link-chapter')?.textContent).toContain('Shell');
});

it('the search box filters on description', async () => {
  await render();
  await openPicker();
  const before = options().length;
  await type('screed');
  expect(options()).toHaveLength(1);
  expect(options()[0].textContent).toContain('Floor screed');
  await type('nothing like this');
  expect(options()).toHaveLength(0);
  expect(dialog()!.textContent).toContain(tr('pdf.linkNoMatch'));
  await type('');
  expect(options()).toHaveLength(before);
});

it('choosing a row sets quantity, unit and link in one undo step and closes the picker', async () => {
  await render();
  await openPicker(); // Ground floor, area 12.5
  await act(async () => option('Brick wall')!.click());
  expect(dialog()).toBeNull();
  expect(item(wall)).toMatchObject({ quantity: 12.5, unit: 'm²', quantityLink: { source: 'pdf', measurementId: 'm-area', kind: 'area' } });
  expect(useAppStore.getState().undoStack).toHaveLength(1);
  expect(useAppStore.getState().documents[0].isModified).toBe(true);
  const restored = useAppStore.getState().undo();
  if (restored) useAppStore.getState().setItems(restored);
  expect(item(wall)).toMatchObject({ quantity: 3, unit: 'st' });
  expect(item(wall).quantityLink ?? null).toBeNull();
});

it('starts on the row selected in the grid; arrows move and Enter links; Escape closes without linking', async () => {
  useAppStore.setState({ activeItemId: floor });
  await render();
  await openPicker(1); // Facade, length 7.25
  expect(options().find(o => o.getAttribute('aria-selected') === 'true')?.textContent).toContain('Floor screed');
  await key('Escape');
  expect(dialog()).toBeNull();
  expect(item(floor).quantityLink ?? null).toBeNull();
  await openPicker(1);
  await key('ArrowDown');
  expect(options().find(o => o.getAttribute('aria-selected') === 'true')?.textContent).toContain('Roof tiles');
  await key('Enter');
  expect(dialog()).toBeNull();
  expect(item(roof)).toMatchObject({ quantity: 7.25, unit: 'm', quantityLink: { source: 'pdf', measurementId: 'm-len', kind: 'length' } });
});

it('shows which rows are linked to a measurement, max two then +n, and marks them in the picker', async () => {
  const s = useAppStore.getState();
  for (const id of [wall, floor, roof]) s.updateItem(id, 'quantityLink', { source: 'pdf', measurementId: 'm-area', kind: 'area' });
  await render();
  const links = rowOf('Ground floor').querySelector('.pdf-ws-row-links')!;
  expect(links.textContent).toContain('Brick wall');
  expect(links.textContent).toContain('Floor screed');
  expect(links.textContent).not.toContain('Roof tiles');
  expect(links.textContent).toContain('+1');
  expect(links.getAttribute('title')).toContain('Roof tiles');
  expect(rowOf('Facade').querySelector('.pdf-ws-row-links')).toBeNull();
  await openPicker();
  expect(option('Brick wall')!.textContent).toContain(tr('pdf.linked'));
  expect(option('Masonry')!.textContent).not.toContain(tr('pdf.linked'));
});

it('read-only view shows the linked rows but no link button', async () => {
  useAppStore.getState().updateItem(wall, 'quantityLink', { source: 'pdf', measurementId: 'm-len', kind: 'length' });
  await render(true);
  expect(linkButtons()).toHaveLength(0);
  expect(rowOf('Facade').querySelector('.pdf-ws-row-links')?.textContent).toContain('Brick wall');
});
