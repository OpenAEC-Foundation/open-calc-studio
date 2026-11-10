/**
 * Gedeelde kern voor álle importers (XML, binair en tekst).
 *
 * Eén plek voor: getal-/eenheid-normalisatie, id/guid-generatie, de
 * CostItem-fabriek en een BudgetBuilder die hiërarchie (sortOrder/depth/
 * parentId) consistent bijhoudt. Elke importer bouwt hierop, zodat er geen
 * losse, net-iets-andere item-fabrieken meer rondzwerven.
 */
import type { CostItem, CostUnit, RowType } from '@/types/costModel';
import { CURRENCY_CODES } from '@/utils/currencies';

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
 * Valutatekens die vóór of achter een bedrag kunnen staan. De waarde is de
 * ISO 4217-code als het teken eenduidig is; `null` bij tekens die meerdere
 * valuta's kunnen betekenen ($, ¥, kr). Langste eerst, zodat "US$" vóór "$" gaat.
 */
const CURRENCY_TOKENS: [string, string | null][] = [
  ['US$', 'USD'], ['NZ$', 'NZD'], ['HK$', 'HKD'], ['R$', 'BRL'], ['C$', 'CAD'], ['A$', 'AUD'], ['S$', 'SGD'],
  ['€', 'EUR'], ['£', 'GBP'], ['₹', 'INR'], ['₽', 'RUB'], ['₺', 'TRY'], ['₩', 'KRW'], ['₪', 'ILS'],
  ['₫', 'VND'], ['₱', 'PHP'], ['฿', 'THB'], ['₦', 'NGN'], ['₴', 'UAH'], ['zł', 'PLN'], ['Kč', 'CZK'],
  ['kr.', null], ['kr', null], ['$', null], ['¥', null],
  ...CURRENCY_CODES.map((c): [string, string] => [c, c]),
];
const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const TOKEN_RE = [...CURRENCY_TOKENS].sort((a, b) => b[0].length - a[0].length).map(([t]) => escapeRe(t)).join('|');
const AMOUNT_RE = new RegExp(`^([+-]?)(${TOKEN_RE})?([+-]?)(.*?)(${TOKEN_RE})?$`, 'i');
const TOKEN_CODE = new Map<string, string | null>(CURRENCY_TOKENS.map(([t, c]): [string, string | null] => [t.toLowerCase(), c]));

/** Geldige ISO 4217-code uit een bestand (hoofdletterongevoelig), anders null. */
export function normalizeCurrencyCode(raw: string | null | undefined): string | null {
  const code = (raw ?? '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

export interface ParsedAmount {
  /** Het getal; 0 bij lege of onleesbare tekst. */
  value: number;
  /** Niet-lege tekst die geen getal is (bv. "n.v.t."). Leeg telt niet als onleesbaar. */
  invalid: boolean;
  /** ISO-code van een eenduidig valutateken of -code bij het bedrag, anders null. */
  currency: string | null;
}

/**
 * Lees een getal of bedrag uit tekst. Valutatekens en -codes vóór of achter
 * het getal ("€ 1.234,56", "1.234,56 EUR", "USD 1,234.56") en spaties (ook
 * harde spaties) tellen niet mee. Er wordt nooit omgerekend.
 *
 * Decimaalteken: staan er zowel punten als komma's in, dan is het laatste
 * teken het decimaalteken ("1.234,56" en "1,234.56"). Alleen één komma →
 * NL-decimaal ("12,5"); meerdere komma's of meerdere punten → duizendtallen.
 */
export function parseAmount(raw: string | number | null | undefined): ParsedAmount {
  if (typeof raw === 'number') return { value: Number.isFinite(raw) ? raw : 0, invalid: !Number.isFinite(raw), currency: null };
  if (raw == null) return { value: 0, invalid: false, currency: null };
  const s = String(raw).replace(/[\s\u00a0\u2007\u202f'\u2019]/g, '').replace(/\u2212/g, '-');
  if (!s) return { value: 0, invalid: false, currency: null };
  const m = AMOUNT_RE.exec(s);
  const token = m?.[2] ?? m?.[5];
  const currency = token ? TOKEN_CODE.get(token.toLowerCase()) ?? null : null;
  let t = m ? `${m[1] || m[3]}${m[4]}` : s;
  const lastComma = t.lastIndexOf(',');
  const lastDot = t.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    t = lastComma > lastDot ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  } else if (lastComma >= 0) {
    t = t.indexOf(',') === lastComma ? t.replace(',', '.') : t.replace(/,/g, '');
  } else if (lastDot >= 0 && t.indexOf('.') !== lastDot) {
    t = t.replace(/\./g, '');
  }
  const n = parseFloat(t);
  return Number.isFinite(n) ? { value: n, invalid: false, currency } : { value: 0, invalid: true, currency: null };
}

/**
 * Parse een getal uit tekst of number (zie `parseAmount`); leeg/onleesbaar → 0.
 * Importers met een meldingenkanaal gebruiken `parseAmount`, zodat onleesbare
 * tekst niet stil als 0 binnenkomt.
 */
export function parseNumber(raw: string | number | null | undefined): number {
  return parseAmount(raw).value;
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
