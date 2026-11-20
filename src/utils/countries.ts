// Countries for the price-library choice (issue #93): ISO 3166-1 alpha-2,
// with names in the app language from Intl.DisplayNames.

export const COUNTRY_CODES = [
  'AD', 'AE', 'AF', 'AG', 'AI', 'AL', 'AM', 'AO', 'AQ', 'AR', 'AS', 'AT', 'AU', 'AW', 'AX', 'AZ',
  'BA', 'BB', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI', 'BJ', 'BL', 'BM', 'BN', 'BO', 'BQ', 'BR', 'BS',
  'BT', 'BV', 'BW', 'BY', 'BZ', 'CA', 'CC', 'CD', 'CF', 'CG', 'CH', 'CI', 'CK', 'CL', 'CM', 'CN',
  'CO', 'CR', 'CU', 'CV', 'CW', 'CX', 'CY', 'CZ', 'DE', 'DJ', 'DK', 'DM', 'DO', 'DZ', 'EC', 'EE',
  'EG', 'EH', 'ER', 'ES', 'ET', 'FI', 'FJ', 'FK', 'FM', 'FO', 'FR', 'GA', 'GB', 'GD', 'GE', 'GF',
  'GG', 'GH', 'GI', 'GL', 'GM', 'GN', 'GP', 'GQ', 'GR', 'GS', 'GT', 'GU', 'GW', 'GY', 'HK', 'HM',
  'HN', 'HR', 'HT', 'HU', 'ID', 'IE', 'IL', 'IM', 'IN', 'IO', 'IQ', 'IR', 'IS', 'IT', 'JE', 'JM',
  'JO', 'JP', 'KE', 'KG', 'KH', 'KI', 'KM', 'KN', 'KP', 'KR', 'KW', 'KY', 'KZ', 'LA', 'LB', 'LC',
  'LI', 'LK', 'LR', 'LS', 'LT', 'LU', 'LV', 'LY', 'MA', 'MC', 'MD', 'ME', 'MF', 'MG', 'MH', 'MK',
  'ML', 'MM', 'MN', 'MO', 'MP', 'MQ', 'MR', 'MS', 'MT', 'MU', 'MV', 'MW', 'MX', 'MY', 'MZ', 'NA',
  'NC', 'NE', 'NF', 'NG', 'NI', 'NL', 'NO', 'NP', 'NR', 'NU', 'NZ', 'OM', 'PA', 'PE', 'PF', 'PG',
  'PH', 'PK', 'PL', 'PM', 'PN', 'PR', 'PS', 'PT', 'PW', 'PY', 'QA', 'RE', 'RO', 'RS', 'RU', 'RW',
  'SA', 'SB', 'SC', 'SD', 'SE', 'SG', 'SH', 'SI', 'SJ', 'SK', 'SL', 'SM', 'SN', 'SO', 'SR', 'SS',
  'ST', 'SV', 'SX', 'SY', 'SZ', 'TC', 'TD', 'TF', 'TG', 'TH', 'TJ', 'TK', 'TL', 'TM', 'TN', 'TO',
  'TR', 'TT', 'TV', 'TW', 'TZ', 'UA', 'UG', 'UM', 'US', 'UY', 'UZ', 'VA', 'VC', 'VE', 'VG', 'VI',
  'VN', 'VU', 'WF', 'WS', 'YE', 'YT', 'ZA', 'ZM', 'ZW',
] as const;

type DisplayNamesCtor = new (locales: string[], options: { type: 'region' }) => { of(code: string): string | undefined };
const displayNames = new Map<string, { of(code: string): string | undefined } | null>();

/** Name of the country in the app language ("Netherlands", "Países Bajos"); the code when unknown. */
export function countryName(code: string, language: string): string {
  const lang = language || 'en';
  if (!displayNames.has(lang)) {
    // Intl.DisplayNames is in the ES2021 types; tsconfig targets ES2020.
    const DisplayNames = (Intl as unknown as { DisplayNames?: DisplayNamesCtor }).DisplayNames;
    let names = null;
    try { names = DisplayNames ? new DisplayNames([lang], { type: 'region' }) : null; } catch { /* no names */ }
    displayNames.set(lang, names);
  }
  try {
    return displayNames.get(lang)?.of(code) ?? code;
  } catch {
    return code;
  }
}

export interface CountryOption { code: string; label: string }

/**
 * Options for the country choice: the countries in `first` (those with a
 * library), then all others, each group sorted by name in the app language.
 * A current code that is not in the ISO list (an old or hand-edited file)
 * stays selectable.
 */
export function countryOptions(first: readonly string[], current: string, language: string): { first: CountryOption[]; rest: CountryOption[] } {
  const collator = new Intl.Collator(language || 'en');
  const option = (code: string): CountryOption => ({ code, label: countryName(code, language) });
  const sort = (list: CountryOption[]) => list.sort((a, b) => collator.compare(a.label, b.label));
  const top = new Set(first);
  const codes = new Set<string>(COUNTRY_CODES);
  if (!top.has(current)) codes.add(current);
  return {
    first: sort([...top].map(option)),
    rest: sort([...codes].filter(code => !top.has(code)).map(option)),
  };
}
