import { describe, it, expect } from 'vitest';
import { toIfcCalcPath, isNativeSavePath } from '@/hooks/useFileOperations';

/**
 * Opslaan (als) — .ifcCalc is het standaardformaat, en een geïmporteerd
 * bronbestand (.xls/.xtb/…) mag nooit in-place met OCS-JSON overschreven
 * worden (regressie: Ctrl+S schreef JSON over het originele Excel-bestand).
 */
describe('Opslaan als → standaard .ifcCalc', () => {
  it('vervangt de bron-extensie door .ifcCalc, map en naam blijven', () => {
    expect(toIfcCalcPath('C:\\Projecten\\begroting Ed\\c_gww_Nieuwe begroting.xls', null))
      .toBe('C:\\Projecten\\begroting Ed\\c_gww_Nieuwe begroting.ifcCalc');
    expect(toIfcCalcPath('/data/project.xtb', null)).toBe('/data/project.ifcCalc');
    expect(toIfcCalcPath('C:\\a\\b.ifcCalc', null)).toBe('C:\\a\\b.ifcCalc');
  });

  it('valt zonder pad terug op de documentnaam + .ifcCalc', () => {
    expect(toIfcCalcPath(null, 'Nieuwbouw fase 2')).toBe('Nieuwbouw fase 2.ifcCalc');
    expect(toIfcCalcPath(null, 'import.xls')).toBe('import.ifcCalc');
    expect(toIfcCalcPath(null, null)).toBe('begroting.ifcCalc');
    expect(toIfcCalcPath(undefined, '')).toBe('begroting.ifcCalc');
  });

  it('mappen met punten in de naam breken het pad niet', () => {
    expect(toIfcCalcPath('C:\\v1.2\\raming', null)).toBe('C:\\v1.2\\raming.ifcCalc');
  });

  it('alleen native formaten mogen in-place opgeslagen worden', () => {
    expect(isNativeSavePath('C:\\a\\b.ifcCalc')).toBe(true);
    expect(isNativeSavePath('C:\\a\\b.IFCX')).toBe(true);
    expect(isNativeSavePath('C:\\a\\b.ocs')).toBe(true);
    expect(isNativeSavePath('C:\\a\\b.json')).toBe(true);
    // Bronformaten: nooit overschrijven
    expect(isNativeSavePath('C:\\a\\b.xls')).toBe(false);
    expect(isNativeSavePath('C:\\a\\b.xlsx')).toBe(false);
    expect(isNativeSavePath('C:\\a\\b.xtb')).toBe(false);
    expect(isNativeSavePath('C:\\a\\b.calc')).toBe(false);
    expect(isNativeSavePath('C:\\a\\b.dnc')).toBe(false);
    expect(isNativeSavePath('C:\\a\\b.rsx')).toBe(false);
  });
});
