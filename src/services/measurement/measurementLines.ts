import type { CostItem, MeasurementField, MeasurementLine } from '@/types/costModel';
import { roundHalfUp } from '@/services/calculation/priceRounding';
import { parseNumericInput } from '@/utils/numericInput';
import { parseLocaleNumber } from '@/utils/formatting';
import { evaluateLineExpression } from './lineExpression';

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
  if (line.expression) {
    // Regelformule: lege vakken tellen als 0; een formule die niets oplevert telt als 0.
    const v = evaluateLineExpression(line.expression, { a: line.count, b: line.length, c: line.width, d: line.height });
    return v === null ? 0 : round(v);
  }
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

/** Kolommen van het tabelletje in volgorde, zoals een geplakt blok ze vult. */
export const MEASUREMENT_PASTE_COLUMNS: readonly ('description' | MeasurementField)[] = ['description', ...MEASUREMENT_FIELDS];

/**
 * Tekst van het klembord als blok cellen: regels op \r\n of \n, cellen op
 * tab. Excel zet een cel met een tab, regeleinde of aanhalingsteken tussen
 * "…" (met "" voor een aanhalingsteken); dat wordt hier teruggedraaid. Het
 * laatste regeleinde (Excel sluit elke kopie ermee af) telt niet als regel.
 */
export function parseClipboardBlock(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let i = 0;
  let atCellStart = true;
  while (i < text.length) {
    const ch = text[i];
    if (atCellStart && ch === '"') {
      // Aanhalingstekens tot het sluitende "; "" is een " in de cel.
      let j = i + 1;
      let quoted = '';
      while (j < text.length) {
        if (text[j] === '"') {
          if (text[j + 1] === '"') { quoted += '"'; j += 2; continue; }
          break;
        }
        quoted += text[j++];
      }
      // Alleen een nette cel ("…" gevolgd door tab, regeleinde of einde);
      // anders is het gewoon tekst die met een " begint.
      const after = text[j + 1];
      if (j < text.length && (after === undefined || after === '\t' || after === '\n' || after === '\r')) {
        cell = quoted;
        i = j + 1;
        atCellStart = false;
        continue;
      }
    }
    atCellStart = false;
    if (ch === '\t') {
      row.push(cell); cell = ''; atCellStart = true; i++;
    } else if (ch === '\r' || ch === '\n') {
      row.push(cell); rows.push(row); row = []; cell = ''; atCellStart = true;
      i += ch === '\r' && text[i + 1] === '\n' ? 2 : 1;
    } else {
      cell += ch; i++;
    }
  }
  if (!atCellStart || cell !== '' || row.length > 0) { row.push(cell); rows.push(row); }
  return rows;
}

/** Of geplakte tekst meer is dan één cel (een tab of een tweede regel). */
export function isClipboardBlock(text: string): boolean {
  const rows = parseClipboardBlock(text);
  return rows.length > 1 || (rows[0]?.length ?? 0) > 1;
}

/** Tekens die in een geplakt getal mogen staan (zonder `=`): cijfers, scheidingstekens, teken, rekenen. */
const NUMBER_CELL = /^[\d\s.,'\u00A0\u202F+\-\u2212*/()]+$/;
/** Eén getal (cijfers met scheidingstekens, eventueel een teken ervoor). */
const PLAIN_NUMBER = /^[-+\u2212]?[\d\s.,'\u00A0\u202F]*\d$/;
/** Negatief getal tussen haakjes, zoals Excel het in boekhoudnotatie kopieert: "(12)", "(1,50)". */
const BRACKET_NEGATIVE = /^\(\s*([\d\s.,'\u00A0\u202F]*\d)\s*\)$/;
/**
 * Een echte rekensom zonder `=`: met * / of haakjes, of met + / - tussen
 * spaties ("10 - 2"). Zo worden een datum ("1-2-2024") of een code ("12-3")
 * niet stil uitgerekend.
 */
const CALCULATION = /[*/()]|\s[+\-\u2212]\s/;
/**
 * Getal met een eenheid erachter, zoals Excel een cel met getalnotatie
 * "0 m" of "0,00 m²" kopieert: "12 m", "8,5m2", "3 st". De eenheid is 1 tot
 * 5 letters, eventueel met 2/3 of ²/³ en een punt.
 */
const NUMBER_WITH_UNIT = /^([-+\u2212]?[\d\s.,'\u00A0\u202F]*\d)(\s*)([A-Za-z\u00B5]{1,5}[23\u00B2\u00B3]?\.?)$/;
/** Spaties en apostrof (duizendtal in Zwitserland) weg, voor het tellen van scheidingstekens. */
const stripGrouping = (raw: string) => raw.replace(/[\s\u00A0\u202F']/g, '');

/** Wat er in een geplakte getalcel staat, vóór het lezen. */
interface PastedNumberText {
  /** Lege cel. */
  empty?: boolean;
  /** Tekst met `=`: een formule. */
  formula?: string;
  /** Eén getal, zonder eenheid. */
  number?: string;
  /** Een rekensom zonder `=` ("2*3"). */
  calculation?: string;
  /** Er stond een eenheid achter die is weggelaten. */
  unit?: boolean;
}

function splitPastedNumber(raw: string): PastedNumberText | undefined {
  const text = raw.trim();
  if (text === '') return { empty: true };
  if (text.startsWith('=')) return { formula: text };
  const negative = BRACKET_NEGATIVE.exec(text);
  if (negative) return { number: `-${negative[1].trim()}` };
  if (PLAIN_NUMBER.test(text)) return { number: text };
  if (NUMBER_CELL.test(text)) return CALCULATION.test(text) ? { calculation: text } : undefined;
  const m = NUMBER_WITH_UNIT.exec(text);
  // "1e3" is geen 1 met eenheid "e3": zonder spatie mag de eenheid niet met e beginnen.
  if (m && !(m[2] === '' && /^[eE]/.test(m[3]))) return { number: m[1], unit: true };
  return undefined;
}

/** Getallen in een cel waaruit het decimaalteken van het blok kan blijken (ook die in een formule of rekensom). */
function numberTokens(split: PastedNumberText | undefined): string[] {
  if (!split) return [];
  if (split.number) return [split.number];
  const expr = split.formula ?? split.calculation;
  return expr ? expr.match(/\d[\d.,]*\d|\d/g) ?? [] : [];
}

/**
 * Welk decimaalteken een geplakt blok gebruikt, uit de getallen zelf:
 * - komma en punt allebei in een getal: de laatste is het decimaalteken;
 * - een teken dat twee keer voorkomt is een duizendtal ("1.234.567");
 * - één teken met geen 3 cijfers erachter ("2,5"), of met 0 of meer dan 3
 *   cijfers ervoor ("0,250", "1234,500"), is een decimaalteken.
 * Zo leest "2,5" en "0,250" uit een Spaans werkboek goed, ook als de app in
 * het Engels staat. Geven de getallen geen uitsluitsel (alleen
 * "1,250"-achtige getallen) of spreken ze elkaar tegen, dan `undefined`.
 */
export function detectPasteDecimal(numbers: readonly string[]): ',' | '.' | undefined {
  let comma = 0;
  let dot = 0;
  for (const raw of numbers) {
    const s = stripGrouping(raw).replace(/^[-+\u2212]/, '');
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastComma >= 0 && lastDot >= 0) {
      if (lastComma > lastDot) comma++; else dot++;
      continue;
    }
    for (const sep of [',', '.'] as const) {
      const count = s.split(sep).length - 1;
      if (count === 0) continue;
      const vote = (decimal: ',' | '.') => { if (decimal === ',') comma++; else dot++; };
      if (count > 1) { vote(sep === ',' ? '.' : ','); continue; } // meerdere keren: duizendtal
      const whole = s.slice(0, s.indexOf(sep));
      const decimals = s.length - s.indexOf(sep) - 1;
      if (decimals !== 3 || /^0*$/.test(whole) || whole.length > 3) vote(sep);
    }
  }
  if (comma > 0 && dot === 0) return ',';
  if (dot > 0 && comma === 0) return '.';
  return undefined;
}

/** Of een getal dubbelzinnig is: 1 tot 3 cijfers (niet 0), één scheidingsteken, precies 3 cijfers ("1,250"). */
function isAmbiguousNumber(raw: string): boolean {
  return /^[-+\u2212]?[1-9]\d{0,2}[.,]\d{3}$/.test(stripGrouping(raw));
}

export interface MeasurementPasteResult {
  lines: MeasurementLine[];
  /** Regelnummers (vanaf 1, in het tabelletje) met een getal dat niet te lezen was; dat vak is leeg. */
  invalidLines: number[];
  /** Regelnummers waar een eenheid achter een getal is weggelaten ("12 m" → 12). */
  unitLines: number[];
  /** Er stonden gevulde kolommen rechts van Hoogte; die zijn niet geplakt. */
  droppedColumns: boolean;
  /**
   * Een dubbelzinnig getal ("1,250") dat volgens de taal van de app is
   * gelezen, omdat het blok zelf geen uitsluitsel gaf: de tekst en de waarde.
   */
  decimalGuess?: { text: string; value: number };
  /** De regel waar de eerste geplakte rij in kwam (na overgeslagen tussentotalen). */
  firstLineId?: string;
}

/**
 * Plakt een blok cellen in de meetregels vanaf regel `startIndex`, kolom
 * `startField`. De kolommen volgen het tabelletje (omschrijving, aantal,
 * lengte, breedte, hoogte) vanaf het startvak; wat daar rechts buiten valt
 * wordt niet geplakt. Bestaande regels worden overschreven, alleen in de
 * geplakte kolommen; tussentotaalregels worden overgeslagen. Komen er meer
 * regels dan er zijn, dan komen ze erbij: vóór de tussentotalen onderaan,
 * zodat een eindtotaal het eindtotaal blijft.
 *
 * `appDecimal` is het decimaalteken van de app-taal: alleen gebruikt als de
 * getallen in het blok zelf geen uitsluitsel geven.
 */
export function pasteIntoMeasurementLines(
  lines: readonly MeasurementLine[],
  startIndex: number,
  startField: 'description' | MeasurementField,
  rows: readonly (readonly string[])[],
  appDecimal: ',' | '.' = '.',
): MeasurementPasteResult {
  const firstColumn = Math.max(0, MEASUREMENT_PASTE_COLUMNS.indexOf(startField));
  const columnAt = (c: number) => MEASUREMENT_PASTE_COLUMNS[firstColumn + c];

  // Eerst alle getallen van het blok: daaruit volgt het decimaalteken.
  const plainNumbers: string[] = [];
  let droppedColumns = false;
  for (const cells of rows) {
    cells.forEach((raw, c) => {
      const column = columnAt(c);
      if (!column) { if (raw.trim() !== '') droppedColumns = true; return; }
      if (column === 'description') return;
      plainNumbers.push(...numberTokens(splitPastedNumber(raw)));
    });
  }
  const detected = detectPasteDecimal(plainNumbers);
  const decimal = detected ?? appDecimal;
  let decimalGuess: MeasurementPasteResult['decimalGuess'];

  const read = (raw: string): { value: number | null; formula?: string; unit?: boolean } | undefined => {
    const split = splitPastedNumber(raw);
    if (!split) return undefined;
    if (split.empty) return { value: null };
    if (split.formula) {
      const value = parseNumericInput(split.formula, decimal);
      return value === null || !Number.isFinite(value) ? undefined : { value, formula: split.formula };
    }
    if (split.calculation) {
      const value = parseNumericInput(split.calculation, decimal);
      return value === null || !Number.isFinite(value) ? undefined : { value };
    }
    const text = split.number!;
    // Het decimaalteken twee keer in één getal ("1.234.567" bij een punt) is niet te lezen.
    if (stripGrouping(text).split(decimal).length > 2) return undefined;
    const value = parseLocaleNumber(text, decimal);
    if (value === null || !Number.isFinite(value)) return undefined;
    if (!detected && !decimalGuess && isAmbiguousNumber(text)) decimalGuess = { text: text.trim(), value };
    return { value, unit: split.unit };
  };

  const next = [...lines];
  let firstLineId: string | undefined;
  const invalid = new Set<number>();
  const units = new Set<number>();
  // Tussentotalen onderaan: nieuwe regels komen ervóór, tenzij het plakken daar zelf begon.
  let tail = next.length;
  while (tail > 0 && next[tail - 1].subtotal) tail--;
  const start = Math.min(Math.max(0, startIndex), next.length);
  const insertBeforeTail = start < tail;
  let target = start;
  for (const cells of rows) {
    while (target < tail && next[target].subtotal) target++;
    let position: number;
    let line: MeasurementLine;
    if (target < tail) {
      position = target++;
      line = { ...next[position] };
    } else {
      position = insertBeforeTail ? tail : next.length;
      line = newMeasurementLine();
    }
    const formulas = { ...(line.formulas ?? {}) };
    cells.forEach((raw, c) => {
      const column = columnAt(c);
      if (!column) return;
      if (column === 'description') { line.description = raw.trim(); return; }
      const value = read(raw);
      if (!value) invalid.add(position + 1);
      if (value?.unit) units.add(position + 1);
      line[column] = value?.value ?? null;
      if (value?.formula) formulas[column] = value.formula; else delete formulas[column];
    });
    if (Object.keys(formulas).length > 0) line.formulas = formulas; else delete line.formulas;
    firstLineId ??= line.id;
    if (position < next.length && next[position].id === line.id) {
      next[position] = line;
    } else {
      next.splice(position, 0, line);
      if (insertBeforeTail) { tail++; target = tail; } else target = next.length;
    }
  }
  const sorted = (set: Set<number>) => [...set].sort((a, b) => a - b);
  return { lines: next, invalidLines: sorted(invalid), unitLines: sorted(units), droppedColumns, decimalGuess, firstLineId };
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
