import { describe, expect, it } from 'vitest';
import { fileNameFromPath } from '@/hooks/useFileOperations';

describe('knownbug 117: tabnaam zonder native extensie', () => {
  it('haalt .ifcCalc, .ifcx, .ocs en .json weg, hoofdletterongevoelig', () => {
    expect(fileNameFromPath('C:\\Projecten\\Begroting.ifcCalc')).toBe('Begroting');
    expect(fileNameFromPath('/home/a/Begroting.IFCCALC')).toBe('Begroting');
    expect(fileNameFromPath('/home/a/Begroting.ocs')).toBe('Begroting');
    expect(fileNameFromPath('/home/a/Begroting.ifcx')).toBe('Begroting');
    expect(fileNameFromPath('/home/a/Begroting.json')).toBe('Begroting');
  });
  it('laat andere punten in de naam staan', () => {
    expect(fileNameFromPath('C:/p/Fase 1.2.ifcCalc')).toBe('Fase 1.2');
    expect(fileNameFromPath('C:/p/werk.xlsx')).toBe('werk.xlsx');
  });
});
