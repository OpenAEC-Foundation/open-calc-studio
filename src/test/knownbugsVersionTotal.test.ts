import { describe, expect, it } from 'vitest';
import { useAppStore } from '@/state/appStore';
import { getStaartBreakdown, recalculateItems } from '@/services/calculation/calculator';
import { makeStaartItem } from '@/services/calculation/staartDefaults';
import type { CostItem } from '@/types/costModel';

// knownbugs.md punt 3: een versie bewaarde als "totaal excl. btw" alleen de
// som van de hoofdstukken (directe kosten), zonder de staart.

function item(overrides: Partial<CostItem> & { id: string }): CostItem {
  return {
    parentId: null, sortOrder: 0, code: '', description: overrides.id, unit: 'st', quantity: null,
    materialPrice: null, laborPrice: null, unitPrice: 0, total: 0, isCollapsed: false, depth: 0,
    notes: '', ifcGuid: '', rowType: 'chapter', staartPercentage: null, nr: '', normQuantity: null,
    normFactor: null, normDivisor: null, normUnitPrice: null, resourceType: null, resourceLibraryId: null,
    verrekenbaar: null, tariefGroep: null, ...overrides,
  };
}

describe('versie bewaart de aanneemsom excl. btw', () => {
  it('telt de staart mee, niet alleen de hoofdstukken', () => {
    const items = recalculateItems([
      item({ id: 'h', rowType: 'chapter' }),
      item({ id: 'r', parentId: 'h', depth: 1, rowType: 'regel', quantity: 1, normQuantity: 1, normFactor: 1, normUnitPrice: 1000, resourceType: 'materiaal' }),
      makeStaartItem('staart_abk', 'Algemene bedrijfskosten:', 10, 100),
      makeStaartItem('staart_winst', 'Winst:', 5, 101),
      makeStaartItem('staart_btw', 'Btw:', 21, 102),
    ]);
    useAppStore.setState({ items, snapshots: [] });
    useAppStore.getState().createSnapshot('v1', 'concept');

    const snapshot = useAppStore.getState().snapshots[0];
    const verwacht = getStaartBreakdown(items).aanneemsomExcl;
    expect(verwacht).toBeCloseTo(1000 * 1.1 * 1.05, 6); // 1155, zonder btw
    expect(snapshot.totaalExclBtw).toBeCloseTo(verwacht, 6);
  });
});
