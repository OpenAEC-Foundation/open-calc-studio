import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '@/state/appStore';
import { importBc3 } from '@/services/importers/bc3Importer';

// Afrondingsregel in de store (#83): een BC3-begroting houdt zijn afronding
// vast bij bewerkingen en ongedaan maken. Het voorbeeld uit het issue:
// 47,28 per m², 4.431,65 totaal.

const CYPE = String.raw`~V|CYPE INGENIEROS, S.A.|FIEBDC-3/2004|ARQUIMEDES||ANSI|Presupuesto|2|
~C|TEST##||TEST ESTIMATE|4431.65|260113|0|
~D|TEST##|01#\\1\|
~C|01#||CHAPTER|4431.65|260113|0|
~D|01#|P01\\1\|
~C|P01|m2|ITEM WITH DECOMPOSITION|47.28|260113|0|
~D|P01|R01\\0.7\R02\\0.7\R03\\1.05\R04\\1.5\|
~C|R01|h|Oficial 1a|18.35|260113|1|
~C|R02|h|Peon ordinario|17.08|260113|1|
~C|R03|m2|Baldosa|21.21|260113|3|
~C|R04|kg|Cemento cola|0.13|260113|3|
~M|01#\P01|1\1\|93.732|`.replace(/\r?\n/g, '\r\n');

const s = () => useAppStore.getState();
const p01 = () => s().items.find(i => i.code === 'P01')!;
const regels = () => s().items.filter(i => i.parentId === p01().id);
const undo = () => { const r = s().undo(); expect(r).not.toBeNull(); s().setItems(r!); };

/** Laadt het voorbeeld zoals de app een BC3-import laadt: eerst het schedule, dan de items. */
function loadBc3(withRule: boolean) {
  const res = importBc3(CYPE);
  s().resetSchedule();
  s().setSchedule({ ...res.schedule, ...(withRule ? {} : { priceRounding: null }) });
  s().setItems(res.items);
  useAppStore.setState({ undoStack: [], redoStack: [] } as any);
}

describe('afrondingsregel in de store (#83)', () => {
  beforeEach(() => loadBc3(true));

  it('een BC3-import rekent met de regel uit het bestand', () => {
    expect(s().schedule.priceRounding).toEqual({ line: 2, unitPrice: 2, total: 2 });
    expect(p01().unitPrice).toBe(47.28);
    expect(p01().total).toBe(4431.65);
  });

  it('een prijswijziging op een regel houdt de afronding vast', () => {
    // 1,5 × 0,14 = 0,21 → 47,29 per m².
    const r04 = s().items.find(i => i.code === 'R04')!;
    s().updateItem(r04.id, 'normUnitPrice', 0.14);
    expect(p01().unitPrice).toBe(47.29);
    expect(p01().total).toBe(4432.59);
  });

  it('ongedaan maken herstelt de afgeronde bedragen', () => {
    const r04 = s().items.find(i => i.code === 'R04')!;
    // Zoals de grid doet: eerst de undo-stap vastleggen, dan bewerken.
    s().pushHistory(s().items, 'edit');
    s().updateItem(r04.id, 'normUnitPrice', 0.14);
    expect(p01().total).toBe(4432.59);
    undo();
    expect(p01().total).toBe(4431.65);
  });

  // Het aantal van een post mét regels voedt in Open Calc Studio alleen de
  // afgeleide eenheidsprijs (totaal ÷ aantal); elke regel heeft een eigen
  // Aantal. De BC3-import zet het aantal van de post op elke regel, maar dat
  // is een kopie: het aantal van de post wijzigen schaalt de regels niet mee
  // (in CYPE/Presto wél: daar is de ontleding per eenheid, 100 × 47,28 =
  // 4.728). Dat modelverschil bestond al; de afronding rekent per eenheid van
  // het nieuwe aantal.
  it('het aantal van een post wijzigen schaalt de regels niet mee, met en zonder afronding', () => {
    s().updateItem(p01().id, 'quantity', 100);
    expect(regels().map(r => r.quantity)).toEqual([93.732, 93.732, 93.732, 93.732]);
    // Met regel: 12,04 + 11,21 + 20,87 + 0,18 = 44,30 per m² → 4.430,00.
    expect(p01().unitPrice).toBe(44.3);
    expect(p01().total).toBe(4430);
    expect(regels().reduce((t, r) => t + r.total, 0)).toBeCloseTo(4430, 9);
    // Zonder regel: het totaal blijft, de eenheidsprijs zakt.
    loadBc3(false);
    s().updateItem(p01().id, 'quantity', 100);
    expect(p01().total).toBeCloseTo(4430.383578, 6);
    expect(p01().unitPrice).toBeCloseTo(44.30383578, 8);
  });
});
