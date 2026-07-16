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
      // Eén punt zonder komma: alleen duizendtal bij exact 3 cijfers erna
      // ("1.234" → 1234); anders decimaal ("60.5" → 60,5 — niet 605).
      const frac = cleaned.slice(cleaned.indexOf('.') + 1);
      if (/^\d{3}$/.test(frac)) cleaned = cleaned.replace('.', '');
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
