import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '@/state/appStore';
import { captureRecovery } from '@/services/file/recovery';
import { generateReport } from '@/services/report/reportGenerator';
import { makeReportContext } from '@/i18n/reportI18n';
import { createDefaultSchedule } from '@/data/defaultBudget';
import { getStaartBreakdown, recalculateItems } from '@/services/calculation/calculator';
import { synthesizeStaartItems } from '@/services/calculation/staartDefaults';
import { makeCostItem } from '@/services/importers/core';
import { importWpCalcFile } from '@/services/importers/wpcalcImporter';

// WpCalc-bestanden zijn Access-databases; de test levert de tabellen via een nep-MDBReader.
const mdb = vi.hoisted(() => ({ tables: {} as Record<string, Record<string, unknown>[]> }));
vi.mock('mdb-reader', () => ({
  default: class {
    getTableNames() { return Object.keys(mdb.tables); }
    getTable(name: string) { return { getData: () => mdb.tables[name] ?? [] }; }
  },
}));

const initial = useAppStore.getState();

describe('knownbugs 118: een versie maken markeert het document als gewijzigd', () => {
  beforeEach(() => { useAppStore.setState(initial, true); });

  const activeDoc = () => { const s = useAppStore.getState(); return s.documents.find(d => d.id === s.activeDocumentId)!; };

  it('createSnapshot (Verzenden/Concept in het lint) maakt het document dirty, zodat herstel iets bewaart', () => {
    useAppStore.getState().addDocument({ fileName: 'Offerte' });
    expect(activeDoc().isModified).toBe(false);
    expect(captureRecovery('w')).toBeNull();

    useAppStore.getState().createSnapshot('Verzonden', 'verstuurd');

    expect(activeDoc().isModified).toBe(true);
    const record = captureRecovery('w');
    expect(record).not.toBeNull();
    expect(JSON.parse(record!.documents[0].json).snapshots[0].label).toBe('Verzonden');
  });

  it('deleteSnapshot maakt het document ook dirty', () => {
    useAppStore.getState().addDocument({ fileName: 'Offerte' });
    useAppStore.getState().createSnapshot('v1', 'concept');
    const id = useAppStore.getState().snapshots[0].id;
    useAppStore.getState().updateDocument(activeDoc().id, { isModified: false });

    useAppStore.getState().deleteSnapshot(id);

    expect(useAppStore.getState().snapshots).toHaveLength(0);
    expect(activeDoc().isModified).toBe(true);
  });

  it('laden (setSnapshots) en selecteren markeren niets', () => {
    useAppStore.getState().addDocument({ fileName: 'Offerte' });
    useAppStore.getState().setSnapshots([{ id: 's', label: 'x', timestamp: '', type: 'concept', notitie: '', schedule: createDefaultSchedule(), items: [], totaalExclBtw: 0 }]);
    useAppStore.getState().setSelectedSnapshot('s');
    expect(activeDoc().isModified).toBe(false);
  });
});

describe('knownbugs 89: WpCalc-regels met prijs maar zonder omschrijving blijven behouden', () => {
  const row = (over: Record<string, unknown>) => ({
    recnr: 0, docnr: 1, groep: 1, paragraaf: 0, volgnr: 0, tabs: 0, rectype: 0, omschrijving: null, eenheid: 'st',
    aantal: null, prijs: null, kosteneh: null, minuten: null, norm: null, verbruik: null, tariefgroep: null, tarief: null,
    onderaanneming: false, materieel: false, stelpost: false, vastbedrag: false, rekenstring: null, code: null, artikelnr: null,
    ...over,
  });

  it('een hoofdstuk met 1000 + 200 (zonder omschrijving) komt op 1200; echt lege regels vallen nog steeds weg', () => {
    mdb.tables = {
      data: [
        row({ recnr: 1, volgnr: 0, rectype: 8, omschrijving: 'Grondwerk' }),
        row({ recnr: 2, volgnr: 1, omschrijving: 'Ontgraven', aantal: 1, prijs: 1000, kosteneh: 1000 }),
        row({ recnr: 3, volgnr: 2, omschrijving: null, aantal: 1, prijs: 200, kosteneh: 200 }),
        row({ recnr: 4, volgnr: 3, omschrijving: '  ' }), // helemaal leeg
        row({ recnr: 5, volgnr: 4, rectype: 5, omschrijving: null }), // lege tekstregel
      ],
    };
    const { items } = importWpCalcFile(new ArrayBuffer(8));
    const chapter = items.find(i => i.rowType === 'chapter')!;
    const posts = items.filter(i => i.rowType === 'regel');
    expect(posts.map(p => p.description)).toEqual(['Ontgraven', '']);
    expect(posts.every(p => p.parentId === chapter.id)).toBe(true);
    expect(posts.reduce((s, p) => s + p.total, 0)).toBe(1200);
    expect(items.filter(i => i.parentId === chapter.id)).toHaveLength(2);

    const recalculated = recalculateItems(items);
    expect(recalculated.find(i => i.id === chapter.id)!.total).toBeCloseTo(1200, 6);
  });
});

describe('knownbugs 123: "Rapport genereren" toont onder "excl. btw" het bedrag zonder btw', () => {
  it('€ 640 met de standaardstaart geeft 767,15, niet 928,25', () => {
    const h = makeCostItem({ id: 'h', rowType: 'chapter', description: 'Grondwerk', depth: 0, sortOrder: 0 });
    const r = makeCostItem({ id: 'r', rowType: 'regel', description: 'Post', parentId: 'h', depth: 1, sortOrder: 1,
      quantity: 1, normQuantity: 1, normFactor: 1, normUnitPrice: 640, resourceType: 'materiaal' });
    const items = recalculateItems([h, r, ...synthesizeStaartItems(null)]);
    const bd = getStaartBreakdown(items);
    expect(bd.kostprijs).toBeCloseTo(640, 6);
    expect(bd.aanneemsom + bd.afronding).toBeCloseTo(767.15, 2);

    const html = generateReport({ ...createDefaultSchedule(), name: 'T' }, items, makeReportContext('nl'));
    const box = html.match(/<div class="summary-box">[\s\S]*?<span class="amount">([^<]*)<\/span>/);
    expect(box?.[1]).toBe('767,15');
  });
});
