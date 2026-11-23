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

/** Aantal decimalen van een getal zoals het is ingevoerd (hoogstens 9). */
function decimalsOf(n: number): number {
  for (let d = 0; d < 9; d++) {
    const scaled = n * 10 ** d;
    if (Math.abs(scaled - Math.round(scaled)) < 1e-9 * Math.max(1, Math.abs(scaled))) return d;
  }
  return 9;
}

/** Rijen die meetregels kunnen hebben. */
export function canHaveMeasurementLines(item: Pick<CostItem, 'rowType' | 'id'>): boolean {
  return (item.rowType === 'begrotingspost' || item.rowType === 'bewakingspost') && !item.id.startsWith('footer:');
}

/** De post zonder meetregels (en hun inklapstand): voor wegen die een koppeling zetten buiten updateItem om. */
export function withoutMeasurementLines<T extends Pick<CostItem, 'measurementLines' | 'measurementLinesCollapsed'>>(item: T): T {
  if (!item.measurementLines) return item;
  const { measurementLines: _lines, measurementLinesCollapsed: _collapsed, ...rest } = item;
  return rest as T;
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
  const factors = MEASUREMENT_FIELDS.map((f) => line[f]).filter((v): v is number => v != null && Number.isFinite(v));
  if (factors.length === 0) return 0;
  // Eén ingevuld vak: dat getal zelf, zoals getypt. Anders zou een post met
  // aantal 10,12345 bij de eerste meetregel stil naar 10,123 springen.
  if (factors.length === 1) return factors[0];
  return round(factors.reduce((p, v) => p * v, 1));
}

/**
 * Som van regelwaarden, afgerond op de decimalen van de fijnste regel (en
 * minstens 3): dat haalt float-ruis weg zonder getypte precisie te verliezen.
 */
function sumOf(values: number[]): number {
  const decimals = values.reduce((d, v) => Math.max(d, decimalsOf(v)), MEASUREMENT_DECIMALS);
  return roundHalfUp(values.reduce((s, v) => s + v, 0), decimals);
}

/** De hoeveelheid die de regels samen opleveren. */
export function measurementSum(lines: readonly MeasurementLine[] | undefined): number {
  return sumOf((lines ?? []).map(lineValue));
}

/**
 * Wat een tussentotaalregel toont: de som van de gewone regels sinds het
 * vorige tussentotaal ('partial') of vanaf het begin ('cumulative').
 */
export function subtotalValue(lines: readonly MeasurementLine[], index: number): number {
  const line = lines[index];
  if (!line?.subtotal) return lineValue(line);
  const values: number[] = [];
  for (let i = index - 1; i >= 0; i--) {
    if (lines[i].subtotal && line.subtotal === 'partial') break;
    values.push(lineValue(lines[i]));
  }
  return sumOf(values);
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
