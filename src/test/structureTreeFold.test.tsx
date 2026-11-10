import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SchedulePanel } from '@/components/panels/SchedulePanel';
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

// h21 > post1 > regel1
// h22 > postT (alleen een tekstregel eronder) > tekst1
// h23 (leeg)
const items = (): CostItem[] => [
  mkItem({ id: 'h21', rowType: 'chapter', code: '21', description: 'Funderingen', sortOrder: 0 }),
  mkItem({ id: 'post1', rowType: 'begrotingspost', parentId: 'h21', depth: 1, code: '01', description: 'Ontgraven', sortOrder: 0 }),
  mkItem({ id: 'regel1', rowType: 'regel', parentId: 'post1', depth: 2, description: 'Graafmachine', sortOrder: 0 }),
  mkItem({ id: 'h22', rowType: 'chapter', code: '22', description: 'Buitenwanden', sortOrder: 1 }),
  mkItem({ id: 'postT', rowType: 'begrotingspost', parentId: 'h22', depth: 1, code: '01', description: 'Tekstpost', sortOrder: 0 }),
  mkItem({ id: 'tekst1', rowType: 'tekstregel', parentId: 'postT', depth: 2, description: 'Werkomschrijving', sortOrder: 0 }),
  mkItem({ id: 'h23', rowType: 'chapter', code: '23', description: 'Vloeren', sortOrder: 2 }),
  mkItem({ id: 'btw', rowType: 'staart_btw', description: 'BTW', sortOrder: 3, staartPercentage: 21 }),
];

const ROW = 20;
let node: HTMLDivElement, root: Root, originalRect: typeof Element.prototype.getBoundingClientRect;
const state = () => useAppStore.getState();
const find = (id: string) => state().items.find((i) => i.id === id)!;
const rows = () => [...node.querySelectorAll<HTMLElement>('[role=treeitem]')];
const treeOrder = () => rows().map((r) => r.dataset.treeId);
const byId = (id: string) => node.querySelector<HTMLElement>(`[data-tree-id="${id}"]`)!;
const gridHas = (id: string) => state().getGridRows().some((r) => r.id === id);
const rowTop = (id: string) => rows().indexOf(byId(id)) * ROW;
const keyDown = (key: string, altKey = false) => act(async () => {
  node.querySelector('[role=tree]')!.dispatchEvent(new KeyboardEvent('keydown', { key, altKey, bubbles: true }));
});
const pointer = (type: string, target: Element | Window, clientY: number, clientX = 50) => act(async () => {
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY, button: 0 }));
});
/** `y` als functie: pas ná het oppakken uitrekenen (de gesleepte rij staat dan dicht). */
const dragTo = async (id: string, yOrFn: number | (() => number)) => {
  await pointer('pointerdown', byId(id), rowTop(id) + ROW / 2);
  await pointer('pointermove', byId(id), rowTop(id) + ROW / 2, 60); // over de sleep-drempel
  const y = typeof yOrFn === 'function' ? yOrFn() : yOrFn;
  await pointer('pointermove', rows()[Math.floor(y / ROW)], y);
};
const release = () => pointer('pointerup', window, 0);
const undo = () => act(async () => { const restored = state().undo(); if (restored) state().setItems(restored); });

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18next.changeLanguage('en');
  localStorage.setItem('ocs.structureTree.depth', 'all');
  useAppStore.setState({
    items: items(), activeItemId: null, activeRow: -1, activeContentTab: 'grid', undoStack: [], redoStack: [],
    selectionStart: null, selectionEnd: null, cellSelectionStart: null, cellSelectionEnd: null,
  });
  node = document.createElement('div'); document.body.append(node); root = createRoot(node);
  await act(async () => root.render(<SchedulePanel />));
  originalRect = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (this: Element) {
    if ((this as HTMLElement).getAttribute?.('role') === 'tree') {
      return { top: 0, bottom: 400, height: 400, left: 0, right: 200, width: 200, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    }
    const i = rows().indexOf(this as HTMLElement);
    const top = i < 0 ? 0 : i * ROW, height = i < 0 ? 0 : ROW;
    return { top, bottom: top + height, height, left: 0, right: 200, width: 200, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
  };
  document.elementFromPoint = (_x: number, y: number) => rows()[Math.floor(y / ROW)] ?? null;
});
afterEach(async () => {
  vi.useRealTimers();
  Element.prototype.getBoundingClientRect = originalRect;
  delete (document as { elementFromPoint?: unknown }).elementFromPoint;
  await act(async () => root.unmount()); node.remove();
  localStorage.removeItem('ocs.structureTree.depth');
});

describe('a post with only text rows under it', () => {
  it('has a fold arrow and aria-expanded; the arrow folds the grid, the tree shows no text rows', async () => {
    expect(treeOrder()).toEqual(['h21', 'post1', 'regel1', 'h22', 'postT', 'h23']);
    const arrow = byId('postT').querySelector<HTMLButtonElement>('.grid-collapse-btn');
    expect(arrow).not.toBeNull();
    expect(byId('postT').getAttribute('aria-expanded')).toBe('true');
    expect(byId('h23').querySelector('.grid-collapse-btn')).toBeNull();
    await act(async () => arrow!.click());
    expect(find('postT').isCollapsed).toBe(true);
    expect(gridHas('tekst1')).toBe(false);
    expect(byId('postT').getAttribute('aria-expanded')).toBe('false');
  });

  it('← and → fold it; * opens everything below a chapter, also such a post', async () => {
    await act(async () => byId('postT').click());
    await keyDown('ArrowLeft');
    expect(find('postT').isCollapsed).toBe(true);
    await keyDown('ArrowRight');
    expect(find('postT').isCollapsed).toBe(false);

    await act(async () => useAppStore.setState({
      items: state().items.map((i) => (i.id === 'h22' || i.id === 'postT' ? { ...i, isCollapsed: true } : i)),
    }));
    await act(async () => byId('h22').click());
    await keyDown('*');
    expect(find('h22').isCollapsed).toBe(false);
    expect(find('postT').isCollapsed).toBe(false);
    expect(gridHas('tekst1')).toBe(true);
  });

  it('"collapse below" in the menu also folds such a post', async () => {
    await act(async () => {
      byId('h22').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 }));
    });
    await act(async () => node.querySelector<HTMLButtonElement>('[data-action="collapse-below"]')!.click());
    expect(find('h22').isCollapsed).toBe(true);
    expect(find('postT').isCollapsed).toBe(true);
  });

  it('collapsed, it counts as collapsed while dragging: no line previewed inside it', async () => {
    await act(async () => state().toggleCollapse('postT'));
    await dragTo('regel1', rowTop('postT') + ROW / 2);
    expect(byId('postT').classList.contains('drop-inside')).toBe(true);
    // Geen voorbeeld in de dichte post (die gaat er niet voor open).
    expect(treeOrder()).toEqual(['h21', 'post1', 'regel1', 'h22', 'postT', 'h23']);
    await release();
    expect(find('regel1').parentId).toBe('postT');
  });
});

describe('Alt+← / Alt+→', () => {
  it('only move (up/down); left/right do not fold', async () => {
    await act(async () => byId('post1').click());
    await keyDown('ArrowLeft', true);
    expect(find('post1').isCollapsed).toBe(false);
    await act(async () => state().toggleCollapse('post1'));
    await keyDown('ArrowRight', true);
    expect(find('post1').isCollapsed).toBe(true);
    expect(state().undoStack).toHaveLength(0);
  });
});

describe('folders opened while dragging', () => {
  it('stay open above the new place, and undo brings back the fold state from before the drag', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    // 22 en 23 dicht; 23 krijgt inhoud, zodat het echt dicht is.
    await act(async () => useAppStore.setState({
      items: [
        ...state().items.map((i) => (i.id === 'h22' || i.id === 'h23' ? { ...i, isCollapsed: true } : i)),
        mkItem({ id: 'post3', rowType: 'begrotingspost', parentId: 'h23', depth: 1, description: 'Vloer', sortOrder: 0 }),
      ],
    }));
    await dragTo('post1', () => rowTop('h22') + ROW / 2);
    await act(async () => { vi.advanceTimersByTime(650); });
    expect(find('h22').isCollapsed).toBe(false); // geopend door het slepen
    await pointer('pointermove', byId('h23'), rowTop('h23') + ROW / 2);
    await act(async () => { vi.advanceTimersByTime(650); });
    expect(find('h23').isCollapsed).toBe(false);
    await release();
    expect(find('post1').parentId).toBe('h23');
    expect(find('h23').isCollapsed).toBe(false); // daar landde het: blijft open
    expect(find('h22').isCollapsed).toBe(true); // alleen voor het slepen open: weer dicht
    expect(state().getGridRows()[state().activeRow]?.id).toBe('post1');

    await undo();
    expect(find('post1').parentId).toBe('h21');
    expect(find('h22').isCollapsed).toBe(true);
    expect(find('h23').isCollapsed).toBe(true); // zoals vóór het slepen
  });
});

describe('grid selection after folding', () => {
  const setRange = (start: number, end: number) => act(async () => useAppStore.setState({
    selectionStart: start, selectionEnd: end, cellSelectionStart: null, cellSelectionEnd: null,
  }));

  it('the grid fold arrow (store toggleCollapse) drops a row range and keeps the active row on its item', async () => {
    await act(async () => state().revealItem('h23'));
    const rowsBefore = state().getGridRows();
    await setRange(rowsBefore.findIndex((r) => r.id === 'h22'), rowsBefore.findIndex((r) => r.id === 'h23'));
    await act(async () => state().toggleCollapse('h21')); // rijen boven de selectie verdwijnen
    expect(state().selectionStart).toBeNull();
    expect(state().selectionEnd).toBeNull();
    expect(state().getSelectedRowIndices()).toEqual([state().activeRow]);
    expect(state().getGridRows()[state().activeRow]?.id).toBe('h23');
  });

  it('folding from the tree drops a row range too, even when the active row does not move', async () => {
    await act(async () => byId('h21').click());
    const rowsBefore = state().getGridRows();
    await setRange(rowsBefore.findIndex((r) => r.id === 'h21'), rowsBefore.findIndex((r) => r.id === 'h22'));
    await act(async () => byId('post1').querySelector<HTMLButtonElement>('.grid-collapse-btn')!.click());
    expect(state().selectionStart).toBeNull();
    expect(state().getGridRows()[state().activeRow]?.id).toBe('h21');

    await setRange(0, 3);
    await keyDown('*'); // alles onder 21 open (zonder toggleCollapse)
    expect(find('post1').isCollapsed).toBe(false);
    expect(state().selectionStart).toBeNull();
  });
});
