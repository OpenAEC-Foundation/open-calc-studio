import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getStaartBreakdown, recalculateItems } from '@/services/calculation/calculator';
import { classifyWpCalcStaartLabel, importWpCalcFile, wpcalcCurrency } from '@/services/importers/wpcalcImporter';

// Knownbug 88: de klassieke WpCalc-staart (UKK/AK/W&R) kwam op verzonnen
// percentages binnen. En (voormalig issue #75): de valuta uit het bestand.
// WpCalc-bestanden zijn Access-databases; de test levert de tabellen via een nep-MDBReader.
const mdb = vi.hoisted(() => ({ tables: {} as Record<string, Record<string, unknown>[]> }));
vi.mock('mdb-reader', () => ({
  default: class {
    getTableNames() { return Object.keys(mdb.tables); }
    getTable(name: string) { return { getData: () => mdb.tables[name] ?? [] }; }
  },
}));

const dataRows = [
  { recnr: 1, docnr: 1, groep: 1, paragraaf: 0, volgnr: 0, tabs: 0, rectype: 8, omschrijving: 'Grondwerk' },
  { recnr: 2, docnr: 1, groep: 1, paragraaf: 0, volgnr: 1, tabs: 1, rectype: 0, omschrijving: 'Ontgraven',
    eenheid: 'st', aantal: 1, prijs: 1000, kosteneh: 1000 },
];

/**
 * Staart zoals `wpcalc_export.rs` (rond regel 345-420) hem schrijft voor een
 * begroting met de klassieke staart: kopregel, de staartregels in de volgorde
 * van de mapping (btw en afronding vóór de klassieke regels), dan de
 * totaalregels. Percentage als fractie (p / 100), 0 bij geen percentage.
 */
function exportedStaart(pcts: { ukk: number; ak: number; wr: number; btw: number }) {
  const rows: [string, number, number][] = [
    ['Totaal kolommen:', 0, 32],
    ['Btw hoog:', pcts.btw / 100, 64],
    ['Afronding', 0, 128],
    ['Uitvoeringskosten:', pcts.ukk / 100, 1],
    ['Algemene kosten:', pcts.ak / 100, 2],
    ['Winst & risico:', pcts.wr / 100, 2],
    ['Totaal kostprijs:', 0, 4],
    ['Totaal excl. btw.:', 0, 4],
    ['Totaalprijs incl. btw.:', 0, 4],
  ];
  return rows.map(([omschrijving, percentage, itemtype], i) => ({
    volgnr: i + 1, itemtype, omschrijving, percentage,
    loon: 0, materiaal: 0, materieel: 0, stelpost: 0, onderaanneming: 0, bedrag: 0, subtotaal: 0, totaal: 0,
  }));
}

const staartOf = (items: { rowType: string; staartPercentage: number | null }[]) =>
  Object.fromEntries(items.filter(i => i.rowType.startsWith('staart_')).map(i => [i.rowType, i.staartPercentage]));

describe('knownbug 88: WpCalc-import van de klassieke staart', () => {
  beforeEach(() => { mdb.tables = {}; });

  it('round-trip: de labels van onze eigen export komen terug met dezelfde percentages', () => {
    mdb.tables = { data: dataRows, staart: exportedStaart({ ukk: 6, ak: 8, wr: 5, btw: 21 }) };
    const { schedule, items } = importWpCalcFile(new ArrayBuffer(8));

    expect(staartOf(items)).toEqual({
      staart_ukk: 6,
      staart_ak: 8,
      staart_wr: 5,
      staart_btw_laag: 9, // zoals bij het openen van een bestand; zonder grondslag € 0
      staart_btw: 21,
      staart_afronding: null,
    });
    // Geen verzonnen regels meer en W&R telt niet dubbel.
    for (const rt of ['staart_abk', 'staart_ak_oa', 'staart_garanties', 'staart_wvpm', 'staart_verzekering', 'staart_risico', 'staart_winst']) {
      expect(items.some(i => i.rowType === rt)).toBe(false);
    }
    expect(schedule.uitvoeringskosten).toBe(6);
    expect(schedule.algemeneKosten).toBe(8);
    expect(schedule.winstRisico).toBe(5);

    // Klassieke cascade: 1000 + 6 % = 1060, + 8 % = 1144,80, + 5 % = 1202,04.
    const bd = getStaartBreakdown(recalculateItems(items));
    expect(bd.ukkAmount).toBeCloseTo(60, 6);
    expect(bd.akAmount).toBeCloseTo(84.8, 6);
    expect(bd.wrAmount).toBeCloseTo(57.24, 6);
    expect(bd.abkAmount + bd.akOaAmount + bd.garantiesAmount + bd.wvpmAmount + bd.verzekeringAmount).toBe(0);
  });

  it('Bouw 1-labels: alleen de regels uit het bestand, "Algemene kosten over onderaanneming" is geen AK', () => {
    mdb.tables = {
      data: dataRows,
      staart: [
        { volgnr: 1, itemtype: 1, omschrijving: 'Algemene kosten over onderaanneming:', percentage: 0.07 },
        { volgnr: 2, itemtype: 1, omschrijving: 'Algemene bedrijfskosten:', percentage: 0.05 },
        { volgnr: 3, itemtype: 2, omschrijving: 'Risico:', percentage: 0.02 },
        { volgnr: 4, itemtype: 2, omschrijving: 'Winst:', percentage: 0.04 },
        { volgnr: 5, itemtype: 4, omschrijving: 'Totaal excl. btw.:', percentage: 0 },
      ],
    };
    const { schedule, items } = importWpCalcFile(new ArrayBuffer(8));
    expect(staartOf(items)).toEqual({
      staart_ak_oa: 7,
      staart_abk: 5,
      staart_risico: 2,
      staart_winst: 4,
      staart_afronding: null,
    });
    expect(schedule.algemeneKosten).toBe(5);
    expect(schedule.winstRisico).toBe(6);
  });

  it('een bestand zonder staarttabel krijgt de standaardstaart van een nieuwe begroting', () => {
    mdb.tables = { data: dataRows };
    const { items } = importWpCalcFile(new ArrayBuffer(8));
    expect(staartOf(items)).toEqual({
      staart_ak_oa: 9, staart_abk: 6, staart_garanties: 2, staart_wvpm: 2, staart_risico: 3,
      staart_winst: 5, staart_verzekering: 0.5, staart_btw_laag: 9, staart_btw: 21, staart_afronding: null,
    });
  });

  it('herkent de labels', () => {
    expect(classifyWpCalcStaartLabel('Uitvoeringskosten:')).toBe('ukk');
    expect(classifyWpCalcStaartLabel('Algemene kosten:')).toBe('ak');
    expect(classifyWpCalcStaartLabel('Winst & risico:')).toBe('wr');
    expect(classifyWpCalcStaartLabel('Winst en risico')).toBe('wr');
    expect(classifyWpCalcStaartLabel('W&R')).toBe('wr');
    expect(classifyWpCalcStaartLabel('Algemene kosten over onderaanneming:')).toBe('ak_oa');
    expect(classifyWpCalcStaartLabel('Btw laag:')).toBe('btw_laag');
    expect(classifyWpCalcStaartLabel('Btw hoog:')).toBe('btw');
    expect(classifyWpCalcStaartLabel('Totaal excl. btw.:')).toBeNull();
    expect(classifyWpCalcStaartLabel('Totaal kolommen:')).toBeNull();
    expect(classifyWpCalcStaartLabel('')).toBeNull();
  });
});

describe('WpCalc-import: valuta uit calculaties.valuta (voormalig issue #75)', () => {
  beforeEach(() => { mdb.tables = {}; });

  it('neemt de valuta uit het bestand over, zonder bedragen om te rekenen', () => {
    mdb.tables = { calculaties: [{ docnr: 1, calculatietitel: 'Test', valuta: 'usd', koers: 1.1 }], data: dataRows };
    const { schedule, items } = importWpCalcFile(new ArrayBuffer(8));
    expect(schedule.currency).toBe('USD');
    expect(items.find(i => i.rowType === 'regel')!.total).toBe(1000);
  });

  it('valt terug op EUR zonder (geldige) valuta', () => {
    mdb.tables = { calculaties: [{ docnr: 1, calculatietitel: 'Test' }], data: dataRows };
    expect(importWpCalcFile(new ArrayBuffer(8)).schedule.currency).toBe('EUR');
    mdb.tables = { data: dataRows };
    expect(importWpCalcFile(new ArrayBuffer(8)).schedule.currency).toBe('EUR');
  });

  it('zet tekens en namen om naar een code', () => {
    expect(wpcalcCurrency('€')).toBe('EUR');
    expect(wpcalcCurrency('Euro')).toBe('EUR');
    expect(wpcalcCurrency('Hfl.')).toBe('NLG');
    expect(wpcalcCurrency('ƒ')).toBe('NLG');
    expect(wpcalcCurrency('Dfl')).toBe('NLG');
    expect(wpcalcCurrency('GBP')).toBe('GBP');
    expect(wpcalcCurrency('xx')).toBe('EUR');
    expect(wpcalcCurrency(null)).toBe('EUR');
    expect(wpcalcCurrency(12)).toBe('EUR');
  });
});
