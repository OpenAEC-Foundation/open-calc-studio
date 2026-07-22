import type { CostItem } from '@/types/costModel';

/** Compute resource breakdown totals for each item (used in WpCalc view).
 *  In WpCalc, each regel has BOTH a loon component (norm × tarief) and a
 *  material/resource component. The resource columns split by type.
 *
 *  Gedeeld tussen het grid (kolomweergave) en de statusbalk (som van een
 *  celselectie) — één bron, zodat de opgetelde waarde niet kan afwijken
 *  van wat er in de cel staat. */
export function computeResourceTotals(items: CostItem[]): Map<string, Record<string, number>> {
  const map = new Map<string, Record<string, number>>();
  const childrenByParent = new Map<string, CostItem[]>();

  for (const item of items) {
    if (item.parentId) {
      const list = childrenByParent.get(item.parentId) ?? [];
      list.push(item);
      childrenByParent.set(item.parentId, list);
    }
  }

  const byId = new Map(items.map((i) => [i.id, i]));

  function getTotals(itemId: string): Record<string, number> {
    if (map.has(itemId)) return map.get(itemId)!;

    const item = byId.get(itemId);
    if (!item) return {};

    const totals: Record<string, number> = {
      materiaalTotal: 0,
      arbeidTotal: 0,
      materieelTotal: 0,
      onderaannemingTotal: 0,
      stelpostTotal: 0,
    };

    if (item.rowType === 'regel') {
      const qty = item.quantity || 0;
      const lab = item.laborPrice ?? 0;
      const nup = item.normUnitPrice ?? 0;
      // Loon = laborPrice × aantal
      const loon = lab * qty;
      // Materiaalprijs = normUnitPrice × aantal
      const matKosten = nup * qty;

      // For onderaannemer: entire amount goes to onderaanneming, no loon
      switch (item.resourceType) {
        case 'onderaannemer':
          totals.onderaannemingTotal = item.total || 0;
          break;
        case 'materieel':
          totals.arbeidTotal = loon;
          totals.materieelTotal = matKosten;
          break;
        case 'overig':
          totals.arbeidTotal = loon;
          totals.stelpostTotal = matKosten;
          break;
        default:
          totals.arbeidTotal = loon;
          totals.materiaalTotal = matKosten;
          break;
      }
    } else {
      const children = childrenByParent.get(itemId) ?? [];
      for (const child of children) {
        const childTotals = getTotals(child.id);
        for (const key of Object.keys(totals)) {
          totals[key] += childTotals[key] || 0;
        }
      }
    }

    map.set(itemId, totals);
    return totals;
  }

  for (const item of items) {
    getTotals(item.id);
  }

  return map;
}
