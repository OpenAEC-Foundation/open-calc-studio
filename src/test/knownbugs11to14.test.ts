import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '@/state/appStore';
import { reviewBudget } from '@/services/review/budgetReview';
import { getGrandTotal, getKostprijs } from '@/services/calculation/calculator';
import { variantCalculatedItems } from '@/services/grid/variantTotals';

const initial = useAppStore.getState();
const s = () => useAppStore.getState();
const flagged = () => reviewBudget(s()).issues.filter(issue => issue.code === 'missing-price').map(issue => issue.itemId);
let chapter: string, post: string;

beforeEach(() => {
  useAppStore.setState(initial, true);
  s().addDocument({ id: 'bugs-11-14', items: [] });
  chapter = s().addChapter(null);
  post = s().addItem(chapter);
  s().updateItem(post, 'description', 'Wall');
  s().updateItem(post, 'quantity', 10);
});

describe('knownbug 11 — empty rows under a post do not hide its missing price', () => {
  it('flags the post when every row beneath it is empty', () => {
    const rule = s().addRegel(post);
    s().updateItem(rule, 'quantity', null);
    expect(flagged()).toEqual([post]);
  });
  it('still flags only the row when the row itself needs a price', () => {
    const rule = s().addRegel(post);
    s().updateItem(rule, 'quantity', 4);
    expect(flagged()).toEqual([rule]);
  });
  it('a pro-memoria row or a priced row without quantity still covers the post', () => {
    const rule = s().addRegel(post);
    s().updateItem(rule, 'quantity', null); s().updateItem(rule, 'unit', 'pm');
    expect(flagged()).toEqual([]);
    s().updateItem(rule, 'unit', 'm²'); s().updateItem(rule, 'normUnitPrice', 12);
    expect(flagged()).toEqual([]);
  });
  it('looks through an empty monitoring post to the rows beneath it', () => {
    const monitor = s().addBewakingspost(post);
    const rule = s().addRegel(monitor);
    s().updateItem(rule, 'quantity', null);
    expect(flagged()).toEqual([post]);
  });
});

describe('knownbug 13 — a post whose own price carries the total does not flag its empty rows', () => {
  it('does not flag an unpriced row while the post price is what counts', () => {
    const rule = s().addRegel(post);
    s().updateItem(rule, 'quantity', 4);
    s().updateItem(post, 'materialPrice', 25);
    expect(byTotal(post)).toBe(250);
    expect(flagged()).toEqual([]);
  });
  it('flags the row again once another row under the post carries an amount', () => {
    const rule = s().addRegel(post);
    s().updateItem(rule, 'quantity', 4);
    const priced = s().addRegel(post);
    s().updateItem(priced, 'quantity', 2); s().updateItem(priced, 'normUnitPrice', 5);
    s().updateItem(post, 'materialPrice', 25);
    expect(flagged()).toEqual([rule]);
  });
});

describe('knownbug 14 — a rate group missing from the rate table does not count as a price', () => {
  it('flags a norm row whose rate group has no rate', () => {
    const rule = s().addRegel(post);
    s().updateItem(rule, 'quantity', 4);
    s().updateItem(rule, 'normQuantity', 2);
    s().updateItem(rule, 'tariefGroep', 'Z');
    s().setSchedule({ tarieven: { A: 60 } });
    s().recalculate();
    expect(flagged()).toEqual([rule]);
    s().setSchedule({ tarieven: { A: 60, Z: 50 } });
    expect(flagged()).toEqual([]);
  });
  it('uses the default rates when the estimate has no rate table', () => {
    const rule = s().addRegel(post);
    s().updateItem(rule, 'quantity', 4);
    s().updateItem(rule, 'normQuantity', 2);
    s().updateItem(rule, 'tariefGroep', 'A');
    s().setSchedule({ tarieven: {} });
    expect(flagged()).toEqual([]);
  });
});

describe('knownbug 12 / 264 — totals follow the chosen variant', () => {
  const variants = (active: string) => s().setSchedule({ branchesEnabled: true, activeBranchId: active,
    branches: [{ id: 'main', parentId: null, name: 'Main' }, { id: 'alt', parentId: 'main', name: 'Alternative' }] });

  it('a row from another variant counts neither in the grid nor in the grand total', () => {
    const base = s().addRegel(post);
    s().updateItem(base, 'quantity', 2); s().updateItem(base, 'normUnitPrice', 100);
    const alt = s().addRegel(post);
    s().updateItem(alt, 'quantity', 3); s().updateItem(alt, 'normUnitPrice', 1000);
    s().updateItem(alt, 'branchId', 'alt');

    variants('main');
    const rowTotal = (id: string) => s().getGridRows().find(row => row.id === id)?.total;
    expect(rowTotal(post)).toBe(200);
    expect(rowTotal(chapter)).toBe(200);
    const scoped = variantCalculatedItems(s().items, s().schedule);
    expect(getKostprijs(scoped)).toBe(200);
    expect(getGrandTotal(scoped)).toBeLessThan(getGrandTotal(s().items));

    variants('alt');
    expect(rowTotal(post)).toBe(3200);
  });

  it('grid and review agree when the only priced row is in another variant', () => {
    const alt = s().addRegel(post);
    s().updateItem(alt, 'quantity', 3); s().updateItem(alt, 'normUnitPrice', 1000);
    s().updateItem(alt, 'branchId', 'alt');
    variants('main');
    expect(s().getGridRows().find(row => row.id === post)?.total).toBe(0);
    expect(flagged()).toEqual([post]);
    variants('alt');
    expect(flagged()).toEqual([]);
  });

  it('without variants the stored items are used as they are', () => {
    expect(variantCalculatedItems(s().items, s().schedule)).toBe(s().items);
  });
});

function byTotal(id: string) {
  return s().items.find(item => item.id === id)!.total;
}
