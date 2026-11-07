import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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

// 21 > 21.10 > post1 > regel1 ; 22 > post2 ; 23 (leeg) ; staart btw
const items = (): CostItem[] => [
  mkItem({ id: 'h21', rowType: 'chapter', code: '21', description: 'Funderingen', sortOrder: 0 }),
  mkItem({ id: 'p2110', rowType: 'chapter', parentId: 'h21', depth: 1, code: '21.10', description: 'Grondwerk', sortOrder: 0 }),
  mkItem({ id: 'post1', rowType: 'begrotingspost', parentId: 'p2110', depth: 2, code: '01', description: 'Ontgraven', sortOrder: 0 }),
  mkItem({ id: 'regel1', rowType: 'regel', parentId: 'post1', depth: 3, description: 'Graafmachine', sortOrder: 0 }),
  mkItem({ id: 'h22', rowType: 'chapter', code: '22', description: 'Buitenwanden', sortOrder: 1 }),
  mkItem({ id: 'post2', rowType: 'begrotingspost', parentId: 'h22', depth: 1, code: '01', description: 'Metselwerk', sortOrder: 0 }),
  mkItem({ id: 'h23', rowType: 'chapter', code: '23', description: 'Vloeren', sortOrder: 2 }),
  mkItem({ id: 'btw', rowType: 'staart_btw', code: '', description: 'BTW', sortOrder: 3, staartPercentage: 21 }),
];

let node: HTMLDivElement, root: Root;
const state = () => useAppStore.getState();
const find = (id: string) => state().items.find((i) => i.id === id)!;
const byId = (id: string) => node.querySelector<HTMLElement>(`[data-tree-id="${id}"]`)!;
const topOrder = () => state().items.filter((i) => i.parentId === null).map((i) => i.id);
const treeOrder = () => [...node.querySelectorAll<HTMLElement>('[role=treeitem]')].map((el) => el.dataset.treeId);
const keyDown = (key: string, altKey = false) => act(async () => {
  node.querySelector('[role=tree]')!.dispatchEvent(new KeyboardEvent('keydown', { key, altKey, bubbles: true }));
});
const openMenu = (id: string) => act(async () => {
  byId(id).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 }));
});
const menuButtons = () => [...node.querySelectorAll<HTMLButtonElement>('[role=menuitem]')];
const moveTargets = async () => {
  const moveTo = menuButtons().find((b) => b.textContent?.includes(i18next.t('contextMenu.moveTo', { ns: 'grid' })))!;
  await act(async () => moveTo.click());
  return [...node.querySelectorAll<HTMLButtonElement>('[data-move-target]')];
};

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18next.changeLanguage('en');
  useAppStore.setState({ items: items(), activeItemId: null, activeRow: -1, activeContentTab: 'grid', undoStack: [], redoStack: [] });
  node = document.createElement('div'); document.body.append(node); root = createRoot(node);
  await act(async () => root.render(<SchedulePanel />));
});
afterEach(async () => { await act(async () => root.unmount()); node.remove(); });

describe('moving from the structure tree', () => {
  it('Alt+Down and Alt+Up swap a chapter with its sibling; codes stay as they are', async () => {
    await act(async () => byId('h21').click());
    await keyDown('ArrowDown', true);
    expect(topOrder()).toEqual(['h22', 'h21', 'h23', 'btw']);
    expect(treeOrder()).toEqual(['h22', 'post2', 'h21', 'p2110', 'post1', 'h23']);
    // Alles onder 21 is meegegaan; alleen de volgorde veranderde.
    expect(find('p2110').parentId).toBe('h21');
    expect(find('post1').parentId).toBe('p2110');
    expect(find('h21').code).toBe('21');
    expect(find('h22').code).toBe('22');
    expect(state().activeItemId).toBe('h21');

    await keyDown('ArrowUp', true);
    expect(topOrder()).toEqual(['h21', 'h22', 'h23', 'btw']);
  });

  it('the last chapter cannot move down past the tail rows; the first cannot move up', async () => {
    await act(async () => byId('h23').click());
    const before = state().items;
    await keyDown('ArrowDown', true);
    expect(state().items).toBe(before);
    expect(state().undoStack).toHaveLength(0);
    await openMenu('h23');
    const [up, down] = menuButtons();
    expect(up.disabled).toBe(false);
    expect(down.disabled).toBe(true);
  });

  it('"Move to..." puts an estimate item at the end of another chapter', async () => {
    await openMenu('post1');
    const targets = await moveTargets();
    expect(targets.map((b) => b.dataset.moveTarget)).toEqual(['h21', 'h22', 'h23']); // niet 21.10 (huidige ouder)
    await act(async () => targets.find((b) => b.dataset.moveTarget === 'h22')!.click());
    const post1 = find('post1');
    expect(post1.parentId).toBe('h22');
    expect(post1.depth).toBe(1);
    expect(find('regel1').parentId).toBe('post1');
    // Achteraan: na de bestaande post 01 Metselwerk.
    expect(state().items.filter((i) => i.parentId === 'h22').map((i) => i.id)).toEqual(['post2', 'post1']);
    expect(post1.code).toBe('01');
    expect(find('post2').code).toBe('01');
    expect(node.querySelector('[role=menu]')).toBeNull();
  });

  it('refuses a cycle: a chapter cannot be moved into itself or its own descendants', async () => {
    await openMenu('h21');
    const targets = await moveTargets();
    expect(targets.map((b) => b.dataset.moveTarget)).toEqual(['h22', 'h23']); // geen h21, geen 21.10
    const before = state().items;
    // Ook rechtstreeks via de store blijft het geweigerd.
    state().moveItems(['h21'], 'p2110', 'inside');
    expect(state().items).toEqual(before);
  });

  it('a move is one undo step', async () => {
    await act(async () => byId('h21').click());
    await keyDown('ArrowDown', true);
    expect(state().undoStack).toHaveLength(1);
    expect(topOrder()).toEqual(['h22', 'h21', 'h23', 'btw']);
    const restored = state().undo();
    expect(restored).not.toBeNull();
    await act(async () => state().setItems(restored!));
    expect(topOrder()).toEqual(['h21', 'h22', 'h23', 'btw']);
    expect(state().undoStack).toHaveLength(0);
  });
});
