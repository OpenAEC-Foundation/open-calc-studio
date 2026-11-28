/** Complete locale-aware input; undefined means invalid, null means deliberately blank. */
export function parseLocaleNumber(text: string, comma: boolean): number | null | undefined {
  if (!text.trim()) return null;
  const value = text.trim();
  const pattern = comma ? /^-?(?:\d{1,3}(?:[. ]\d{3})+|\d+)(?:,\d+)?$/ : /^-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/;
  if (!pattern.test(value)) return undefined;
  const number = Number(comma ? value.replace(/[. ]/g, '').replace(',', '.') : value.replace(/,/g, ''));
  return Number.isFinite(number) ? number : undefined;
}
export const usesDecimalComma = (locale: string) => new Intl.NumberFormat(locale).format(1.5).includes(',');
/** Getal zonder exponentnotatie: String(5e-7) is "5e-7", en dat leest
 * parseLocaleNumber niet terug, zodat elke bewerking mislukte (knownbug 209). */
function plainNumberText(value: number): string {
  const text = String(value);
  const m = /^(-?)(\d+)(?:\.(\d+))?e([+-]\d+)$/i.exec(text);
  if (!m) return text;
  const [, sign, whole, fraction = '', exponent] = m;
  const digits = whole + fraction;
  const point = whole.length + Number(exponent);
  if (point <= 0) return `${sign}0.${'0'.repeat(-point)}${digits}`;
  if (point >= digits.length) return sign + digits + '0'.repeat(point - digits.length);
  return `${sign}${digits.slice(0, point)}.${digits.slice(point)}`;
}
export const formatInputNumber = (value: number | null, comma: boolean) => value == null ? '' : plainNumberText(value).replace('.', comma ? ',' : '.');
