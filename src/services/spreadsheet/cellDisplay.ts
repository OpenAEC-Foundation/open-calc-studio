import type { SubSheetCell } from '@/types/costModel';
import { safeCurrency } from '@/utils/formatting';

// Celweergave met het aantal decimalen van de cel. Subbladen lezen getallen
// in NL-notatie (subSheetSlice: parseNlNumber, ook voor opgeslagen bladen),
// dus tonen ze die ook, los van de app-taal: anders zie je "1,250.00" en
// leest het blad "1,250" als 1,25. 'currency' krijgt wel het teken van de
// begrotingsvaluta (issue #65). Gedeeld door het desktopraster en de
// mobiele deelbladlijst, zodat beide hetzelfde tonen.
const cellFormatters = new Map<string, Intl.NumberFormat>();
export function formatCellNumber(value: number, decimals: number, currency?: string): string {
  // Een met de hand bewerkt bestand kan rare decimalen bevatten; Intl gooit
  // dan een RangeError en die mag het raster niet laten crashen.
  const dec = Number.isFinite(decimals) ? Math.min(20, Math.max(0, Math.round(decimals))) : 2;
  const locale = 'nl-NL';
  const key = `${locale}|${dec}|${currency ?? ''}`;
  let f = cellFormatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(`${locale}-u-nu-latn`, {
      minimumFractionDigits: dec,
      maximumFractionDigits: dec,
      ...(currency ? { style: 'currency', currency: safeCurrency(currency) } : {}),
    });
    cellFormatters.set(key, f);
  }
  return f.format(value).replace(/−/g, '-');
}

/** De tekst die een cel toont: de berekende waarde in de celopmaak, anders de invoer. */
export function cellDisplayText(cell: SubSheetCell | undefined, currency?: string): string {
  if (!cell) return '';
  if (cell.computed === undefined) return cell.value;
  const dec = cell.decimals ?? 2;
  const fmt = cell.format || 'auto';
  if (fmt === 'currency') return formatCellNumber(cell.computed, dec, currency);
  if (fmt === 'percentage') return `${(cell.computed * 100).toFixed(Number.isFinite(dec) ? Math.min(20, Math.max(0, Math.round(dec))) : 2)}%`;
  if (typeof cell.computed === 'number') return formatCellNumber(cell.computed, dec);
  return cell.value;
}
