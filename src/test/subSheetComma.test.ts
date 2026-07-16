import { describe, it, expect } from 'vitest';
import { useAppStore } from '@/state/appStore';
import { normalizeDecimalsInExpression } from '@/utils/numericInput';

const s = () => useAppStore.getState();

describe('normalizeDecimalsInExpression', () => {
  it('herschrijft NL-getallen naar punt-notatie, laat de rest staan', () => {
    expect(normalizeDecimalsInExpression('2*1,05')).toBe('2*1.05');
    expect(normalizeDecimalsInExpression('1.234,56*2')).toBe('1234.56*2');
    expect(normalizeDecimalsInExpression('6.66+1')).toBe('6.66+1');
    expect(normalizeDecimalsInExpression('(3+4)/2')).toBe('(3+4)/2');
  });
});

describe('subblad: komma-decimalen en NL-formules (LibreOffice-plak)', () => {
  it('geplakte waarde met komma wordt volledig gelezen', () => {
    const id = s().addSubSheet('komma-waarde');
    s().setSubSheetCell(id, 'A1', '6,66');
    expect(s().getSubSheet(id)!.cells['A1'].computed).toBe(6.66);
  });

  it('formule met komma-decimaal en celverwijzing', () => {
    const id = s().addSubSheet('komma-formule');
    s().setSubSheetCell(id, 'B2', '10');
    s().setSubSheetCell(id, 'B3', '=B2*1,05');
    expect(s().getSubSheet(id)!.cells['B3'].computed).toBeCloseTo(10.5, 10);
  });

  it('SOM( werkt als alias voor SUM(', () => {
    const id = s().addSubSheet('som-alias');
    s().setSubSheetCell(id, 'A1', '2,5');
    s().setSubSheetCell(id, 'A2', '2,5');
    s().setSubSheetCell(id, 'A3', '=SOM(A1:A2)');
    expect(s().getSubSheet(id)!.cells['A3'].computed).toBe(5);
  });

  it('duizendtal-notatie binnen een formule', () => {
    const id = s().addSubSheet('duizendtal');
    s().setSubSheetCell(id, 'A1', '=1.234,56*2');
    expect(s().getSubSheet(id)!.cells['A1'].computed).toBeCloseTo(2469.12, 10);
  });

  it('verwijzing naar cel met komma-waarde', () => {
    const id = s().addSubSheet('ref-komma');
    s().setSubSheetCell(id, 'A1', '17,70');
    s().setSubSheetCell(id, 'A2', '=A1*2');
    expect(s().getSubSheet(id)!.cells['A2'].computed).toBeCloseTo(35.4, 10);
  });

  it('tekst blijft tekst', () => {
    const id = s().addSubSheet('tekst');
    s().setSubSheetCell(id, 'A1', 'omschrijving');
    expect(s().getSubSheet(id)!.cells['A1'].computed).toBeUndefined();
  });
});
