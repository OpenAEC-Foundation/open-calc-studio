import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useAppStore } from '@/state/appStore';
import { changeLanguage } from '@/i18n/config';
import { UrenStaartView } from '@/components/grid/WpCalcBottomPanel';
import { recalculateItems } from '@/services/calculation/calculator';
import type { CostItem } from '@/types/costModel';
import { setNumberLocale } from '@/utils/formatting';

// Knownbug 9 / issue #66 punt 8: de productiecapaciteit (normFactor) is een
// deler. Uren = aantal × norm ÷ capaciteit, en het loon via een tariefgroep
// moet daar ook door gedeeld worden; anders rekent de begroting een ander
// bedrag dan het urenoverzicht (10 × 1 ÷ 2 = 5 u × € 64 = € 320, niet € 640).

const TARIEVEN = { A: 64, B: 43, C: 82 };

function regel(partial: Partial<CostItem>): CostItem {
  return {
    id: 'r1', parentId: 'p1', sortOrder: 0, code: '', description: 'regel', unit: 'm2', quantity: 10,
    materialPrice: null, laborPrice: null, unitPrice: 0, total: 0, isCollapsed: false, depth: 2,
    notes: '', ifcGuid: '', rowType: 'regel', staartPercentage: null, nr: '',
    normQuantity: null, normFactor: null, normDivisor: null, normUnitPrice: null,
    resourceType: null, resourceLibraryId: null, verrekenbaar: null, tariefGroep: null,
    ...partial,
  } as CostItem;
}

const calc = (partial: Partial<CostItem>) => recalculateItems([regel(partial)], TARIEVEN)[0];

describe('labour via a rate group is divided by the production capacity', () => {
  it('capacity 2: 10 × 1 ÷ 2 = 5 h × € 64 = € 320', () => {
    const r = calc({ normQuantity: 1, normFactor: 2, tariefGroep: 'A' });
    expect(r.laborPrice).toBeCloseTo(32, 6);
    expect(r.total).toBeCloseTo(320, 6);
  });

  it('painter: 100 m², 8 h per 40 m², € 64 → 20 h = € 1.280 (was € 51.200)', () => {
    const r = calc({ quantity: 100, normQuantity: 8, normFactor: 40, tariefGroep: 'A' });
    expect(r.total).toBeCloseTo(1280, 6);
  });

  it('capacity empty, 0 or 1 changes nothing and never divides by zero', () => {
    for (const normFactor of [null, 0, 1]) {
      const r = calc({ normQuantity: 1, normFactor, tariefGroep: 'A' });
      expect(r.laborPrice).toBeCloseTo(64, 6);
      expect(r.total).toBeCloseTo(640, 6);
      expect(Number.isFinite(r.total)).toBe(true);
    }
  });

  it('a material price per unit is not divided by the capacity, only the labour', () => {
    const r = calc({ normQuantity: 1, normFactor: 2, tariefGroep: 'A', normUnitPrice: 10 });
    expect(r.total).toBeCloseTo(10 * (10 + 32), 6);
  });

  it('a line without a norm keeps its directly entered labour price', () => {
    const r = calc({ normQuantity: null, normFactor: 2, tariefGroep: 'A', laborPrice: 50 });
    expect(r.laborPrice).toBe(50);
    expect(r.total).toBeCloseTo(500, 6);
  });

  it('the UI-1 model (no labour price, a norm and a price per resource) is unchanged', () => {
    const r = calc({ normQuantity: 8, normFactor: 40, normUnitPrice: 64, quantity: 100 });
    expect(r.laborPrice).toBeNull();
    expect(r.total).toBeCloseTo(1280, 6);
  });
});

describe('estimate and hours overview give the same labour amount', () => {
  const initial = useAppStore.getState();
  let root: Root | undefined;
  let node: HTMLDivElement;
  let rule: string;

  beforeEach(async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await changeLanguage('en');
    // Engelse teksten, maar deze tests rekenen met Nederlandse getallen ("1.234,50").
    // Sinds #65 volgt de getalnotatie de app-taal; zet die hier dus terug op NL.
    setNumberLocale('nl-NL');
    useAppStore.setState(initial, true);
    const state = useAppStore.getState();
    state.addDocument({ id: 'capacity-doc', items: [] });
    const chapter = state.addChapter(null);
    const post = state.addItem(chapter);
    rule = state.addRegel(post);
    state.updateTarieven(TARIEVEN);
    state.updateItem(rule, 'tariefGroep', 'A');
    state.updateItem(rule, 'quantity', 10);
    state.updateItem(rule, 'normQuantity', 1);
    state.updateItem(rule, 'normFactor', 2);
  });

  afterEach(async () => {
    if (root) await act(async () => root!.unmount());
    root = undefined;
    node?.remove();
  });

  const total = () => useAppStore.getState().items.find((i) => i.id === rule)!.total;

  it('capacity 2: the grid and the overview both show € 320', async () => {
    expect(total()).toBeCloseTo(320, 6);
    node = document.createElement('div');
    document.body.appendChild(node);
    root = createRoot(node);
    await act(async () => root!.render(<UrenStaartView />));
    const cells = (tr: Element) => [...tr.querySelectorAll('td')].map((td) => td.textContent ?? '');
    const table = node.querySelector('table.wpcalc-bottom-table')!;
    expect(cells(table.querySelector('tbody tr')!)[3]).toBe('320,00');
    expect(cells(table.querySelector('tr.wpcalc-bottom-total')!)[3]).toBe('320,00');
  });

  it('a rate change recalculates with the capacity', () => {
    useAppStore.getState().updateTarieven({ ...TARIEVEN, A: 70 });
    expect(total()).toBeCloseTo(350, 6);
  });

  it('undo after a change keeps the amount with the capacity', () => {
    const state = useAppStore.getState();
    state.pushHistory(state.items, 'test');
    state.updateItem(rule, 'quantity', 20);
    expect(total()).toBeCloseTo(640, 6);
    const restored = useAppStore.getState().undo();
    if (restored) useAppStore.getState().setItems(restored);
    expect(total()).toBeCloseTo(320, 6);
  });
});
