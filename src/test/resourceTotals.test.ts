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

  it('sluitingscontrole over alle postvormen door elkaar heen', () => {
    // Permanente tegenhanger van de archief-sweep: elke combinatie van
    // postvormen die in de praktijk voorkomt, in één hoofdstuk. De som van
    // de kostensoort-kolommen moet exact het hoofdstuktotaal zijn — dat is
    // de invariant die de Subtotaal- en Totaal-footer aan elkaar bindt.
    const ch = s().addChapter(null);

    // a) post met eigen prijs + lege bewakingspost
    const a = s().addItem(ch);
    s().updateItem(a, 'quantity', 1);
    s().updateItem(a, 'normUnitPrice', 550);
    s().addBewakingspost(a);

    // b) post met geïmporteerde materiaalprijs
    const b = s().addItem(ch);
    s().updateItem(b, 'quantity', 81);
    s().updateItem(b, 'materialPrice', 15.319024);

    // c) post met een norm-regel (UI-1-model)
    const c = s().addItem(ch);
    const cbw = s().addBewakingspost(c);
    const cr = s().addRegel(cbw);
    s().updateItem(cr, 'quantity', 1);
    s().updateItem(cr, 'normQuantity', 8);
    s().updateItem(cr, 'normUnitPrice', 71.5);

    // d) post met een loonregel (WpCalc-model)
    const d = s().addItem(ch);
    const dbw = s().addBewakingspost(d);
    const dr = s().addRegel(dbw);
    s().updateItem(dr, 'quantity', 3);
    s().updateItem(dr, 'laborPrice', 40);
    s().updateItem(dr, 'normUnitPrice', 10);

    // e) onderaannemer- en materieelregels
    const e = s().addItem(ch);
    const ebw = s().addBewakingspost(e);
    const oa = s().addRegel(ebw);
    s().updateItem(oa, 'quantity', 1);
    s().updateItem(oa, 'normUnitPrice', 2500);
    s().updateItem(oa, 'resourceType', 'onderaannemer');
    const mr = s().addRegel(ebw);
    s().updateItem(mr, 'quantity', 2);
    s().updateItem(mr, 'normUnitPrice', 125);
    s().updateItem(mr, 'resourceType', 'materieel');

    // f) post zonder geld (alleen een tekstregel) mag niets toevoegen
    const f = s().addItem(ch);
    s().addTekstregel(f);

    const hoofdstuk = s().items.find(i => i.id === ch)!;
    const kolommen = somKolommen(computeResourceTotals(s().items).get(ch));
    expect(hoofdstuk.total).toBeGreaterThan(0);
    expect(kolommen).toBeCloseTo(hoofdstuk.total, 2);
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
