import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '@/state/appStore';
import { getColumnsForView } from '@/components/grid/gridConstants';
import { parseNumericInput } from '@/utils/numericInput';

const s = () => useAppStore.getState();

/** Spiegelt de afronding uit useGridEditing (currency = max 2 decimalen). */
function commitWaarde(colKey: string, invoer: string): number | null {
  const col = getColumnsForView('wpcalc', false).find(c => c.key === colKey)!;
  const ruw = parseNumericInput(invoer);
  if (ruw === null) return null;
  return col.type === 'currency' ? Math.round(ruw * 100) / 100 : ruw;
}

beforeEach(() => {
  s().resetSchedule();
  s().setItems([]);
});

describe('bedragen krijgen hoogstens twee decimalen', () => {
  it('de Prijs-kolom is een bedrag', () => {
    const col = getColumnsForView('wpcalc', false).find(c => c.key === 'normUnitPrice')!;
    expect(col.type).toBe('currency');
  });

  it('rondt getypte invoer af', () => {
    expect(commitWaarde('normUnitPrice', '15,319024')).toBe(15.32);
    expect(commitWaarde('normUnitPrice', '12,345')).toBe(12.35);
    expect(commitWaarde('normUnitPrice', '99,999')).toBe(100);
  });

  it('rondt ook het resultaat van een formule af', () => {
    expect(commitWaarde('normUnitPrice', '=10/3')).toBe(3.33);
    expect(commitWaarde('normUnitPrice', '=12,2*2,22')).toBe(27.08);
  });

  it('laat een bedrag met twee of minder decimalen ongemoeid', () => {
    expect(commitWaarde('normUnitPrice', '550')).toBe(550);
    expect(commitWaarde('normUnitPrice', '71,5')).toBe(71.5);
    expect(commitWaarde('normUnitPrice', '1.240,84')).toBe(1240.84);
  });

  it('aantallen en normen houden hun precisie', () => {
    // Een productienorm van 0,125 uur/eenheid mag niet naar 0,13 verspringen.
    expect(commitWaarde('productienorm', '0,125')).toBe(0.125);
    expect(commitWaarde('quantity', '36,455')).toBe(36.455);
  });

  it('een afgeronde prijs rekent netjes door', () => {
    const ch = s().addChapter(null);
    const post = s().addItem(ch);
    s().updateItem(post, 'quantity', 81);
    s().updateItem(post, 'normUnitPrice', commitWaarde('normUnitPrice', '15,319024'));
    expect(s().items.find(i => i.id === post)!.total).toBeCloseTo(81 * 15.32, 2);
  });
});
