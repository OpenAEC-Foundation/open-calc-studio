import { readWorkbookForValues, WORKBOOK_LIMITS } from '@/services/importers/safeWorkbook';
import { uiText } from '../../i18n/uiText';
import * as XLSX from 'xlsx';
import { BudgetBuilder, parseAmount, normalizeUnit } from './core';
import type { ImportCellDiagnostics, ImportResult } from './types';
import type { CostItem } from '@/types/costModel';

/**
 * Generieke Excel/CSV-importer met kolom-mapping.
 *
 * Veel begrotingen worden uitgewisseld als "gewoon" Excel- of CSV-bestand met
 * een vrije kolomindeling. Deze importer leest de rijen in en laat de gebruiker
 * (via een mapping-dialoog) elke bronkolom aan een doelveld koppelen. De pure
 * logica hier — parsen, auto-detectie en opbouw — staat los van de UI, zodat
 * ze testbaar is.
 */

/** Doelvelden waaraan een bronkolom gekoppeld kan worden. */
export type TargetField =
  | 'ignore'
  | 'code'
  | 'nr'
  | 'description'
  | 'unit'
  | 'quantity'
  | 'materialPrice'
  | 'laborPrice'
  | 'equipmentPrice'
  | 'unitPrice'
  | 'total';

/**
 * Doelvelden in dropdown-volgorde. `label` is de NL-terugvaltekst; de dialoog
 * vertaalt via `dialogs:columnMapping.fields.<field>`.
 */
export const TARGET_FIELDS: { field: TargetField; label: string }[] = [
  { field: 'ignore', label: '— negeren —' },
  { field: 'code', label: 'Code' },
  { field: 'nr', label: 'Nr' },
  { field: 'description', label: 'Omschrijving' },
  { field: 'unit', label: 'Eenheid' },
  { field: 'quantity', label: 'Hoeveelheid' },
  { field: 'materialPrice', label: 'Materiaal (prijs/eh)' },
  { field: 'laborPrice', label: 'Arbeid (prijs/eh)' },
  { field: 'equipmentPrice', label: 'Materieel (prijs/eh)' },
  { field: 'unitPrice', label: 'Eenheidsprijs' },
  { field: 'total', label: 'Totaal (bedrag)' },
];

/** Mapping: bronkolom-index → doelveld. `ignore` = kolom overslaan. */
export type ColumnMapping = TargetField[];

export interface TabularData {
  headers: string[];
  rows: string[][];
  sourceName: string;
  /**
   * Excel only: cells without a usable value (#88). `row` indexes `rows`,
   * `col` indexes the row array. `noCachedValue` = a formula whose result was
   * never calculated (a file written by a script and never saved in Excel:
   * no stored result, or a placeholder 0); `error` = an Excel error such as
   * #REF!. Errors and missing results arrive in `rows` as ''.
   */
  cellIssues?: TabularCellIssue[];
  /** Per column: `rows` indices of issues beyond the stored maximum (no address kept). */
  cellIssuesOverflow?: Record<number, number[]>;
  /**
   * Excel only: per column, `rows` indices of formula cells whose stored
   * result is used. That is the result Excel last saved; it is imported as it
   * is and never recalculated (#88).
   */
  formulaCells?: Record<number, number[]>;
}

export interface TabularCellIssue {
  row: number;
  col: number;
  /** Sheet-qualified address, e.g. "Blad1!B3". */
  address: string;
  kind: 'noCachedValue' | 'error';
  /** The Excel error text (#REF!, #DIV/0!) for `error`. */
  text?: string;
}

// ── Parsen ────────────────────────────────────────────────────────────────

/** Detecteer het scheidingsteken van een CSV-kop (; , of tab). NL-Excel: ';'. */
function detectDelimiter(headerLine: string): string {
  const counts: Record<string, number> = { ';': 0, ',': 0, '\t': 0 };
  for (const ch of headerLine) if (ch in counts) counts[ch] += 1;
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] > 0 ? best[0] : ';';
}

/** Parse één CSV-regel met ondersteuning voor "quoted" velden. */
function parseCsvLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i += 1; } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      out.push(cur); cur = '';
      if (out.length >= WORKBOOK_LIMITS.columns) throw Error('CSV exceeds 1,024 columns.');
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function parseCsv(text: string, sourceName = 'CSV-import'): TabularData {
  if (text.length * 2 > WORKBOOK_LIMITS.bytes) throw Error('CSV exceeds the supported size.');
  const clean = text.replace(/^﻿/, ''); // strip BOM
  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length > WORKBOOK_LIMITS.rows) throw Error('CSV exceeds 100,000 rows.');
  if (lines.length === 0) return { headers: [], rows: [], sourceName };
  const delim = detectDelimiter(lines[0]);
  const headers = parseCsvLine(lines[0], delim);
  const rows: string[][] = []; let cells = headers.length;
  for (const line of lines.slice(1)) {
    const row = parseCsvLine(line, delim); cells += row.length;
    if (cells > WORKBOOK_LIMITS.cells) throw Error('CSV exceeds two million cells.');
    rows.push(row);
  }
  return { headers, rows, sourceName };
}

export function parseXlsxTabular(buf: ArrayBuffer | Uint8Array, sourceName = 'Excel-import'): TabularData {
  // Een bestand dat nooit in Excel is berekend (openpyxl, XlsxWriter, pandas)
  // wordt met sheetStubs gelezen, zodat ook formulecellen zonder opgeslagen
  // uitkomst zichtbaar zijn (#88). sheet_to_json slaat stubs over, dus `rows`
  // blijft gelijk. Gewone Excel-bestanden houden de snelle leesmethode.
  const { workbook: wb, uncalculated } = readWorkbookForValues(buf instanceof Uint8Array ? buf : new Uint8Array(buf), { type: 'array' });
  // Kies het tabblad met de meeste rijen — dat is doorgaans de databladzijde.
  // Lege rijen vallen weg, maar we onthouden het echte rijnummer van elke rij
  // zodat een cel zonder bruikbare waarde met zijn adres gemeld kan worden (#88).
  let best: { name: string; rows: unknown[][]; sheetRows: number[] } | null = null;
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const start = XLSX.utils.decode_range(ws['!ref'] || 'A1').s;
    const all = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: true });
    const rows: unknown[][] = [];
    const sheetRows: number[] = [];
    all.forEach((r, i) => {
      if (!(r as unknown[]).some((v) => v != null && v !== '')) return;
      rows.push(r as unknown[]);
      sheetRows.push(start.r + i);
    });
    if (!best || rows.length > best.rows.length) best = { name, rows, sheetRows };
  }
  if (!best || best.rows.length === 0) return { headers: [], rows: [], sourceName };
  const toStr = (v: unknown) => (v == null ? '' : String(v).trim());
  const headers = best.rows[0].map(toStr);
  const rows = best.rows.slice(1).map((r) => r.map(toStr));

  const ws = wb.Sheets[best.name];
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  const cellIssues: TabularCellIssue[] = [];
  // Per kolom bewaren we een beperkt aantal cellen; de rest tellen we alleen,
  // zodat een blad vol #REF! de import niet opblaast.
  const perColumn = new Map<number, number>();
  const cellIssuesOverflow: Record<number, number[]> = {};
  const formulaCells: Record<number, number[]> = {};
  const add = (issue: TabularCellIssue) => {
    const seen = perColumn.get(issue.col) ?? 0;
    perColumn.set(issue.col, seen + 1);
    if (seen < MAX_CELL_ISSUES_PER_COLUMN) cellIssues.push(issue);
    else (cellIssuesOverflow[issue.col] ??= []).push(issue.row);
  };
  // Excel schrijft een bladnaam met spaties of leestekens tussen quotes.
  const sheetRef = /^[A-Za-z_][A-Za-z0-9_.]*$/.test(best.name) ? best.name : `'${best.name.replace(/'/g, "''")}'`;
  best.sheetRows.slice(1).forEach((r, row) => {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const ref = XLSX.utils.encode_cell({ r, c });
      const cell = ws[ref] as XLSX.CellObject | undefined;
      if (!cell) continue;
      const address = `${sheetRef}!${ref}`;
      const col = c - range.s.c;
      const issue = cellIssueKind(cell, uncalculated);
      if (issue) add({ row, col, address, ...issue });
      else if (cell.f || cell.F) (formulaCells[col] ??= []).push(row);
    }
  });
  return {
    headers, rows, sourceName,
    ...(cellIssues.length ? { cellIssues } : {}),
    ...(Object.keys(cellIssuesOverflow).length ? { cellIssuesOverflow } : {}),
    ...(Object.keys(formulaCells).length ? { formulaCells } : {}),
  };
}

/** Max. aantal bewaarde probleemcellen per kolom (#88); de rest telt mee in `cellIssuesOverflow`. */
const MAX_CELL_ISSUES_PER_COLUMN = 200;

/**
 * Waarom een cel geen bruikbare waarde heeft, of null (#88). Ook gebruikt
 * door de Excel-koppeling.
 * - Een foutcel eerst: SheetJS 0.20 kent nieuwere fouten (#SPILL!, #CALC!)
 *   niet als code, dan is alleen `w` gevuld. Een formule zonder uitkomst,
 *   geschreven als <f>…</f> zonder <v>, leest SheetJS ook als t 'e', maar
 *   zonder v én zonder w: die valt door naar de volgende regel.
 * - Een formule (ook binnen een matrix: `F`) zonder uitkomst: een stub
 *   (t 'z'), geen v, of het hele bestand is nooit in Excel berekend.
 */
export function cellIssueKind(cell: XLSX.CellObject, uncalculated: boolean): Pick<TabularCellIssue, 'kind' | 'text'> | null {
  if (cell.t === 'e' && (cell.v !== undefined || cell.w)) return { kind: 'error', text: cell.w || '#ERROR' };
  if ((cell.f || cell.F) && (uncalculated || cell.t === 'z' || cell.v === undefined)) return { kind: 'noCachedValue' };
  return null;
}

// ── Auto-detectie ───────────────────────────────────────────────────────────

// Koppen worden vóór vergelijking genormaliseerd: kleine letters, zonder
// accenten, spaties en leestekens ("Mano de obra" → "manodeobra",
// "Medición" → "medicion", "Ud." → "ud"). Spaanse koppen volgen Presto/BC3 (#40).
const HEADER_SYNONYMS: { field: TargetField; pattern: RegExp }[] = [
  { field: 'code', pattern: /^(code|stabu|nlsfb|nl-sfb|besteksnr|besteknr|artikelnr|artikelcode|codigo|cod)$/ },
  { field: 'nr', pattern: /^(nr|nummer|regelnr|volgnr|positie|pos|numero|num|nº|orden)$/ },
  { field: 'description', pattern: /^(omschrijving|omschr|oms|description|benaming|naam|werk|activiteit|resumen|descripcion|concepto|designacion)$/ },
  { field: 'unit', pattern: /^(eh|ehd|eenheid|unit|ud|uds|unidad|unidades)$/ },
  { field: 'quantity', pattern: /^(hoeveelheid|hoev|hvh|aantal|qty|quantity|medicion|cantidad|cant)$/ },
  { field: 'materialPrice', pattern: /^(materiaal|materiaalprijs|mat|matprijs|material|materiales)$/ },
  { field: 'laborPrice', pattern: /^(arbeid|arbeidsprijs|loon|loonprijs|labor|labour|uurprijs|urenprijs|manodeobra|mo)$/ },
  { field: 'equipmentPrice', pattern: /^(materieel|materieelprijs|equipment|machinery|plant|maquinaria|equipo|equipos)$/ },
  { field: 'unitPrice', pattern: /^(eenheidsprijs|ehprijs|ehprs|prijs|price|unitprice|stukprijs|tarief|prijspereh|precio|preciounitario)$/ },
  { field: 'total', pattern: /^(totaal|bedrag|total|amount|subtotaal|regeltotaal|importe)$/ },
];

/** Raad per bronkolom een doelveld op basis van de kop. Elk veld max. één keer. */
export function autoDetectMapping(headers: string[]): ColumnMapping {
  const used = new Set<TargetField>();
  return headers.map((h) => {
    const norm = h.trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[\s._/]+/g, '');
    for (const syn of HEADER_SYNONYMS) {
      if (used.has(syn.field)) continue;
      if (syn.pattern.test(norm)) { used.add(syn.field); return syn.field; }
    }
    return 'ignore';
  });
}

// ── Formulecellen en cellen zonder waarde (#88) ─────────────────────────────

/** Doelvelden met een getal; alleen daar telt een formule of een kapotte cel. */
const NUMBER_FIELDS: readonly TargetField[] = ['quantity', 'materialPrice', 'laborPrice', 'equipmentPrice', 'unitPrice', 'total'];

/** De kolom die de opbouw per getalveld gebruikt: bij een dubbele koppeling alleen de eerste. */
function numberColumns(mapping: ColumnMapping): Set<number> {
  return new Set(NUMBER_FIELDS.map((field) => mapping.indexOf(field)).filter((col) => col >= 0));
}

/**
 * Welke getalkolommen de opbouw voor een rij werkelijk gebruikt. Hoeveelheid,
 * materiaal, arbeid en materieel altijd; de eenheidsprijs alleen zonder
 * materiaal/arbeid; het totaal alleen als ook de eenheidsprijs leeg is. Een
 * Totaal-kolom vol formules (=B2*C2) naast een eenheidsprijs telt dus niet:
 * die uitkomst komt nooit in de begroting.
 */
function usedColumnsTest(mapping: ColumnMapping): (row: string[], col: number) => boolean {
  const [cQty, cMat, cLab, cEq, cUp, cTot] = NUMBER_FIELDS.map((field) => mapping.indexOf(field));
  const filled = (row: string[], idx: number) => idx >= 0 && (row[idx] ?? '').trim() !== '';
  return (row, col) => {
    if (col < 0) return false;
    if (col === cQty || col === cMat || col === cLab || col === cEq) return true;
    if (filled(row, cMat) || filled(row, cLab)) return false;
    if (col === cUp) return true;
    return col === cTot && !filled(row, cUp);
  };
}

/** Een rij wordt geïmporteerd als hij niet leeg is en een omschrijving of code heeft. */
function importedRowTest(mapping: ColumnMapping): (row: string[] | undefined) => boolean {
  const filled = (row: string[], idx: number) => idx >= 0 && (row[idx] ?? '').trim() !== '';
  const cDesc = mapping.indexOf('description');
  const cCode = mapping.indexOf('code');
  return (row) => !!row && (filled(row, cDesc) || filled(row, cCode));
}

export interface TabularCellSummary {
  /** Getallen in gekoppelde getalkolommen die een opgeslagen Excel-formule-uitkomst zijn. */
  formulaValues: number;
  /** Cellen in gekoppelde getalkolommen zonder bruikbare waarde (komen leeg binnen). */
  unusableCells: number;
}

/**
 * Tel voor deze kolomkoppeling de formule-uitkomsten en de cellen zonder
 * bruikbare waarde, alleen in getalkolommen en op rijen die geïmporteerd
 * worden. De kolomdialoog toont dit vóór het importeren (#88).
 */
export function summarizeCells(data: TabularData, mapping: ColumnMapping): TabularCellSummary {
  const cols = numberColumns(mapping);
  const imported = importedRowTest(mapping);
  const used = usedColumnsTest(mapping);
  // Telt alleen op regels die geïmporteerd worden, in een kolom die die regel gebruikt.
  const counts = (r: number, c: number) => imported(data.rows[r]) && used(data.rows[r], c);
  // Alleen een formule die een getal oplevert telt: =ALS(…;"";…) geeft een
  // lege cel en tekst als "n.v.t." komt als onleesbaar getal al apart in beeld.
  const isNumber = (r: number, c: number) => {
    const raw = (data.rows[r]?.[c] ?? '').trim();
    return raw !== '' && !parseAmount(raw).invalid;
  };
  let formulaValues = 0;
  let unusableCells = 0;
  for (const c of cols) {
    formulaValues += (data.formulaCells?.[c] ?? []).filter((r) => counts(r, c) && isNumber(r, c)).length;
    unusableCells += (data.cellIssuesOverflow?.[c] ?? []).filter((r) => counts(r, c)).length;
  }
  for (const issue of data.cellIssues ?? []) {
    if (cols.has(issue.col) && counts(issue.row, issue.col)) unusableCells += 1;
  }
  return { formulaValues, unusableCells };
}

export interface BuildOptions {
  /**
   * De gebruiker heeft de formule-uitkomsten al gezien in de kolomdialoog.
   * Zonder deze vlag komt er een melding bij, zodat ook een import zonder
   * dialoog laat weten dat de getallen opgeslagen uitkomsten zijn.
   */
  formulaValuesReviewed?: boolean;
}

// ── Opbouw ───────────────────────────────────────────────────────────────

/**
 * Bouw een ImportResult uit de rijen en de kolom-mapping.
 *
 * Heuristiek voor de rijsoort: een rij met (alleen) code/omschrijving en géén
 * hoeveelheid of bedrag wordt een hoofdstuk; overige rijen worden een
 * begrotingspost. De ouder volgt uit een hiërarchische code ("01.01.001"
 * valt onder hoofdstuk "01.01", dat onder "01" valt); zonder zo'n code komt
 * de rij onder het laatst geziene hoofdstuk.
 */
export function buildFromMapping(data: TabularData, mapping: ColumnMapping, options: BuildOptions = {}): ImportResult {
  const builder = new BudgetBuilder();
  const warnings: string[] = [];

  const colOf = (field: TargetField): number => mapping.indexOf(field);
  const cDesc = colOf('description');
  const cCode = colOf('code');
  const cNr = colOf('nr');
  const cUnit = colOf('unit');
  const cQty = colOf('quantity');
  const cMat = colOf('materialPrice');
  const cLab = colOf('laborPrice');
  const cEq = colOf('equipmentPrice');
  const cUp = colOf('unitPrice');
  const cTot = colOf('total');

  if (cDesc < 0) warnings.push(uiText("diagnostics.genericTabularImporter.noColumnIsMappedToDescription", "No column is mapped to Description."));
  if (cQty < 0 && cUp < 0 && cTot < 0 && cMat < 0 && cLab < 0 && cEq < 0) {
    warnings.push(uiText("diagnostics.genericTabularImporter.noPriceOrQuantityColumnIsMapped", "No price or quantity column is mapped; everything will be imported as chapters."));
  }

  const cell = (row: string[], idx: number): string => (idx >= 0 ? (row[idx] ?? '').trim() : '');

  // Getallen en bedragen: valutatekens ("€ 1.234,56") tellen niet mee. Tekst
  // die geen getal is, komt als 0 binnen — met een melding, niet stil (#82).
  // Een eenduidige valuta bij de bedragen wordt de valuta van de begroting.
  let invalidCount = 0;
  let invalidExample = '';
  const currencies = new Set<string>();
  const parseNumber = (raw: string, money = false): number => {
    const parsed = parseAmount(raw);
    if (parsed.invalid) {
      invalidCount += 1;
      if (!invalidExample) invalidExample = raw;
    }
    if (money && parsed.currency) currencies.add(parsed.currency);
    return parsed.value;
  };
  let currentChapter: CostItem | null = null;

  // Hoofdstukken op code, zodat Spaanse capítulos/subcapítulos als boom
  // binnenkomen (#40): zoek het langste voorvoegsel dat een hoofdstuk is.
  const chaptersByCode = new Map<string, CostItem>();
  const chapterForCode = (code: string): CostItem | null => {
    const parts = code.split('.');
    for (let n = parts.length - 1; n > 0; n--) {
      const chapter = chaptersByCode.get(parts.slice(0, n).join('.'));
      if (chapter) return chapter;
    }
    return null;
  };
  const under = (parent: CostItem | null) => ({ parentId: parent?.id ?? null, depth: parent ? parent.depth + 1 : 0 });

  // Excel-cellen zonder bruikbare waarde in een getalkolom: niet stil als
  // leeg/0 laten binnenkomen, maar met adres melden (#88).
  // Alleen kolommen die de regel gebruikt (zie usedColumnsTest), net als summarizeCells.
  const numberCols = numberColumns(mapping);
  const usedColumn = usedColumnsTest(mapping);
  const issuesByRow = new Map<number, TabularCellIssue[]>();
  for (const issue of data.cellIssues ?? []) {
    if (!numberCols.has(issue.col)) continue;
    if (!usedColumn(data.rows[issue.row] ?? [], issue.col)) continue;
    issuesByRow.set(issue.row, [...(issuesByRow.get(issue.row) ?? []), issue]);
  }
  const reportedIssues: TabularCellIssue[] = [];

  for (const [rowIndex, row] of data.rows.entries()) {
    if (row.every((c) => !c || !c.trim())) continue;

    const description = cell(row, cDesc);
    // Zonder Code-kolom is de eigen nummering van het bestand (kop "Nr", "Nº",
    // "Pos" …) de code. In `nr` zou ze verloren gaan: dat veld wordt bij elke
    // herberekening opnieuw uitgerekend (1, 1.01 …). Zo blijven "12.01" en
    // "17.01.01" staan én bouwen ze de hoofdstukboom op (#95).
    const code = cCode >= 0 ? cell(row, cCode) : cell(row, cNr);
    if (!description && !code) continue;
    const rowIssues = issuesByRow.get(rowIndex) ?? [];
    reportedIssues.push(...rowIssues);

    const qtyRaw = cell(row, cQty);
    const matRaw = cell(row, cMat);
    const labRaw = cell(row, cLab);
    const eqRaw = cell(row, cEq);
    const upRaw = cell(row, cUp);
    const totRaw = cell(row, cTot);

    const hasQty = qtyRaw !== '';
    const hasMoney = [matRaw, labRaw, eqRaw, upRaw, totRaw].some((v) => v !== '');

    // Een regel met een kapotte getalcel blijft een post (met lege waarde),
    // anders zou hij stil een hoofdstuk worden (#88).
    if (!hasQty && !hasMoney && rowIssues.length === 0) {
      const ch = builder.add({
        ...under(code ? chapterForCode(code) : null), rowType: 'chapter',
        code, description: description || code, unit: 'st',
      });
      if (code) chaptersByCode.set(code, ch);
      currentChapter = ch;
      continue;
    }
    const parent = (code ? chapterForCode(code) : null) ?? currentChapter;

    let materialPrice = matRaw !== '' ? parseNumber(matRaw, true) : null;
    const laborPrice = labRaw !== '' ? parseNumber(labRaw, true) : null;
    const equipmentPrice = eqRaw !== '' ? parseNumber(eqRaw, true) : null;
    let quantity = hasQty ? parseNumber(qtyRaw) : null;
    const explicitUnit = upRaw !== '' ? parseNumber(upRaw, true) : null;
    const explicitTotal = totRaw !== '' ? parseNumber(totRaw, true) : null;

    // Met materieel (maquinaria) erbij past de splitsing niet meer op één
    // kale post: die kent alleen loon plus één eigen prijs. Leg elke
    // kostensoort dan vast als rekenregel onder de post, zodat Loon,
    // Materiaal en Materieel elk in hun eigen kolom komen. Een 0 telt als leeg.
    if (equipmentPrice) {
      const post = builder.add({
        ...under(parent),
        rowType: 'begrotingspost',
        code,
        nr: cell(row, cNr),
        description,
        unit: normalizeUnit(cell(row, cUnit)),
        quantity,
      });
      const qty = quantity ?? 1;
      // Zonder arbeid/materiaal kan een eenheidsprijs of totaal méér bevatten
      // dan het materieel alleen; dat restant mag niet stil wegvallen.
      let otherPrice = materialPrice;
      if (!laborPrice && !materialPrice) {
        const statedUnit = explicitUnit ?? (explicitTotal != null && quantity ? explicitTotal / quantity : null);
        if (statedUnit != null && statedUnit > equipmentPrice) otherPrice = statedUnit - equipmentPrice;
      }
      const parts: { price: number | null; resourceType: 'arbeid' | 'materiaal' | 'materieel'; label: string }[] = [
        { price: laborPrice, resourceType: 'arbeid', label: uiText('diagnostics.genericTabularImporter.labour', 'Labour') },
        { price: otherPrice, resourceType: 'materiaal', label: uiText('diagnostics.genericTabularImporter.material', 'Material') },
        { price: equipmentPrice, resourceType: 'materieel', label: uiText('diagnostics.genericTabularImporter.equipment', 'Equipment') },
      ];
      let postTotal = 0;
      for (const part of parts) {
        if (!part.price) continue;
        const total = qty * part.price;
        postTotal += total;
        builder.add({
          parentId: post.id,
          depth: post.depth + 1,
          rowType: 'regel',
          description: part.label,
          unit: post.unit,
          quantity: qty,
          resourceType: part.resourceType,
          ...(part.resourceType === 'arbeid' ? { laborPrice: part.price } : { normUnitPrice: part.price }),
          unitPrice: total,
          total,
        });
      }
      post.total = postTotal;
      post.unitPrice = quantity ? postTotal / quantity : postTotal;
      continue;
    }

    // Een kale begrotingspost (zonder regels) haalt zijn totaal bij de
    // herberekening uit hoeveelheid × (materiaal + arbeid). Zit er geen
    // materiaal/arbeid-split in maar wél een eenheidsprijs of totaal, dan
    // stoppen we die waarde in de materiaal-kolom zodat het bedrag de
    // herberekening overleeft (anders zou de post op € 0 uitkomen).
    if (materialPrice == null && laborPrice == null) {
      if (explicitUnit != null) {
        materialPrice = explicitUnit;
      } else if (explicitTotal != null) {
        if (quantity == null || quantity === 0) { quantity = 1; materialPrice = explicitTotal; }
        else { materialPrice = explicitTotal / quantity; }
      }
    }
    const unitPrice = (materialPrice ?? 0) + (laborPrice ?? 0);
    const total = (quantity ?? 0) * unitPrice;

    builder.add({
      ...under(parent),
      rowType: 'begrotingspost',
      code,
      nr: cell(row, cNr),
      description,
      unit: normalizeUnit(cell(row, cUnit)),
      quantity,
      materialPrice,
      laborPrice,
      unitPrice,
      total,
    });
  }

  if (builder.length === 0) warnings.push(uiText("diagnostics.genericTabularImporter.noUsableRowsFoundWithThisColumn", "No usable rows found with this column mapping."));
  if (invalidCount > 0) {
    warnings.push(uiText('diagnostics.unreadableNumbers', '{{count}} values could not be read as a number and were imported as 0 (for example "{{example}}").', { count: invalidCount, example: invalidExample }));
  }
  // Boven het maximum per kolom kennen we alleen de rij; die telt wel mee.
  const summary = summarizeCells(data, mapping);
  const issueCount = summary.unusableCells;
  const columnName = (col: number) => data.headers[col] || '?';
  if (issueCount > 0) {
    const describe = (issue: TabularCellIssue) => {
      const column = columnName(issue.col);
      return issue.kind === 'error' ? `${issue.address} ${issue.text} (${column})` : `${issue.address} (${column})`;
    };
    const shown = reportedIssues.slice(0, 5).map(describe);
    if (issueCount > shown.length) shown.push('…');
    warnings.push(uiText('diagnostics.formulaCellsWithoutValue', 'Cells in number columns without a usable value were imported as empty ({{count}}): {{cells}}. They contain a formula that was never calculated in Excel, or an Excel error. Open the file in Excel, correct the errors or recalculate (F9), save it and import again.', { count: issueCount, cells: shown.join(', ') }));
  }
  if (summary.formulaValues > 0 && !options.formulaValuesReviewed) {
    warnings.push(uiText('diagnostics.formulaValuesStored', 'Values from Excel formulas: {{count}}. These are the results last saved in Excel; they were imported as they are and not recalculated.', { count: summary.formulaValues }));
  }
  // Dezelfde informatie gestructureerd, voor aanroepers zonder UI (SDK, MCP).
  const cellDiagnostics: ImportCellDiagnostics | undefined = summary.formulaValues > 0 || issueCount > 0
    ? {
      formulaValues: summary.formulaValues,
      unusableCells: issueCount,
      cells: reportedIssues.map((issue) => ({
        address: issue.address,
        field: mapping[issue.col],
        column: columnName(issue.col),
        kind: issue.kind,
        ...(issue.text ? { text: issue.text } : {}),
      })),
    }
    : undefined;

  return {
    // Alleen bij precies één valuta; bij gemengde valuta's blijft de standaard
    // staan. Bedragen worden nooit omgerekend.
    schedule: { name: data.sourceName || 'Import', ...(currencies.size === 1 ? { currency: [...currencies][0] } : {}) },
    items: builder.items,
    warnings,
    format: 'tabular',
    ...(cellDiagnostics ? { cellDiagnostics } : {}),
  };
}
