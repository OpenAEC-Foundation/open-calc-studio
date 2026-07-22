import type { CostItem, GridColumn } from '@/types/costModel';
import { isFooterRow } from './gridRows';

/**
 * De numerieke waarde van één gridcel — de tegenhanger van wat GridCell
 * tékent, maar dan als getal. `null` betekent: die cel toont geen getal
 * (leeg, tekst, of niet van toepassing op dit rijtype) en telt dus niet mee.
 *
 * Bewust gespiegeld aan de weergaveregels in GridCell: de statusbalk moet
 * exact optellen wat je in de kolom ziet staan, niet een onderliggend veld
 * dat toevallig gevuld is.
 */
export function getGridCellNumber(
  item: CostItem,
  colKey: string,
  resourceTotals?: Record<string, number>
): number | null {
  const rt = item.rowType;
  const isRegel = rt === 'regel';
  const isBgr = rt === 'begrotingspost';
  const isBwk = rt === 'bewakingspost';

  switch (colKey) {
    case 'quantity':
      // Staartregels tonen een percentage — geen bedrag om op te tellen.
      if (rt.startsWith('staart_')) return null;
      return (isRegel || isBgr || isBwk) ? (item.quantity ?? null) : null;

    case 'productienorm':
      return isRegel ? (item.normQuantity ?? null) : null;

    case 'productiecapaciteit':
      return isRegel ? (item.normFactor ?? null) : null;

    case 'hoeveelheid': {
      if (isRegel) {
        const qty = item.quantity ?? 0;
        const norm = item.normQuantity ?? 0;
        const cap = item.normFactor ?? 1;
        if (qty === 0 || norm === 0) return null;
        return qty * norm / (cap || 1);
      }
      if (isBgr || isBwk || rt === 'tekstregel') return item.quantity ?? null;
      return null;
    }

    case 'normUnitPrice': {
      if (isRegel) return item.normUnitPrice ?? null;
      if (isBgr || isBwk) {
        // Eigen prijs van een (bewakings)post: prijs/middel plus een
        // geïmporteerd materiaal-/loonbedrag (zie GridCell).
        const eigen = (item.normUnitPrice ?? 0) + (item.materialPrice ?? 0) + (item.laborPrice ?? 0);
        return eigen !== 0 ? eigen : null;
      }
      return null;
    }

    case 'unitPrice':
      return (isRegel || isBwk || isBgr) ? (item.unitPrice ?? null) : null;

    case 'total':
      if (isRegel || rt === 'tekstregel' || rt === 'witregel') return null;
      return item.total ?? null;

    case 'kostenEd': {
      if (isRegel) {
        const kostenEh = (item.normUnitPrice ?? 0) + (item.laborPrice ?? 0);
        return kostenEh ? kostenEh : null;
      }
      if (isBgr || isBwk) {
        const qty = item.quantity ?? 0;
        if (qty > 0) return item.total / qty;
        return item.unitPrice ? item.unitPrice : null;
      }
      return null;
    }

    case 'arbeidTotal':
    case 'materiaalTotal':
    case 'materieelTotal':
    case 'stelpostTotal':
    case 'onderaannemingTotal': {
      if (!resourceTotals) return null;
      const val = resourceTotals[colKey];
      return val ? val : null;
    }

    default:
      return null;
  }
}

/** Kolommen waarvoor de resource-uitsplitsing nodig is (duur om te berekenen). */
const RESOURCE_COLS = new Set([
  'arbeidTotal', 'materiaalTotal', 'materieelTotal', 'stelpostTotal', 'onderaannemingTotal',
]);

export function needsResourceTotals(columns: GridColumn[], minCol: number, maxCol: number): boolean {
  for (let c = minCol; c <= maxCol; c++) {
    const key = columns[c]?.key;
    if (key && RESOURCE_COLS.has(key)) return true;
  }
  return false;
}

export interface SelectionSummary {
  /** Aantal cellen met een getal (lege/tekstcellen tellen niet mee) */
  count: number;
  sum: number;
  min: number;
  max: number;
  /** Zijn de meegetelde cellen allemaal bedragen? Dan tonen we ze als valuta. */
  currency: boolean;
}

/** Kolommen die een bedrag tonen (voor de opmaak van de som) */
const CURRENCY_COLS = new Set([
  'normUnitPrice', 'unitPrice', 'total', 'kostenEd',
  'arbeidTotal', 'materiaalTotal', 'materieelTotal', 'stelpostTotal', 'onderaannemingTotal',
]);

/**
 * Tel de getallen in een celselectie op — de Excel-achtige som onderin.
 *
 * Synthetische hoofdstuk-footerrijen worden overgeslagen: dat zijn
 * automatische subtotalen, meetellen zou de som dubbel maken.
 */
export function summarizeCellSelection(
  rows: CostItem[],
  columns: GridColumn[],
  start: { row: number; col: number },
  end: { row: number; col: number },
  resourceTotalsMap?: Map<string, Record<string, number>>
): SelectionSummary {
  const minRow = Math.min(start.row, end.row);
  const maxRow = Math.max(start.row, end.row);
  const minCol = Math.min(start.col, end.col);
  const maxCol = Math.max(start.col, end.col);

  let count = 0;
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  let allCurrency = true;

  for (let r = minRow; r <= maxRow; r++) {
    const item = rows[r];
    if (!item || isFooterRow(item.id)) continue;
    for (let c = minCol; c <= maxCol; c++) {
      const col = columns[c];
      if (!col) continue;
      const val = getGridCellNumber(item, col.key, resourceTotalsMap?.get(item.id));
      if (val == null || !isFinite(val)) continue;
      count++;
      sum += val;
      if (val < min) min = val;
      if (val > max) max = val;
      if (!CURRENCY_COLS.has(col.key)) allCurrency = false;
    }
  }

  return {
    count,
    sum,
    min: count ? min : 0,
    max: count ? max : 0,
    currency: count > 0 && allCurrency,
  };
}
