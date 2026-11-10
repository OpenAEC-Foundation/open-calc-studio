import { readWorkbook, WORKBOOK_LIMITS } from '@/services/importers/safeWorkbook';
import { uiText } from '../../i18n/uiText';
import * as XLSX from 'xlsx';
import { BudgetBuilder, parseAmount, normalizeUnit } from './core';
import type { ImportResult } from './types';
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
  const wb = readWorkbook(buf instanceof Uint8Array ? buf : new Uint8Array(buf), { type: 'array' });
  // Kies het tabblad met de meeste rijen — dat is doorgaans de databladzijde.
  let best: unknown[][] | null = null;
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, blankrows: false });
    if (!best || rows.length > best.length) best = rows;
  }
  if (!best || best.length === 0) return { headers: [], rows: [], sourceName };
  const toStr = (v: unknown) => (v == null ? '' : String(v).trim());
  const headers = (best[0] as unknown[]).map(toStr);
  const rows = best.slice(1).map((r) => (r as unknown[]).map(toStr));
  return { headers, rows, sourceName };
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
export function buildFromMapping(data: TabularData, mapping: ColumnMapping): ImportResult {
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

  for (const row of data.rows) {
    if (row.every((c) => !c || !c.trim())) continue;

    const description = cell(row, cDesc);
    const code = cell(row, cCode);
    if (!description && !code) continue;

    const qtyRaw = cell(row, cQty);
    const matRaw = cell(row, cMat);
    const labRaw = cell(row, cLab);
    const eqRaw = cell(row, cEq);
    const upRaw = cell(row, cUp);
    const totRaw = cell(row, cTot);

    const hasQty = qtyRaw !== '';
    const hasMoney = [matRaw, labRaw, eqRaw, upRaw, totRaw].some((v) => v !== '');

    if (!hasQty && !hasMoney) {
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

  return {
    // Alleen bij precies één valuta; bij gemengde valuta's blijft de standaard
    // staan. Bedragen worden nooit omgerekend.
    schedule: { name: data.sourceName || 'Import', ...(currencies.size === 1 ? { currency: [...currencies][0] } : {}) },
    items: builder.items,
    warnings,
    format: 'tabular',
  };
}
