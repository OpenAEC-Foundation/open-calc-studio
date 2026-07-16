import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '@/state/appStore';
import { isCellEditable } from '@/components/grid/gridConstants';

describe('aantal bewerkbaar op posten', () => {
  it('quantity is bewerkbaar op regel, begrotingspost én bewakingspost', () => {
    expect(isCellEditable('quantity', 'regel')).toBe(true);
    expect(isCellEditable('quantity', 'begrotingspost')).toBe(true);
    expect(isCellEditable('quantity', 'bewakingspost')).toBe(true);
    expect(isCellEditable('quantity', 'chapter')).toBe(false);
    expect(isCellEditable('quantity', 'tekstregel')).toBe(false);
  });
});

describe('toggleAllBewakingspostenCollapsed', () => {
  beforeEach(() => {
    const s = useAppStore.getState();
    s.resetSchedule();
    s.setItems([]);
  });

  const s = () => useAppStore.getState();

  it('klapt alle bewakingsposten in en daarna weer uit', () => {
    const ch = s().addChapter(null);
    const p1 = s().addItem(ch);
    const p2 = s().addItem(ch);
    const b1 = s().addBewakingspost(p1);
    const b2 = s().addBewakingspost(p2);
    s().addRegel(b1);
    s().addRegel(b2);

    // Eén handmatig ingeklapt: de knop klapt de rest ook in (alles dicht)
    s().toggleCollapse(b1);
    const dicht = s().toggleAllBewakingspostenCollapsed();
    expect(dicht).toBe(true);
    expect(s().items.filter((i) => i.rowType === 'bewakingspost').every((i) => i.isCollapsed)).toBe(true);
    // Regels onder ingeklapte bewakingsposten zijn niet meer zichtbaar
    const zichtbaar = s().getVisibleItems();
    expect(zichtbaar.some((i) => i.rowType === 'regel')).toBe(false);

    // Tweede klik: alles weer open
    const open = s().toggleAllBewakingspostenCollapsed();
    expect(open).toBe(false);
    expect(s().items.filter((i) => i.rowType === 'bewakingspost').every((i) => !i.isCollapsed)).toBe(true);
    expect(s().getVisibleItems().some((i) => i.rowType === 'regel')).toBe(true);

    // Hoofdstukken/posten blijven onaangeroerd
    expect(s().items.find((i) => i.id === ch)?.isCollapsed).toBe(false);
    expect(s().items.find((i) => i.id === p1)?.isCollapsed).toBe(false);
  });
});
