// Getalnotatie volgt de app-taal (issue #65): "1.234,56" in het Nederlands,
// "1,234.56" in het Engels. De taal wordt gezet vanuit i18n/config.ts
// (setNumberLocale); zonder die aanroep (headless, tests) blijft het NL.
// Altijd Latijnse cijfers (-u-nu-latn): Arabisch-Indische cijfers kan de
// cel-editor niet teruglezen.

const DEFAULT_LOCALE = 'nl-NL';
let numberLocale = DEFAULT_LOCALE;
const formatters = new Map<string, Intl.NumberFormat>();

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

/** Zet de taal voor getalnotatie (bijv. 'en', 'nl', 'es'). Onbekend → NL. */
export function setNumberLocale(locale: string | null | undefined): void {
  let next = DEFAULT_LOCALE;
  if (locale) {
    try {
      if (Intl.NumberFormat.supportedLocalesOf([locale]).length > 0) next = locale;
    } catch {
      /* ongeldige taalcode → standaard */
    }
  }
  numberLocale = next;
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

/** Bedrag zonder valutateken (voor cellen en kolommen). */
export function formatCurrency(value: number | null): string {
  return formatDecimals(value, 2);
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

/**
 * Bedrag mét valutateken, voor totalen: "€ 1.234,56", "$1,234.56".
 * Leeg bij null/0, net als formatCurrency. Er wordt niets omgerekend.
 */
export function formatMoney(value: number | null | undefined, currency: string | null | undefined): string {
  if (value === null || value === undefined || value === 0) return '';
  return formatMoneyKeepZero(value, currency);
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
