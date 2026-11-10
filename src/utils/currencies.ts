// Valuta's die je per begroting kunt kiezen (issue #65). Alleen de weergave
// verandert: er wordt nooit omgerekend tussen valuta's.

export const CURRENCY_CODES = [
  'EUR', 'USD', 'GBP', 'CHF', 'CAD', 'AUD', 'NZD',
  'MXN', 'BRL', 'ARS', 'CLP', 'COP', 'PEN', 'UYU',
  'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'BGN', 'RSD', 'UAH', 'TRY',
  'JPY', 'CNY', 'KRW', 'INR', 'IDR', 'MYR', 'SGD', 'THB', 'VND', 'PHP',
  'AED', 'SAR', 'ILS', 'IRR', 'PKR', 'BDT', 'LAK',
  'ZAR', 'NGN', 'KES', 'TZS', 'EGP', 'MAD',
] as const;

type DisplayNamesCtor = new (locales: string[], options: { type: 'currency' }) => { of(code: string): string | undefined };

/** Naam van de valuta in de app-taal ("US Dollar", "dólar estadounidense"). */
export function currencyName(code: string, language: string): string {
  // Intl.DisplayNames zit pas in de ES2021-typen; tsconfig staat op ES2020.
  const DisplayNames = (Intl as unknown as { DisplayNames?: DisplayNamesCtor }).DisplayNames;
  if (!DisplayNames) return code;
  try {
    return new DisplayNames([language || 'en'], { type: 'currency' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/**
 * Keuzelijst voor de projectinstellingen, op valutacode gesorteerd (EUR, GBP, USD, …);
 * de naam staat erachter in de app-taal.
 * Een code uit een geïmporteerd bestand die niet in de lijst staat, komt er
 * ook in, zodat de keuze nooit stil verspringt.
 */
export function currencyOptions(current: string, language: string): { code: string; label: string }[] {
  const codes = new Set<string>(CURRENCY_CODES);
  if (/^[A-Z]{3}$/.test(current)) codes.add(current);
  return [...codes]
    .map(code => ({ code, label: `${code} · ${currencyName(code, language)}` }))
    .sort((a, b) => a.code.localeCompare(b.code));
}
