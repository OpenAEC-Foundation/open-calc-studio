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
export const formatInputNumber = (value: number | null, comma: boolean) => value == null ? '' : String(value).replace('.', comma ? ',' : '.');
