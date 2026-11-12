// Valuta's die je per begroting kunt kiezen (issue #65). Alleen de weergave
// verandert: er wordt nooit omgerekend tussen valuta's.

/**
 * Korte, gangbare lijst. De importers gebruiken deze lijst om bedragen en
 * stelposten te herkennen (importers/core.ts, inschrijfstaatImporter.ts); daar
 * mag hij níet de volledige ISO-lijst worden, want codes als ALL, TOP, CUP of
 * PEN zijn ook gewone woorden. In de keuzelijst staan deze valuta's bovenaan.
 */
export const CURRENCY_CODES = [
  'EUR', 'USD', 'GBP', 'CHF', 'CAD', 'AUD', 'NZD',
  'MXN', 'BRL', 'ARS', 'CLP', 'COP', 'PEN', 'UYU',
  // Midden-Amerika en Caribisch gebied (issue #81: colón van Costa Rica).
  'CRC', 'GTQ', 'HNL', 'NIO', 'PAB', 'DOP', 'BOB', 'PYG',
  'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'BGN', 'RSD', 'UAH', 'RUB', 'TRY',
  'JPY', 'CNY', 'HKD', 'TWD', 'KRW', 'INR', 'LKR', 'IDR', 'MYR', 'SGD', 'THB', 'VND', 'PHP',
  'AED', 'SAR', 'ILS', 'IRR', 'PKR', 'BDT', 'LAK',
  'ZAR', 'NGN', 'KES', 'TZS', 'EGP', 'MAD',
] as const;

/**
 * Hoofdvaluta's: dit is wat de keuzelijst toont zolang je niets typt, in deze
 * volgorde (eerst NL/EU, dan Spaanstalig Amerika, dan de grote overige). "Alle
 * valuta's tonen" en zoeken gaan over de volledige lijst.
 */
export const MAIN_CURRENCY_CODES = [
  'EUR', 'USD', 'GBP', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK',
  'MXN', 'COP', 'ARS', 'CLP', 'PEN', 'BRL', 'CRC',
  'CAD', 'AUD', 'JPY', 'CNY',
] as const;

/**
 * ISO 4217-codes die geen betaalmiddel zijn en dus niet in de keuzelijst horen:
 * edelmetalen (XAU, XAG, XPT, XPD), test- en lege codes (XTS, XXX), rekeneenheden
 * (XDR, XSU, XUA) en fondscodes naast de gewone valuta (BOV, CLF, COU, MXV, USN,
 * UYI, UYW, CHE, CHW), en valuta's die niet meer in gebruik zijn: ANG (sinds
 * 2025 XCG), BGN (Bulgarije sinds 2026 euro), CUC (2021 afgeschaft), HRK (Kroatië
 * sinds 2023 euro), SLL (nu SLE), SVC (El Salvador gebruikt USD), ZWL (nu ZWG).
 * Staat zo'n code in een bestaande begroting of een geïmporteerd bestand, dan
 * blijft hij wel kiesbaar (zie currencyOptions). De importers blijven BGN als
 * valuta herkennen (CURRENCY_CODES), voor oude bestanden.
 */
const EXCLUDED_CURRENCY_CODES = new Set([
  'XAU', 'XAG', 'XPT', 'XPD', 'XTS', 'XXX', 'XDR', 'XSU', 'XUA',
  'BOV', 'CLF', 'COU', 'MXV', 'USN', 'UYI', 'UYW', 'CHE', 'CHW',
  'ANG', 'BGN', 'CUC', 'HRK', 'SLL', 'SVC', 'ZWL',
]);

/**
 * Alle valuta's die de runtime kent (Intl.supportedValuesOf, ±160 codes), op
 * code gesorteerd. Zonder die functie (oude WebView) alleen CURRENCY_CODES.
 */
export function allCurrencyCodes(): string[] {
  // Intl.supportedValuesOf zit pas in de ES2022-typen; tsconfig staat op ES2020.
  const supportedValuesOf = (Intl as unknown as { supportedValuesOf?: (key: 'currency') => string[] }).supportedValuesOf;
  const codes = new Set<string>(CURRENCY_CODES.filter(code => !EXCLUDED_CURRENCY_CODES.has(code)));
  try {
    for (const code of supportedValuesOf?.('currency') ?? []) {
      if (/^[A-Z]{3}$/.test(code) && !EXCLUDED_CURRENCY_CODES.has(code)) codes.add(code);
    }
  } catch { /* alleen de korte lijst */ }
  return [...codes].sort();
}

type DisplayNamesCtor = new (locales: string[], options: { type: 'currency' }) => { of(code: string): string | undefined };
const displayNames = new Map<string, { of(code: string): string | undefined } | null>();

/** Naam van de valuta in de app-taal ("US Dollar", "dólar estadounidense"). */
export function currencyName(code: string, language: string): string {
  const lang = language || 'en';
  if (!displayNames.has(lang)) {
    // Intl.DisplayNames zit pas in de ES2021-typen; tsconfig staat op ES2020.
    const DisplayNames = (Intl as unknown as { DisplayNames?: DisplayNamesCtor }).DisplayNames;
    let names = null;
    try { names = DisplayNames ? new DisplayNames([lang], { type: 'currency' }) : null; } catch { /* geen namen */ }
    displayNames.set(lang, names);
  }
  try {
    return displayNames.get(lang)?.of(code) ?? code;
  } catch {
    return code;
  }
}

export interface CurrencyOption {
  code: string;
  /** "CRC · colón costarricense" */
  label: string;
  /** Hoofdvaluta (MAIN_CURRENCY_CODES): staat in de korte lijst. */
  main: boolean;
  /** Gangbare valuta (CURRENCY_CODES): direct na de hoofdvaluta's. */
  common: boolean;
  /** Code en namen (app-taal én Engels), kleine letters zonder accenten, om in te zoeken. */
  search: string;
}

/** Kleine letters zonder accenten: "Colón" en "colon" vinden elkaar. */
function normalize(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

/**
 * Volledige keuzelijst voor de projectinstellingen: eerst de hoofdvaluta's in
 * de volgorde van MAIN_CURRENCY_CODES, dan de overige gangbare en dan de rest,
 * die twee op valutacode; de naam staat erachter in de app-taal. Een code uit
 * een bestaande begroting of geïmporteerd bestand die niet in de lijst staat,
 * komt er ook in, zodat de keuze nooit stil verspringt.
 */
export function currencyOptions(current: string, language: string): CurrencyOption[] {
  const main: readonly string[] = MAIN_CURRENCY_CODES;
  const common = new Set<string>(CURRENCY_CODES);
  const codes = new Set(allCurrencyCodes());
  if (/^[A-Z]{3}$/.test(current)) codes.add(current);
  const group = (o: CurrencyOption) => (o.main ? 0 : o.common ? 1 : 2);
  return [...codes]
    .map(code => {
      const name = currencyName(code, language);
      return { code, label: `${code} · ${name}`, main: main.includes(code), common: common.has(code), search: normalize(`${code} ${name} ${currencyName(code, 'en')}`) };
    })
    .sort((a, b) => group(a) - group(b) || (a.main ? main.indexOf(a.code) - main.indexOf(b.code) : a.code.localeCompare(b.code)));
}

/** Korte lijst zolang je niets typt: de hoofdvaluta's, plus de huidige als die er niet bij zit. */
export function mainCurrencyOptions(options: CurrencyOption[], current: string): CurrencyOption[] {
  return options.filter(o => o.main || o.code === current);
}

/**
 * Zoeken op code of naam ("CRC", "colón", "dollar"). Een exacte code komt
 * eerst, dan codes die zo beginnen, dan namen; verder blijft de volgorde van
 * de lijst (hoofdvaluta's eerst). Een lege zoekterm geeft de hele lijst.
 */
export function filterCurrencyOptions(options: CurrencyOption[], query: string): CurrencyOption[] {
  const q = normalize(query);
  if (!q) return options;
  const rank = (o: CurrencyOption): number => {
    const code = o.code.toLowerCase();
    if (code === q) return 0;
    if (code.startsWith(q)) return 1;
    if (o.search.split(/[\s·]+/).some(word => word.startsWith(q))) return 2;
    return o.search.includes(q) ? 3 : -1;
  };
  return options
    .map((o, index) => ({ o, index, r: rank(o) }))
    .filter(x => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.index - b.index)
    .map(x => x.o);
}
