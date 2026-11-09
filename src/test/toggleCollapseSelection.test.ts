import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '@/state/appStore';
import type { CostItem } from '@/types/costModel';

// In-/uitklappen (pijltje in het raster) laat rijen verdwijnen of verschijnen.
// Een selectiebereik bestaat uit rij-nummers: daarna wijzen die naar ándere
// rijen, en een Delete zou die raken. Dus: bereik weg, actieve rij volgt zijn item.

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

const items = (): CostItem[] => [
  mkItem({ id: 'h1', rowType: 'chapter', description: 'Een', sortOrder: 0 }),
  mkItem({ id: 'p1', rowType: 'begrotingspost', parentId: 'h1', depth: 1, sortOrder: 0 }),
  mkItem({ id: 'r1', rowType: 'regel', parentId: 'p1', depth: 2, sortOrder: 0 }),
  mkItem({ id: 'h2', rowType: 'chapter', description: 'Twee', sortOrder: 1 }),
  mkItem({ id: 'p2', rowType: 'begrotingspost', parentId: 'h2', depth: 1, sortOrder: 0 }),
  mkItem({ id: 'h3', rowType: 'chapter', description: 'Drie', sortOrder: 2 }),
];

const state = () => useAppStore.getState();
const rowOf = (id: string) => state().getGridRows().findIndex((r) => r.id === id);
const select = (id: string) => useAppStore.setState({ activeItemId: id, activeRow: rowOf(id) });

beforeEach(() => {
  useAppStore.setState({ items: items(), activeItemId: null, activeRow: -1, undoStack: [], redoStack: [] });
});

describe('folding resets a grid selection range', () => {
  it('rows above the range disappear: range gone, active row stays on its item', () => {
    select('h3');
    useAppStore.setState({ selectionStart: rowOf('h2'), selectionEnd: rowOf('h3'), cellSelectionStart: null, cellSelectionEnd: null });
    state().toggleCollapse('h1');
    expect(state().selectionStart).toBeNull();
    expect(state().selectionEnd).toBeNull();
    expect(state().getSelectedRowIndices()).toEqual([state().activeRow]);
    expect(state().getGridRows()[state().activeRow]?.id).toBe('h3');
  });

  it('also when the active row itself does not move', () => {
    select('h1');
    useAppStore.setState({ selectionStart: rowOf('h1'), selectionEnd: rowOf('h3') });
    const activeRow = state().activeRow;
    state().toggleCollapse('h2');
    expect(state().selectionStart).toBeNull();
    expect(state().selectionEnd).toBeNull();
    expect(state().activeRow).toBe(activeRow);
    expect(state().getGridRows()[state().activeRow]?.id).toBe('h1');
  });
});
