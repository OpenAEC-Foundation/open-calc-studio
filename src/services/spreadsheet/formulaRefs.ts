/**
 * Verschuiven van celverwijzingen in spreadsheet-formules bij kopiëren/
 * plakken — Excel/LibreOffice-gedrag: relatieve verwijzingen (A1) schuiven
 * mee met de plak-offset, absolute delen ($A$1, $A1, A$1) blijven staan.
 */

/** Kolomletters → 0-gebaseerde index (A=0, Z=25, AA=26, …). */
export function colIndexFromLabel(label: string): number {
  let n = 0;
  for (const c of label.toUpperCase()) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

/** 0-gebaseerde index → kolomletters. */
export function colLabelFromIndex(index: number): string {
  let label = '';
  let n = index;
  while (n >= 0) {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  }
  return label;
}

/**
 * Verschuif alle relatieve celverwijzingen in een formule met (dCol, dRow).
 * `$`-verankerde delen schuiven niet mee. Verwijzingen die buiten het blad
 * zouden vallen (vóór kolom A of rij 1) worden `#VERW!`.
 *
 * Geen formule (begint niet met '=') → ongewijzigd terug.
 */
export function shiftFormulaRefs(formula: string, dCol: number, dRow: number): string {
  if (!formula.startsWith('=') || (dCol === 0 && dRow === 0)) return formula;
  return formula.replace(
    /(\$?)([A-Z]+)(\$?)(\d+)/gi,
    (_m, colAbs: string, col: string, rowAbs: string, row: string) => {
      let colIdx = colIndexFromLabel(col);
      let rowNum = parseInt(row, 10);
      if (!colAbs) colIdx += dCol;
      if (!rowAbs) rowNum += dRow;
      if (colIdx < 0 || rowNum < 1) return '#VERW!';
      return `${colAbs}${colLabelFromIndex(colIdx)}${rowAbs}${rowNum}`;
    },
  );
}
