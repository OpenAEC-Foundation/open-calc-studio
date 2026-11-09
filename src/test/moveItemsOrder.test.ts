import { describe, it, expect } from 'vitest';
import { useAppStore } from '@/state/appStore';
import type { CostItem } from '@/types/costModel';

// Regressies voor moveItems: de volgorde van niet-verplaatste rijen volgt de
// zichtbare volgorde (sortOrder, bij gelijkstand array-index) — niet de
// array-volgorde — en een zet die niets verandert laat `items` ongemoeid.

function mkItem(partial: Partial<CostItem> & { id: string }): CostItem {
  return {
    parentId: null,
    sortOrder: 0,
    code: '',
    description: '',
    unit: 'st',
    quantity: null,
    materialPrice: null,
    laborPrice: null,
    unitPrice: 0,
    total: 0,
    isCollapsed: false,
    depth: 0,
    notes: '',
    ifcGuid: '',
    rowType: 'regel',
    staartPercentage: null,
    nr: '',
    normQuantity: null,
    normFactor: null,
    normDivisor: null,
    normUnitPrice: null,
    resourceType: null,
    resourceLibraryId: null,
    verrekenbaar: null,
    tariefGroep: null,
    ...partial,
  } as CostItem;
}

const state = () => useAppStore.getState();
const visibleIds = () => state().getVisibleItems().map((it) => it.id);
const childIds = (parentId: string | null) =>
  state().getVisibleItems().filter((it) => (it.parentId ?? null) === parentId).map((it) => it.id);

/** h1 toont y,x (sortOrder 0/1) terwijl de array x,y bevat. */
function seedMismatchedOrder() {
  useAppStore.setState({
    items: [
      mkItem({ id: 'h1', rowType: 'chapter', depth: 0, sortOrder: 0 }),
      mkItem({ id: 'x', parentId: 'h1', depth: 1, sortOrder: 1 }),
      mkItem({ id: 'y', parentId: 'h1', depth: 1, sortOrder: 0 }),
      mkItem({ id: 'h2', rowType: 'chapter', depth: 0, sortOrder: 1 }),
      mkItem({ id: 'p', rowType: 'begrotingspost', parentId: 'h2', depth: 1, sortOrder: 0 }),
      mkItem({ id: 'r', parentId: 'p', depth: 2, sortOrder: 0 }),
      mkItem({ id: 'h3', rowType: 'chapter', depth: 0, sortOrder: 2 }),
      mkItem({ id: 'q', parentId: 'h3', depth: 1, sortOrder: 0 }),
    ],
  } as any);
}

describe('moveItems keeps the visible order of unrelated rows', () => {
  it('moving a post to another chapter leaves other chapters as shown', () => {
    seedMismatchedOrder();
    expect(childIds('h1')).toEqual(['y', 'x']);
    state().moveItems(['p'], 'h3', 'inside');
    expect(childIds('h1')).toEqual(['y', 'x']);
    expect(visibleIds()).toEqual(['h1', 'y', 'x', 'h2', 'h3', 'p', 'r', 'q']);
    const p = state().items.find((it) => it.id === 'p')!;
    const r = state().items.find((it) => it.id === 'r')!;
    expect(p.parentId).toBe('h3');
    expect(p.depth).toBe(1);
    expect(r.parentId).toBe('p');
    expect(r.depth).toBe(2);
  });

  it("'inside' inserts as first child in visible order", () => {
    seedMismatchedOrder();
    state().moveItems(['q'], 'h1', 'inside');
    expect(childIds('h1')).toEqual(['q', 'y', 'x']);
  });

  it("'before' and 'after' place relative to the target as shown, not as stored", () => {
    seedMismatchedOrder();
    // Zichtbaar: y, x. "Na y" moet tussen y en x landen.
    state().moveItems(['q'], 'y', 'after');
    expect(childIds('h1')).toEqual(['y', 'q', 'x']);

    seedMismatchedOrder();
    state().moveItems(['q'], 'x', 'before');
    expect(childIds('h1')).toEqual(['y', 'q', 'x']);
  });

  it('reordering within a group keeps the shown order of the rest', () => {
    useAppStore.setState({
      items: [
        mkItem({ id: 'h', rowType: 'chapter', depth: 0, sortOrder: 0 }),
        mkItem({ id: 'a', parentId: 'h', depth: 1, sortOrder: 2 }),
        mkItem({ id: 'b', parentId: 'h', depth: 1, sortOrder: 0 }),
        mkItem({ id: 'c', parentId: 'h', depth: 1, sortOrder: 1 }),
      ],
    } as any);
    expect(childIds('h')).toEqual(['b', 'c', 'a']);
    state().moveItems(['a'], 'b', 'after');
    expect(childIds('h')).toEqual(['b', 'a', 'c']);
  });
});

describe('moveItems that change nothing keep the same items reference', () => {
  it("'after' the sibling that is already directly before it", () => {
    seedMismatchedOrder();
    const before = state().items;
    state().moveItems(['x'], 'y', 'after'); // zichtbaar al y, x
    expect(state().items).toBe(before);
  });

  it("'before' the sibling that is already directly after it", () => {
    seedMismatchedOrder();
    const before = state().items;
    state().moveItems(['y'], 'x', 'before');
    expect(state().items).toBe(before);
  });

  it("'inside' its current parent when it is already first", () => {
    seedMismatchedOrder();
    const before = state().items;
    state().moveItems(['y'], 'h1', 'inside'); // zichtbaar al eerste
    expect(state().items).toBe(before);
  });

  it('a real move does produce a new array', () => {
    seedMismatchedOrder();
    const before = state().items;
    state().moveItems(['x'], 'h1', 'inside');
    expect(state().items).not.toBe(before);
    expect(childIds('h1')).toEqual(['x', 'y']);
  });
});
