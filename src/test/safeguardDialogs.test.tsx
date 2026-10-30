import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useAppStore } from '@/state/appStore';
import { PriceUpdateDialog } from '@/components/library/PriceUpdateDialog';
import { ResourcePicker } from '@/components/library/ResourcePicker';
import { RevisionDialog } from '@/components/common/RevisionDialog';
import { parseLibraryJson } from '@/state/slices/resourceLibrarySlice';
import { capturePriceOrigin } from '@/services/pricing/priceUpdates';
import { changeLanguage } from '@/i18n/config';
const initial = useAppStore.getState();
let container: HTMLDivElement, root: ReturnType<typeof createRoot>;
beforeEach(async () => {
  await changeLanguage('en'); useAppStore.setState(initial, true);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
it('reviews catalogue changes through the dialog and applies only checked rows', async () => {
  const s = useAppStore.getState(); s.addDocument(); const chapter = s.addChapter(null), post = s.addItem(chapter), id = s.addRegel(post);
  const old = parseLibraryJson({ id: 'owned', version: 1, currency: 'EUR', resources: [{ id: 'A', unit: 'st', description: 'Brick', defaultUnitPrice: 10 }] })[0];
  s.updateItem(id, 'description', 'Brick'); s.updateItem(id, 'normUnitPrice', 10);
  useAppStore.setState(s => ({ items: s.items.map(item => item.id === id ? { ...item, priceOrigin: capturePriceOrigin(old, 'EUR'), resourceLibraryId: old.id } : item) }));
  s.setResourceLibrary([{ ...old, catalogueVersion: '2', defaultUnitPrice: 12 }]);
  await act(async () => root.render(<PriceUpdateDialog />));
  const button = (text: string) => [...container.querySelectorAll('button')].find(b => b.textContent === text)!;
  await act(async () => button('Compare loaded catalogue').click());
  expect(button('Apply selected prices').disabled).toBe(true);
  await act(async () => container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
  expect(button('Apply selected prices').disabled).toBe(false);
  await act(async () => button('Apply selected prices').click());
  expect(useAppStore.getState().items.find(item => item.id === id)?.normUnitPrice).toBe(12);
});
it('source revision dialog is keyboard dismissible and does not edit an estimate', async () => {
  const s = useAppStore.getState(); s.addDocument(); s.openDialog('revisions');
  const items = useAppStore.getState().items;
  await act(async () => root.render(<RevisionDialog />));
  expect(container.querySelector('[role="dialog"]')!.contains(document.activeElement)).toBe(true);
  await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(useAppStore.getState().activeDialog).toBeNull(); expect(useAppStore.getState().items).toBe(items);
});
it('an unpriced catalogue labour resource cannot silently inherit a bureau tariff', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
  try {
    const s = useAppStore.getState(); s.addDocument(); const chapter = s.addChapter(null), post = s.addItem(chapter);
    s.setResourceLibrary(parseLibraryJson({ id: 'unpriced', currency: 'EUR', resources: [{ id: 'labour', description: 'Unpriced labour', unit: 'uur', resourceType: 'arbeid', defaultUnitPrice: null }] }));
    s.openResourcePicker(post); await act(async () => root.render(<ResourcePicker />));
    await act(async () => container.querySelector<HTMLButtonElement>('.resource-picker-add-btn')!.click());
    const row = useAppStore.getState().items.find(item => item.rowType === 'regel')!;
    expect(row.tariefGroep).toBeNull(); expect(row.normUnitPrice).toBeNull(); expect(row.priceOrigin).toBeUndefined();
  } finally {
    if (descriptor) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', descriptor);
    else delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  }
});
