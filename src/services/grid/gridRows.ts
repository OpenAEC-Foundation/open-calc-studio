import type { CostItem, CostSchedule } from '@/types/costModel';
import type { GridView } from '@/state/slices/uiSlice';

/**
 * DE canonieke gerenderde rijenlijst van het grid.
 *
 * `activeRow`, selecties en cel-selecties zijn indices in DEZE lijst. Elke
 * consumer die een rij-index naar een item vertaalt moet dus door
 * `getGridRows()` gaan — niet door `getVisibleItems()`. Die laatste is de
 * kale hiërarchie-walker en kent de staart-/branch-filtering en de
 * WPCalc-footerrijen niet, waardoor dezelfde index daar een ánder item
 * aanwijst (eigenschappenpaneel toonde bv. een hoofdstuk terwijl in het
 * grid een begrotingspost geselecteerd was).
 */

/** Synthetische hoofdstuk-footerrij (subtotalen) — geen echt CostItem. */
export function isFooterRow(id: string): boolean {
  return id.startsWith('footer:');
}

/** Create a synthetic chapter footer item for totals row */
export function makeChapterFooter(chapterId: string): CostItem {
  return {
    id: `footer:${chapterId}`,
    parentId: chapterId,
    sortOrder: 999999,
    code: '',
    description: '+',
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
    rowType: 'tekstregel', // styled differently via isFooterRow/chapterFooterIds
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
  };
}

/**
 * Bouw de gerenderde rijenlijst uit de zichtbare hiërarchie:
 * staart-rijen eruit (die staan in het onderpaneel), branch-filtering,
 * en in de WPCalc-weergave een footerrij na elk top-hoofdstuk.
 */
export function buildGridRows(
  visibleItems: CostItem[],
  gridView: GridView,
  schedule: Pick<CostSchedule, 'branchesEnabled' | 'activeBranchId' | 'branches'>
): CostItem[] {
  let visible = visibleItems.filter((i) => !i.rowType.startsWith('staart_'));

  // Branch filter: if activeBranchId set, show only items matching or in ancestor chain
  if (schedule.branchesEnabled && schedule.activeBranchId) {
    const allBranches = schedule.branches ?? [];
    // Collect active branch and all ancestors (main chain is always visible)
    const ancestors = new Set<string>(['main']);
    let cur: string | null | undefined = schedule.activeBranchId;
    while (cur) {
      ancestors.add(cur);
      const b = allBranches.find((br) => br.id === cur);
      cur = b?.parentId;
    }
    visible = visible.filter((i) => ancestors.has(i.branchId ?? 'main'));
  }

  if (gridView !== 'wpcalc') return visible;

  // In wpcalc view, insert chapter footer rows after each root chapter's block
  const result: CostItem[] = [];
  let currentChapterId: string | null = null;
  for (const item of visible) {
    if (item.rowType === 'chapter' && !item.parentId) {
      if (currentChapterId) result.push(makeChapterFooter(currentChapterId));
      currentChapterId = item.id;
    }
    result.push(item);
  }
  if (currentChapterId) result.push(makeChapterFooter(currentChapterId));
  return result;
}
