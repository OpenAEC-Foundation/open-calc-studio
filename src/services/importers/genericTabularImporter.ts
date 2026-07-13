import * as XLSX from 'xlsx';
import { BudgetBuilder, parseNumber, normalizeUnit } from './core';
import type { ImportResult } from './types';

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
  | 'unitPrice'
  | 'total';

/** UI-labels voor de doelvelden (NL). Volgorde = volgorde in de dropdown. */
export const TARGET_FIELDS: { field: TargetField; label: string }[] = [
  { field: 'ignore', label: '— negeren —' },
  { field: 'code', label: 'Code' },
  { field: 'nr', label: 'Nr' },
  { field: 'description', label: 'Omschrijving' },
  { field: 'unit', label: 'Eenheid' },
  { field: 'quantity', label: 'Hoeveelheid' },
  { field: 'materialPrice', label: 'Materiaal (prijs/eh)' },
  { field: 'laborPrice', label: 'Arbeid (prijs/eh)' },
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
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function parseCsv(text: string, sourceName = 'CSV-import'): TabularData {
  const clean = text.replace(/^﻿/, ''); // strip BOM
  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [], sourceName };
  const delim = detectDelimiter(lines[0]);
  const headers = parseCsvLine(lines[0], delim);
  const rows = lines.slice(1).map((l) => parseCsvLine(l, delim));
  return { headers, rows, sourceName };
}

export function parseXlsxTabular(buf: ArrayBuffer | Uint8Array, sourceName = 'Excel-import'): TabularData {
  const wb = XLSX.read(buf instanceof Uint8Array ? buf : new Uint8Array(buf), { type: 'array' });
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

const HEADER_SYNONYMS: { field: TargetField; pattern: RegExp }[] = [
  { field: 'code', pattern: /^(code|stabu|nlsfb|nl-sfb|besteksnr|besteknr|artikelnr|artikelcode)$/ },
  { field: 'nr', pattern: /^(nr|nummer|regelnr|volgnr|positie|pos)$/ },
  { field: 'description', pattern: /^(omschrijving|omschr|oms|description|benaming|naam|werk|activiteit)$/ },
  { field: 'unit', pattern: /^(eh|ehd|eenheid|unit)$/ },
  { field: 'quantity', pattern: /^(hoeveelheid|hoev|hvh|aantal|qty|quantity)$/ },
  { field: 'materialPrice', pattern: /^(materiaal|materiaalprijs|mat|matprijs|material)$/ },
  { field: 'laborPrice', pattern: /^(arbeid|arbeidsprijs|loon|loonprijs|labor|labour|uurprijs|urenprijs)$/ },
  { field: 'unitPrice', pattern: /^(eenheidsprijs|ehprijs|ehprs|prijs|price|unitprice|stukprijs|tarief|prijspereh)$/ },
  { field: 'total', pattern: /^(totaal|bedrag|total|amount|subtotaal|regeltotaal)$/ },
];

/** Raad per bronkolom een doelveld op basis van de kop. Elk veld max. één keer. */
export function autoDetectMapping(headers: string[]): ColumnMapping {
  const used = new Set<TargetField>();
  return headers.map((h) => {
    const norm = h.trim().toLowerCase().replace(/[\s._/]+/g, '');
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
 * begrotingspost onder het laatst geziene hoofdstuk.
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
  const cUp = colOf('unitPrice');
  const cTot = colOf('total');

  if (cDesc < 0) warnings.push('Geen kolom aan "Omschrijving" gekoppeld.');
  if (cQty < 0 && cUp < 0 && cTot < 0 && cMat < 0 && cLab < 0) {
    warnings.push('Geen prijs- of hoeveelheidskolom gekoppeld — alles wordt als hoofdstuk ingelezen.');
  }

  const cell = (row: string[], idx: number): string => (idx >= 0 ? (row[idx] ?? '').trim() : '');
  let currentChapterId: string | null = null;

  for (const row of data.rows) {
    if (row.every((c) => !c || !c.trim())) continue;

    const description = cell(row, cDesc);
    const code = cell(row, cCode);
    if (!description && !code) continue;

    const qtyRaw = cell(row, cQty);
    const matRaw = cell(row, cMat);
    const labRaw = cell(row, cLab);
    const upRaw = cell(row, cUp);
    const totRaw = cell(row, cTot);

    const hasQty = qtyRaw !== '';
    const hasMoney = [matRaw, labRaw, upRaw, totRaw].some((v) => v !== '');

    if (!hasQty && !hasMoney) {
      const ch = builder.add({
        parentId: null, depth: 0, rowType: 'chapter',
        code, description: description || code, unit: 'st',
      });
      currentChapterId = ch.id;
      continue;
    }

    let materialPrice = matRaw !== '' ? parseNumber(matRaw) : null;
    const laborPrice = labRaw !== '' ? parseNumber(labRaw) : null;
    let quantity = hasQty ? parseNumber(qtyRaw) : null;
    const explicitUnit = upRaw !== '' ? parseNumber(upRaw) : null;
    const explicitTotal = totRaw !== '' ? parseNumber(totRaw) : null;

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
      parentId: currentChapterId,
      depth: currentChapterId ? 1 : 0,
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

  if (builder.length === 0) warnings.push('Geen bruikbare rijen gevonden met deze kolomindeling.');

  return {
    schedule: { name: data.sourceName || 'Import' },
    items: builder.items,
    warnings,
    format: 'tabular',
  };
}
