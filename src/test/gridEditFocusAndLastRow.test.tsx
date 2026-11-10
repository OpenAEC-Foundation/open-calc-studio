// knownbugs 44: na een celbewerking via het toetsenbord (Enter, Tab, Esc,
// pijltje) moet de focus terug naar het grid, anders werken pijltjes,
// Ctrl+C/X/V en Delete pas weer na een muisklik. Wegklikken naar een ander
// veld mag de focus NIET terugpakken.
// knownbugs 21: op de laatste rij mogen Enter, Tab en Pijl omlaag niet voorbij
// het einde gaan (actieve rij buiten bereik, bewerkmodus zonder editor).
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CostGrid } from '@/components/grid/CostGrid';
import { getColumnsForView, isCellEditable } from '@/components/grid/gridConstants';
import { useAppStore } from '@/state/appStore';
import type { CostItem } from '@/types/costModel';
import i18next from '@/i18n/config';

function mkItem(partial: Partial<CostItem> & { id: string }): CostItem {
  return {
    parentId: null, sortOrder: 0, code: '', description: '', unit: 'st', quantity: null,
    materialPrice: null, laborPrice: null, unitPrice: 0, total: 0, isCollapsed: false, depth: 0,
    notes: '', ifcGuid: '', rowType: 'regel', staartPercentage: null, nr: '',
    normQuantity: null, normFactor: null, normDivisor: null, normUnitPrice: null,
    resourceType: null, resourceLibraryId: null, verrekenbaar: null, tariefGroep: null,
    ...partial,
  } as CostItem;
}

const columns = getColumnsForView('st', false);
const colOf = (key: string) => columns.findIndex((c) => c.key === key);
const editableRegelCols = columns
  .map((c, i) => ({ key: c.key, i }))
  .filter((c) => isCellEditable(c.key, 'regel', 'st'));
const lastEditableRegelCol = editableRegelCols[editableRegelCols.length - 1].i;

let node: HTMLDivElement, root: Root;
const s = () => useAppStore.getState();

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18next.changeLanguage('en');
  useAppStore.setState({
    gridView: 'st',
    viewportHeight: 600,
    scrollTop: 0,
    schedule: { ...s().schedule, branchesEnabled: false },
    items: [
      mkItem({ id: 'h1', rowType: 'chapter', description: 'Chapter', sortOrder: 0 }),
      mkItem({ id: 'a', parentId: 'h1', depth: 1, description: 'Beton', quantity: 7, sortOrder: 0 }),
      mkItem({ id: 'b', parentId: 'h1', depth: 1, description: 'Staal', quantity: 3, sortOrder: 1 }),
      mkItem({ id: 't', parentId: 'h1', rowType: 'tekstregel', depth: 1, description: 'Toelichting', sortOrder: 2 }),
    ],
  } as never);
  node = document.createElement('div'); document.body.append(node); root = createRoot(node);
  await act(async () => root.render(<CostGrid />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  node.remove();
  document.body.innerHTML = '';
});

const gridEl = () => node.querySelector<HTMLElement>('.cost-grid')!;
const editor = () => node.querySelector<HTMLElement>('.grid-cell-editor');
const nextFrame = () => act(async () => { await new Promise((r) => requestAnimationFrame(() => r(null))); });
const twoFrames = async () => { await nextFrame(); await nextFrame(); };

async function startEditAt(row: number, col: number) {
  await act(async () => { s().setActiveCell(row, col); s().startEditing(); });
  const el = editor();
  expect(el).not.toBeNull();
  return el!;
}

const press = (el: Element, key: string, init: KeyboardEventInit = {}) =>
  act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })); });

describe('knownbugs 44: focus returns to the grid after a keyboard edit', () => {
  it('Enter: the grid has focus and ArrowDown moves on', async () => {
    const input = await startEditAt(1, colOf('description'));
    expect(document.activeElement).toBe(input);
    await press(input, 'Enter');
    await twoFrames();
    expect(s().isEditing).toBe(false);
    expect(s().activeRow).toBe(2);
    expect(document.activeElement).toBe(gridEl());
    // De volgende toets komt dus echt bij het grid aan.
    await press(document.activeElement!, 'ArrowUp');
    expect(s().activeRow).toBe(1);
  });

  it('Escape: the grid has focus', async () => {
    const input = await startEditAt(1, colOf('quantity'));
    await press(input, 'Escape');
    await twoFrames();
    expect(s().isEditing).toBe(false);
    expect(document.activeElement).toBe(gridEl());
  });

  it('Tab: the editor of the next cell has focus (not body)', async () => {
    const input = await startEditAt(1, colOf('description'));
    await press(input, 'Tab');
    await twoFrames();
    expect(document.activeElement).not.toBe(document.body);
    expect(gridEl().contains(document.activeElement)).toBe(true);
  });

  it('Escape in a select editor: the grid has focus', async () => {
    const sel = await startEditAt(1, colOf('unit'));
    expect(sel.tagName).toBe('SELECT');
    await press(sel, 'Escape');
    await twoFrames();
    expect(document.activeElement).toBe(gridEl());
  });

  it('Escape in a text-line editor (textarea): the grid has focus', async () => {
    const ta = await startEditAt(3, colOf('description'));
    expect(ta.tagName).toBe('TEXTAREA');
    await press(ta, 'Escape');
    await twoFrames();
    expect(document.activeElement).toBe(gridEl());
  });

  it('clicking into another field does not steal focus back', async () => {
    const other = document.createElement('input');
    document.body.append(other);
    await startEditAt(1, colOf('description'));
    await act(async () => { other.focus(); });
    await twoFrames();
    expect(s().isEditing).toBe(false);
    expect(document.activeElement).toBe(other);
  });
});

describe('knownbugs 21: the last row is a hard end', () => {
  const lastRow = 3; // h1, a, b, t

  it('Enter on the last row stays on the last row and leaves edit mode', async () => {
    const ta = await startEditAt(lastRow, colOf('description'));
    await press(ta, 'Enter');
    await twoFrames();
    expect(s().activeRow).toBe(lastRow);
    expect(s().activeItemId).toBe('t');
    expect(s().isEditing).toBe(false);
    expect(document.activeElement).toBe(gridEl());
  });

  it('Enter in an input on the last row stays on that row', async () => {
    // Zonder tekstregel: b is dan de laatste rij.
    await act(async () => useAppStore.setState({ items: s().items.filter((i) => i.id !== 't') }));
    const input = await startEditAt(2, colOf('quantity'));
    await press(input, 'Enter');
    await twoFrames();
    expect(s().activeRow).toBe(2);
    expect(s().activeItemId).toBe('b');
    expect(s().isEditing).toBe(false);
  });

  it('ArrowDown on the last row does not move past the end', async () => {
    await act(async () => useAppStore.setState({ items: s().items.filter((i) => i.id !== 't') }));
    const input = await startEditAt(2, colOf('quantity'));
    await press(input, 'ArrowDown');
    await twoFrames();
    expect(s().activeRow).toBe(2);
    expect(s().activeItemId).toBe('b');
    // Geen "bewerken zonder editor" meer: of de editor staat er nog, of er
    // wordt niet meer bewerkt.
    expect(s().isEditing ? editor() !== null : true).toBe(true);
  });

  it('Tab on the last editable cell of the last row stays there and leaves edit mode', async () => {
    await act(async () => useAppStore.setState({ items: s().items.filter((i) => i.id !== 't') }));
    const el = await startEditAt(2, lastEditableRegelCol);
    await press(el, 'Tab');
    await twoFrames();
    expect(s().activeRow).toBe(2);
    expect(s().activeCol).toBe(lastEditableRegelCol);
    expect(s().activeItemId).toBe('b');
    expect(s().isEditing).toBe(false);
    expect(document.activeElement).toBe(gridEl());
  });
});
