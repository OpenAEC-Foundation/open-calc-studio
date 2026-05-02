import { describe, it, expect } from 'vitest';
import { useAppStore } from '@/state/appStore';
import type { CostItem } from '@/types/costModel';

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

describe('moveItems', () => {
  it('moves item before target within same parent', () => {
    useAppStore.setState({
      items: [
        mkItem({ id: 'a', rowType: 'chapter', depth: 0, sortOrder: 0 }),
        mkItem({ id: 'b', rowType: 'regel', parentId: 'a', depth: 1, sortOrder: 0 }),
        mkItem({ id: 'c', rowType: 'regel', parentId: 'a', depth: 1, sortOrder: 1 }),
      ],
    } as any);
    useAppStore.getState().moveItems(['c'], 'b', 'before');
    const ids = useAppStore.getState().items.map((it) => it.id);
    expect(ids).toEqual(['a', 'c', 'b']);
    const c = useAppStore.getState().items.find((it) => it.id === 'c')!;
    expect(c.parentId).toBe('a');
  });

  it('reparents when dropping inside a chapter', () => {
    useAppStore.setState({
      items: [
        mkItem({ id: 'a', rowType: 'chapter', depth: 0, sortOrder: 0 }),
        mkItem({ id: 'x', rowType: 'regel', depth: 0, sortOrder: 1 }),
      ],
    } as any);
    useAppStore.getState().moveItems(['x'], 'a', 'inside');
    const x = useAppStore.getState().items.find((it) => it.id === 'x')!;
    expect(x.parentId).toBe('a');
    expect(x.depth).toBe(1);
  });

  it('refuses to drop onto self', () => {
    useAppStore.setState({
      items: [
        mkItem({ id: 'a', rowType: 'chapter', depth: 0, sortOrder: 0 }),
        mkItem({ id: 'b', rowType: 'regel', parentId: 'a', depth: 1, sortOrder: 0 }),
      ],
    } as any);
    const before = useAppStore.getState().items;
    useAppStore.getState().moveItems(['a'], 'a', 'before');
    expect(useAppStore.getState().items).toEqual(before);
  });

  it('refuses to drop a parent into its own descendant', () => {
    useAppStore.setState({
      items: [
        mkItem({ id: 'a', rowType: 'chapter', depth: 0, sortOrder: 0 }),
        mkItem({ id: 'b', rowType: 'begrotingspost', parentId: 'a', depth: 1, sortOrder: 0 }),
      ],
    } as any);
    const before = useAppStore.getState().items;
    useAppStore.getState().moveItems(['a'], 'b', 'inside');
    expect(useAppStore.getState().items).toEqual(before);
  });

  it('moves subtree along with its root', () => {
    useAppStore.setState({
      items: [
        mkItem({ id: 'root1', rowType: 'chapter', depth: 0, sortOrder: 0 }),
        mkItem({ id: 'child', rowType: 'regel', parentId: 'root1', depth: 1, sortOrder: 0 }),
        mkItem({ id: 'root2', rowType: 'chapter', depth: 0, sortOrder: 1 }),
      ],
    } as any);
    useAppStore.getState().moveItems(['root1'], 'root2', 'after');
    const ids = useAppStore.getState().items.map((it) => it.id);
    expect(ids).toEqual(['root2', 'root1', 'child']);
    const child = useAppStore.getState().items.find((it) => it.id === 'child')!;
    expect(child.parentId).toBe('root1');
  });
});
