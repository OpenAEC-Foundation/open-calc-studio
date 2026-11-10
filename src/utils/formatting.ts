// Getalnotatie (issue #65). Standaard volgt die de app-taal: "1.234,56" in
// het Nederlands, "1,234.56" in het Engels. De instelling "Getalnotatie"
// (Voorkeuren) kan een vaste notatie kiezen; bestaande installaties krijgen
// 1.234,56, zodat er voor hen niets verandert (utils/settings.ts).
// - setNumberLocale(taal): vanuit i18n/config.ts bij elke taalwissel;
// - setNumberFormatPreference(voorkeur): vanuit de instellingen.
// Zonder die aanroepen (headless, tests) blijft het NL.
// Altijd Latijnse cijfers (-u-nu-latn): Arabisch-Indische cijfers kan de
// cel-editor niet teruglezen.

const DEFAULT_LOCALE = 'nl-NL';
/** 'auto' = volg de app-taal; anders een vaste notatie. */
export type NumberFormatPreference = 'auto' | 'nl-NL' | 'en-US';
let appLanguage = DEFAULT_LOCALE;
let preference: NumberFormatPreference = 'auto';
let numberLocale = DEFAULT_LOCALE;
const formatters = new Map<string, Intl.NumberFormat>();

function applyLocale(): void {
  numberLocale = preference === 'auto' ? appLanguage : preference;
}

function formatter(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(`${locale}-u-nu-latn`, options);
    formatters.set(key, f);
  }
  return f;
}

// Sommige talen (fi, sv, nb, hr, fa) gebruiken het wiskundige minteken
// U+2212. Dat leest Excel niet als getal; toon daarom een gewoon '-'.
const plainMinus = (s: string) => s.replace(/\u2212/g, '-');

/** Zet de app-taal voor de getalnotatie (bijv. 'en', 'nl', 'es'). Onbekend → NL. */
export function setNumberLocale(locale: string | null | undefined): void {
  let next = DEFAULT_LOCALE;
  if (locale) {
    try {
      if (Intl.NumberFormat.supportedLocalesOf([locale]).length > 0) next = locale;
    } catch {
      /* ongeldige taalcode → standaard */
    }
  }
  appLanguage = next;
  applyLocale();
}

/** Instelling "Getalnotatie": volg de app-taal of gebruik een vaste notatie. */
export function setNumberFormatPreference(pref: string | null | undefined): void {
  preference = pref === 'nl-NL' || pref === 'en-US' ? pref : 'auto';
  applyLocale();
}

export function getNumberLocale(): string {
  return numberLocale;
}

/** Het decimaalteken van de huidige taal: ',' of '.'. */
export function decimalSeparator(locale: string = numberLocale): ',' | '.' {
  const part = formatter(locale, { minimumFractionDigits: 1 }).formatToParts(1.5).find(p => p.type === 'decimal');
  return part?.value === '.' ? '.' : ',';
}

/** Getal met een vast aantal decimalen in de huidige taal; leeg bij null/0. */
export function formatDecimals(value: number | null | undefined, min: number, max: number = min): string {
  if (value === null || value === undefined || value === 0) return '';
  return plainMinus(formatter(numberLocale, { minimumFractionDigits: min, maximumFractionDigits: max }).format(value));
}

export function formatNumber(value: number | null): string {
  return formatDecimals(value, 2);
}

/**
 * Bedrag zonder valutateken (voor cellen en kolommen). Met een valuta krijgt
 * het bedrag het aantal decimalen van die valuta: 0 voor JPY/KRW/CLP, 3 voor
 * KWD/BHD, anders 2. Zonder valuta 2. Alleen weergave; er wordt niets
 * afgerond in de opgeslagen waarde.
 */
export function formatCurrency(value: number | null, currency?: string | null): string {
  return formatDecimals(value, currency ? currencyDigits(currency) : 2);
}

/** Geldige ISO 4217-code, anders EUR. */
export function safeCurrency(code: string | null | undefined): string {
  const upper = (code ?? '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(upper)) return 'EUR';
  try {
    new Intl.NumberFormat('en', { style: 'currency', currency: upper });
    return upper;
  } catch {
    return 'EUR';
  }
}

const digitsCache = new Map<string, number>();
/** Aantal decimalen (minor unit) van een valuta volgens Intl: EUR 2, JPY 0, KWD 3. */
export function currencyDigits(currency: string | null | undefined): number {
  const code = safeCurrency(currency);
  let digits = digitsCache.get(code);
  if (digits === undefined) {
    digits = new Intl.NumberFormat('en', { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits ?? 2;
    digitsCache.set(code, digits);
  }
  return digits;
}

/**
 * Bedrag mét valutateken, voor totalen: "€ 1.234,56", "$1,234.56".
 * Leeg bij null/0, net als formatCurrency. Er wordt niets omgerekend.
 */
export function formatMoney(value: number | null | undefined, currency: string | null | undefined): string {
  if (value === null || value === undefined || value === 0) return '';
  return formatMoneyKeepZero(value, currency);
}

/** Alleen het valutateken in de app-taal: "€", "$", "US$", "MX$", "CHF". */
export function currencySymbol(currency: string | null | undefined): string {
  const part = formatter(numberLocale, { style: 'currency', currency: safeCurrency(currency) }).formatToParts(1).find(p => p.type === 'currency');
  return part?.value ?? safeCurrency(currency);
}

/** Hele bedragen met valutateken ("€ 1.000", "$1,000"), afgerond; 0 blijft zichtbaar. */
export function formatMoneyWhole(value: number, currency: string | null | undefined): string {
  return plainMinus(formatter(numberLocale, { style: 'currency', currency: safeCurrency(currency), minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(value)));
}

/** Als formatMoney, maar 0 blijft zichtbaar ("€ 0,00"); null/undefined telt als 0. */
export function formatMoneyKeepZero(value: number | null | undefined, currency: string | null | undefined): string {
  return plainMinus(formatter(numberLocale, { style: 'currency', currency: safeCurrency(currency) }).format(value ?? 0));
}

/**
 * Leest een getal in de notatie van een taal. `decimal` is het decimaalteken
 * van die taal; het andere teken (punt of komma) is het duizendtal-teken.
 * - Spaties, harde spaties en apostrofs (duizendtal in fr/sv/ru/ch) vallen weg.
 * - Staan beide tekens erin, dan is het laatste het decimaalteken
 *   ("1.234,56" en "1,234.56" zijn allebei 1234,56).
 * - Eén duizendtal-teken met precies 3 cijfers erna en 1 tot 3 cijfers
 *   (niet 0) ervoor is een duizendtal ("1.234" → 1234 in NL); anders een
 *   decimaal ("60.5" → 60,5, "0.500" → 0,5).
 */
export function parseLocaleNumber(input: string, decimal: ',' | '.' = decimalSeparator()): number | null {
  let s = input.replace(/[\s\u00A0\u202F\u200E\u200F']/g, '').replace(/\u2212/g, '-');
  if (!s) return null;
  const group = decimal === ',' ? '.' : ',';
  const count = (ch: string) => s.split(ch).length - 1;
  if (s.includes(decimal) && s.includes(group)) {
    const realDecimal = s.lastIndexOf(decimal) > s.lastIndexOf(group) ? decimal : group;
    const realGroup = realDecimal === decimal ? group : decimal;
    s = s.split(realGroup).join('').replace(realDecimal, '.');
  } else if (s.includes(decimal)) {
    s = s.replace(decimal, '.');
  } else if (s.includes(group)) {
    const thousands = count(group) > 1
      || new RegExp(`^-?[1-9]\\d{0,2}\\${group}\\d{3}$`).test(s);
    s = thousands ? s.split(group).join('') : s.replace(group, '.');
  }
  const num = parseFloat(s);
  return isNaN(num) ? null : num;
}

/** Leest een getal in NL-notatie, los van de app-taal (subbladen, bestanden). */
export function parseNlNumber(input: string): number | null {
  return parseLocaleNumber(input, ',');
}

// Tekst voor de cel-editor: decimaalteken van de app-taal, geen duizendtal-
// tekens, zodat een ongewijzigde commit exact hetzelfde getal oplevert.
export function formatNumberForEdit(value: number | null | undefined): string {
  if (value === null || value === undefined || value === 0) return '';
  return String(value).replace('.', decimalSeparator());
}
