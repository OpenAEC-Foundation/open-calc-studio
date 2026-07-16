import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '@/state/appStore';

const s = () => useAppStore.getState();

function bouwBegroting() {
  const ch = s().addChapter(null); // hoofdstuk
  const sub = s().addChapter(ch); // paragraaf (sub-hoofdstuk)
  const post = s().addItem(sub);
  const bw = s().addBewakingspost(post);
  const regel = s().addRegel(bw);
  s().updateItem(regel, 'quantity', 10);
  s().updateItem(regel, 'normUnitPrice', 50);
  const regel2 = s().addRegel(post);
  s().updateItem(regel2, 'quantity', 2);
  s().updateItem(regel2, 'laborPrice', 60);
  return { ch, sub, post, bw, regel, regel2 };
}

beforeEach(() => {
  s().resetSchedule();
  s().setItems([]);
});

describe('collapseToLevel', () => {
  it('klapt in tot het gekozen niveau en normaliseert de rest open', () => {
    const { ch, sub, post, bw } = bouwBegroting();
    const get = (id: string) => s().items.find((i) => i.id === id)!;

    s().collapseToLevel('bewakingspost');
    expect(get(bw).isCollapsed).toBe(true);
    expect(get(post).isCollapsed).toBe(false);
    expect(get(sub).isCollapsed).toBe(false);

    s().collapseToLevel('begrotingspost');
    expect(get(post).isCollapsed).toBe(true);
    expect(get(sub).isCollapsed).toBe(false);

    s().collapseToLevel('paragraaf');
    expect(get(sub).isCollapsed).toBe(true);
    expect(get(ch).isCollapsed).toBe(false);
    expect(get(post).isCollapsed).toBe(false);

    s().collapseToLevel('hoofdstuk');
    expect(get(ch).isCollapsed).toBe(true);
    // Alleen het top-hoofdstuk zichtbaar
    expect(s().getVisibleItems().filter((i) => !i.rowType.startsWith('staart_')).map((i) => i.id)).toEqual([ch]);

    s().collapseToLevel('alles');
    expect(s().items.every((i) => !i.isCollapsed)).toBe(true);
  });
});

describe('scaleAllPrices', () => {
  it('schaalt prijs/middel en uurloon met de factor; totalen volgen exact', () => {
    const { regel, regel2 } = bouwBegroting();
    const before = s().items.find((i) => i.id === regel)!.total; // 10 × 50 = 500
    const before2 = s().items.find((i) => i.id === regel2)!.total; // 2 × 60 = 120
    expect(Math.round(before)).toBe(500);
    expect(Math.round(before2)).toBe(120);

    s().scaleAllPrices(1.1);
    const na = s().items.find((i) => i.id === regel)!;
    const na2 = s().items.find((i) => i.id === regel2)!;
    expect(na.normUnitPrice).toBeCloseTo(55, 10);
    expect(na.total).toBeCloseTo(550, 8);
    expect(na2.laborPrice).toBeCloseTo(66, 10);
    expect(na2.total).toBeCloseTo(132, 8);
  });

  it('staart-percentages blijven ongemoeid; ongeldige factor doet niets', () => {
    bouwBegroting();
    const staartVoor = s().items.filter((i) => i.rowType.startsWith('staart_')).map((i) => i.staartPercentage);
    s().scaleAllPrices(1.25);
    const staartNa = s().items.filter((i) => i.rowType.startsWith('staart_')).map((i) => i.staartPercentage);
    expect(staartNa).toEqual(staartVoor);

    const totalen = s().items.map((i) => i.total);
    s().scaleAllPrices(0); // ongeldig
    s().scaleAllPrices(NaN); // ongeldig
    expect(s().items.map((i) => i.total)).toEqual(totalen);
  });
});
