/**
 * Gedeelde kern voor álle importers (XML, binair en tekst).
 *
 * Eén plek voor: getal-/eenheid-normalisatie, id/guid-generatie, de
 * CostItem-fabriek en een BudgetBuilder die hiërarchie (sortOrder/depth/
 * parentId) consistent bijhoudt. Elke importer bouwt hierop, zodat er geen
 * losse, net-iets-andere item-fabrieken meer rondzwerven.
 */
import type { CostItem, CostUnit, RowType } from '@/types/costModel';

// ── id / guid ───────────────────────────────────────────────────────────────

let _idCounter = 0;

/** Stabiele, uniek-genoeg id. Gebruikt crypto.randomUUID indien beschikbaar. */
export function genId(prefix = 'imp'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  _idCounter += 1;
  return `${prefix}-${_idCounter.toString(36)}`;
}

const GUID_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';
/** 22-teken IFC-stijl GUID-placeholder. */
export function genIfcGuid(): string {
  let out = '';
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const buf = new Uint8Array(22);
    crypto.getRandomValues(buf);
    for (let i = 0; i < 22; i++) out += GUID_CHARS[buf[i] % 64];
    return out;
  }
  for (let i = 0; i < 22; i++) out += GUID_CHARS[(_idCounter * 31 + i * 7) % 64];
  return out;
}

// ── getallen ──────────────────────────────────────────────────────────────

/**
 * Parse een getal uit tekst of number. Ondersteunt NL-decimalen ("1.234,56")
 * én EN-decimalen ("1234.56"); leeg/onleesbaar → 0.
 */
export function parseNumber(raw: string | number | null | undefined): number {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
  if (raw == null) return 0;
  const s = String(raw).trim();
  if (!s) return 0;
  // Komma aanwezig → NL: punten zijn duizendtallen, komma is decimaal.
  const t = s.indexOf(',') >= 0 ? s.replace(/\./g, '').replace(',', '.') : s;
  const n = parseFloat(t.replace(/\s/g, ''));
  return Number.isFinite(n) ? n : 0;
}

// ── eenheden ────────────────────────────────────────────────────────────────

const UNIT_MAP: Record<string, CostUnit> = {
  st: 'st', stk: 'st', stl: 'st', stuk: 'st', stuks: 'st',
  m: 'm', m1: 'm', meter: 'm',
  m2: 'm²', 'm^2': 'm²', 'm²': 'm²',
  m3: 'm³', 'm^3': 'm³', 'm³': 'm³',
  kg: 'kg', ton: 'ton',
  uur: 'uur', u: 'uur', h: 'uur',
  dg: 'dgn', dgn: 'dgn', dag: 'dgn', dagen: 'dgn',
  km: 'km', keer: 'keer', ls: 'ls',
  week: 'week', wk: 'week',
  mnd: 'mnd', maand: 'mnd',
  post: 'post', pst: 'post', eur: 'post',
  '%': '%', pm: 'pm',
};

/** Normaliseer een vrije eenheid-tekst ("m3", "M²", "stuks") naar CostUnit. */
export function normalizeUnit(raw: string | null | undefined): CostUnit {
  const s = (raw ?? '').trim().toLowerCase();
  return UNIT_MAP[s] ?? 'st';
}

// ── CostItem-fabriek ──────────────────────────────────────────────────────

/**
 * Bouw een volledige CostItem met alle verplichte velden ingevuld. Geef alleen
 * de relevante velden mee; de rest krijgt zinnige defaults. `rowType` is altijd
 * vereist (bepaalt o.a. de default voor `verrekenbaar`).
 */
export function makeCostItem(partial: Partial<CostItem> & { rowType: RowType }): CostItem {
  const rowType = partial.rowType;
  return {
    id: genId(),
    parentId: null,
    sortOrder: 0,
    code: '',
    description: '',
    unit: 'st',
    quantity: null,
    materialPrice: null,
    laborPrice: null,
    unitPrice: 0,
    total: 0,
    isCollapsed: false,
    depth: 0,
    notes: '',
    ifcGuid: genIfcGuid(),
    staartPercentage: null,
    nr: '',
    normQuantity: null,
    normFactor: null,
    normDivisor: null,
    normUnitPrice: null,
    resourceType: null,
    resourceLibraryId: null,
    tariefGroep: null,
    verrekenbaar: rowType === 'chapter' ? 'V' : null,
    ...partial,
  };
}

// ── BudgetBuilder ─────────────────────────────────────────────────────────

/**
 * Houdt de items-lijst + oplopende sortOrder bij, zodat importers zich op de
 * mapping kunnen richten i.p.v. op boekhouding. `add` retourneert het item
 * (handig om de id als parentId voor kinderen te gebruiken).
 */
export class BudgetBuilder {
  readonly items: CostItem[] = [];
  private _sort = 0;

  add(partial: Partial<CostItem> & { rowType: RowType }): CostItem {
    const item = makeCostItem({ sortOrder: this._sort++, ...partial });
    this.items.push(item);
    return item;
  }

  get length(): number {
    return this.items.length;
  }
}
