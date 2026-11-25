import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '@/state/appStore';
import { recalcSheetCells } from '@/state/slices/subSheetSlice';
import type { SubSheetCell } from '@/types/costModel';

// knownbugs 48, 50, 51, 53, 54, 268: formule-engine van de deelspreadsheets.
const initial = useAppStore.getState();
let sheetId = '';
const set = (ref: string, value: string) => useAppStore.getState().setSubSheetCell(sheetId, ref, value);
const computed = (ref: string) =>
  useAppStore.getState().subSheets.find((s) => s.id === sheetId)!.cells[ref]?.computed;

beforeEach(() => {
  useAppStore.setState(initial, true);
  sheetId = useAppStore.getState().addSubSheet('Formules');
});

describe('verwijzingen invullen', () => {
  it('rekent met een negatieve waarde in een verwijzing (knownbug 48)', () => {
    set('A1', '-5');
    set('B1', '=10-A1');
    set('B2', '=-A1');
    set('B3', '=A1*-2');
    expect(computed('B1')).toBe(15);
    expect(computed('B2')).toBe(5);
    expect(computed('B3')).toBe(10);
  });

  it('rekent met een heel kleine waarde in een verwijzing (knownbug 54)', () => {
    set('A1', '0,0000001');
    set('B1', '=A1*2');
    expect(computed('B1')).toBeCloseTo(2e-7, 15);
  });

  it('rekent met absolute en gemengde verwijzingen (knownbug 50)', () => {
    set('A1', '3');
    set('A2', '4');
    set('B1', '=$A$1*2');
    set('B2', '=A$1+$A2');
    set('B3', '=SUM($A$1:$A$2)');
    expect(computed('B1')).toBe(6);
    expect(computed('B2')).toBe(7);
    expect(computed('B3')).toBe(7);
  });
});

describe('SUM', () => {
  it('telt een omgekeerd bereik op (knownbug 51)', () => {
    set('A1', '1');
    set('A2', '2');
    set('A3', '3');
    set('B1', '=SUM(A3:A1)');
    expect(computed('B1')).toBe(6);
  });

  it('telt kolommen met twee letters op (knownbug 51)', () => {
    set('Z1', '1');
    set('AA1', '2');
    set('AB1', '4');
    set('B1', '=SUM(Z1:AB1)');
    set('B2', '=AA1*10');
    expect(computed('B1')).toBe(7);
    expect(computed('B2')).toBe(20);
  });

  it('slaat tekst in een bereik over, zoals Excel', () => {
    set('A1', 'omschrijving');
    set('A2', '2');
    set('A3', '=SUM(A1:A2)');
    expect(computed('A3')).toBe(2);
  });
});

describe('fouten doorgeven', () => {
  it('geeft een fout als een verwezen cel tekst bevat (knownbug 53)', () => {
    set('A1', 'abc');
    set('B1', '=A1+1');
    expect(computed('B1')).toBeUndefined();
  });

  it('geeft een fout als een verwezen cel zelf een fout is (knownbug 53)', () => {
    set('A1', '=1/0');
    set('B1', '=A1+1');
    set('B2', '=SUM(A1:A2)');
    expect(computed('B1')).toBeUndefined();
    expect(computed('B2')).toBeUndefined();
  });

  it('een lege cel telt als 0', () => {
    set('B1', '=A1+1');
    expect(computed('B1')).toBe(1);
  });

  it('een cel die op een kringverwijzing leunt is ook ongeldig (knownbug 268)', () => {
    set('A1', '=B1');
    set('B1', '=A1');
    set('C1', '=A1+1');
    set('D1', '=C1*2');
    expect(computed('A1')).toBeUndefined();
    expect(computed('B1')).toBeUndefined();
    expect(computed('C1')).toBeUndefined();
    expect(computed('D1')).toBeUndefined();
  });

  it('herstelt na het opheffen van de kring', () => {
    set('A1', '=B1');
    set('B1', '=A1');
    set('C1', '=A1+1');
    set('B1', '4');
    expect(computed('A1')).toBe(4);
    expect(computed('C1')).toBe(5);
  });
});

describe('lange ketens (knownbug 268)', () => {
  it('rekent een lopend totaal over duizenden rijen zonder stack overflow', () => {
    // Onderste cel eerst, zodat de evaluatie de hele keten in één keer omhoog moet.
    const cells: Record<string, SubSheetCell> = {};
    for (let r = 20000; r >= 2; r--) cells[`A${r}`] = { value: `=A${r - 1}+1` };
    cells.A1 = { value: '1', computed: 1 };
    const out = recalcSheetCells(cells);
    expect(out.A20000.computed).toBe(20000);
  });
});
