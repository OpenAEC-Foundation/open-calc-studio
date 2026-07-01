import { describe, it, expect } from 'vitest';
import { appendHistory, shouldTrackField, isItemChangedSince } from '@/services/history/itemHistory';
import type { CostItem, FieldChange } from '@/types/costModel';

const baseItem = (over: Partial<CostItem> = {}): CostItem => ({
  id: 'i1', parentId: null, sortOrder: 0, code: '', description: '', unit: 'st',
  quantity: null, materialPrice: null, laborPrice: null, unitPrice: 0, total: 0,
  isCollapsed: false, depth: 0, notes: '', ifcGuid: 'g', rowType: 'regel',
  staartPercentage: null, nr: '', normQuantity: null, normFactor: null,
  normDivisor: null, normUnitPrice: null, resourceType: null, resourceLibraryId: null,
  tariefGroep: null, verrekenbaar: null, ...over,
});

const T0 = Date.parse('2026-06-23T10:00:00.000Z');
const min = (n: number) => T0 + n * 60_000;
const iso = (n: number) => new Date(min(n)).toISOString();

describe('shouldTrackField', () => {
  it('volgt waarde-velden, negeert berekende/structurele velden', () => {
    expect(shouldTrackField('quantity')).toBe(true);
    expect(shouldTrackField('description')).toBe(true);
    expect(shouldTrackField('materialPrice')).toBe(true);
    expect(shouldTrackField('notes')).toBe(true);
    // berekend/structureel → niet volgen
    expect(shouldTrackField('unitPrice')).toBe(false);
    expect(shouldTrackField('total')).toBe(false);
    expect(shouldTrackField('depth')).toBe(false);
    expect(shouldTrackField('isCollapsed')).toBe(false);
    expect(shouldTrackField('sortOrder')).toBe(false);
  });
});

describe('appendHistory', () => {
  it('legt een wijziging vast met oude/nieuwe waarde, gebruiker en tijd', () => {
    const h = appendHistory(baseItem(), 'quantity', null, 20, 'jan', min(0));
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ field: 'quantity', oldValue: null, newValue: 20, user: 'jan' });
    expect(h[0].timestamp).toBe(iso(0));
  });

  it('negeert een no-op (oude waarde == nieuwe waarde)', () => {
    const hist: FieldChange[] = [{ field: 'code', oldValue: 'a', newValue: 'b', timestamp: iso(0), user: 'jan' }];
    const item = baseItem({ history: hist });
    const h = appendHistory(item, 'quantity', 5, 5, 'jan', min(1));
    expect(h).toBe(hist); // ongewijzigde referentie
  });

  it('voegt opeenvolgende snelle bewerkingen van hetzelfde veld + gebruiker samen', () => {
    let item = baseItem();
    item = { ...item, history: appendHistory(item, 'quantity', 10, 20, 'jan', min(0)) };
    item = { ...item, history: appendHistory(item, 'quantity', 20, 30, 'jan', min(1)) };
    expect(item.history).toHaveLength(1);
    expect(item.history![0]).toMatchObject({ oldValue: 10, newValue: 30 });
    expect(item.history![0].timestamp).toBe(iso(1)); // tijd schuift mee
  });

  it('voegt NIET samen over verschillende gebruikers heen', () => {
    let item = baseItem();
    item = { ...item, history: appendHistory(item, 'quantity', 10, 20, 'jan', min(0)) };
    item = { ...item, history: appendHistory(item, 'quantity', 20, 30, 'piet', min(1)) };
    expect(item.history).toHaveLength(2);
    expect(item.history![1].user).toBe('piet');
  });

  it('voegt NIET samen nadat het tijdvenster verstreken is', () => {
    let item = baseItem();
    item = { ...item, history: appendHistory(item, 'quantity', 10, 20, 'jan', min(0)) };
    item = { ...item, history: appendHistory(item, 'quantity', 20, 30, 'jan', min(10)) };
    expect(item.history).toHaveLength(2);
  });

  it('laat de entry vallen als een samengevoegde bewerking terugkeert naar de oorspronkelijke waarde', () => {
    let item = baseItem();
    item = { ...item, history: appendHistory(item, 'description', 'oud', 'nieuw', 'jan', min(0)) };
    item = { ...item, history: appendHistory(item, 'description', 'nieuw', 'oud', 'jan', min(1)) };
    expect(item.history).toHaveLength(0);
  });

  it('voegt NIET samen wanneer er tussendoor een ander veld is bewerkt', () => {
    let item = baseItem();
    item = { ...item, history: appendHistory(item, 'quantity', 10, 20, 'jan', min(0)) };
    item = { ...item, history: appendHistory(item, 'description', '', 'x', 'jan', min(1)) };
    item = { ...item, history: appendHistory(item, 'quantity', 20, 30, 'jan', min(2)) };
    expect(item.history).toHaveLength(3);
  });
});

describe('isItemChangedSince', () => {
  const withHist = (n: number) => baseItem({
    history: [{ field: 'quantity', oldValue: 1, newValue: 2, timestamp: iso(n), user: 'jan' }],
  });

  it('is onwaar als bijhouden uit staat (geen baseline)', () => {
    expect(isItemChangedSince(withHist(5), null)).toBe(false);
    expect(isItemChangedSince(withHist(5), undefined)).toBe(false);
  });

  it('is onwaar zonder historie', () => {
    expect(isItemChangedSince(baseItem(), iso(0))).toBe(false);
  });

  it('is waar als er een wijziging is op of na de baseline', () => {
    expect(isItemChangedSince(withHist(5), iso(5))).toBe(true); // exact gelijk telt mee
    expect(isItemChangedSince(withHist(8), iso(5))).toBe(true);
  });

  it('is onwaar als alle wijzigingen vóór de baseline liggen', () => {
    expect(isItemChangedSince(withHist(2), iso(5))).toBe(false);
  });
});
