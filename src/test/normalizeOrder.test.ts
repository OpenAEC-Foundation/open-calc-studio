import { describe, it, expect } from 'vitest';
import { recalculateItems, normalizeItemOrder } from '@/services/calculation/calculator';
import type { CostItem } from '@/types/costModel';

function makeItem(overrides: Partial<CostItem> = {}): CostItem {
  return {
    id: crypto.randomUUID(),
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
    ifcGuid: 'test',
    rowType: 'begrotingspost' as const,
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
    ...overrides,
  };
}

/** Elke subtree moet een aaneengesloten blok zijn: na een ouder volgen
 *  uitsluitend afstammelingen (depth > ouder) tot de subtree eindigt. */
function assertContiguousSubtrees(items: CostItem[]) {
  const idx = new Map(items.map((it, i) => [it.id, i] as const));
  for (const item of items) {
    if (item.parentId === null) continue;
    const p = idx.get(item.parentId);
    expect(p, `ouder van ${item.description} ontbreekt in array`).toBeDefined();
    expect(p!, `kind ${item.description} staat vóór zijn ouder`).toBeLessThan(idx.get(item.id)!);
    // alles tussen ouder en kind hoort dieper te liggen dan de ouder
    for (let i = p! + 1; i < idx.get(item.id)!; i++) {
      expect(items[i].depth, `vreemde rij tussen ouder en kind ${item.description}`).toBeGreaterThan(items[p!].depth);
    }
  }
}

describe('normalizeItemOrder (kern-invariant: array = hiërarchie)', () => {
  it('groepeert plat-aangevulde kinderen terug onder hun hoofdstuk', () => {
    const ch21 = makeItem({ id: 'ch21', rowType: 'chapter', code: '21', description: 'Betonwerk' });
    const ch25 = makeItem({ id: 'ch25', rowType: 'chapter', code: '25', description: 'Staal' });
    const post21 = makeItem({ id: 'p21', parentId: 'ch21', description: 'Drijflichaam' });
    const regel21 = makeItem({ id: 'r21', parentId: 'p21', rowType: 'regel', description: 'Betonbak', quantity: 12, normUnitPrice: 19350 });
    const post25 = makeItem({ id: 'p25', parentId: 'ch25', description: 'Constructiestaal' });
    const regel25 = makeItem({ id: 'r25', parentId: 'p25', rowType: 'regel', description: 'Staal', quantity: 10000, normUnitPrice: 2 });

    // Gescrambeld zoals MCP/import het achterlaat: kinderen achteraan, los van ouders
    const scrambled = [ch21, ch25, post25, regel21, post21, regel25];
    const result = recalculateItems(scrambled);

    assertContiguousSubtrees(result);
    const order = result.map(i => i.id);
    // ch21-subtree compleet vóór ch25
    expect(order.indexOf('p21')).toBeGreaterThan(order.indexOf('ch21'));
    expect(order.indexOf('r21')).toBe(order.indexOf('p21') + 1);
    expect(order.indexOf('ch25')).toBeGreaterThan(order.indexOf('r21'));
    expect(order.indexOf('r25')).toBe(order.indexOf('p25') + 1);
  });

  it('herleidt depth en kent sortOrder = sibling-index toe', () => {
    const ch = makeItem({ id: 'ch', rowType: 'chapter', depth: 5 });
    const p1 = makeItem({ id: 'p1', parentId: 'ch', depth: 0 });
    const p2 = makeItem({ id: 'p2', parentId: 'ch', depth: 9 });
    const r = makeItem({ id: 'r', parentId: 'p1', rowType: 'regel', depth: 0 });
    const result = normalizeItemOrder([r, p2, ch, p1].map(i => ({ ...i })));
    const byId = new Map(result.map(i => [i.id, i]));
    expect(byId.get('ch')!.depth).toBe(0);
    expect(byId.get('p1')!.depth).toBe(1);
    expect(byId.get('r')!.depth).toBe(2);
    expect(byId.get('p2')!.depth).toBe(1);
    // relatieve array-volgorde was p2 vóór p1 → p2 wordt sibling 0
    expect(byId.get('p2')!.sortOrder).toBe(0);
    expect(byId.get('p1')!.sortOrder).toBe(1);
  });

  it('behoudt sibling-volgorde (relatieve array-volgorde, géén hersortering)', () => {
    const ch = makeItem({ id: 'ch', rowType: 'chapter' });
    const a = makeItem({ id: 'a', parentId: 'ch', description: 'A', sortOrder: 99 });
    const b = makeItem({ id: 'b', parentId: 'ch', description: 'B', sortOrder: 1 });
    // array-volgorde a → b is de waarheid, ook al zegt sortOrder iets anders
    const result = normalizeItemOrder([ch, a, b].map(i => ({ ...i })));
    expect(result.map(i => i.id)).toEqual(['ch', 'a', 'b']);
  });

  it('laat wezen nooit verdwijnen en zet staart achteraan', () => {
    const ch = makeItem({ id: 'ch', rowType: 'chapter' });
    const wees = makeItem({ id: 'w', parentId: 'bestaat-niet', description: 'Wees' });
    const staart = makeItem({ id: 's', rowType: 'staart_btw', staartPercentage: 21 });
    const result = normalizeItemOrder([staart, wees, ch].map(i => ({ ...i })));
    expect(result).toHaveLength(3);
    expect(result.map(i => i.id)).toEqual(['ch', 'w', 's']);
  });

  it('overleeft een parentId-cyclus zonder hangen of dataverlies', () => {
    const a = makeItem({ id: 'a', parentId: 'b' });
    const b = makeItem({ id: 'b', parentId: 'a' });
    const result = normalizeItemOrder([a, b].map(i => ({ ...i })));
    expect(result).toHaveLength(2);
  });

  it('verandert totalen niet door de herordening', () => {
    const ch = makeItem({ id: 'ch', rowType: 'chapter' });
    const p = makeItem({ id: 'p', parentId: 'ch' });
    const r1 = makeItem({ id: 'r1', parentId: 'p', rowType: 'regel', quantity: 2, normUnitPrice: 100 });
    const r2 = makeItem({ id: 'r2', parentId: 'p', rowType: 'regel', quantity: 3, normUnitPrice: 50 });
    const ordered = recalculateItems([ch, p, r1, r2]);
    const scrambled = recalculateItems([r2, ch, r1, p]);
    const total = (arr: CostItem[]) => arr.find(i => i.id === 'ch')!.total;
    expect(total(scrambled)).toBe(total(ordered));
    expect(total(ordered)).toBe(2 * 100 + 3 * 50);
  });

  it('nummert hiërarchisch volgens de genormaliseerde volgorde', () => {
    const ch = makeItem({ id: 'ch', rowType: 'chapter', code: '21' });
    const p1 = makeItem({ id: 'p1', parentId: 'ch' });
    const p2 = makeItem({ id: 'p2', parentId: 'ch' });
    const r = makeItem({ id: 'r', parentId: 'p2', rowType: 'regel', quantity: 1, normUnitPrice: 1 });
    // p2 vóór p1 in de array → p2 = 21.01, p1 = 21.02
    const result = recalculateItems([ch, p2, r, p1]);
    const byId = new Map(result.map(i => [i.id, i]));
    expect(byId.get('ch')!.nr).toBe('21');
    expect(byId.get('p2')!.nr).toBe('21.01');
    expect(byId.get('r')!.nr).toBe('21.01.01');
    expect(byId.get('p1')!.nr).toBe('21.02');
  });
});
