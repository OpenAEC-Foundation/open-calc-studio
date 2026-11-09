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

// 21 Funderingen > 21.10 Grondwerk > post Ontgraven > regel Graafmachine
// 22 Buitenwanden (dichtgeklapt) > post Metselwerk
// 23 Vloeren (leeg)
const items = (): CostItem[] => [
  mkItem({ id: 'h21', rowType: 'chapter', code: '21', description: 'Funderingen', sortOrder: 0 }),
  mkItem({ id: 'p2110', rowType: 'chapter', parentId: 'h21', depth: 1, code: '21.10', description: 'Grondwerk', sortOrder: 0 }),
  mkItem({ id: 'post1', rowType: 'begrotingspost', parentId: 'p2110', depth: 2, code: '21.10.01', description: 'Ontgraven', sortOrder: 0 }),
  mkItem({ id: 'regel1', rowType: 'regel', parentId: 'post1', depth: 3, description: 'Graafmachine', sortOrder: 0 }),
  mkItem({ id: 'h22', rowType: 'chapter', code: '22', description: 'Buitenwanden', sortOrder: 1, isCollapsed: true }),
  mkItem({ id: 'post2', rowType: 'begrotingspost', parentId: 'h22', depth: 1, code: '22.01', description: 'Metselwerk', sortOrder: 0 }),
  mkItem({ id: 'h23', rowType: 'chapter', code: '23', description: 'Vloeren', sortOrder: 2 }),
];

let node: HTMLDivElement, root: Root;
const treeItems = () => [...node.querySelectorAll<HTMLElement>('[role=treeitem]')];
const labels = () => treeItems().map((el) => el.textContent?.trim());
const byId = (id: string) => node.querySelector<HTMLElement>(`[data-tree-id="${id}"]`)!;
const keyDown = (key: string) => act(async () => {
  node.querySelector('[role=tree]')!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
});

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18next.changeLanguage('en');
  useAppStore.setState({ items: items(), activeItemId: null, activeRow: -1, activeContentTab: 'grid', showPropertiesPanel: false });
  localStorage.setItem('ocs.structureTree.depth', 'all'); // deze tests kijken tot op regelniveau
  node = document.createElement('div'); document.body.append(node); root = createRoot(node);
  await act(async () => root.render(<SchedulePanel />));
});
afterEach(async () => { await act(async () => root.unmount()); node.remove(); localStorage.removeItem('ocs.structureTree.depth'); });

const chooseDepth = (value: string) => act(async () => {
  const select = node.querySelector<HTMLSelectElement>('select.schedule-tree-depth')!;
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
});

describe('tree depth', () => {
  it('only changes how deep the tree looks, never the budget, and is remembered', async () => {
    const before = useAppStore.getState().items;
    await chooseDepth('post');
    expect(node.querySelector('[data-tree-id="regel1"]')).toBeNull();
    expect(byId('post1').querySelector('button')).not.toBeNull(); // pijltje blijft: klapt het raster
    await chooseDepth('chapter');
    expect(treeItems().map((el) => el.dataset.treeId)).toEqual(['h21', 'p2110', 'h22', 'h23']);
    expect(byId('p2110').querySelector('button')).not.toBeNull(); // inhoud zit dieper: pijltje voor het raster
    expect(useAppStore.getState().items).toBe(before); // niets in- of uitgeklapt
    expect(useAppStore.getState().getGridRows().some((r) => r.id === 'regel1')).toBe(true);
    expect(localStorage.getItem('ocs.structureTree.depth')).toBe('chapter');
  });

  it('a hidden line selected in the grid lights up its estimate item', async () => {
    await chooseDepth('post');
    const row = useAppStore.getState().getGridRows().findIndex((r) => r.id === 'regel1');
    await act(async () => useAppStore.getState().setActiveCell(row, 1, 'regel1'));
    expect(byId('post1').getAttribute('aria-selected')).toBe('true');
  });

  it('starts at estimate items when nothing is remembered', async () => {
    await act(async () => root.unmount());
    localStorage.removeItem('ocs.structureTree.depth');
    root = createRoot(node);
    await act(async () => root.render(<SchedulePanel />));
    expect(node.querySelector<HTMLSelectElement>('select.schedule-tree-depth')!.value).toBe('post');
    expect(node.querySelector('[data-tree-id="regel1"]')).toBeNull();
  });
});

describe('structure tree', () => {
  it('shows chapters, estimate items and their lines with code and description', () => {
    expect(labels()).toEqual(['21Funderingen', '21.10Grondwerk', '21.10.01Ontgraven', 'Graafmachine', '22Buitenwanden', '23Vloeren']);
    expect(byId('post1').title).toBe('21.10.01 Ontgraven');
    expect(byId('regel1').getAttribute('aria-level')).toBe('4');
    // Pijltje alleen bij rijen met inhoud in de boom.
    expect(byId('h21').querySelector('button')).not.toBeNull();
    expect(byId('h23').querySelector('button')).toBeNull();
    expect(byId('post1').querySelector('button')).not.toBeNull();
    expect(byId('regel1').querySelector('button')).toBeNull();
    expect(byId('h22').getAttribute('aria-expanded')).toBe('false');
  });

  it('collapsing an estimate item in the tree hides its lines in tree and grid, and the other way round', async () => {
    await act(async () => byId('post1').querySelector('button')!.click());
    expect(useAppStore.getState().items.find((i) => i.id === 'post1')!.isCollapsed).toBe(true);
    expect(node.querySelector('[data-tree-id="regel1"]')).toBeNull();
    expect(useAppStore.getState().getGridRows().some((r) => r.id === 'regel1')).toBe(false);

    await act(async () => useAppStore.getState().toggleCollapse('post1')); // pijltje in het raster
    expect(byId('regel1')).not.toBeNull();
  });

  it('expanding in the tree also expands the grid, and the other way round', async () => {
    await act(async () => byId('h22').querySelector('button')!.click());
    expect(useAppStore.getState().items.find((i) => i.id === 'h22')!.isCollapsed).toBe(false);
    expect(labels()).toContain('22.01Metselwerk');
    expect(useAppStore.getState().getGridRows().some((r) => r.id === 'post2')).toBe(true);

    await act(async () => useAppStore.getState().toggleCollapse('h21'));
    expect(labels()).toEqual(['21Funderingen', '22Buitenwanden', '22.01Metselwerk', '23Vloeren']);
  });

  it('a click selects the row in the grid; a double click also opens the properties panel', async () => {
    await act(async () => byId('post1').click());
    const s = useAppStore.getState();
    expect(s.activeItemId).toBe('post1');
    expect(s.getGridRows()[s.activeRow].id).toBe('post1');
    expect(s.showPropertiesPanel).toBe(false);
    expect(byId('post1').getAttribute('aria-selected')).toBe('true');

    await act(async () => byId('h23').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    expect(useAppStore.getState().activeItemId).toBe('h23');
    expect(useAppStore.getState().showPropertiesPanel).toBe(true);
  });

  it('a line selected in the grid is highlighted in the tree; when its item is closed, the item is', async () => {
    const row = useAppStore.getState().getGridRows().findIndex((r) => r.id === 'regel1');
    await act(async () => useAppStore.getState().setActiveCell(row, 1, 'regel1'));
    expect(byId('regel1').getAttribute('aria-selected')).toBe('true');
    await act(async () => useAppStore.getState().toggleCollapse('post1'));
    expect(byId('post1').getAttribute('aria-selected')).toBe('true');
  });

  it('revealItem opens collapsed parents so a hidden row can be selected', () => {
    expect(useAppStore.getState().revealItem('post2')).toBe(true);
    const s = useAppStore.getState();
    expect(s.items.find((i) => i.id === 'h22')!.isCollapsed).toBe(false);
    expect(s.getGridRows()[s.activeRow].id).toBe('post2');
    expect(s.revealItem('does-not-exist')).toBe(false);
  });

  it('arrow keys move through the tree and open or close chapters', async () => {
    await act(async () => byId('h21').click());
    await keyDown('ArrowDown');
    expect(useAppStore.getState().activeItemId).toBe('p2110');
    await keyDown('ArrowLeft'); // open → dicht
    expect(useAppStore.getState().items.find((i) => i.id === 'p2110')!.isCollapsed).toBe(true);
    await keyDown('ArrowLeft'); // al dicht → naar ouder
    expect(useAppStore.getState().activeItemId).toBe('h21');
    await keyDown('End');
    expect(useAppStore.getState().activeItemId).toBe('h23');
    await keyDown('ArrowUp');
    await keyDown('ArrowRight'); // 22 dicht → open
    expect(useAppStore.getState().items.find((i) => i.id === 'h22')!.isCollapsed).toBe(false);
    await keyDown('Enter');
    expect(useAppStore.getState().showPropertiesPanel).toBe(true);
  });
});
