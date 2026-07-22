import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '@/state/appStore';
import { getColumnsForView } from '@/components/grid/gridConstants';
import { summarizeCellSelection, getGridCellNumber } from '@/services/grid/cellValue';

const s = () => useAppStore.getState();
const colIdx = (key: string) => getColumnsForView('wpcalc', false).findIndex((c) => c.key === key);

beforeEach(() => {
  s().resetSchedule();
  s().setItems([]);
  s().setGridView('wpcalc');
});

/** Hoofdstuk met drie posten van 100 / 200 / 300. */
function bouwDriePosten() {
  const ch = s().addChapter(null);
  const ids = [100, 200, 300].map((bedrag) => {
    const p = s().addItem(ch);
    s().updateItem(p, 'quantity', 1);
    s().updateItem(p, 'normUnitPrice', bedrag);
    return p;
  });
  return { ch, posten: ids };
}

describe('som van een celselectie (statusbalk)', () => {
  it('telt de Totaal-kolom over meerdere rijen op', () => {
    const { posten } = bouwDriePosten();
    const rows = s().getGridRows();
    const columns = getColumnsForView('wpcalc', false);
    const c = colIdx('total');
    const r1 = rows.findIndex((r) => r.id === posten[0]);
    const r3 = rows.findIndex((r) => r.id === posten[2]);

    const sum = summarizeCellSelection(rows, columns, { row: r1, col: c }, { row: r3, col: c });
    expect(sum.count).toBe(3);
    expect(sum.sum).toBe(600);
    expect(sum.min).toBe(100);
    expect(sum.max).toBe(300);
    expect(sum.currency).toBe(true);
  });

  it('slaat de hoofdstuk-footerrij over (anders telt het subtotaal dubbel)', () => {
    const { ch, posten } = bouwDriePosten();
    const rows = s().getGridRows();
    const columns = getColumnsForView('wpcalc', false);
    const c = colIdx('total');
    // Selecteer het hele blok inclusief hoofdstukrij én footerrij
    const sum = summarizeCellSelection(rows, columns, { row: 0, col: c }, { row: rows.length - 1, col: c });
    // hoofdstuk (600) + 3 posten (600) = 1200; de footer telt NIET mee
    expect(sum.sum).toBe(1200);
    expect(rows.some((r) => r.id === `footer:${ch}`)).toBe(true);
    expect(posten).toHaveLength(3);
  });

  it('telt lege en tekstcellen niet mee', () => {
    const { ch } = bouwDriePosten();
    s().addTekstregel(ch);
    const rows = s().getGridRows();
    const columns = getColumnsForView('wpcalc', false);
    // Omschrijving-kolom bevat tekst → geen enkele numerieke cel
    const c = colIdx('description');
    const sum = summarizeCellSelection(rows, columns, { row: 0, col: c }, { row: rows.length - 1, col: c });
    expect(sum.count).toBe(0);
    expect(sum.sum).toBe(0);
  });

  it('een gemengde selectie (aantal + bedrag) wordt niet als valuta opgemaakt', () => {
    const { posten } = bouwDriePosten();
    const rows = s().getGridRows();
    const columns = getColumnsForView('wpcalc', false);
    const r1 = rows.findIndex((r) => r.id === posten[0]);
    const r3 = rows.findIndex((r) => r.id === posten[2]);
    const sum = summarizeCellSelection(
      rows, columns,
      { row: r1, col: colIdx('quantity') },
      { row: r3, col: colIdx('normUnitPrice') }
    );
    // 3× aantal 1 + 3× prijs (100/200/300)
    expect(sum.sum).toBe(603);
    expect(sum.currency).toBe(false);
  });
});

describe('getGridCellNumber spiegelt de celweergave', () => {
  it('Prijs op een post telt de gepinde materiaalprijs mee', () => {
    const ch = s().addChapter(null);
    const post = s().addItem(ch);
    s().updateItem(post, 'quantity', 81);
    s().updateItem(post, 'materialPrice', 15.319024);
    const item = s().items.find((i) => i.id === post)!;
    expect(getGridCellNumber(item, 'normUnitPrice')).toBeCloseTo(15.319024, 6);
  });

  it('Totaal is leeg op een rekenregel, dus telt niet mee', () => {
    const ch = s().addChapter(null);
    const post = s().addItem(ch);
    const bw = s().addBewakingspost(post);
    const regel = s().addRegel(bw);
    s().updateItem(regel, 'quantity', 2);
    s().updateItem(regel, 'normUnitPrice', 50);
    const item = s().items.find((i) => i.id === regel)!;
    expect(getGridCellNumber(item, 'total')).toBeNull();
  });
});
