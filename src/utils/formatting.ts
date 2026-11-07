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
  let cleaned = input.trim();
  if (cleaned.includes(',')) {
    // NL-notatie: punt = duizendtal, komma = decimaal
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else {
    const dots = (cleaned.match(/\./g) || []).length;
    if (dots > 1) {
      cleaned = cleaned.replace(/\./g, ''); // 1.234.567
    } else if (dots === 1) {
      // Eén punt zonder komma: alleen duizendtal bij 1 tot 3 cijfers ervoor
      // (niet 0) en exact 3 erna ("1.234" → 1234); anders decimaal
      // ("60.5" → 60,5, "0.500" → 0,5, "1234.567" → 1234,567).
      if (/^-?[1-9]\d{0,2}\.\d{3}$/.test(cleaned)) cleaned = cleaned.replace('.', '');
    }
  }
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

// Tekst voor de cel-editor: komma als decimaalteken, geen duizendtal-
// separators — zodat een ongewijzigde commit exact hetzelfde getal oplevert.
export function formatNumberForEdit(value: number | null | undefined): string {
  if (value === null || value === undefined || value === 0) return '';
  return String(value).replace('.', ',');
}
