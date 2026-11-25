import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '@/state/appStore';
import type { CostItem } from '@/types/costModel';

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

const initial = useAppStore.getState();
beforeEach(() => { useAppStore.setState(initial, true); });

describe('knownbug 225: een hoofdstuk verwijderen is lineair', () => {
  it('leest parentId niet één keer per kind per item', () => {
    let reads = 0;
    const counted = (item: CostItem): CostItem => {
      let parentId = item.parentId;
      Object.defineProperty(item, 'parentId', { enumerable: true, configurable: true, get: () => { reads++; return parentId; }, set: (v) => { parentId = v; } });
      return item;
    };
    const items: CostItem[] = [counted(mkItem({ id: 'h1', rowType: 'chapter' }))];
    for (let i = 0; i < 2000; i++) items.push(counted(mkItem({ id: `p${i}`, rowType: 'begrotingspost', parentId: 'h1', depth: 1, sortOrder: i })));
    items.push(counted(mkItem({ id: 'h2', rowType: 'chapter', sortOrder: 1 })));
    for (let i = 0; i < 2000; i++) items.push(counted(mkItem({ id: `q${i}`, rowType: 'begrotingspost', parentId: 'h2', depth: 1, sortOrder: i })));
    useAppStore.setState({ items });
    reads = 0;
    useAppStore.getState().deleteItem('h1');
    expect(useAppStore.getState().items).toHaveLength(2001);
    // Kwadratisch waren dit ~2001 × 4002 ≈ 8 miljoen; lineair een klein veelvoud van 4002.
    expect(reads).toBeLessThan(10 * items.length);
  });

  it('verwijdert ook een diepe keten zonder stack overflow', () => {
    const items: CostItem[] = [mkItem({ id: 'n0', rowType: 'chapter' })];
    for (let i = 1; i < 20000; i++) items.push(mkItem({ id: `n${i}`, rowType: 'tekstregel', parentId: `n${i - 1}`, depth: 1 }));
    items.push(mkItem({ id: 'keep', rowType: 'chapter', sortOrder: 1 }));
    useAppStore.setState({ items });
    useAppStore.getState().deleteItem('n0');
    expect(useAppStore.getState().items.map(i => i.id)).toEqual(['keep']);
  });
});
