const nlFormatter = new Intl.NumberFormat('nl-NL', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatNumber(value: number | null): string {
  if (value === null || value === 0) return '';
  return nlFormatter.format(value);
}

export function formatCurrency(value: number | null): string {
  if (value === null || value === 0) return '';
  return nlFormatter.format(value);
}

export function parseNlNumber(input: string): number | null {
  if (!input.trim()) return null;
  const cleaned = input.replace(/\./g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}
