import type { CostItem, MeasurementField, MeasurementLine } from '@/types/costModel';
import { roundHalfUp } from '@/services/calculation/priceRounding';

/**
 * Meetregels (afmetingenstaat) onder een post, #96. De hoeveelheid van een
 * post met meetregels is de som van de regels; zie `setMeasurementLines` in
 * de store, die ook de middelen eronder laat meeschalen.
 */

export const MEASUREMENT_FIELDS: readonly MeasurementField[] = ['count', 'length', 'width', 'height'];

/**
 * Decimalen van een meetregel en van de som. FIEBDC-3 rondt elke tussenstap
 * half-up af en rekent met de afgeronde waarde verder; voor meetregels is
 * dat DS in ~K, en Presto en CYPE schrijven daar 3. Zo is de som gelijk aan
 * die in het bronprogramma, en verdwijnt float-ruis (0,1 + 0,2).
 */
export const MEASUREMENT_DECIMALS = 3;
const round = (n: number): number => roundHalfUp(n, MEASUREMENT_DECIMALS);

/** Rijen die meetregels kunnen hebben. */
export function canHaveMeasurementLines(item: Pick<CostItem, 'rowType' | 'id'>): boolean {
  return (item.rowType === 'begrotingspost' || item.rowType === 'bewakingspost') && !item.id.startsWith('footer:');
}

export function hasMeasurementLines(item: Pick<CostItem, 'measurementLines'>): boolean {
  return (item.measurementLines?.length ?? 0) > 0;
}

/**
 * Uitkomst van één regel: het product van de ingevulde vakken. Lege vakken
 * tellen niet mee; zijn ze allemaal leeg, dan is de regel 0 (een regel met
 * alleen een omschrijving is een opmerking). Een tussentotaal telt niet mee.
 */
export function lineValue(line: MeasurementLine): number {
  if (line.subtotal) return 0;
  let product = 1;
  let any = false;
  for (const f of MEASUREMENT_FIELDS) {
    const v = line[f];
    if (v == null || !Number.isFinite(v)) continue;
    product *= v;
    any = true;
  }
  return any ? round(product) : 0;
}

/** De hoeveelheid die de regels samen opleveren. */
export function measurementSum(lines: readonly MeasurementLine[] | undefined): number {
  return round((lines ?? []).reduce((s, l) => s + lineValue(l), 0));
}

/**
 * Wat een tussentotaalregel toont: de som van de gewone regels sinds het
 * vorige tussentotaal ('partial') of vanaf het begin ('cumulative').
 */
export function subtotalValue(lines: readonly MeasurementLine[], index: number): number {
  const line = lines[index];
  if (!line?.subtotal) return lineValue(line);
  let sum = 0;
  for (let i = index - 1; i >= 0; i--) {
    if (lines[i].subtotal && line.subtotal === 'partial') break;
    sum += lineValue(lines[i]);
  }
  return round(sum);
}

export function newMeasurementLine(partial: Partial<MeasurementLine> = {}): MeasurementLine {
  return {
    id: crypto.randomUUID(),
    description: '',
    count: null,
    length: null,
    width: null,
    height: null,
    ...partial,
  };
}

/**
 * Of de hoeveelheid van de post de som van de regels is, op de decimalen
 * van de meetregels. Wijkt hij af (een bestand van buiten, een oudere
 * versie), dan toont het tabelletje dat; de hoeveelheid blijft staan tot de
 * gebruiker kiest.
 */
export function quantityMatchesLines(item: Pick<CostItem, 'quantity' | 'measurementLines'>): boolean {
  if (!item.measurementLines?.length) return true;
  return Math.abs((item.quantity ?? 0) - measurementSum(item.measurementLines)) < 0.5 * 10 ** -MEASUREMENT_DECIMALS;
}

/** Of twee hoeveelheden gelijk genoeg zijn om als dezelfde te gelden (float-ruis). */
export function sameQuantity(a: number | null | undefined, b: number | null | undefined): boolean {
  const x = a ?? 0;
  const y = b ?? 0;
  return Math.abs(x - y) <= 1e-9 * Math.max(1, Math.abs(x), Math.abs(y));
}
