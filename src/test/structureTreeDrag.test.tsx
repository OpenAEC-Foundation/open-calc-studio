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

// Boomvolgorde: h21, p2110, post1, h22, post2, h23 — elke rij 20 px hoog.
const items = (): CostItem[] => [
  mkItem({ id: 'h21', rowType: 'chapter', code: '21', description: 'Funderingen', sortOrder: 0 }),
  mkItem({ id: 'p2110', rowType: 'chapter', parentId: 'h21', depth: 1, code: '21.10', description: 'Grondwerk', sortOrder: 0 }),
  mkItem({ id: 'post1', rowType: 'begrotingspost', parentId: 'p2110', depth: 2, code: '01', description: 'Ontgraven', sortOrder: 0, isCollapsed: true }), // regels dicht
  mkItem({ id: 'regel1', rowType: 'regel', parentId: 'post1', depth: 3, description: 'Graafmachine', sortOrder: 0 }),
  mkItem({ id: 'h22', rowType: 'chapter', code: '22', description: 'Buitenwanden', sortOrder: 1 }),
  mkItem({ id: 'post2', rowType: 'begrotingspost', parentId: 'h22', depth: 1, code: '01', description: 'Metselwerk', sortOrder: 0 }),
  mkItem({ id: 'regel2', rowType: 'regel', parentId: 'post2', depth: 2, description: 'Metselaar', sortOrder: 0 }),
  mkItem({ id: 'h23', rowType: 'chapter', code: '23', description: 'Vloeren', sortOrder: 2 }),
  mkItem({ id: 'btw', rowType: 'staart_btw', description: 'BTW', sortOrder: 3, staartPercentage: 21 }),
];
const ORIGINAL_TREE = ['h21', 'p2110', 'post1', 'h22', 'post2', 'h23'];

const ROW = 20;
let node: HTMLDivElement, root: Root, originalRect: typeof Element.prototype.getBoundingClientRect;
const state = () => useAppStore.getState();
const find = (id: string) => state().items.find((i) => i.id === id)!;
const rows = () => [...node.querySelectorAll<HTMLElement>('[role=treeitem]')];
const treeOrder = () => rows().map((r) => r.dataset.treeId);
const byId = (id: string) => node.querySelector<HTMLElement>(`[data-tree-id="${id}"]`)!;
const topOrder = () => state().items.filter((i) => i.parentId === null).map((i) => i.id);
const rowTop = (id: string) => rows().indexOf(byId(id)) * ROW;

const pointer = (type: string, target: Element | Window, clientY: number, clientX = 50) => act(async () => {
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY, button: 0 }));
});
/** Pak `id` op en beweeg naar `y` (px vanaf de bovenkant van de boom). Een
 *  functie wordt pas ná het oppakken uitgerekend: een open map klapt dan dicht
 *  en de rijen eronder schuiven op. */
const dragTo = async (id: string, yOrFn: number | (() => number)) => {
  await pointer('pointerdown', byId(id), rowTop(id) + ROW / 2);
  // Over de sleep-drempel, zijwaarts: blijft boven de eigen rij, dus nog geen doel (en geen springslot).
  await pointer('pointermove', byId(id), rowTop(id) + ROW / 2, 60);
  const y = typeof yOrFn === 'function' ? yOrFn() : yOrFn;
  const over = rows()[Math.min(rows().length - 1, Math.floor(y / ROW))];
  await pointer('pointermove', over, y);
};
const release = () => pointer('pointerup', window, 0);

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18next.changeLanguage('en');
  useAppStore.setState({ items: items(), activeItemId: null, activeRow: -1, activeContentTab: 'grid', undoStack: [], redoStack: [] });
  node = document.createElement('div'); document.body.append(node); root = createRoot(node);
  await act(async () => root.render(<SchedulePanel />));
  // jsdom kent geen layout: geef elke boomrij 20 px, onder elkaar.
  originalRect = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (this: Element) {
    // De boom zelf is ruim hoog genoeg: anders zit de muis altijd "aan de
    // rand" en gaat het automatisch scrollen elke frame opnieuw mikken.
    if ((this as HTMLElement).getAttribute?.('role') === 'tree') {
      return { top: 0, bottom: 400, height: 400, left: 0, right: 200, width: 200, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
    }
    const i = rows().indexOf(this as HTMLElement);
    const top = i < 0 ? 0 : i * ROW, height = i < 0 ? 0 : ROW;
    return { top, bottom: top + height, height, left: 0, right: 200, width: 200, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
  };
  // …en ook geen elementFromPoint: de rij op hoogte y, volgens dezelfde 20 px.
  document.elementFromPoint = (_x: number, y: number) => rows()[Math.floor(y / ROW)] ?? null;
});
afterEach(async () => {
  Element.prototype.getBoundingClientRect = originalRect;
  delete (document as { elementFromPoint?: unknown }).elementFromPoint;
  await act(async () => root.unmount()); node.remove();
  localStorage.removeItem('ocs.structureTree.depth');
});

describe('dragging in the structure tree', () => {
  it('previews the new place in the tree while the budget waits; release commits both, one undo step', async () => {
    const before = state().items;
    await dragTo('h23', rowTop('h22') + 2); // bovenste derde van 22
    expect(byId('h23').classList.contains('dragging')).toBe(true);
    expect(treeOrder()).toEqual(['h21', 'p2110', 'post1', 'h23', 'h22', 'post2']); // boom al verschoven
    expect(state().items).toBe(before); // begroting nog niet
    await release();
    expect(topOrder()).toEqual(['h21', 'h23', 'h22', 'btw']);
    expect(treeOrder()).toEqual(['h21', 'p2110', 'post1', 'h23', 'h22', 'post2']);
    expect(state().undoStack).toHaveLength(1);
    expect(node.querySelector('.dragging')).toBeNull();
    expect(find('h23').code).toBe('23');
  });

  it('dropping on the middle of a chapter previews the item inside it, last', async () => {
    await dragTo('post1', rowTop('h23') + ROW / 2);
    expect(byId('h23').classList.contains('drop-inside')).toBe(true);
    expect(treeOrder()).toEqual(['h21', 'p2110', 'h22', 'post2', 'h23', 'post1']);
    expect(byId('post1').getAttribute('aria-level')).toBe('2');
    expect(find('post1').parentId).toBe('p2110'); // nog niet verplaatst
    await release();
    expect(find('post1').parentId).toBe('h23');
    expect(find('post1').depth).toBe(1);
    expect(find('regel1').parentId).toBe('post1');
    expect(node.querySelector('.drop-inside')).toBeNull();
  });

  it('a main chapter stays a main chapter: never next to a post or a section', async () => {
    const before = state().items;
    await dragTo('h23', rowTop('post2') + ROW - 1); // naast post 22.01
    expect(treeOrder()).toEqual(ORIGINAL_TREE);
    await release();
    await dragTo('h23', rowTop('p2110') + 2); // naast paragraaf 21.10
    expect(treeOrder()).toEqual(ORIGINAL_TREE);
    await release();
    expect(state().items).toBe(before);
  });

  it('over another main chapter a chapter goes before or after it, wherever you aim in the row', async () => {
    await dragTo('h23', rowTop('h22') + ROW / 2 - 1); // net boven het midden
    expect(treeOrder()).toEqual(['h21', 'p2110', 'post1', 'h23', 'h22', 'post2']);
    expect(byId('h22').classList.contains('drop-inside')).toBe(false); // nooit "erin"
    await release();
    expect(topOrder()).toEqual(['h21', 'h23', 'h22', 'btw']);
  });

  it('a section stays a section: it can move into another main chapter without posts', async () => {
    await dragTo('p2110', () => rowTop('h23') + ROW / 2);
    expect(byId('h23').classList.contains('drop-inside')).toBe(true);
    await release();
    expect(find('p2110').parentId).toBe('h23');
    expect(find('p2110').depth).toBe(1);
    expect(find('post1').parentId).toBe('p2110');
  });

  it('an estimate item dropped on another estimate item lands next to it, not inside', async () => {
    await dragTo('post2', rowTop('post1') + ROW - 1); // onderste helft van post 21.10.01
    expect(byId('post1').classList.contains('drop-inside')).toBe(false);
    expect(treeOrder()).toEqual(['h21', 'p2110', 'post1', 'post2', 'h22', 'h23']);
    await release();
    expect(find('post2').parentId).toBe('p2110');
    expect(find('post2').depth).toBe(2);
    expect(state().items.filter((i) => i.parentId === 'p2110').map((i) => i.id)).toEqual(['post1', 'post2']);
  });

  it('a forbidden target shows no preview and nothing happens on release', async () => {
    const before = state().items;
    // Kringetje: hoofdstuk 21 in zijn eigen paragraaf 21.10 kan via de boom niet eens:
    // zolang je 21 sleept staat het dicht, dus 21.10 is in beeld geen doel.
    await dragTo('h21', rowTop('h21') + ROW / 2);
    expect(treeOrder()).toEqual(['h21', 'h22', 'post2', 'h23']);
    expect(treeOrder()).not.toContain('p2110');
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    await release();
    expect(state().items).toBe(before);
    state().moveItems(['h21'], 'p2110', 'inside'); // ook via de store geweigerd
    expect(state().items).toBe(before);
    // Een post op het hoogste niveau (boven hoofdstuk 21) mag ook niet.
    await dragTo('post1', rowTop('h21') + 1);
    expect(treeOrder()).toEqual(ORIGINAL_TREE);
    await release();
    expect(state().items).toBe(before);
    // Op zijn eigen plek (vlak onder de vorige zuster): geen verschuiving, geen undo-stap.
    await dragTo('h23', rowTop('h22') + ROW - 1);
    expect(treeOrder()).toEqual(ORIGINAL_TREE);
    await release();
    expect(state().undoStack).toHaveLength(0);
  });

  it('Escape puts the tree back and cancels the drag', async () => {
    await dragTo('h23', rowTop('h22') + 2);
    expect(treeOrder()).toEqual(['h21', 'p2110', 'post1', 'h23', 'h22', 'post2']);
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(treeOrder()).toEqual(ORIGINAL_TREE);
    expect(node.querySelector('.dragging')).toBeNull();
    await release();
    expect(topOrder()).toEqual(['h21', 'h22', 'h23', 'btw']);
    expect(state().undoStack).toHaveLength(0);
  });

  it('hovering over the dragged item itself keeps the preview steady', async () => {
    await dragTo('h23', rowTop('h22') + 2);
    // In het voorbeeld staat h23 nu op rij 3, precies onder de muis.
    await pointer('pointermove', byId('h23'), 3 * ROW + 2);
    expect(treeOrder()).toEqual(['h21', 'p2110', 'post1', 'h23', 'h22', 'post2']);
    await release();
    expect(topOrder()).toEqual(['h21', 'h23', 'h22', 'btw']);
  });

  describe('lines', () => {
    // Post 21.10.01 open: h21, p2110, post1, regel1, h22, post2, regel2, h23
    beforeEach(async () => {
      await act(async () => state().toggleCollapse('post1'));
      await act(async () => {
        const select = node.querySelector<HTMLSelectElement>('select.schedule-tree-depth')!;
        select.value = 'all';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });

    it('a line dropped on another estimate item goes inside it, last', async () => {
      await dragTo('regel1', rowTop('post2') + 1); // ook bovenin de rij: erin
      expect(byId('post2').classList.contains('drop-inside')).toBe(true);
      expect(state().items.find((i) => i.id === 'regel1')!.parentId).toBe('post1'); // nog niet
      await release();
      expect(find('regel1').parentId).toBe('post2');
      expect(find('regel1').depth).toBe(2);
      expect(state().items.filter((i) => i.parentId === 'post2').map((i) => i.id)).toEqual(['regel2', 'regel1']);
      expect(state().undoStack).toHaveLength(1);
    });

    it('a line dropped on another line lands next to it', async () => {
      await dragTo('regel1', rowTop('regel2') + 2); // bovenste helft
      expect(treeOrder()).toEqual(['h21', 'p2110', 'post1', 'h22', 'post2', 'regel1', 'regel2', 'h23']);
      await release();
      expect(state().items.filter((i) => i.parentId === 'post2').map((i) => i.id)).toEqual(['regel1', 'regel2']);
    });

    it('a line never goes into a chapter', async () => {
      const before = state().items;
      await dragTo('regel1', rowTop('h23') + ROW / 2);
      expect(byId('h23').classList.contains('drop-inside')).toBe(false);
      await release();
      await dragTo('regel1', rowTop('h22') + 2);
      expect(treeOrder()).toEqual(['h21', 'p2110', 'post1', 'regel1', 'h22', 'post2', 'regel2', 'h23']);
      await release();
      expect(state().items).toBe(before);
    });

    it('an estimate item dropped on a line goes nowhere (a post never sits among lines)', async () => {
      const before = state().items;
      await dragTo('post2', rowTop('regel1') + 2);
      expect(treeOrder()).toEqual(['h21', 'p2110', 'post1', 'regel1', 'h22', 'post2', 'h23']); // post2 zelf even dicht
      await release();
      expect(state().items).toBe(before);
    });
  });

  describe('solid dragging', () => {
    it('the click that follows a drag does not select another row', async () => {
      await dragTo('h23', rowTop('h22') + 2);
      await release();
      const selected = state().activeItemId; // revealItem na de zet: het verplaatste hoofdstuk
      expect(selected).toBe('h23');
      await act(async () => byId('h22').click()); // de klik die de browser na loslaten stuurt
      expect(state().activeItemId).toBe('h23');
      await act(async () => byId('h22').click()); // een echte, nieuwe klik werkt weer
      expect(state().activeItemId).toBe('h22');
    });

    it('while dragging only the dragged row is marked, not also the selected row', async () => {
      await act(async () => byId('h21').click());
      expect(byId('h21').classList.contains('active')).toBe(true);
      await dragTo('h23', rowTop('h22') + 2);
      expect(byId('h21').classList.contains('active')).toBe(false);
      expect(node.querySelectorAll('.schedule-item.active')).toHaveLength(0);
      expect(node.querySelectorAll('.schedule-item.dragging')).toHaveLength(1);
      await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
      expect(byId('h21').classList.contains('active')).toBe(true); // na afbreken weer terug
    });

    it('a cancelled pointer (window loses focus) ends the drag without moving', async () => {
      await dragTo('h23', rowTop('h22') + 2);
      await act(async () => { window.dispatchEvent(new Event('blur')); });
      expect(node.querySelector('.dragging')).toBeNull();
      expect(treeOrder()).toEqual(ORIGINAL_TREE);
      await release();
      expect(topOrder()).toEqual(['h21', 'h22', 'h23', 'btw']);
      expect(state().undoStack).toHaveLength(0);
    });

    it('a small label next to the pointer says where it goes, or that it cannot go there', async () => {
      await dragTo('h23', rowTop('h22') + 2);
      const labelEl = () => document.querySelector<HTMLElement>('.schedule-drag-label');
      expect(labelEl()?.textContent).toBe('↑  22 Buitenwanden'); // alleen het doel, niet nog eens de gesleepte rij
      await pointer('pointermove', byId('post2'), rowTop('post2') + 2); // hoofdstuk naast een post
      expect(labelEl()?.textContent).toContain('⦸');
      expect(node.querySelector('.schedule-tree.is-blocked')).not.toBeNull();
      await release();
      expect(labelEl()).toBeNull();
    });

    it('a collapsed chapter opens after hovering over it for a moment', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      try {
        await act(async () => state().toggleCollapse('h22')); // 22 dicht: post2 niet zichtbaar
        await dragTo('post1', rowTop('h22') + ROW / 2);
        expect(byId('h22').classList.contains('drop-inside')).toBe(true);
        await act(async () => { vi.advanceTimersByTime(650); });
        expect(find('h22').isCollapsed).toBe(false);
        expect(treeOrder()).toContain('post2');
        await release();
        expect(find('post1').parentId).toBe('h22');
        expect(find('h22').isCollapsed).toBe(false); // erin gezet: blijft open
      } finally {
        vi.useRealTimers();
      }
    });

    it('a closed chapter also opens when the item only fits deeper inside; Escape closes it again', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      try {
        // 21 dicht. Een post mag niet direct in 21 (dat heeft paragrafen), wel in 21.10.
        await act(async () => state().toggleCollapse('h21'));
        await dragTo('post2', rowTop('h21') + ROW / 2);
        expect(byId('h21').classList.contains('drop-inside')).toBe(false);
        await act(async () => { vi.advanceTimersByTime(650); });
        expect(find('h21').isCollapsed).toBe(false);
        expect(treeOrder()).toContain('p2110'); // nu bereikbaar
        await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
        expect(find('h21').isCollapsed).toBe(true); // afgebroken: weer zoals het was (ook in het raster)
        expect(state().undoStack).toHaveLength(0);
      } finally {
        vi.useRealTimers();
      }
    });

    it('a closed chapter where the item cannot go anywhere stays closed', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      try {
        await act(async () => state().toggleCollapse('h22'));
        await dragTo('h23', rowTop('h22') + ROW / 2); // een hoofdstuk past niet in 22 (dat heeft posten)
        await act(async () => { vi.advanceTimersByTime(650); });
        expect(find('h22').isCollapsed).toBe(true);
        await release();
      } finally {
        vi.useRealTimers();
      }
    });

    it('dropping back on its own place is neutral: no forbidden sign, nothing happens', async () => {
      await dragTo('h23', rowTop('h22') + ROW - 1); // onderste helft van 22 = waar 23 al staat
      expect(node.querySelector('.schedule-tree.is-blocked')).toBeNull();
      expect(document.querySelector('.schedule-drag-label')).toBeNull();
      await release();
      expect(state().undoStack).toHaveLength(0);
    });

    it('an open chapter is shown closed while you drag it, so it moves as one row', async () => {
      await dragTo('p2110', () => rowTop('h23') + ROW / 2);
      expect(treeOrder()).not.toContain('post1'); // inhoud even weg uit beeld
      expect(find('p2110').isCollapsed).toBe(false); // begroting zelf ongewijzigd
      await release();
      expect(find('p2110').parentId).toBe('h23');
      expect(treeOrder()).toContain('post1'); // na loslaten weer open
    });

    it('after releasing outside the tree, the next click in the tree works', async () => {
      await dragTo('h23', rowTop('h22') + 2);
      await pointer('pointermove', window, 9999); // buiten de boom
      await release(); // er kwam geen klik op een rij
      // Een echte klik: indrukken, loslaten, klik.
      await pointer('pointerdown', byId('h22'), rowTop('h22') + 5);
      await release();
      await act(async () => byId('h22').click());
      expect(state().activeItemId).toBe('h22');
    });

    it('no jumping back and forth when the preview shifts rows under the pointer', async () => {
      // 21 slepen (dicht in beeld): h21 0–20, h22 20–40, post2 40–60, h23 60–80.
      await dragTo('h21', 38); // onderste helft van 22 → "na 22"
      // Voorbeeld: h22 0–20, post2 20–40, h21 40–60, h23 60–80. Onder de muis (y 38) staat nu post2.
      expect(treeOrder()).toEqual(['h22', 'post2', 'h21', 'h23']);
      // 1 px verder, boven post2: zonder slot "kan hier niet" → voorbeeld terug → weer 22 → … (springen).
      await pointer('pointermove', byId('post2'), 39);
      expect(treeOrder()).toEqual(['h22', 'post2', 'h21', 'h23']);
      expect(node.querySelector('.schedule-tree.is-blocked')).toBeNull();
      // Een echte beweging (meer dan een halve rij) werkt wel: onderste helft van 23 → "na 23".
      await pointer('pointermove', byId('h23'), 75);
      expect(treeOrder()).toEqual(['h22', 'post2', 'h23', 'h21']);
      await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    });

    it('a chapter opened while hovering closes again when the item is dropped somewhere else', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      try {
        await act(async () => state().toggleCollapse('h22')); // 22 dicht
        await dragTo('post1', rowTop('h22') + ROW / 2);
        await act(async () => { vi.advanceTimersByTime(650); });
        expect(find('h22').isCollapsed).toBe(false);
        await pointer('pointermove', byId('h23'), rowTop('h23') + ROW / 2); // verder naar 23
        await release();
        expect(find('post1').parentId).toBe('h23');
        expect(find('h22').isCollapsed).toBe(true); // 22 weer dicht, zoals het was
        // Het raster wijst nog naar de verplaatste post (22 klapte ná de zet dicht, rijen schoven op).
        expect(state().getGridRows()[state().activeRow]?.id).toBe('post1');
      } finally {
        vi.useRealTimers();
      }
    });

    it('the Delete key does nothing while dragging', async () => {
      await dragTo('h23', rowTop('h22') + 2);
      await act(async () => { node.querySelector('[role=tree]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true })); });
      expect(state().items.some((i) => i.id === 'h23')).toBe(true);
      await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    });

    it('a refused move leaves no empty undo step', async () => {
      // Via de store: een zet die moveItems weigert (in zichzelf).
      await act(async () => byId('h21').click());
      const before = state().items;
      state().moveItems(['h21'], 'h21', 'before');
      expect(state().items).toBe(before);
      // Alt+pijl op de bovenste: ook niets.
      await act(async () => { node.querySelector('[role=tree]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true })); });
      expect(state().undoStack).toHaveLength(0);
    });
  });

  it('a plain click is still a click, not a drag', async () => {
    await pointer('pointerdown', byId('h22'), rowTop('h22') + 5);
    await pointer('pointermove', byId('h22'), rowTop('h22') + 6); // onder de drempel
    await release();
    expect(node.querySelector('.dragging')).toBeNull();
    expect(state().undoStack).toHaveLength(0);
    await act(async () => byId('h22').click());
    expect(state().activeItemId).toBe('h22');
  });
});
