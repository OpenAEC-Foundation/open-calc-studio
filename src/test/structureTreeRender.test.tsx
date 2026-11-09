import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SchedulePanel } from '@/components/panels/SchedulePanel';
import { useAppStore } from '@/state/appStore';
import type { CostItem } from '@/types/costModel';
import i18next from '@/i18n/config';

/**
 * Structuurboom bij grote begrotingen: een klik, een pijltje of in-/uitklappen
 * tekent alleen de rijen die echt veranderen (TreeRow is React.memo), niet
 * de hele boom. Geteld via het icoon dat elke rij tekent.
 */

const iconRenders = vi.hoisted(() => ({ count: 0 }));
vi.mock('@/components/panels/structureTree/RowIcon', () => ({
  RowIcon: () => { iconRenders.count++; return null; },
}));

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

// 4 hoofdstukken × 3 posten × 4 regels = 64 rijen in de boom (diepte "alles").
const items = (): CostItem[] => {
  const out: CostItem[] = [];
  for (let c = 0; c < 4; c++) {
    out.push(mkItem({ id: `h${c}`, rowType: 'chapter', nr: `${c}`, description: `Hoofdstuk ${c}`, sortOrder: c }));
    for (let p = 0; p < 3; p++) {
      out.push(mkItem({ id: `p${c}_${p}`, rowType: 'begrotingspost', parentId: `h${c}`, depth: 1, description: `Post ${p}`, sortOrder: p }));
      for (let r = 0; r < 4; r++) out.push(mkItem({ id: `r${c}_${p}_${r}`, parentId: `p${c}_${p}`, depth: 2, description: `Regel ${r}`, sortOrder: r }));
    }
  }
  return out;
};

let node: HTMLDivElement, root: Root;
const byId = (id: string) => node.querySelector<HTMLElement>(`[data-tree-id="${id}"]`)!;
const tree = () => node.querySelector<HTMLElement>('[role=tree]')!;
/** Aantal getekende rijen tijdens `fn`. */
const rendersDuring = async (fn: () => void) => {
  iconRenders.count = 0;
  await act(async () => fn());
  return iconRenders.count;
};

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18next.changeLanguage('en');
  localStorage.setItem('ocs.structureTree.depth', 'all');
  useAppStore.setState({ items: items(), activeItemId: null, activeRow: -1, activeContentTab: 'grid', undoStack: [], redoStack: [] });
  node = document.createElement('div'); document.body.append(node); root = createRoot(node);
  await act(async () => root.render(<SchedulePanel />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  node.remove();
  localStorage.removeItem('ocs.structureTree.depth');
});

describe('structure tree: only changed rows re-render', () => {
  it('renders all rows once at the start', () => {
    expect(node.querySelectorAll('[role=treeitem]').length).toBe(64);
  });

  it('a click or an arrow key re-renders only the old and the new selected row', async () => {
    expect(await rendersDuring(() => byId('p1_1').click())).toBeLessThanOrEqual(2);
    expect(useAppStore.getState().activeItemId).toBe('p1_1');
    expect(await rendersDuring(() => byId('p2_0').click())).toBeLessThanOrEqual(2);
    expect(await rendersDuring(() => {
      tree().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    })).toBeLessThanOrEqual(2);
    expect(useAppStore.getState().activeItemId).toBe('r2_0_0');
  });

  it('folding a post re-renders only that post', async () => {
    const n = await rendersDuring(() => byId('p3_2').querySelector<HTMLElement>('.grid-collapse-btn')!.click());
    expect(byId('p3_2').getAttribute('aria-expanded')).toBe('false');
    expect(n).toBeLessThanOrEqual(2);
  });
});
