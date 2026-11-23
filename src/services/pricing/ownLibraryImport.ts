// Turn a file into an own price library (issue #104): library JSON, a CSV or
// Excel table, or a BMEcat/DICO supplier catalogue. Every format ends up as
// library JSON and goes through parseLibraryJson, so validation and article IDs
// are the same as for the built-in libraries.
import type { ResourceLibraryItem, ResourceType } from '@/types/costModel';
import { uiText } from '@/i18n/uiText';
import { parseCsv, parseXlsxTabular, autoDetectMapping, type TabularData } from '@/services/importers/genericTabularImporter';
import { importBmecat } from '@/services/importers/bmecatImporter';
import { parseAmount } from '@/services/importers/core';
import { parseLibraryJson } from './libraryJson';
import { isBuiltInCatalogueId } from './priceLibraries';
import { getOwnLibrary, ownLibraryItems, type OwnLibrary, type OwnLibraryInfo, type OwnLibraryJson, type OwnLibraryOrigin } from './ownLibraries';

export const OWN_LIBRARY_FILE_TYPES = '.json,.csv,.tsv,.txt,.xlsx,.xls,.xml,.bmecat';
export const OWN_LIBRARY_EXTENSIONS = ['json', 'csv', 'tsv', 'txt', 'xlsx', 'xls', 'xml', 'bmecat'];

export interface PrepareOptions {
  /**
   * Re-import: the file becomes a newer version of this own library and keeps
   * its catalogue ID, so price links in estimates stay valid even when the file
   * has another name or ID.
   */
  updateId?: string;
  now?: Date;
}

export interface PreparedOwnLibrary {
  library: OwnLibrary;
  items: ResourceLibraryItem[];
  /** The own library this one replaces (same catalogue ID). */
  replaces?: OwnLibraryInfo;
  /** Codes of the replaced version that are not in this file; rows linked to them keep their price. */
  dropped: string[];
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
    throw invalid('expected a JSON object with a "resources" list.');
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
const EXTRA_HEADERS: { field: 'code' | 'description' | 'unitPrice' | 'type' | 'category' | 'priceDate' | 'source'; pattern: RegExp }[] = [
  { field: 'code', pattern: /^(id|itemcode|itemno|item|artikel|articlecode|articleno)$/ },
  { field: 'description', pattern: /^(name|title|itemname|resource)$/ },
  { field: 'unitPrice', pattern: /^(rate|unitrate|defaultunitprice|cost|unitcost|kosten)$/ },
  { field: 'type', pattern: /^(type|resourcetype|soort|middelsoort|tipo)$/ },
  { field: 'category', pattern: /^(category|categorie|group|groep|chapter|hoofdstuk|categoria|section)$/ },
  { field: 'priceDate', pattern: /^(pricedate|prijsdatum|date|datum|peildatum)$/ },
  { field: 'source', pattern: /^(source|bron|pricesource|prijsbron)$/ },
];

const TYPE_WORDS: Record<string, ResourceType> = {
  arbeid: 'arbeid', labour: 'arbeid', labor: 'arbeid',
  materiaal: 'materiaal', material: 'materiaal', materials: 'materiaal',
  materieel: 'materieel', equipment: 'materieel', plant: 'materieel', machinery: 'materieel',
  onderaannemer: 'onderaannemer', subcontractor: 'onderaannemer', subcontract: 'onderaannemer',
  overig: 'overig', other: 'overig',
};

const normHeader = (h: string) => h.trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[\s._/]+/g, '');

function fromTable(data: TabularData, fileName: string): Draft {
  const generic = autoDetectMapping(data.headers);
  const column = (field: string) => {
    const at = generic.indexOf(field as never);
    if (at >= 0) return at;
    const extra = EXTRA_HEADERS.filter(e => e.field === field);
    return data.headers.findIndex((h, i) => generic[i] === 'ignore' && extra.some(e => e.pattern.test(normHeader(h))));
  };
  const cCode = column('code');
  const cDesc = column('description');
  const cUnit = column('unit');
  const cPrice = column('unitPrice');
  const cType = column('type');
  const cCat = column('category');
  const cDate = column('priceDate');
  const cSource = column('source');
  if (cCode < 0 || cDesc < 0) {
    throw new OwnLibraryFileError(uiText('pricing.ownColumns', 'The table needs at least the columns code and description. Found: {{columns}}.', { columns: data.headers.join(', ') || '—' }));
  }
  const cell = (row: string[], col: number) => (col >= 0 ? String(row[col] ?? '').trim() : '');
  const resources = data.rows
    .map((row, i) => ({ row, line: i + 2 }))
    .filter(({ row }) => cell(row, cCode) !== '' || cell(row, cDesc) !== '')
    .map(({ row, line }) => {
      const priceText = cell(row, cPrice);
      const amount = parseAmount(priceText);
      if (priceText !== '' && amount.invalid) throw invalid(`row ${line}: price "${priceText}" is not a number.`);
      const type = TYPE_WORDS[cell(row, cType).toLowerCase()];
      const date = cell(row, cDate);
      return {
        code: cell(row, cCode) || `row-${line}`,
        description: cell(row, cDesc),
        unit: cell(row, cUnit) || 'st',
        ...(type ? { resourceType: type } : {}),
        category: cell(row, cCat),
        defaultUnitPrice: priceText === '' ? null : amount.value,
        source: cell(row, cSource) || fileName,
        priceDate: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
      };
    });
  const name = baseName(fileName);
  return { preferredId: name, name, version: 'unversioned', resources };
}

function fromBmecat(content: string, fileName: string): { draft: Draft; warnings: string[] } {
  const result = importBmecat(content);
  const name = baseName(fileName);
  return {
    warnings: result.warnings,
    draft: {
      preferredId: name, name, version: 'unversioned',
      resources: result.resources.map(r => ({
        id: r.code || r.description, code: r.code, description: r.description, unit: r.unit,
        resourceType: r.resourceType, category: r.category, defaultUnitPrice: r.defaultUnitPrice, source: fileName,
      })),
    },
  };
}

function originOf(ext: string, content: string | ArrayBuffer | Uint8Array): OwnLibraryOrigin {
  if (ext === 'xlsx' || ext === 'xls' || ext === 'csv' || ext === 'tsv' || ext === 'txt') return 'table';
  if (ext === 'xml' || ext === 'bmecat') return 'bmecat';
  if (ext === 'json') return 'json';
  // No known extension: sniff.
  const start = (typeof content === 'string' ? content : new TextDecoder().decode(content.slice(0, 64))).trimStart();
  return start.startsWith('<') ? 'bmecat' : 'json';
}

/** Read a file into an own library. Throws a message for the user on a bad file. */
export function prepareOwnLibrary(fileName: string, content: string | ArrayBuffer | Uint8Array, options: PrepareOptions = {}): PreparedOwnLibrary {
  const ext = (fileName.match(/\.([^.\\/]+)$/)?.[1] ?? '').toLowerCase();
  const asText = () => typeof content === 'string' ? content : new TextDecoder().decode(content);
  const origin = originOf(ext, content);
  let draft: Draft;
  let warnings: string[] = [];
  try {
    if (origin === 'table') {
      if (ext === 'xlsx' || ext === 'xls') {
        if (typeof content === 'string') throw invalid('expected a binary Excel file.');
        draft = fromTable(parseXlsxTabular(content, fileName), fileName);
      } else {
        draft = fromTable(parseCsv(asText(), fileName), fileName);
      }
    } else if (origin === 'bmecat') {
      ({ draft, warnings } = fromBmecat(asText(), fileName));
    } else {
      draft = fromJson(asText(), fileName);
    }
  } catch (e) {
    if (e instanceof OwnLibraryFileError) throw e;
    throw invalid(e instanceof Error ? e.message : String(e));
  }

  const target = options.updateId === undefined ? undefined : getOwnLibrary(options.updateId);
  if (options.updateId !== undefined && !target) throw new OwnLibraryFileError(uiText('pricing.ownNotFound', 'The own library to update is no longer on this computer.'));
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
  return { library, items, replaces, dropped: replaces ? droppedCodes(replaces.id, items) : [], warnings };
}


function droppedCodes(id: string, items: ResourceLibraryItem[]): string[] {
  const kept = new Set(items.map(item => item.id));
  return (ownLibraryItems(id) ?? []).filter(item => !kept.has(item.id)).map(item => item.code || item.id);
}
