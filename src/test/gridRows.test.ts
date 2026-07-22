import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '@/state/appStore';
import { isFooterRow } from '@/services/grid/gridRows';

const s = () => useAppStore.getState();

/** Twee hoofdstukken met elk een begrotingspost; geeft ids terug. */
function bouwTweeHoofdstukken() {
  const ch1 = s().addChapter(null);
  s().updateItem(ch1, 'description', 'HOOFDSTUK EEN');
  const post1 = s().addItem(ch1);
  s().updateItem(post1, 'description', 'Post 1.1');
  const ch2 = s().addChapter(null);
  s().updateItem(ch2, 'description', 'HOOFDSTUK TWEE');
  const post2 = s().addItem(ch2);
  s().updateItem(post2, 'description', 'Post 2.1');
  return { ch1, post1, ch2, post2 };
}

beforeEach(() => {
  s().resetSchedule();
  s().setItems([]);
  s().setGridView('wpcalc');
});

describe('getGridRows — de canonieke grid-rijenlijst', () => {
  it('bevat in wpcalc-weergave een footerrij na elk top-hoofdstukblok', () => {
    const { ch1, ch2 } = bouwTweeHoofdstukken();
    const rows = s().getGridRows();
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(`footer:${ch1}`);
    expect(ids).toContain(`footer:${ch2}`);
    // Footer van hoofdstuk 1 staat direct vóór hoofdstuk 2
    expect(ids.indexOf(`footer:${ch1}`)).toBe(ids.indexOf(ch2) - 1);
  });

  it('bevat géén footers buiten de wpcalc-weergave', () => {
    bouwTweeHoofdstukken();
    s().setGridView('st');
    expect(s().getGridRows().some((r) => isFooterRow(r.id))).toBe(false);
  });

  it('grid-index ≠ getVisibleItems-index voorbij een footer (de oude bug)', () => {
    const { post2 } = bouwTweeHoofdstukken();
    const gridIdx = s().getGridRows().findIndex((r) => r.id === post2);
    const visIdx = s().getVisibleItems().findIndex((r) => r.id === post2);
    // De footer van hoofdstuk 1 schuift alles in blok 2 één plek op
    expect(gridIdx).toBe(visIdx + 1);
    // Het oude patroon getVisibleItems()[gridIdx] wees dus een ANDER item aan
    expect(s().getVisibleItems()[gridIdx]?.id).not.toBe(post2);
  });
});

describe('activeItemId volgt de geselecteerde grid-rij', () => {
  it('setActiveCell zonder id resolvet het item uit de grid-rijenlijst', () => {
    const { post2 } = bouwTweeHoofdstukken();
    const gridIdx = s().getGridRows().findIndex((r) => r.id === post2);
    s().setActiveCell(gridIdx, 1);
    expect(s().activeItemId).toBe(post2);
  });

  it('setActiveCellExtend werkt activeItemId bij naar de nieuwe rij', () => {
    const { post1, post2 } = bouwTweeHoofdstukken();
    const rows = s().getGridRows();
    s().setActiveCell(rows.findIndex((r) => r.id === post1), 1);
    const idx2 = rows.findIndex((r) => r.id === post2);
    s().setActiveCellExtend(idx2, 1);
    expect(s().activeItemId).toBe(post2);
  });

  it('rij-selectie voorbij een footer wijst de geselecteerde items aan (Ctrl+C/Delete-pad)', () => {
    const { post2 } = bouwTweeHoofdstukken();
    const gridIdx = s().getGridRows().findIndex((r) => r.id === post2);
    s().setActiveCell(gridIdx, 1);
    // Het gefixte patroon: selectie-indices vertalen via getGridRows
    const rows = s().getGridRows();
    const geselecteerd = s().getSelectedRowIndices()
      .map((i) => rows[i])
      .filter((it) => it && !isFooterRow(it.id));
    expect(geselecteerd.map((i) => i.id)).toEqual([post2]);
    // Het oude patroon (getVisibleItems + grid-index) wees een ánder item aan
    const oud = s().getSelectedRowIndices().map((i) => s().getVisibleItems()[i]);
    expect(oud[0]?.id).not.toBe(post2);
  });

  it('plakken voorbij een footer gebruikt het geselecteerde item als anker', () => {
    const { post1, post2 } = bouwTweeHoofdstukken();
    s().copyItems([s().items.find((i) => i.id === post1)!]);
    const gridIdx = s().getGridRows().findIndex((r) => r.id === post2);
    s().setActiveCell(gridIdx, 1);
    expect(s().activeItemId).toBe(post2); // anker klopt vóór de plak
    s().pasteItems();
    const klonen = s().items.filter(
      (i) => i.description === 'Post 1.1' && i.id !== post1
    );
    expect(klonen).toHaveLength(1);
  });
});
