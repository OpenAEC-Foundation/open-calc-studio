// knownbugs 19 / issue #66 punt 3: begin je in een cel met typen, dan is de
// getypte toets de begintekst van de editor. Eén teken typen en dan Enter,
// Tab of wegklikken moet die waarde opslaan, ook als het maar één teken is.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GridCellEditor } from '@/components/grid/GridCellEditor';
import { getColumnsForView } from '@/components/grid/gridConstants';
import { useAppStore } from '@/state/appStore';
import type { CostItem } from '@/types/costModel';
import i18next from '@/i18n/config';

let node: HTMLDivElement, root: Root;
beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18next.changeLanguage('en');
  useAppStore.setState({ gridView: 'st', schedule: { ...useAppStore.getState().schedule, branchesEnabled: false } });
  node = document.createElement('div'); document.body.append(node); root = createRoot(node);
});
afterEach(async () => { await act(async () => root.unmount()); node.remove(); });

const item = { id: 'r1', rowType: 'regel', depth: 1, description: 'Beton', quantity: 7, unit: 'm3' } as unknown as CostItem;
const colIndex = (key: string) => getColumnsForView('st', false).findIndex(c => c.key === key);

async function typeOneKey(key: string, typed: string) {
  const onCommit = vi.fn();
  // Zoals useGridNavigation doet bij een gewone toets: startEditing(e.key).
  act(() => useAppStore.getState().startEditing(typed));
  await act(async () => root.render(<GridCellEditor item={item} colIndex={colIndex(key)} style={{}} onCommit={onCommit} />));
  const input = node.querySelector<HTMLInputElement>('input.grid-cell-editor')!;
  expect(input.value).toBe(typed);
  return { input, onCommit };
}

const press = (el: HTMLElement, key: string) =>
  act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); });

for (const [key, typed] of [['quantity', '5'], ['description', 'X']] as const) {
  it(`${key}: one typed character + Enter is stored`, async () => {
    const { input, onCommit } = await typeOneKey(key, typed);
    press(input, 'Enter');
    expect(onCommit).toHaveBeenCalledWith(item, colIndex(key), typed);
  });

  it(`${key}: one typed character + Tab is stored`, async () => {
    const { input, onCommit } = await typeOneKey(key, typed);
    press(input, 'Tab');
    expect(onCommit).toHaveBeenCalledWith(item, colIndex(key), typed);
  });

  it(`${key}: one typed character + clicking away is stored`, async () => {
    const { input, onCommit } = await typeOneKey(key, typed);
    act(() => input.blur());
    expect(onCommit).toHaveBeenCalledWith(item, colIndex(key), typed);
  });
}

it('opening the editor without typing and leaving it does not rewrite the value', async () => {
  const onCommit = vi.fn();
  act(() => useAppStore.getState().startEditing());
  await act(async () => root.render(<GridCellEditor item={item} colIndex={colIndex('quantity')} style={{}} onCommit={onCommit} />));
  const input = node.querySelector<HTMLInputElement>('input.grid-cell-editor')!;
  expect(input.value).toBe('7');
  press(input, 'Enter');
  expect(onCommit).not.toHaveBeenCalled();
});

it('typing the same value the cell already holds commits nothing', async () => {
  const { input, onCommit } = await typeOneKey('quantity', '7');
  press(input, 'Enter');
  expect(onCommit).not.toHaveBeenCalled();
});
