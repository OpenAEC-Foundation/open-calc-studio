// Turn a file into an own price library (issue #104): library JSON, a CSV or
// Excel table, a BMEcat/DICO supplier catalogue or a ZSX price list. Every format ends up as
// library JSON and goes through parseLibraryJson, so validation and article IDs
// are the same as for the built-in libraries.
import type { ResourceLibraryItem, ResourceType } from '@/types/costModel';
import { uiText } from '@/i18n/uiText';
import { parseCsv, parseXlsxTabular, autoDetectMapping, type TabularData } from '@/services/importers/genericTabularImporter';
import { importBmecat } from '@/services/importers/bmecatImporter';
import { importZsx } from '@/services/importers/zsxImporter';
import { parseAmount } from '@/services/importers/core';
import { parseLibraryJson } from './libraryJson';
import { isBuiltInCatalogueId } from './priceLibraries';
import { getOwnLibrary, ownLibraryItems, type OwnLibrary, type OwnLibraryInfo, type OwnLibraryJson, type OwnLibraryOrigin } from './ownLibraries';

export const OWN_LIBRARY_FILE_TYPES = '.json,.csv,.tsv,.txt,.xlsx,.xls,.xml,.bmecat,.zsx';
export const OWN_LIBRARY_EXTENSIONS = ['json', 'csv', 'tsv', 'txt', 'xlsx', 'xls', 'xml', 'bmecat', 'zsx'];

export interface PrepareOptions {
  /**
   * Re-import: the file becomes a newer version of this own library and keeps
   * its catalogue ID, so price links in estimates stay valid even when the file
   * has another name or ID.
   */
  updateId?: string;
  now?: Date;
  /** Source column index to library field; overrides header detection. */
  columnMapping?: LibraryColumnMapping;
  /** The format the user chose (for example ZSX for a .xml file); overrides detection. */
  format?: OwnLibraryOrigin;
}

export const LIBRARY_COLUMN_FIELDS = ['ignore', 'code', 'description', 'unit', 'unitPrice', 'type', 'category', 'priceDate', 'source', 'currency', 'vatBasis'] as const;
export type LibraryColumnField = typeof LIBRARY_COLUMN_FIELDS[number];
export type LibraryColumnMapping = LibraryColumnField[];

/** Parse once for a column preview; JSON and supplier XML do not need a mapping. */
export function readOwnLibraryTable(fileName: string, content: string | ArrayBuffer | Uint8Array): TabularData | null {
  if (/\.xlsx?$/i.test(fileName)) {
    if (typeof content === 'string') throw invalid('expected a binary Excel file.');
    return parseXlsxTabular(content, fileName);
  }
  if (/\.(csv|tsv|txt)$/i.test(fileName)) return parseCsv(typeof content === 'string' ? content : new TextDecoder().decode(content), fileName);
  return null;
}

export function detectLibraryMapping(headers: string[]): LibraryColumnMapping {
  const generic = autoDetectMapping(headers);
  const seen = new Set<string>();
  return headers.map((h, i) => {
    const basic = generic[i];
    const field: LibraryColumnField = ['code', 'description', 'unit', 'unitPrice'].includes(basic)
      ? basic as LibraryColumnField
      : EXTRA_HEADERS.find(e => e.pattern.test(normHeader(h)))?.field ?? 'ignore';
    if (field !== 'ignore' && seen.has(field)) return 'ignore';
    seen.add(field);
    return field;
  });
}

/**
 * Does a table opened as an estimate look like a price list? Only when the
 * columns for a price library are there (code, description, a price), none of
 * an estimate (quantity, total), and nearly every row has a price. Estimates
 * almost always have a quantity or total column, and their chapter rows have
 * no price, so a real estimate rarely matches. It is only a hint: the user
 * decides.
 */
export function looksLikePriceList(data: TabularData): boolean {
  const estimate = autoDetectMapping(data.headers);
  if (estimate.includes('quantity') || estimate.includes('total')) return false;
  const library = detectLibraryMapping(data.headers);
  const price = library.indexOf('unitPrice');
  if (!library.includes('code') || !library.includes('description') || price < 0) return false;
  const rows = data.rows.filter(row => row.some(cell => String(cell ?? '').trim() !== ''));
  if (rows.length === 0) return false;
  const priced = rows.filter(row => {
    const text = String(row[price] ?? '').trim();
    return text !== '' && !parseAmount(text).invalid;
  }).length;
  return priced / rows.length >= 0.8;
}

export interface PreparedOwnLibrary {
  library: OwnLibrary;
  items: ResourceLibraryItem[];
  /** The own library this one replaces (same catalogue ID). */
  replaces?: OwnLibraryInfo;
  /** Codes of the replaced version that are not in this file; rows linked to them keep their price. */
  dropped: string[];
  /** Codes that appear more than once in the file; the later ones got a suffix (`~2`, `~3`). */
  duplicates: string[];
  warnings: string[];
}

/** A bad file: the message is meant for the user. */
export class OwnLibraryFileError extends Error {}

function invalid(error: string): OwnLibraryFileError {
  return new OwnLibraryFileError(uiText('pricing.ownInvalid', 'This file is not a usable price library: {{error}}', { error }));
}

function baseName(fileName: string): string {
  const name = fileName.split(/[\\/]/).pop() ?? fileName;
  return name.replace(/\.[^.]+$/, '').trim() || 'own-library';
}

/** Never the catalogue ID of a built-in library: that one gets a suffix. */
function ownCatalogueId(preferred: string): string {
  const base = preferred.trim() || 'own-library';
  let id = base;
  for (let n = 2; isBuiltInCatalogueId(id); n++) id = `${base} (${n})`;
  return id;
}

const text = (value: unknown): string | undefined => typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;

type Draft = Omit<OwnLibraryJson, 'id'> & { preferredId: string };

function fromJson(content: string, fileName: string): Draft {
  let data: unknown;
  try { data = JSON.parse(content.replace(/^﻿/, '')); } catch (e) { throw invalid(e instanceof Error ? e.message : String(e)); }
  if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray((data as { resources?: unknown }).resources)) {
    throw invalid(uiText('pricing.ownNeedsResources', 'expected a JSON object with a list “resources”.'));
  }
  const d = data as Record<string, unknown>;
  const preferredId = text(d.id) ?? text(d.catalogueId) ?? text(d.name) ?? baseName(fileName);
  return {
    preferredId,
    name: text(d.name) ?? preferredId,
    version: text(d.version) ?? (typeof d.version === 'number' ? String(d.version) : 'unversioned'),
    ...(text(d.currency) ? { currency: text(d.currency) } : {}),
    ...(text(d.region) ? { region: text(d.region) } : {}),
    ...(text(d.description) ? { description: text(d.description) } : {}),
    resources: d.resources as unknown[],
  };
}

// Column headers on top of the generic table import (code, description, unit, price).
const EXTRA_HEADERS: { field: 'code' | 'description' | 'unitPrice' | 'type' | 'category' | 'priceDate' | 'source' | 'currency' | 'vatBasis'; pattern: RegExp }[] = [
  { field: 'code', pattern: /^(id|itemcode|itemno|item|artikel|articlecode|articleno)$/ },
  { field: 'description', pattern: /^(name|title|itemname|resource)$/ },
  { field: 'unitPrice', pattern: /^(rate|unitrate|defaultunitprice|cost|unitcost|kosten)$/ },
  { field: 'type', pattern: /^(type|resourcetype|soort|middelsoort|tipo)$/ },
  { field: 'category', pattern: /^(category|categorie|group|groep|chapter|hoofdstuk|categoria|section)$/ },
  { field: 'priceDate', pattern: /^(pricedate|prijsdatum|date|datum|peildatum)$/ },
  { field: 'currency', pattern: /^(currency|valuta|moneda)$/ },
  { field: 'vatBasis', pattern: /^(vatbasis|btwbasis)$/ },
  { field: 'source', pattern: /^(source|bron|pricesource|prijsbron)$/ },
];

const TYPE_WORDS: Record<string, ResourceType> = {
  arbeid: 'arbeid', labour: 'arbeid', labor: 'arbeid',
  materiaal: 'materiaal', material: 'materiaal', materials: 'materiaal',
  materieel: 'materieel', equipment: 'materieel', plant: 'materieel', machinery: 'materieel',
  onderaannemer: 'onderaannemer', subcontractor: 'onderaannemer', subcontract: 'onderaannemer',
  overig: 'overig', other: 'overig',
};

/**
 * Article ID of a row without a code: from its description and unit, never
 * from its position, so a newer version of the file with rows added above
 * still links the same article.
 */
function contentId(description: string, unit: string): string {
  const text = `${description.trim().toLowerCase().replace(/\s+/g, ' ')}|${unit.trim().toLowerCase()}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 0x01000193); }
  return `d-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

/**
 * Decimal style of a whole price column: a supplier list uses one style, so
 * "1,234" in a column that also has "12.50" is a thousand, not 1.234. Null
 * when the column does not tell (each price is then read on its own).
 */
function columnDecimals(texts: string[]): 'dot' | 'comma' | null {
  let dot = false, comma = false;
  for (const text of texts) {
    const t = text.replace(/[^\d.,]/g, '');
    if (/,\d{3}\.\d+$/.test(t) || /\.\d{1,2}$/.test(t) || /\.\d{4,}$/.test(t)) dot = true;
    if (/\.\d{3},\d+$/.test(t) || /,\d{1,2}$/.test(t) || /,\d{4,}$/.test(t)) comma = true;
  }
  return dot && !comma ? 'dot' : comma && !dot ? 'comma' : null;
}

/** A price date as YYYY-MM-DD: as written, or from an Excel date cell (a day number since 1899-12-30). */
function isoDate(text: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (/^\d{5}(\.\d+)?$/.test(text)) {
    const days = Math.floor(Number(text));
    if (days > 20000 && days < 80000) return new Date(Date.UTC(1899, 11, 30) + days * 86_400_000).toISOString().slice(0, 10);
  }
  return null;
}

const normHeader = (h: string) => h.trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[\s._/]+/g, '');

function fromTable(data: TabularData, fileName: string, provided?: LibraryColumnMapping): Draft {
  const mapping = provided ?? detectLibraryMapping(data.headers);
  if (mapping.length !== data.headers.length || mapping.some(f => !LIBRARY_COLUMN_FIELDS.includes(f))
    || new Set(mapping.filter(f => f !== 'ignore')).size !== mapping.filter(f => f !== 'ignore').length) {
    throw invalid('Invalid or duplicate library column mapping.');
  }
  const column = (field: LibraryColumnField) => mapping.indexOf(field);
  const cCode = column('code');
  const cDesc = column('description');
  const cUnit = column('unit');
  const cPrice = column('unitPrice');
  const cType = column('type');
  const cCat = column('category');
  const cDate = column('priceDate');
  const cSource = column('source');
  const cCurrency = column('currency');
  const cVat = column('vatBasis');
  if (cCode < 0 || cDesc < 0) {
    throw new OwnLibraryFileError(uiText('pricing.ownColumns', 'The table needs at least a column "Code" and a column "Description" (headers in English or Dutch, such as "Omschrijving"). Found: {{columns}}.', { columns: data.headers.join(', ') || '—' }));
  }
  const cell = (row: string[], col: number) => (col >= 0 ? String(row[col] ?? '').trim() : '');
  const rows = data.rows
    .map((row, i) => ({ row, line: i + 2 }))
    .filter(({ row }) => cell(row, cCode) !== '' || cell(row, cDesc) !== '');
  const decimals = columnDecimals(rows.map(({ row }) => cell(row, cPrice)));
  const resources = rows
    .map(({ row, line }) => {
      const priceText = cell(row, cPrice);
      const amount = parseAmount(decimals === 'dot' ? priceText.replace(/,/g, '') : decimals === 'comma' ? priceText.replace(/\./g, '') : priceText);
      if (priceText !== '' && amount.invalid) throw invalid(uiText('pricing.ownRowPrice', 'row {{row}}: price “{{price}}” is not a number.', { row: line, price: priceText }));
      const type = TYPE_WORDS[cell(row, cType).toLowerCase()];
      const date = isoDate(cell(row, cDate));
      const code = cell(row, cCode);
      const unit = cell(row, cUnit) || 'st';
      return {
        ...(code ? {} : { id: contentId(cell(row, cDesc), unit) }),
        code,
        description: cell(row, cDesc),
        unit,
        ...(type ? { resourceType: type } : {}),
        category: cell(row, cCat),
        defaultUnitPrice: priceText === '' ? null : amount.value,
        source: cell(row, cSource) || fileName,
        priceDate: date,
        ...(cell(row, cCurrency) ? { currency: cell(row, cCurrency).toUpperCase() } : {}),
        ...(cell(row, cVat) ? { vatBasis: cell(row, cVat).toLowerCase() } : {}),
      };
    });
  const name = baseName(fileName);
  return { preferredId: name, name, version: 'unversioned', resources };
}

/** BMEcat/DICO catalogue or ZSX price list: both give a list of resources. */
function fromSupplierXml(result: { resources: ResourceLibraryItem[]; warnings: string[] }, fileName: string): { draft: Draft; warnings: string[] } {
  const name = baseName(fileName);
  return {
    warnings: result.warnings,
    draft: {
      preferredId: name, name, version: 'unversioned',
      resources: result.resources.map(r => ({
        id: r.code || contentId(r.description, r.unit), code: r.code, description: r.description, unit: r.unit,
        resourceType: r.resourceType, category: r.category, defaultUnitPrice: r.defaultUnitPrice, source: fileName,
      })),
    },
  };
}

/** A ZSX price list is XML with <Middel> elements; other XML is read as BMEcat. */
const looksLikeZsx = (xml: string) => /<Middel[\s>/]/.test(xml);

function originOf(ext: string, text: () => string): OwnLibraryOrigin {
  if (ext === 'xlsx' || ext === 'xls' || ext === 'csv' || ext === 'tsv' || ext === 'txt') return 'table';
  if (ext === 'zsx') return 'zsx';
  if (ext === 'bmecat') return 'bmecat';
  if (ext === 'xml') return looksLikeZsx(text()) ? 'zsx' : 'bmecat';
  if (ext === 'json') return 'json';
  // No known extension: sniff.
  const content = text();
  if (!content.trimStart().startsWith('<')) return 'json';
  return looksLikeZsx(content) ? 'zsx' : 'bmecat';
}

/** Read a file into an own library. Throws a message for the user on a bad file. */
export function prepareOwnLibrary(fileName: string, content: string | ArrayBuffer | Uint8Array, options: PrepareOptions = {}): PreparedOwnLibrary {
  const ext = (fileName.match(/\.([^.\\/]+)$/)?.[1] ?? '').toLowerCase();
  const asText = () => typeof content === 'string' ? content : new TextDecoder().decode(content);
  const origin = options.format ?? originOf(ext, asText);
  let draft: Draft;
  let warnings: string[] = [];
  try {
    if (origin === 'table') {
      const table = readOwnLibraryTable(fileName, content);
      if (!table) throw invalid('Unsupported table format.');
      draft = fromTable(table, fileName, options.columnMapping);
    } else if (origin === 'bmecat') {
      const xml = asText();
      // Any XML that is not ZSX lands here; one without articles is most
      // likely an estimate (CUF, GAEB, RSX, ...), so point to the right import.
      if (!/<(ARTICLE|PRODUCT)[\s>/]/.test(xml)) throw new OwnLibraryFileError(uiText('pricing.ownNotPriceXml', 'This XML file is not a BMEcat catalogue or ZSX price list. Is it an estimate (CUF, GAEB, RSX, …)? Open it with Import → New estimate.'));
      ({ draft, warnings } = fromSupplierXml(importBmecat(xml), fileName));
    } else if (origin === 'zsx') {
      ({ draft, warnings } = fromSupplierXml(importZsx(asText()), fileName));
    } else {
      draft = fromJson(asText(), fileName);
    }
  } catch (e) {
    if (e instanceof OwnLibraryFileError) throw e;
    throw invalid(e instanceof Error ? e.message : String(e));
  }
  return finishPrepared(draft, warnings, origin, fileName, options);
}

/**
 * A table that was already read (for example in the estimate import, where
 * the user chose "Import as price library instead") becomes an own library
 * without reading the file again.
 */
export function prepareOwnLibraryFromTable(table: TabularData, fileName: string, options: PrepareOptions = {}): PreparedOwnLibrary {
  let draft: Draft;
  try {
    draft = fromTable(table, fileName, options.columnMapping);
  } catch (e) {
    if (e instanceof OwnLibraryFileError) throw e;
    throw invalid(e instanceof Error ? e.message : String(e));
  }
  return finishPrepared(draft, [], 'table', fileName, options);
}

function finishPrepared(draft: Draft, warnings: string[], origin: OwnLibraryOrigin, fileName: string, options: PrepareOptions): PreparedOwnLibrary {
  const target = options.updateId === undefined ? undefined : getOwnLibrary(options.updateId);
  if (options.updateId !== undefined && !target) throw new OwnLibraryFileError(uiText('pricing.ownNotFound', 'The own library to update is no longer on this computer.'));
  const duplicates = suffixDuplicates(draft.resources);
  const { preferredId, ...rest } = draft;
  const json: OwnLibraryJson = {
    ...rest,
    id: target?.id ?? ownCatalogueId(preferredId),
    // An update keeps the name the user gave the library.
    name: target?.name ?? rest.name,
  };

  let items: ResourceLibraryItem[];
  try { items = parseLibraryJson(json); } catch (e) { throw invalid(e instanceof Error ? e.message : String(e)); }
  if (items.length === 0) throw new OwnLibraryFileError(uiText('pricing.ownEmpty', 'This file has no resources.'));

  const replaces = target ?? getOwnLibrary(json.id);
  const library: OwnLibrary = {
    id: json.id, name: json.name, version: json.version,
    ...(json.currency ? { currency: json.currency } : {}),
    ...(json.region ? { region: json.region } : {}),
    origin, count: items.length, fileName: fileName.split(/[\\/]/).pop() ?? fileName,
    importedAt: (options.now ?? new Date()).toISOString(), library: json,
  };
  return { library, items, replaces, dropped: replaces ? droppedCodes(replaces.id, items) : [], duplicates, warnings };
}


/**
 * Supplier lists repeat codes (sizes, packaging). Instead of refusing the
 * file, the second and later rows with an ID get `~2`, `~3`; the code shown
 * stays. Returns the repeated codes.
 */
function suffixDuplicates(resources: unknown[]): string[] {
  const seen = new Map<string, number>();
  const repeated = new Set<string>();
  for (const raw of resources) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const r = raw as Record<string, unknown>;
    const key = String(r.id ?? r.code ?? '');
    if (key === '') continue;
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    if (n > 1) {
      let id = `${key}~${n}`;
      for (let k = n; seen.has(id); k++) id = `${key}~${k + 1}`;
      seen.set(id, 1);
      r.id = id;
      repeated.add(String(r.code ?? key) || key);
    }
  }
  return [...repeated];
}

function droppedCodes(id: string, items: ResourceLibraryItem[]): string[] {
  const kept = new Set(items.map(item => item.id));
  return (ownLibraryItems(id) ?? []).filter(item => !kept.has(item.id)).map(item => item.code || item.id);
}
