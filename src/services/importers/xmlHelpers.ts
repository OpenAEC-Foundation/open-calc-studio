import type { CostItem, CostUnit, ResourceType, RowType } from '@/types/costModel';

export function parseXml(text: string): Document {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const err = doc.getElementsByTagName('parsererror')[0];
  if (err) throw new Error(`XML parse error: ${err.textContent?.trim() ?? 'unknown'}`);
  return doc;
}

export function getText(el: Element | null | undefined, tag: string): string {
  if (!el) return '';
  const direct = Array.from(el.children).find((c) => c.tagName === tag || c.localName === tag);
  const found =
    direct ??
    el.getElementsByTagName(tag)[0] ??
    el.getElementsByTagNameNS('*', tag)[0];
  return found?.textContent?.trim() ?? '';
}

export function getNumber(el: Element | null | undefined, tag: string): number {
  const raw = getText(el, tag);
  if (!raw) return 0;
  // Dutch decimals: "1.234,56" → "1234.56". If input is "1234.56" (English),
  // the dot-strip removes thousand-dots that shouldn't be there; accept this.
  const t = raw.indexOf(',') >= 0
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : 0;
}

/** Like getNumber but returns a fallback when the tag is missing or unparseable. */
export function getNumberOrDefault(
  el: Element | null | undefined,
  tag: string,
  def: number,
): number {
  const raw = getText(el, tag);
  if (!raw) return def;
  const t = raw.indexOf(',') >= 0
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : def;
}

export function children(el: Element, tag: string): Element[] {
  return Array.from(el.children).filter(
    (c) => c.tagName === tag || c.localName === tag,
  ) as Element[];
}

export function descendants(el: Element | Document, tag: string): Element[] {
  return Array.from(el.getElementsByTagNameNS('*', tag)) as Element[];
}

/** Normalize free-form unit strings (m3, m2, M3, "stuks", …) to CostUnit. */
export function normalizeUnit(raw: string): CostUnit {
  const s = raw.trim().toLowerCase();
  switch (s) {
    case 'm3':
    case 'm^3':
    case 'm³':
      return 'm³';
    case 'm2':
    case 'm^2':
    case 'm²':
      return 'm²';
    case 'm':
    case 'm1':
    case 'meter':
      return 'm';
    case 'stuks':
    case 'stuk':
    case 'st':
      return 'st';
    case 'kg':
      return 'kg';
    case 'ton':
      return 'ton';
    case 'uur':
    case 'h':
      return 'uur';
    case 'dg':
    case 'dgn':
    case 'dag':
    case 'dagen':
      return 'dgn';
    case 'km':
      return 'km';
    case 'keer':
      return 'keer';
    case 'ls':
      return 'ls';
    case 'week':
    case 'wk':
      return 'week';
    case 'mnd':
    case 'maand':
      return 'mnd';
    case 'post':
      return 'post';
    case '%':
      return '%';
    case 'pm':
      return 'pm';
    default:
      return 'st';
  }
}

let idCounter = 0;
function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `imp-${Date.now()}-${++idCounter}`;
}

function generateIfcGuid(): string {
  // 22-char IFC-style GUID placeholder; real generator lives elsewhere.
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';
  let out = '';
  for (let i = 0; i < 22; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

/** Build a CostItem with all required defaults populated. */
export function makeCostItem(partial: {
  parentId: string | null;
  sortOrder: number;
  depth: number;
  rowType: RowType;
  code?: string;
  description?: string;
  unit?: CostUnit;
  quantity?: number | null;
  unitPrice?: number;
  total?: number;
  normFactor?: number | null;
  normDivisor?: number | null;
  resourceType?: ResourceType | null;
}): CostItem {
  const rowType = partial.rowType;
  return {
    id: generateId(),
    parentId: partial.parentId,
    sortOrder: partial.sortOrder,
    code: partial.code ?? '',
    description: partial.description ?? '',
    unit: partial.unit ?? 'st',
    quantity: partial.quantity ?? null,
    materialPrice: null,
    laborPrice: null,
    unitPrice: partial.unitPrice ?? 0,
    total: partial.total ?? 0,
    isCollapsed: false,
    depth: partial.depth,
    notes: '',
    ifcGuid: generateIfcGuid(),
    rowType,
    staartPercentage: null,
    nr: '',
    normQuantity: null,
    normFactor: partial.normFactor ?? null,
    normDivisor: partial.normDivisor ?? null,
    normUnitPrice: null,
    resourceType: partial.resourceType ?? null,
    resourceLibraryId: null,
    tariefGroep: null,
    verrekenbaar: rowType === 'chapter' ? 'V' : null,
  };
}
