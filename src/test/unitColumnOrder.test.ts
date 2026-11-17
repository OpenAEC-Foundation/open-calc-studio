import { beforeEach, describe, expect, it } from 'vitest';
import { getColumnWidth, getColumnsForView } from '@/components/grid/gridConstants';
import { useAppStore } from '@/state/appStore';

const keys = (view: Parameters<typeof getColumnsForView>[0], branches = false) =>
  getColumnsForView(view, branches).map(c => c.key);

// Issue #97: de eenheid hoort direct naast het aantal, in elke weergave.
describe('kolom Eenheid naast Aantal', () => {
  it('UI-1: Aantal | Eenheid | Prod. norm | Prod. cap. | Hoeveelheid | Verr.', () => {
    const k = keys('st');
    const i = k.indexOf('quantity');
    expect(k.slice(i, i + 6)).toEqual(['quantity', 'unit', 'productienorm', 'productiecapaciteit', 'hoeveelheid', 'verrekenbaar']);
    expect(k.slice(0, i)).toEqual(['sortIndex', 'rowType', 'rowNumber', 'code', 'description']);
  });

  it('Simple en UI-2: Eenheid direct na Aantal (ongewijzigd)', () => {
    for (const view of ['simple', 'wpcalc'] as const) {
      const k = keys(view);
      expect(k[k.indexOf('quantity') + 1]).toBe('unit');
    }
  });

  it('Inschrijfstaat: Eenheid direct na Hoeveelheid (ongewijzigd)', () => {
    const k = keys('inschrijfstaat');
    expect(k[k.indexOf('hoeveelheid') + 1]).toBe('unit');
  });
});

describe('kolombreedtes per kolomsleutel, niet per index', () => {
  const width = (view: Parameters<typeof getColumnsForView>[0], key: string, branches = false) => {
    const col = getColumnsForView(view, branches).find(c => c.key === key)!;
    return getColumnWidth(useAppStore.getState().columnWidths, view, col);
  };
  const resize = (view: Parameters<typeof getColumnsForView>[0], key: string, w: number) => {
    useAppStore.setState({ gridView: view });
    const col = getColumnsForView(view).find(c => c.key === key)!;
    useAppStore.getState().setColumnWidth(col, w);
  };

  beforeEach(() => useAppStore.setState({ columnWidths: {}, gridView: 'st' }));

  it('zonder versleepte breedte gelden de standaardbreedtes van elke weergave', () => {
    expect(width('st', 'unit')).toBe(55);
    expect(width('st', 'description')).toBe(380);
    // Simple deelde vroeger de index-array van UI-1: daar kreeg de
    // omschrijving (index 2) de breedte van Nr.
    expect(width('simple', 'description')).toBe(450);
  });

  it('een versleepte breedte blijft bij dezelfde kolom, ook met de vertakkingskolom ervoor', () => {
    resize('st', 'unit', 70);
    expect(width('st', 'unit')).toBe(70);
    expect(width('st', 'unit', true)).toBe(70);
    expect(width('st', 'productienorm')).toBe(80);
    expect(width('st', 'hoeveelheid')).toBe(90);
  });

  it('breedtes zijn per weergave', () => {
    resize('st', 'description', 500);
    expect(width('simple', 'description')).toBe(450);
    expect(width('wpcalc', 'description')).toBe(240);
    resize('simple', 'description', 300);
    expect(width('st', 'description')).toBe(500);
    expect(width('simple', 'description')).toBe(300);
  });

  it('nooit smaller dan de minimale breedte', () => {
    resize('st', 'unit', 10);
    expect(width('st', 'unit')).toBe(45);
  });
});
