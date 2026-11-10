import type { SubSheetCell } from '@/types/costModel';
import { currencyDigits, getNumberLocale, safeCurrency } from '@/utils/formatting';

// Celweergave met het aantal decimalen van de cel, in de getalnotatie van de
// app (instelling "Getalnotatie", issue #65): "1.250,00" of "1,250.00".
// Subbladen lezen getypte getallen in dezelfde notatie (subSheetSlice), en
// een ingevulde cel bewaart zijn berekende waarde, dus een andere notatie
// verandert alleen de weergave, niet de waarde. 'currency' krijgt het teken
// en het aantal decimalen van de begrotingsvaluta (0 voor JPY/KRW/CLP).
// Gedeeld door het desktopraster en de mobiele deelbladlijst, zodat beide
// hetzelfde tonen.
const cellFormatters = new Map<string, Intl.NumberFormat>();

// Een met de hand bewerkt bestand kan rare decimalen bevatten; Intl gooit
// dan een RangeError en die mag het raster niet laten crashen.
const safeDecimals = (decimals: number) => Number.isFinite(decimals) ? Math.min(20, Math.max(0, Math.round(decimals))) : 2;

export function formatCellNumber(value: number, decimals: number, currency?: string): string {
  const dec = safeDecimals(decimals);
  const locale = getNumberLocale();
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

/**
 * Decimalen van een cel: wat de gebruiker koos, anders 2; een valutacel
 * zonder eigen keuze volgt de valuta (JPY 0, KWD 3).
 */
export function cellDecimals(cell: SubSheetCell | undefined, currency?: string): number {
  if (cell?.decimals !== undefined) return cell.decimals;
  return cell?.format === 'currency' ? currencyDigits(currency) : 2;
}

/** De tekst die een cel toont: de berekende waarde in de celopmaak, anders de invoer. */
export function cellDisplayText(cell: SubSheetCell | undefined, currency?: string): string {
  if (!cell) return '';
  if (cell.computed === undefined) return cell.value;
  const dec = cellDecimals(cell, currency);
  const fmt = cell.format || 'auto';
  if (fmt === 'currency') return formatCellNumber(cell.computed, dec, currency);
  if (fmt === 'percentage') return `${formatCellNumber(cell.computed * 100, dec)}%`;
  if (typeof cell.computed === 'number') return formatCellNumber(cell.computed, dec);
  return cell.value;
}
