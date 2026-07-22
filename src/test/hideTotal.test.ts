import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '@/state/appStore';
import { computeHideTotalSet } from '@/services/grid/hideTotal';

const s = () => useAppStore.getState();

beforeEach(() => {
  s().resetSchedule();
  s().setItems([]);
});

/** Post met één bewakingspost die hetzelfde bedrag draagt. */
function postMetEnkelKind() {
  const ch = s().addChapter(null);
  const post = s().addItem(ch);
  const bw = s().addBewakingspost(post);
  const regel = s().addRegel(bw);
  s().updateItem(regel, 'quantity', 2);
  s().updateItem(regel, 'normUnitPrice', 100);
  return { ch, post, bw };
}

describe('Totaal-kolom verbergen op containerrijen', () => {
  it('uitgeklapt: verbergen, want het kind toont hetzelfde bedrag eronder', () => {
    const { post } = postMetEnkelKind();
    expect(s().items.find(i => i.id === post)!.total).toBe(200);
    expect(computeHideTotalSet(s().items).has(post)).toBe(true);
  });

  it('INGEKLAPT: niet verbergen — het kind wordt niet getekend', () => {
    // Praktijkgeval: een ingeklapte post van 1.144,00 toonde niets in de
    // Totaal-kolom, terwijl het bedrag wél in het hoofdstuktotaal zat.
    const { post } = postMetEnkelKind();
    s().toggleCollapse(post);
    expect(s().items.find(i => i.id === post)!.isCollapsed).toBe(true);
    expect(computeHideTotalSet(s().items).has(post)).toBe(false);
  });

  it('post met een lege bewakingspost houdt zijn eigen bedrag zichtbaar', () => {
    // "Opstellen V & G plan": 1,00 st x 550 met een lege bewakingspost.
    const ch = s().addChapter(null);
    const post = s().addItem(ch);
    s().updateItem(post, 'quantity', 1);
    s().updateItem(post, 'normUnitPrice', 550);
    s().addBewakingspost(post);
    expect(computeHideTotalSet(s().items).has(post)).toBe(false);
  });

  it('meerdere kinderen: nooit verbergen', () => {
    const { post } = postMetEnkelKind();
    s().addBewakingspost(post);
    expect(computeHideTotalSet(s().items).has(post)).toBe(false);
  });

  it('tekst- en witregels tellen niet als kind mee', () => {
    const { post } = postMetEnkelKind();
    s().addTekstregel(post);
    expect(computeHideTotalSet(s().items).has(post)).toBe(true);
  });
});
