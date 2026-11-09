import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '@/state/appStore';

// knownbugs.md punten 5 en 6 (issue #66 punt 10): de eenheid van een regel
// op 'uur' zetten mag het totaal van een al geprijsde regel niet veranderen,
// en een bewuste norm 0 moet 0 blijven.

const s = () => useAppStore.getState();
const get = (id: string) => s().items.find((i) => i.id === id)!;

function nieuweRegel(): string {
  const ch = s().addChapter(null);
  const post = s().addItem(ch);
  return s().addRegel(post);
}

beforeEach(() => {
  s().resetSchedule();
  s().setItems([]);
});

describe("eenheid naar 'uur'", () => {
  it('punt 5: laat het totaal van een UI-1-regel met norm en prijs ongemoeid', () => {
    const r = nieuweRegel();
    s().updateItem(r, 'quantity', 10);
    s().updateItem(r, 'normQuantity', 0.5);
    s().updateItem(r, 'normUnitPrice', 45);
    expect(get(r).total).toBe(225);

    s().updateItem(r, 'unit', 'uur');
    expect(get(r).unit).toBe('uur');
    expect(get(r).normQuantity).toBe(0.5);
    expect(get(r).total).toBe(225);
  });

  it('punt 6: houdt een bewuste norm 0 op 0', () => {
    const r = nieuweRegel();
    s().updateItem(r, 'quantity', 10);
    s().updateItem(r, 'normQuantity', 0);
    s().updateItem(r, 'normUnitPrice', 50);
    expect(get(r).total).toBe(500);

    s().updateItem(r, 'unit', 'uur');
    expect(get(r).normQuantity).toBe(0);
    expect(get(r).total).toBe(500);
  });

  it('vult op een nieuwe, lege regel nog steeds tariefgroep A, arbeid en norm 1 in', () => {
    const r = nieuweRegel();
    s().updateItem(r, 'quantity', 10);
    s().updateItem(r, 'unit', 'uur');
    const item = get(r);
    expect(item.tariefGroep).toBe('A');
    expect(item.resourceType).toBe('arbeid');
    expect(item.normQuantity).toBe(1);
    const tariefA = s().schedule?.tarieven?.A ?? 64;
    expect(item.total).toBe(10 * tariefA);
  });
});
