import { describe, it, expect } from 'vitest';
import { shiftFormulaRefs, colIndexFromLabel, colLabelFromIndex } from '@/services/spreadsheet/formulaRefs';

describe('shiftFormulaRefs — relatief plakken zoals Excel/LibreOffice', () => {
  it('schuift relatieve verwijzingen mee met de plak-offset', () => {
    expect(shiftFormulaRefs('=A1+B1', 2, 4)).toBe('=C5+D5');
    expect(shiftFormulaRefs('=SOM(A1:A10)*2', 1, 0)).toBe('=SOM(B1:B10)*2');
  });

  it('laat $-verankerde delen staan (kolom, rij of beide)', () => {
    expect(shiftFormulaRefs('=$A$1+B2', 3, 3)).toBe('=$A$1+E5');
    expect(shiftFormulaRefs('=$A1+A$1', 2, 5)).toBe('=$A6+C$1');
  });

  it('verwijzingen buiten het blad worden #VERW!', () => {
    expect(shiftFormulaRefs('=A1+C3', -1, 0)).toBe('=#VERW!+B3');
    expect(shiftFormulaRefs('=B2', 0, -5)).toBe('=#VERW!');
  });

  it('geen formule of geen offset → ongewijzigd', () => {
    expect(shiftFormulaRefs('123,45', 2, 2)).toBe('123,45');
    expect(shiftFormulaRefs('tekst A1', 2, 2)).toBe('tekst A1');
    expect(shiftFormulaRefs('=A1+B1', 0, 0)).toBe('=A1+B1');
  });

  it('meerletterige kolommen (AA en verder)', () => {
    expect(colIndexFromLabel('AA')).toBe(26);
    expect(colLabelFromIndex(26)).toBe('AA');
    expect(shiftFormulaRefs('=Z1+AA1', 1, 0)).toBe('=AA1+AB1');
  });
});
