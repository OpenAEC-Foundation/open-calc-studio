import type { CostItem } from '@/types/costModel';

/**
 * Op welke containerrijen verbergen we de Totaal-kolom?
 *
 * Een post met precies één kind dat hetzelfde bedrag draagt, zou dat bedrag
 * twee regels onder elkaar tonen. Dan verbergen we het op de ouder.
 *
 * Cruciale voorwaarde: het kind moet ook écht getekend worden. Op een
 * INGEKLAPTE rij is het kind onzichtbaar, en verdween het bedrag daarmee
 * volledig uit de Totaal-kolom — een ingeklapte post van 1.144,00 toonde
 * niets, terwijl datzelfde bedrag wél in het hoofdstuktotaal meetelde.
 */
export function computeHideTotalSet(items: CostItem[]): Set<string> {
  const set = new Set<string>();
  const childrenMap = new Map<string, CostItem[]>();
  for (const item of items) {
    if (item.parentId) {
      const list = childrenMap.get(item.parentId) ?? [];
      list.push(item);
      childrenMap.set(item.parentId, list);
    }
  }
  for (const item of items) {
    if (item.rowType !== 'chapter' && item.rowType !== 'begrotingspost') continue;
    // Ingeklapt: kinderen worden niet gerenderd, dus nooit verbergen.
    if (item.isCollapsed) continue;
    const children = (childrenMap.get(item.id) ?? [])
      .filter(c => c.rowType !== 'tekstregel' && c.rowType !== 'witregel');
    if (children.length === 1 && Math.abs(children[0].total - item.total) < 0.01) {
      set.add(item.id);
    }
  }
  return set;
}
