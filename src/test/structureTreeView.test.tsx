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

// 21 Funderingen (750) > 21.10 Grondwerk (750) > post Ontgraven (750) > regel Graafmachine (750)
// 22 Buitenwanden (1.250,50) > post Metselwerk (1.250,50)
// 23 Vloeren (leeg, 0)
// Kostprijs = 2.000,50. Bedragen staan er vast in: zo test de boom alleen het tonen.
const items = (): CostItem[] => [
  mkItem({ id: 'h21', rowType: 'chapter', code: '21', nr: '21', description: 'Funderingen', sortOrder: 0, total: 750 }),
  mkItem({ id: 'p2110', rowType: 'chapter', parentId: 'h21', depth: 1, code: '10', nr: '21.10', description: 'Grondwerk', sortOrder: 0, total: 750 }),
  mkItem({ id: 'post1', rowType: 'begrotingspost', parentId: 'p2110', depth: 2, code: '01', nr: '21.10.01', description: 'Ontgraven', sortOrder: 0, total: 750 }),
  mkItem({ id: 'regel1', rowType: 'regel', parentId: 'post1', depth: 3, description: 'Graafmachine', sortOrder: 0, total: 750 }),
  mkItem({ id: 'h22', rowType: 'chapter', code: '22', nr: '22', description: 'Buitenwanden', sortOrder: 1, total: 1250.5 }),
  mkItem({ id: 'post2', rowType: 'begrotingspost', parentId: 'h22', depth: 1, code: '01', nr: '22.01', description: 'Metselwerk', sortOrder: 0, total: 1250.5 }),
  mkItem({ id: 'h23', rowType: 'chapter', code: '23', nr: '23', description: 'Vloeren', sortOrder: 2 }),
];

let node: HTMLDivElement, root: Root;
const state = () => useAppStore.getState();
const byId = (id: string) => node.querySelector<HTMLElement>(`[data-tree-id="${id}"]`)!;
const treeOrder = () => [...node.querySelectorAll<HTMLElement>('[role=treeitem]')].map((el) => el.dataset.treeId);
const amountOf = (id: string) => byId(id).querySelector('.schedule-item-amount')?.textContent ?? null;
// Een rij zonder % heeft een leeg %-vakje (zodat de bedragen onder elkaar staan): leeg = geen %.
const pctOf = (id: string) => byId(id).querySelector('.schedule-item-pct')?.textContent || null;
const prefixOf = (id: string) => byId(id).querySelector('.schedule-item-code')?.textContent ?? null;
const viewButton = () => node.querySelector<HTMLButtonElement>('.schedule-tree-view-btn')!;
const openView = () => act(async () => viewButton().click());
const option = (name: string, value?: string) =>
  node.querySelector<HTMLInputElement>(`input[name="${name}"]${value ? `[value="${value}"]` : ''}`)!;
const clickOption = (name: string, value?: string) => act(async () => option(name, value).click());
const keyDown = (key: string) => act(async () => {
  node.querySelector('[role=tree]')!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
});
const openMenu = (id: string) => act(async () => {
  byId(id).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 }));
});
const clickDelete = () => act(async () => node.querySelector<HTMLButtonElement>('[role=menuitem][data-action="delete"]')!.click());
const render = async () => {
  node = document.createElement('div'); document.body.append(node); root = createRoot(node);
  await act(async () => root.render(<SchedulePanel />));
};

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18next.changeLanguage('en');
  useAppStore.setState({ items: items(), activeItemId: null, activeRow: -1, activeContentTab: 'grid', undoStack: [], redoStack: [] });
  localStorage.setItem('ocs.structureTree.depth', 'all');
  localStorage.removeItem('ocs.structureTree.view');
  await render();
});
afterEach(async () => {
  vi.restoreAllMocks();
  await act(async () => root.unmount()); node.remove();
  localStorage.removeItem('ocs.structureTree.depth');
  localStorage.removeItem('ocs.structureTree.view');
});

describe('amounts and view options', () => {
  it('shows the total of each row on the right by default; an empty chapter shows none', () => {
    expect(amountOf('h21')).toBe('750');
    expect(amountOf('h22')).toBe('1.251'); // hele euro's
    expect(amountOf('post2')).toBe('1.251');
    expect(amountOf('regel1')).toBe('750');
    expect(amountOf('h23')).toBeNull();
    expect(pctOf('h21')).toBeNull(); // % staat standaard uit
    expect(prefixOf('post1')).toBe('21.10.01'); // standaard het Nr, zoals de kolom Nr in het raster
  });

  it('amounts under one euro show cents (not a misleading "0"); negative amounts keep their sign', async () => {
    await act(async () => useAppStore.setState({
      items: state().items.map((i) => (i.id === 'regel1' ? { ...i, total: 0.4 } : i.id === 'post2' ? { ...i, total: -750 } : i)),
    }));
    expect(amountOf('regel1')).toBe('0,40');
    expect(amountOf('post2')).toBe('-750');
  });

  it('no % for lines, and none at all when the cost price is zero or less', async () => {
    await openView();
    await clickOption('schedule-tree-percent');
    expect(pctOf('regel1')).toBeNull();
    expect(pctOf('post1')).not.toBeNull();
    await act(async () => useAppStore.setState({
      items: state().items.map((i) => (i.id === 'h22' ? { ...i, total: -750 } : i)), // kostprijs 750 − 750 = 0
    }));
    expect(pctOf('h21')).toBeNull();
  });

  it('the options menu puts the focus on its first option, and Escape gives it back to the button', async () => {
    await openView();
    expect(document.activeElement).toBe(option('schedule-tree-number', 'nr')); // de gekozen optie
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(document.activeElement).toBe(viewButton());
  });

  it('shows the Nr (not the own code) and can be switched off', async () => {
    expect(byId('post1').title).toBe('21.10.01 Ontgraven'); // eigen code 01 niet
    expect(prefixOf('regel1')).toBeNull(); // geen nummer
    await act(async () => useAppStore.setState({ items: state().items.map((i) => (i.id === 'post2' ? { ...i, code: '22 30 10' } : i)) }));
    expect(prefixOf('post2')).toBe('22.01'); // ook met een eigen (STABU-)code: het Nr

    await openView();
    await clickOption('schedule-tree-number', 'none');
    expect(prefixOf('post1')).toBeNull();
    expect(byId('post1').querySelector('.schedule-item-label')!.textContent).toBe('Ontgraven');
    expect(byId('post1').title).toBe('Ontgraven');
  });

  it('"Code" shows the own code instead of the Nr; a row without a code shows none', async () => {
    await act(async () => useAppStore.setState({ items: state().items.map((i) => (i.id === 'post2' ? { ...i, code: '22 30 10' } : i)) }));
    await openView();
    await clickOption('schedule-tree-number', 'code');
    expect(option('schedule-tree-number', 'code').checked).toBe(true);
    expect(option('schedule-tree-number', 'nr').checked).toBe(false);
    expect(prefixOf('post1')).toBe('01');
    expect(prefixOf('post2')).toBe('22 30 10');
    expect(prefixOf('regel1')).toBeNull();
    expect(byId('post1').title).toBe('01 Ontgraven');
  });

  it('an earlier saved choice "description only" still means: no code', async () => {
    await act(async () => root.unmount()); node.remove();
    localStorage.setItem('ocs.structureTree.view', JSON.stringify({ label: 'none', amounts: true, percent: false }));
    await render();
    expect(prefixOf('post1')).toBeNull();
    // …en het vinkje van daarna: uit = niets, aan = het Nr.
    for (const [code, expected] of [[false, null], [true, '21.10.01']] as const) {
      await act(async () => root.unmount()); node.remove();
      localStorage.setItem('ocs.structureTree.view', JSON.stringify({ code, amounts: true, percent: false }));
      await render();
      expect(prefixOf('post1')).toBe(expected);
    }
  });

  it('% of cost price: share of the top-level chapters total', async () => {
    await openView();
    await clickOption('schedule-tree-percent');
    expect(pctOf('h21')).toBe('37,5%');
    expect(pctOf('h22')).toBe('62,5%');
    expect(pctOf('post1')).toBe('37,5%');
    expect(pctOf('h23')).toBeNull();
  });

  it('amounts can be switched off, and the choice is remembered', async () => {
    await openView();
    await clickOption('schedule-tree-amounts');
    await clickOption('schedule-tree-number', 'none');
    expect(amountOf('h21')).toBeNull();

    await act(async () => root.unmount()); node.remove();
    await render();
    expect(amountOf('h21')).toBeNull();
    expect(prefixOf('post1')).toBeNull();
    expect(JSON.parse(localStorage.getItem('ocs.structureTree.view')!)).toEqual({ number: 'none', amounts: false, percent: false });
  });

  it('the options menu closes with Escape or a click elsewhere, and changes nothing in the budget', async () => {
    const before = state().items;
    await openView();
    expect(viewButton().getAttribute('aria-expanded')).toBe('true');
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(node.querySelector('.schedule-tree-view-menu')).toBeNull();
    await openView();
    await act(async () => { document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })); });
    expect(node.querySelector('.schedule-tree-view-menu')).toBeNull();
    expect(state().items).toBe(before);
  });
});

describe('deleting from the structure tree', () => {
  it('the Delete key never deletes from the tree (in the grid it clears a cell)', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const before = state().items;
    await act(async () => byId('h23').click()); // lege rij: vroeger zelfs zonder vraag weg
    await keyDown('Delete');
    await act(async () => byId('h21').click());
    await keyDown('Delete');
    expect(confirm).not.toHaveBeenCalled();
    expect(state().items).toBe(before);
    expect(state().undoStack).toHaveLength(0);
  });

  it('right-click > Delete always asks, also for a single line; OK removes it as one undo step', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await openMenu('regel1');
    await clickDelete();
    expect(confirm).toHaveBeenCalledWith(i18next.t('structureTree.deleteConfirmOne', { name: 'Graafmachine' }));
    expect(state().items.some((i) => i.id === 'regel1')).toBe(false);
    expect(node.querySelector('[role=menu]')).toBeNull();
    expect(state().undoStack).toHaveLength(1);
    expect(state().activeItemId).toBe('h22'); // selectie naar de volgende rij

    await act(async () => { const restored = state().undo(); if (restored) state().setItems(restored); });
    expect(state().items.some((i) => i.id === 'regel1')).toBe(true);
  });

  it('an empty chapter is asked about too; Cancel keeps it', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await openMenu('h23');
    await clickDelete();
    expect(confirm).toHaveBeenCalledWith(i18next.t('structureTree.deleteConfirmOne', { name: '23 Vloeren' }));
    expect(state().items.some((i) => i.id === 'h23')).toBe(true);
    expect(state().undoStack).toHaveLength(0);
  });

  it('a chapter with content: the question names how many rows go along; Cancel keeps everything', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await openMenu('h21');
    await clickDelete();
    expect(confirm).toHaveBeenCalledWith(i18next.t('structureTree.deleteConfirm', { name: '21 Funderingen', count: 3 }));
    expect(state().items).toHaveLength(7);
    expect(state().undoStack).toHaveLength(0);
  });

  it('OK removes the chapter with everything below it, and selects the next chapter', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await openMenu('h21');
    await clickDelete();
    expect(state().items.map((i) => i.id)).toEqual(['h22', 'post2', 'h23']);
    expect(treeOrder()).toEqual(['h22', 'post2', 'h23']);
    expect(state().activeItemId).toBe('h22');
    expect(state().undoStack).toHaveLength(1);
  });

  it('deleting the last row selects the one before it', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await openMenu('h23');
    await clickDelete();
    expect(state().items.some((i) => i.id === 'h23')).toBe(false);
    expect(state().activeItemId).toBe('post2');
  });

  it('the question uses the same name as the tree shows (without code when codes are off)', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await openView();
    await clickOption('schedule-tree-number', 'none');
    await openMenu('h21');
    await clickDelete();
    expect(confirm).toHaveBeenCalledWith(i18next.t('structureTree.deleteConfirm', { name: 'Funderingen', count: 3 }));
  });
});

describe('monitor posts at the "estimate items" depth', () => {
  it('a monitor post is shown with its estimate item; lines are not', async () => {
    await act(async () => useAppStore.setState({
      items: [...state().items, mkItem({ id: 'bew1', rowType: 'bewakingspost', parentId: 'post1', depth: 3, description: 'Stelpost grondwerk', sortOrder: 1 })],
    }));
    localStorage.setItem('ocs.structureTree.depth', 'post');
    await act(async () => root.unmount()); node.remove();
    await render();
    expect(treeOrder()).toContain('bew1');
    expect(treeOrder()).not.toContain('regel1');
    expect(byId('post1').querySelector('button')).not.toBeNull(); // pijltje: er hangt iets onder
  });
});

describe('fold arrow for content deeper than the tree shows', () => {
  const isCollapsed = (id: string) => !!state().items.find((i) => i.id === id)!.isCollapsed;
  const gridHas = (id: string) => state().getGridRows().some((r) => r.id === id);
  const showChaptersOnly = async () => {
    localStorage.setItem('ocs.structureTree.depth', 'chapter');
    await act(async () => root.unmount()); node.remove();
    await render();
  };

  it('at "chapters" a chapter with only posts still has an arrow; it folds the grid, not the tree', async () => {
    await showChaptersOnly();
    expect(treeOrder()).toEqual(['h21', 'p2110', 'h22', 'h23']);
    const arrow = byId('h22').querySelector<HTMLButtonElement>('.grid-collapse-btn');
    expect(arrow).not.toBeNull();
    expect(byId('h23').querySelector('.grid-collapse-btn')).toBeNull(); // leeg: geen pijltje
    // Open/dicht volgt het pijltje (het raster), ook al toont de boom eronder niets.
    expect(byId('h22').getAttribute('aria-expanded')).toBe('true');
    expect(byId('h23').getAttribute('aria-expanded')).toBeNull();

    await act(async () => arrow!.click());
    expect(isCollapsed('h22')).toBe(true);
    expect(byId('h22').getAttribute('aria-expanded')).toBe('false');
    expect(gridHas('post2')).toBe(false);
    expect(treeOrder()).toEqual(['h21', 'p2110', 'h22', 'h23']);
    expect(state().undoStack).toHaveLength(0);

    await act(async () => byId('h22').querySelector<HTMLButtonElement>('.grid-collapse-btn')!.click());
    expect(isCollapsed('h22')).toBe(false);
    expect(gridHas('post2')).toBe(true);
  });

  it('← and → fold such a chapter too; → on an open one does not jump to the next chapter', async () => {
    await showChaptersOnly();
    await act(async () => byId('h22').click());
    await keyDown('ArrowLeft');
    expect(isCollapsed('h22')).toBe(true);
    await keyDown('ArrowRight');
    expect(isCollapsed('h22')).toBe(false);
    await keyDown('ArrowRight');
    expect(state().activeItemId).toBe('h22');
  });
});

describe('chapter ↔ section', () => {
  // h21 (met paragraaf p2110), h22 (met post: geen doel), h23 (leeg: wel doel).
  const find = (id: string) => state().items.find((i) => i.id === id)!;
  const clickMenu = (selector: string) => act(async () => node.querySelector<HTMLButtonElement>(selector)!.click());

  it('a chapter becomes a section of another chapter; everything below goes along; Nr follows', async () => {
    // h22 heeft een post en geen paragrafen: kan paragraaf worden, alleen van h23 (h21 heeft geen posten → ook).
    await openMenu('h22');
    await clickMenu('[data-action="make-paragraph"]');
    const targets = [...node.querySelectorAll<HTMLElement>('[data-paragraph-target]')].map((b) => b.dataset.paragraphTarget);
    expect(targets).toEqual(['h21', 'h23']); // niet zichzelf
    await clickMenu('[data-paragraph-target="h23"]');
    expect(find('h22').parentId).toBe('h23');
    expect(find('h22').depth).toBe(1);
    expect(find('post2').parentId).toBe('h22'); // kind gaat mee
    expect(find('post2').depth).toBe(2);
    expect(find('h22').nr).toBe('23.01');
    expect(find('h22').code).toBe('22'); // code blijft staan
    expect(state().undoStack).toHaveLength(1);
  });

  it('a section becomes a chapter again, right after its old chapter', async () => {
    await openMenu('p2110');
    await clickMenu('[data-action="make-chapter"]');
    expect(find('p2110').parentId).toBeNull();
    expect(find('p2110').depth).toBe(0);
    expect(find('post1').depth).toBe(1);
    expect(state().items.filter((i) => i.parentId === null).map((i) => i.id)).toEqual(['h21', 'p2110', 'h22', 'h23']);
    expect(state().undoStack).toHaveLength(1);

    await act(async () => { const restored = state().undo(); if (restored) state().setItems(restored); });
    expect(find('p2110').parentId).toBe('h21');
  });

  it('not under a chapter with estimate items, and a chapter with sections cannot become a section (it says why)', async () => {
    // h21 heeft een paragraaf: grijs, met de reden eronder. h23 kan wel, maar niet onder h22 (heeft posten).
    await openMenu('h21');
    // Grijs, de reden als tooltip; klikken doet niets.
    const para = node.querySelector<HTMLButtonElement>('[data-action="make-paragraph"]')!;
    expect(para.getAttribute('aria-disabled')).toBe('true');
    expect(para.title).toBe(i18next.t('structureTree.whyHasSections'));
    await act(async () => para.click());
    expect(node.querySelector('[data-paragraph-target]')).toBeNull();
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    await openMenu('h23');
    await clickMenu('[data-action="make-paragraph"]');
    const targets = [...node.querySelectorAll<HTMLElement>('[data-paragraph-target]')].map((b) => b.dataset.paragraphTarget);
    expect(targets).toEqual(['h21']);
  });

  it('a top-level chapter has no "make chapter"; a post has neither option', async () => {
    await openMenu('h21');
    expect(node.querySelector('[data-action="make-chapter"]')).toBeNull();
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    await openMenu('post1');
    expect(node.querySelector('[data-action="make-chapter"]')).toBeNull();
    expect(node.querySelector('[data-action="make-paragraph"]')).toBeNull();
  });
});

describe('expand / collapse everything below', () => {
  const isCollapsed = (id: string) => !!state().items.find((i) => i.id === id)!.isCollapsed;
  const clickMenu = (action: string) => act(async () => node.querySelector<HTMLButtonElement>(`[role=menuitem][data-action="${action}"]`)!.click());

  it('right-click > collapse all below closes the row and everything in it; expand opens it all again', async () => {
    await openMenu('h21');
    await clickMenu('collapse-below');
    expect(['h21', 'p2110', 'post1'].map(isCollapsed)).toEqual([true, true, true]);
    expect(treeOrder()).toEqual(['h21', 'h22', 'post2', 'h23']);
    expect(state().undoStack).toHaveLength(0); // weergave, geen undo-stap

    await openMenu('h21');
    await clickMenu('expand-below');
    expect(['h21', 'p2110', 'post1'].map(isCollapsed)).toEqual([false, false, false]);
    expect(treeOrder()).toEqual(['h21', 'p2110', 'post1', 'regel1', 'h22', 'post2', 'h23']);
    expect(state().getGridRows().some((r) => r.id === 'regel1')).toBe(true); // het raster klapt mee
  });

  it('the * key opens everything below the selected row', async () => {
    await act(async () => useAppStore.setState({ items: state().items.map((i) => (['h21', 'p2110'].includes(i.id) ? { ...i, isCollapsed: true } : i)) }));
    await act(async () => byId('h21').click());
    await keyDown('*');
    expect(treeOrder()).toContain('regel1');
  });

  it('a row without contents has no expand/collapse options', async () => {
    await openMenu('h23');
    expect(node.querySelector('[data-action="expand-below"]')).toBeNull();
    expect(node.querySelector('[data-action="collapse-below"]')).toBeNull();
    expect(node.querySelector('[data-action="delete"]')).not.toBeNull();
  });
});

describe('type to jump', () => {
  // De klok in de hand: "snel na elkaar" (< 800 ms) of "los" zonder echt te wachten.
  let now = 1_000_000;
  beforeEach(() => { now = 1_000_000; vi.spyOn(Date, 'now').mockImplementation(() => now); });
  const typeKey = async (key: string, afterMs = 100) => { now += afterMs; await keyDown(key); };

  it('typing letters jumps to the next row whose description or code starts with them', async () => {
    await typeKey('b');
    expect(state().activeItemId).toBe('h22'); // Buitenwanden
  });

  it('letters typed quickly form one word', async () => {
    await typeKey('g');
    expect(state().activeItemId).toBe('p2110'); // Grondwerk
    await typeKey('r'); // "gr": Grondwerk past nog
    expect(state().activeItemId).toBe('p2110');
    await typeKey('a'); // "gra" → Graafmachine (een losse "a" of "ra" past nergens)
    expect(state().activeItemId).toBe('regel1');
  });

  it('after a pause the same first letter goes to the next match; a code works too', async () => {
    await typeKey('g');
    expect(state().activeItemId).toBe('p2110'); // Grondwerk
    await typeKey('g', 900); // los: volgende g-rij
    expect(state().activeItemId).toBe('regel1'); // Graafmachine
    await typeKey('2', 900);
    await typeKey('3');
    expect(state().activeItemId).toBe('h23'); // code 23
  });
});

describe('the grid stays on the selected row', () => {
  const gridRowId = () => state().getGridRows()[state().activeRow]?.id;

  it('collapsing a chapter above the selection in the tree keeps the grid on the same row', async () => {
    await act(async () => byId('h22').click());
    expect(gridRowId()).toBe('h22');
    await act(async () => byId('h21').querySelector('button')!.click()); // 21 dicht: rijen schuiven op
    expect(gridRowId()).toBe('h22');
  });

  it('collapsing the parent of the selected line moves the selection to that parent (grid too)', async () => {
    await act(async () => byId('regel1').click());
    await act(async () => byId('post1').querySelector('button')!.click());
    expect(state().activeItemId).toBe('post1');
    expect(gridRowId()).toBe('post1');
  });

  it('a left click on another row closes the right-click menu', async () => {
    await openMenu('h21');
    expect(node.querySelector('[role=menu]')).not.toBeNull();
    await act(async () => { byId('h22').dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 })); });
    expect(node.querySelector('[role=menu]')).toBeNull();
  });
});

describe('chapters stand out', () => {
  it('rows carry their type, so chapters can be shown bold', () => {
    expect(byId('h21').dataset.rowType).toBe('chapter');
    expect(byId('post1').dataset.rowType).toBe('begrotingspost');
  });
});

describe('variants', () => {
  it('shows only the rows of the active variant, like the grid', async () => {
    const schedule = state().schedule;
    try {
      await act(async () => useAppStore.setState({
        schedule: {
          ...schedule,
          branchesEnabled: true,
          activeBranchId: 'b1',
          branches: [{ id: 'b1', name: 'Variant A', parentId: null }, { id: 'b2', name: 'Variant B', parentId: null }],
        },
        items: [
          ...items(),
          mkItem({ id: 'postA', rowType: 'begrotingspost', parentId: 'h22', depth: 1, code: '02', description: 'Alleen in A', sortOrder: 1, branchId: 'b1' }),
          mkItem({ id: 'postB', rowType: 'begrotingspost', parentId: 'h22', depth: 1, code: '03', description: 'Alleen in B', sortOrder: 2, branchId: 'b2' }),
        ],
      }));
      expect(treeOrder()).toContain('postA');
      expect(treeOrder()).not.toContain('postB');
      expect(state().getGridRows().some((r) => r.id === 'postB')).toBe(false); // het raster ook niet

      await act(async () => useAppStore.setState({ schedule: { ...state().schedule, activeBranchId: 'b2' } }));
      expect(treeOrder()).toContain('postB');
      expect(treeOrder()).not.toContain('postA');
    } finally {
      useAppStore.setState({ schedule });
    }
  });
});
