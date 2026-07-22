import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '@/state/appStore';
import { computeResourceTotals } from '@/services/grid/resourceTotals';

const s = () => useAppStore.getState();
const somKolommen = (t?: Record<string, number>) =>
  !t ? 0 : t.arbeidTotal + t.materiaalTotal + t.materieelTotal + t.stelpostTotal + t.onderaannemingTotal;

beforeEach(() => {
  s().resetSchedule();
  s().setItems([]);
});

/** De kostensoort-kolommen moeten optellen tot het bedrag van het hoofdstuk —
 *  anders wijkt de Subtotaal-footer af van de Totaal-footer. */
describe('kostensoort-kolommen sluiten aan op het totaal', () => {
  it('rekenregel met productienorm: uren tellen mee (8 uur à 71,50 = 572)', () => {
    const ch = s().addChapter(null);
    const post = s().addItem(ch);
    const bw = s().addBewakingspost(post);
    const regel = s().addRegel(bw);
    s().updateItem(regel, 'quantity', 1);
    s().updateItem(regel, 'normQuantity', 8);
    s().updateItem(regel, 'normUnitPrice', 71.5);

    const r = s().items.find(i => i.id === regel)!;
    expect(r.total).toBeCloseTo(572, 2);

    const map = computeResourceTotals(s().items);
    // Zonder de norm zou hier 71,50 staan i.p.v. 572,00
    expect(somKolommen(map.get(regel))).toBeCloseTo(572, 2);
    expect(somKolommen(map.get(ch))).toBeCloseTo(s().items.find(i => i.id === ch)!.total, 2);
  });

  it('post met eigen prijs en lege bewakingspost: het bedrag verdwijnt niet uit de kolommen', () => {
    // Praktijkgeval "Opstellen V & G plan": 1,00 st × 550 met een lege
    // bewakingspost eronder — telde wel in Totaal, in geen enkele kolom.
    const ch = s().addChapter(null);
    const post = s().addItem(ch);
    s().updateItem(post, 'quantity', 1);
    s().updateItem(post, 'normUnitPrice', 550);
    s().addBewakingspost(post);

    const map = computeResourceTotals(s().items);
    expect(somKolommen(map.get(post))).toBeCloseTo(550, 2);
    expect(somKolommen(map.get(ch))).toBeCloseTo(550, 2);
    expect(map.get(post)!.materiaalTotal).toBeCloseTo(550, 2);
  });

  it('post met een geïmporteerde materiaalprijs telt ook mee', () => {
    // Praktijkgeval 2.02.02: 81 m³ × 15,319024 gepind in materialPrice
    const ch = s().addChapter(null);
    const post = s().addItem(ch);
    s().updateItem(post, 'quantity', 81);
    s().updateItem(post, 'materialPrice', 15.319024);
    s().addBewakingspost(post);

    const map = computeResourceTotals(s().items);
    expect(somKolommen(map.get(post))).toBeCloseTo(1240.84, 2);
  });

  it('zodra de kinderen rekenen, telt de eigen prijs NIET dubbel mee', () => {
    const ch = s().addChapter(null);
    const post = s().addItem(ch);
    s().updateItem(post, 'quantity', 1);
    s().updateItem(post, 'normUnitPrice', 550);
    const bw = s().addBewakingspost(post);
    const regel = s().addRegel(bw);
    s().updateItem(regel, 'quantity', 2);
    s().updateItem(regel, 'normUnitPrice', 100);

    const map = computeResourceTotals(s().items);
    expect(somKolommen(map.get(post))).toBeCloseTo(200, 2);
    expect(s().items.find(i => i.id === post)!.total).toBeCloseTo(200, 2);
  });

  it('loonregel (WpCalc-model) blijft ongewijzigd: aantal × loon', () => {
    const ch = s().addChapter(null);
    const post = s().addItem(ch);
    const bw = s().addBewakingspost(post);
    const regel = s().addRegel(bw);
    s().updateItem(regel, 'quantity', 3);
    s().updateItem(regel, 'laborPrice', 40);
    s().updateItem(regel, 'normUnitPrice', 10);

    const map = computeResourceTotals(s().items);
    const t = map.get(regel)!;
    expect(t.arbeidTotal).toBeCloseTo(120, 2);
    expect(t.materiaalTotal).toBeCloseTo(30, 2);
    expect(somKolommen(t)).toBeCloseTo(s().items.find(i => i.id === regel)!.total, 2);
  });
});
