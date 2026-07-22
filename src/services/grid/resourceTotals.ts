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
      const norm = item.normQuantity ?? 0;
      const cap = item.normFactor ?? 1;

      // Dezelfde twee rekenmodellen als de calculator, anders tellen de
      // kostensoort-kolommen niet op tot het bedrag van de regel:
      //  - WpCalc (loon ingevuld, of geen norm): aantal × prijs
      //  - UI-1 (norm > 0, geen apart loon):     hoeveelheid × prijs/middel
      // Zonder dat tweede geval viel de productienorm weg: een regel van
      // 8 uur à 71,50 telde als 71,50 in plaats van 572,00.
      let loon: number;
      let matKosten: number;
      if (lab > 0 || norm === 0) {
        loon = lab * qty;
        matKosten = nup * qty;
      } else {
        loon = 0;
        matKosten = (qty * norm / (cap || 1)) * nup;
      }

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

      // Kale (bewakings)post met een eigen prijs: de calculator valt terug
      // op die eigen prijs zodra de kinderen niets opleveren (lege
      // bewakingspost, alleen een tekstregel). Doe hier hetzelfde, anders
      // staat dat geld wél in Totaal maar in geen enkele kostensoort-kolom
      // en loopt het hoofdstuk-subtotaal uit de pas met het totaal.
      const childSum = totals.arbeidTotal + totals.materiaalTotal + totals.materieelTotal
        + totals.stelpostTotal + totals.onderaannemingTotal;
      if (childSum === 0 && (item.rowType === 'begrotingspost' || item.rowType === 'bewakingspost')) {
        const qty = item.quantity ?? 0;
        const loon = (item.laborPrice ?? 0) * qty;
        // BasCalc pint de postprijs in materialPrice; normUnitPrice is de
        // handmatig ingevulde eigen prijs. Samen vormen ze het bedrag.
        const eigen = ((item.normUnitPrice ?? 0) + (item.materialPrice ?? 0)) * qty;
        switch (item.resourceType) {
          case 'onderaannemer':
            totals.onderaannemingTotal = item.total || 0;
            break;
          case 'materieel':
            totals.arbeidTotal = loon;
            totals.materieelTotal = eigen;
            break;
          case 'overig':
            totals.arbeidTotal = loon;
            totals.stelpostTotal = eigen;
            break;
          default:
            totals.arbeidTotal = loon;
            totals.materiaalTotal = eigen;
            break;
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
