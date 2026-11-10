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

// 21 > 21.10 > post1 > regel1 ; 22 > post2 > bw1 (bewakingspost) ; 23 (leeg) ; staart btw
const items = (): CostItem[] => [
  mkItem({ id: 'h21', rowType: 'chapter', nr: '21', description: 'Funderingen', sortOrder: 0 }),
  mkItem({ id: 'p2110', rowType: 'chapter', parentId: 'h21', depth: 1, nr: '21.10', description: 'Grondwerk', sortOrder: 0 }),
  mkItem({ id: 'post1', rowType: 'begrotingspost', parentId: 'p2110', depth: 2, nr: '21.10.01', description: 'Ontgraven', sortOrder: 0 }),
  mkItem({ id: 'regel1', rowType: 'regel', parentId: 'post1', depth: 3, description: 'Graafmachine', sortOrder: 0 }),
  mkItem({ id: 'h22', rowType: 'chapter', nr: '22', description: 'Buitenwanden', sortOrder: 1 }),
  mkItem({ id: 'post2', rowType: 'begrotingspost', parentId: 'h22', depth: 1, nr: '22.01', description: 'Metselwerk', sortOrder: 0 }),
  mkItem({ id: 'bw1', rowType: 'bewakingspost', parentId: 'post2', depth: 2, description: 'Stelpost', sortOrder: 0 }),
  mkItem({ id: 'h23', rowType: 'chapter', nr: '23', description: 'Vloeren', sortOrder: 2 }),
  mkItem({ id: 'btw', rowType: 'staart_btw', description: 'BTW', sortOrder: 3, staartPercentage: 21 }),
];

let node: HTMLDivElement, root: Root;
const state = () => useAppStore.getState();
const find = (id: string) => state().items.find((i) => i.id === id)!;
const byId = (id: string) => node.querySelector<HTMLElement>(`[data-tree-id="${id}"]`)!;
const tree = () => node.querySelector<HTMLElement>('[role=tree]')!;
const topOrder = () => state().items.filter((i) => i.parentId === null).map((i) => i.id);
const treeOrder = () => [...node.querySelectorAll<HTMLElement>('[role=treeitem]')].map((el) => el.dataset.treeId);
const openMenu = (id: string) => act(async () => {
  byId(id).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 }));
});
const menuButtons = () => [...node.querySelectorAll<HTMLButtonElement>('[role=menuitem]')];
const openMoveTo = () => act(async () => node.querySelector<HTMLButtonElement>('[data-action="move-to"]')!.click());
const click = (el: HTMLElement) => act(async () => el.click());
const render = async () => {
  node = document.createElement('div'); document.body.append(node); root = createRoot(node);
  await act(async () => root.render(<SchedulePanel />));
};

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18next.changeLanguage('en');
  useAppStore.setState({ items: items(), activeItemId: null, activeRow: -1, activeContentTab: 'grid', undoStack: [], redoStack: [] });
  localStorage.setItem('ocs.structureTree.depth', 'all');
  await render();
});
afterEach(async () => {
  vi.restoreAllMocks();
  await act(async () => root.unmount()); node.remove();
  localStorage.removeItem('ocs.structureTree.depth');
});

describe('"Move to" for a main chapter', () => {
  it('lists the other main chapters under "Place after" plus "To the top"; it stays a main chapter', async () => {
    await openMenu('h23');
    await openMoveTo();
    expect(node.querySelector('.grid-context-submenu .schedule-tree-menu-heading')?.textContent).toBe(i18next.t('structureTree.placeAfter'));
    // Niet na 22: daar staat 23 al.
    expect([...node.querySelectorAll<HTMLElement>('[data-move-after]')].map((b) => b.dataset.moveAfter)).toEqual(['h21']);
    await click(node.querySelector<HTMLButtonElement>('[data-move-top]')!);
    expect(topOrder()).toEqual(['h23', 'h21', 'h22', 'btw']);
    expect(find('h23').parentId).toBeNull();
    expect(state().undoStack).toHaveLength(1);
    expect(document.activeElement).toBe(tree());
  });

  it('"Place after" puts the chapter directly after the chosen one, with everything below it', async () => {
    await openMenu('h21');
    await openMoveTo();
    // Staat al bovenaan: grijs met reden, niet `disabled` (blijft bereikbaar).
    const top = node.querySelector<HTMLButtonElement>('[data-move-top]')!;
    expect(top.getAttribute('aria-disabled')).toBe('true');
    expect(top.title).toBe(i18next.t('structureTree.whyFirst'));
    await click(node.querySelector<HTMLButtonElement>('[data-move-after="h22"]')!);
    expect(topOrder()).toEqual(['h22', 'h21', 'h23', 'btw']);
    expect(find('p2110').parentId).toBe('h21');
    expect(state().undoStack).toHaveLength(1);
  });
});

describe('"Move to" for lines and monitor posts', () => {
  it('a line can go to other estimate items and monitor posts, grouped under their chapter', async () => {
    await openMenu('regel1');
    await openMoveTo();
    // Niet post1 (huidige ouder); hoofdstuk 22 als kopje erboven.
    expect([...node.querySelectorAll<HTMLElement>('[data-move-target]')].map((b) => b.dataset.moveTarget)).toEqual(['post2', 'bw1']);
    const headings = [...node.querySelectorAll('.grid-context-submenu .schedule-tree-menu-heading')].map((h) => h.textContent);
    expect(headings).toEqual(['22 Buitenwanden']);
    await click(node.querySelector<HTMLButtonElement>('[data-move-target="bw1"]')!);
    expect(find('regel1').parentId).toBe('bw1');
    expect(state().undoStack).toHaveLength(1);
    expect(document.activeElement).toBe(tree());
  });

  it('a monitor post can only go to another estimate item', async () => {
    await openMenu('bw1');
    await openMoveTo();
    expect([...node.querySelectorAll<HTMLElement>('[data-move-target]')].map((b) => b.dataset.moveTarget)).toEqual(['post1']);
    await click(node.querySelector<HTMLButtonElement>('[data-move-target="post1"]')!);
    expect(find('bw1').parentId).toBe('post1');
  });
});

describe('menu keeps working with the keyboard', () => {
  it('after move down, expand/collapse and Escape the tree has the focus again', async () => {
    await openMenu('h21');
    await click(menuButtons()[1]); // omlaag
    expect(topOrder()).toEqual(['h22', 'h21', 'h23', 'btw']);
    expect(document.activeElement).toBe(tree());

    (document.activeElement as HTMLElement).blur();
    await openMenu('h21');
    await click(node.querySelector<HTMLButtonElement>('[data-action="collapse-below"]')!);
    expect(document.activeElement).toBe(tree());

    (document.activeElement as HTMLElement).blur();
    await openMenu('h21');
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(node.querySelector('.schedule-tree-menu')).toBeNull();
    expect(document.activeElement).toBe(tree());
  });

  it('a refused Alt+arrow move reports no change (no undo step)', async () => {
    const moveItems = state().moveItems;
    try {
      useAppStore.setState({ moveItems: () => {} });
      await act(async () => byId('h21').click());
      await act(async () => { tree().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true })); });
      expect(topOrder()).toEqual(['h21', 'h22', 'h23', 'btw']);
      expect(state().undoStack).toHaveLength(0);
    } finally {
      // Terugzetten: anders verplaatst niets meer in de tests hierna.
      useAppStore.setState({ moveItems });
    }
  });
});

describe('menu with the keyboard (WAI-ARIA menu)', () => {
  const key = (k: string, init: KeyboardEventInit = {}) => act(async () => {
    (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }));
  });
  const action = (a: string) => node.querySelector<HTMLElement>(`[data-action="${a}"]`)!;
  const menuEl = () => node.querySelector('.schedule-tree-menu');

  it('greyed up/down say why (aria-disabled + title) and do nothing when clicked', async () => {
    await openMenu('h21');
    expect(action('move-up').getAttribute('aria-disabled')).toBe('true');
    expect(action('move-up').title).toBe(i18next.t('structureTree.whyFirst'));
    expect((action('move-up') as HTMLButtonElement).disabled).toBe(false);
    await click(action('move-up'));
    expect(topOrder()).toEqual(['h21', 'h22', 'h23', 'btw']);
    expect(state().undoStack).toHaveLength(0);
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    await openMenu('h23');
    expect(action('move-down').title).toBe(i18next.t('structureTree.whyLast'));
    expect(action('move-up').hasAttribute('aria-disabled')).toBe(false);
  });

  it('focus goes to the first enabled item; arrows, Home/End move; greyed items stay reachable', async () => {
    await openMenu('h21');
    expect(document.activeElement).toBe(action('move-down'));
    await key('ArrowUp');
    expect(document.activeElement).toBe(action('move-up'));
    await key('ArrowUp'); // rondgaan
    expect(document.activeElement).toBe(action('delete'));
    await key('Home');
    expect(document.activeElement).toBe(action('move-up'));
    await key('End');
    expect(document.activeElement).toBe(action('delete'));
    expect(node.querySelectorAll('.schedule-tree-menu [role=separator]').length).toBeGreaterThan(0);
  });

  it('ArrowRight opens a submenu with focus inside; ArrowLeft/Escape close only the submenu; Escape again closes the menu', async () => {
    await openMenu('h23');
    action('move-to').focus();
    await key('ArrowRight');
    expect(node.querySelector('.grid-context-submenu')).not.toBeNull();
    expect(document.activeElement).toBe(node.querySelector('[data-move-top]'));
    await key('ArrowDown');
    expect(document.activeElement).toBe(node.querySelector('[data-move-after="h21"]'));
    await key('ArrowLeft');
    expect(node.querySelector('.grid-context-submenu')).toBeNull();
    expect(document.activeElement).toBe(action('move-to'));
    await key('Enter');
    expect(document.activeElement).toBe(node.querySelector('[data-move-top]'));
    await key('Escape');
    expect(node.querySelector('.grid-context-submenu')).toBeNull();
    expect(menuEl()).not.toBeNull();
    expect(document.activeElement).toBe(action('move-to'));
    await key('Escape');
    expect(menuEl()).toBeNull();
    expect(document.activeElement).toBe(tree());
  });

  it('Enter activates an item; Tab closes the menu', async () => {
    await openMenu('h21');
    await key('Enter'); // omlaag
    expect(topOrder()).toEqual(['h22', 'h21', 'h23', 'btw']);
    expect(menuEl()).toBeNull();
    await openMenu('h21');
    await key('Tab');
    expect(menuEl()).toBeNull();
    expect(document.activeElement).toBe(tree());
  });

  it('Shift+F10 and the ContextMenu key open the menu for the selected row; tree keys do nothing while it is open', async () => {
    await act(async () => byId('h22').click());
    tree().focus();
    await key('F10', { shiftKey: true });
    expect(menuEl()).not.toBeNull();
    expect(menuEl()!.contains(document.activeElement)).toBe(true);
    // Boomtoetsen tijdens open menu: geen effect op de selectie.
    await act(async () => { tree().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); });
    expect(state().activeItemId).toBe('h22');
    await key('Escape');
    expect(menuEl()).toBeNull();
    await key('ContextMenu');
    expect(menuEl()).not.toBeNull();
  });
});

describe('menu closes when its place is gone', () => {
  it('row removed while open (undo, other document): menu closes and does not come back', async () => {
    await openMenu('h23');
    const all = state().items;
    await act(async () => { useAppStore.setState({ items: all.filter((i) => i.id !== 'h23') }); });
    expect(node.querySelector('.schedule-tree-menu')).toBeNull();
    await act(async () => { useAppStore.setState({ items: all }); });
    expect(node.querySelector('.schedule-tree-menu')).toBeNull();
  });

  it('scrolling the tree or resizing the window closes it', async () => {
    await openMenu('h23');
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); }); // na één frame
    await act(async () => { tree().dispatchEvent(new Event('scroll')); });
    expect(node.querySelector('.schedule-tree-menu')).toBeNull();
    await openMenu('h23');
    await act(async () => { window.dispatchEvent(new Event('resize')); });
    expect(node.querySelector('.schedule-tree-menu')).toBeNull();
  });

  it('scrolling the panel around the tree (what really scrolls in the app) closes it too', async () => {
    node.classList.add('left-panel-body');
    try {
      await openMenu('h23');
      await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
      await act(async () => { node.dispatchEvent(new Event('scroll')); });
      expect(node.querySelector('.schedule-tree-menu')).toBeNull();
    } finally {
      node.classList.remove('left-panel-body');
    }
  });
});

describe('honest reasons and counts', () => {
  it('"Make section of" with only one main chapter says there is no other chapter', async () => {
    await act(async () => {
      useAppStore.setState({ items: [
        mkItem({ id: 'h1', rowType: 'chapter', nr: '1', description: 'Enige', sortOrder: 0 }),
        mkItem({ id: 'p1', rowType: 'begrotingspost', parentId: 'h1', depth: 1, nr: '1.01', description: 'Post', sortOrder: 0 }),
      ] });
    });
    await openMenu('h1');
    expect(node.querySelector<HTMLElement>('[data-action="make-paragraph"]')!.title).toBe(i18next.t('structureTree.whyNoOtherChapter'));
  });

  it('delete question counts only rows of the active variant', async () => {
    const schedule = state().schedule;
    try {
      await act(async () => {
        useAppStore.setState({
          schedule: { ...schedule, branchesEnabled: true, activeBranchId: 'b1', branches: [
            { id: 'b1', name: 'B1', parentId: null }, { id: 'b2', name: 'B2', parentId: null },
          ] },
          items: [...items(), mkItem({ id: 'other', rowType: 'regel', parentId: 'post1', depth: 3, description: 'Andere variant', sortOrder: 1, branchId: 'b2' })],
        });
      });
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
      await openMenu('post1');
      await click(node.querySelector<HTMLButtonElement>('[data-action="delete"]')!);
      expect(confirm).toHaveBeenCalledWith('Delete "21.10.01 Ontgraven" and the row below it?');
    } finally {
      useAppStore.setState({ schedule });
    }
  });
});

describe('submenu stays inside the window', () => {
  it('flips to the left and moves up when it would fall off the right/bottom edge', async () => {
    const real = Element.prototype.getBoundingClientRect;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      if (this.classList.contains('grid-context-submenu')) {
        return { left: 900, right: window.innerWidth + 100, top: 300, bottom: window.innerHeight + 50, width: 200, height: 200, x: 900, y: 300, toJSON: () => ({}) } as DOMRect;
      }
      return real.call(this);
    });
    await openMenu('h23');
    await openMoveTo();
    const sub = node.querySelector<HTMLElement>('.grid-context-submenu')!;
    // Logische kanten (werkt ook bij rechts-naar-links).
    expect(sub.style.insetInlineEnd).toBe('100%');
    expect(sub.style.insetInlineStart).toBe('auto');
    expect(sub.style.top).toBe('-54px'); // 50 eruit + 4 marge
  });
});

describe('delete question and % label', () => {
  it('one row below: singular text, no "1 rows"', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await openMenu('post1');
    await click(node.querySelector<HTMLButtonElement>('[data-action="delete"]')!);
    expect(confirm).toHaveBeenCalledWith('Delete "21.10.01 Ontgraven" and the row below it?');
    await i18next.changeLanguage('nl');
    expect(i18next.t('structureTree.deleteConfirm', { name: 'X', count: 3 })).toBe('"X" en de 3 rijen eronder verwijderen?');
    expect(i18next.t('structureTree.deleteConfirm', { name: 'X', count: 1 })).toBe('"X" en de rij eronder verwijderen?');
  });

  it('languages with more plural forms have them all (Polish: one/few/many/other)', async () => {
    const pl = (await import('@/i18n/locales/pl/common.json')).default as { structureTree: Record<string, string> };
    for (const form of new Intl.PluralRules('pl').resolvedOptions().pluralCategories) {
      expect(pl.structureTree[`deleteConfirm_${form}`], form).toBeTruthy();
    }
    expect(pl.structureTree.deleteConfirm_many).toContain('wierszy');
  });

  it('the % option says "% of total" (it is not the Kostprijs of the tail)', async () => {
    expect(i18next.t('structureTree.percent')).toBe('% of total');
    await i18next.changeLanguage('nl');
    expect(i18next.t('structureTree.percent')).toBe('% van totaal');
  });
});

describe('old mixed budgets at "chapters" depth', () => {
  it('a chapter under a top-level estimate item is still shown, right after that item\'s place', async () => {
    await act(async () => root.unmount()); node.remove();
    localStorage.setItem('ocs.structureTree.depth', 'chapter');
    localStorage.setItem('ocs.structureTree.view', JSON.stringify({ code: true, amounts: true, percent: true }));
    useAppStore.setState({
      items: [
        mkItem({ id: 'h1', rowType: 'chapter', nr: '1', description: 'Een', sortOrder: 0, total: 0 }),
        mkItem({ id: 'tp', rowType: 'begrotingspost', nr: '2', description: 'Losse post', sortOrder: 1, total: 0 }),
        mkItem({ id: 'hc', rowType: 'chapter', parentId: 'tp', depth: 1, nr: '2.1', description: 'Onder post', sortOrder: 0, total: 0 }),
        mkItem({ id: 'h3', rowType: 'chapter', nr: '3', description: 'Drie', sortOrder: 2, total: 0 }),
      ],
    });
    await render();
    expect(treeOrder()).toEqual(['h1', 'hc', 'h3']);
    // Totaal 0: geen % (en geen NaN/Infinity).
    expect(node.textContent).not.toMatch(/NaN|Infinity/);
    localStorage.removeItem('ocs.structureTree.view');
  });
});
