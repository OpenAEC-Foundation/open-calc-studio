import type { PriceRounding } from '../../types/costModel';

/**
 * Prijsafronding per begroting (#83).
 *
 * FIEBDC-3 legt in ~K per soort getal vast hoeveel decimalen het heeft, en
 * schrijft voor dat elke tussenstap half-up wordt afgerond en daarna met de
 * afgeronde waarde verder wordt gerekend. CYPE, Presto en TCQ doen dat ook;
 * Open Calc Studio rekende altijd onafgerond. Een begroting met een
 * `priceRounding` rekent zoals het bronprogramma; zonder rekent hij als
 * vanouds.
 */

/** Standaarden van FIEBDC-3 als ~K ontbreekt of onbruikbaar is: alles op centen. */
export const FIEBDC_DEFAULT_ROUNDING: PriceRounding = { line: 2, unitPrice: 2, total: 2 };

/** Redelijk bereik voor een aantal decimalen; daarbuiten is het veld onzin. */
export const isValidDecimals = (d: unknown): d is number =>
  typeof d === 'number' && Number.isInteger(d) && d >= 0 && d <= 6;

/**
 * Half-up afronden op `decimals` decimalen (FIEBDC: <5 blijft, ≥5 omhoog,
 * van nul af). De marge vangt float-ruis op: 0,7 × 18,35 is in een double
 * 12,8449999…, maar hoort 12,85 te worden. Ze schaalt mee met de grootte van
 * het getal (zo'n 16 ulp), zodat ook grote bedragen goed gaan, maar is begrensd
 * op 2⁻¹⁰ (≈ 0,001 eenheid van de laatste decimaal). Zonder die grens werd de
 * marge bij heel grote getallen (vanaf ~1e14 eenheden) groter dan een halve
 * eenheid: 1e10 op 6 decimalen of 2e12 op centen kreeg er dan een eenheid bij,
 * en de functie was niet meer idempotent. Vanaf 2⁵² is elk double een geheel
 * getal en valt de marge weg in de afronding van de optelling.
 */
const MAX_MARGIN = 2 ** -10;

export function roundHalfUp(n: number, decimals: number): number {
  if (!Number.isFinite(n) || n === 0) return n;
  const f = 10 ** decimals;
  const s = Math.abs(n) * f;
  return Math.sign(n) * Math.round(s + Math.min(s * Number.EPSILON * 16 + 1e-9, MAX_MARGIN)) / f;
}

/**
 * De regel waarmee gerekend wordt, of null (onafgerond) als hij ontbreekt.
 * Ongeldige delen vallen terug op de FIEBDC-standaard.
 */
export function normalizePriceRounding(r: Partial<PriceRounding> | null | undefined): PriceRounding | null {
  if (!r) return null;
  return {
    line: isValidDecimals(r.line) ? r.line : FIEBDC_DEFAULT_ROUNDING.line,
    unitPrice: isValidDecimals(r.unitPrice) ? r.unitPrice : FIEBDC_DEFAULT_ROUNDING.unitPrice,
    total: isValidDecimals(r.total) ? r.total : FIEBDC_DEFAULT_ROUNDING.total,
  };
}
