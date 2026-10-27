import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '@/state/appStore';
import { parseActies, parseLocalBudgetCommand, applyActies, buildBudgetContext } from '@/services/assistant/assistantActions';
import type { CostItem } from '@/types/costModel';

function mk(id: string, rowType: CostItem['rowType'], parentId: string | null, extra: Partial<CostItem> = {}): CostItem {
  return {
    id, parentId, sortOrder: 0, code: '', description: id, unit: 'st',
    quantity: null, materialPrice: null, laborPrice: null, unitPrice: 0, total: 0,
    isCollapsed: false, depth: 0, notes: '', ifcGuid: id, rowType,
    staartPercentage: null, nr: '', normQuantity: null, normFactor: null,
    normDivisor: null, normUnitPrice: null, resourceType: null,
    resourceLibraryId: null, verrekenbaar: null, tariefGroep: null,
    ...extra,
  } as CostItem;
}

beforeEach(() => {
  const s = useAppStore.getState();
  s.setItems([
    mk('ch', 'chapter', null, { code: '21', description: 'Betonwerk' }),
    mk('post', 'begrotingspost', 'ch', { description: 'Drijflichaam' }),
    mk('r1', 'regel', 'post', { description: 'Betonbak', quantity: 12, normUnitPrice: 19350, resourceType: 'onderaannemer' }),
  ]);
  s.recalculate();
});

describe('parseActies', () => {
  it('haalt het ocs-acties blok uit een antwoord', () => {
    const text = 'Ik verhoog het aantal.\n\n```ocs-acties\n{"acties":[{"type":"update","nr":"21.01.01","veld":"aantal","waarde":14}]}\n```\nKlaar!';
    const { acties, cleanText } = parseActies(text);
    expect(acties).toHaveLength(1);
    expect(acties[0].type).toBe('update');
    expect(cleanText).not.toContain('ocs-acties');
    expect(cleanText).toContain('Ik verhoog het aantal.');
  });

  it('geeft lege lijst zonder blok of bij kapotte JSON', () => {
    expect(parseActies('Gewoon een antwoord.').acties).toHaveLength(0);
    expect(parseActies('```ocs-acties\n{kapot}\n```').acties).toHaveLength(0);
  });
});

describe('lokale prompt', () => {
  it('maakt een beoordeelbaar voorstel met Nederlandse decimalen zonder AI-account', () => {
    const voorstel = parseLocalBudgetCommand('Voeg onder 21.01 een regel toe: 12,5 m3 Beton C30 à €145,50');
    expect(voorstel).toEqual([{ type: 'add_regel', onderNr: '21.01', aantal: 12.5, eenheid: 'm³', omschrijving: 'Beton C30', prijs: 145.5 }]);
    expect(useAppStore.getState().items.find(i => i.description === 'Beton C30')).toBeUndefined();
    expect(parseLocalBudgetCommand('Voeg onder 21.01 een regel toe: 5 uur Montage à €50')).toBeNull();
  });
});

describe('applyActies', () => {
  it('update via nr: aantal 12 → 14 en herrekent het totaal', () => {
    const res = applyActies([{ type: 'update', nr: '21.01.01', veld: 'aantal', waarde: 14 }]);
    expect(res[0]).toContain('✔');
    const r1 = useAppStore.getState().items.find(i => i.id === 'r1')!;
    expect(r1.quantity).toBe(14);
    expect(r1.total).toBe(14 * 19350);
  });

  it('add_regel met eenheid uur volgt de loonregels (norm 1, tarief, geen materiaalprijs)', () => {
    const res = applyActies([{ type: 'add_regel', onderNr: '21.01', omschrijving: 'Montage', aantal: 24, eenheid: 'uur', tariefgroep: 'B' }]);
    expect(res[0]).toContain('✔');
    const items = useAppStore.getState().items;
    const montage = items.find(i => i.description === 'Montage')!;
    expect(montage.parentId).toBe('post');
    expect(montage.normQuantity).toBe(1);
    expect(montage.tariefGroep).toBe('B');
    expect(montage.laborPrice).toBeGreaterThan(0);
    expect(montage.normUnitPrice).toBeNull();
    expect(montage.resourceType).toBe('arbeid');
    // genormaliseerd: direct onder zijn ouder in de array
    const idx = items.findIndex(i => i.id === montage.id);
    expect(items[idx - 1].id === 'post' || items[idx - 1].id === 'r1').toBe(true);
  });

  it('add_hoofdstuk + add_post + verwijder subtree', () => {
    const res = applyActies([
      { type: 'add_hoofdstuk', code: '32', omschrijving: 'Trappen' },
      { type: 'verwijder', nr: '21.01' },
    ]);
    expect(res[0]).toContain('✔');
    expect(res[1]).toContain('✔');
    const items = useAppStore.getState().items;
    expect(items.some(i => i.description === 'Trappen')).toBe(true);
    // post + r1 weg, hoofdstuk blijft
    expect(items.some(i => i.id === 'post')).toBe(false);
    expect(items.some(i => i.id === 'r1')).toBe(false);
    expect(items.some(i => i.id === 'ch')).toBe(true);
  });

  it('weigert een ongeldige batch geheel, zodat een voorstel niets gedeeltelijk toepast', () => {
    const before = useAppStore.getState().items;
    const res = applyActies([
      { type: 'update', nr: '99.99', veld: 'aantal', waarde: 1 },
      { type: 'update', nr: '21.01.01', veld: 'aantal', waarde: 5 },
    ]);
    expect(res[0]).toContain('✖');
    expect(useAppStore.getState().items).toBe(before);
    expect(useAppStore.getState().items.find(i => i.id === 'r1')!.quantity).toBe(12);
  });

  it('weigert ongeldige getallen en onbekende eenheden vóór de wijziging', () => {
    const before = useAppStore.getState().items;
    const res = applyActies([
      { type: 'add_regel', onderNr: '21.01', omschrijving: 'Fout', aantal: Infinity, eenheid: 'lichtjaar', prijs: 12 },
    ]);
    expect(res.join(' ')).toContain('✖');
    expect(useAppStore.getState().items).toBe(before);
  });

  it('accepteert gangbare m3-notatie en bewaart de canonieke eenheid', () => {
    const res = applyActies([{ type: 'add_regel', onderNr: '21.01', omschrijving: 'Beton', aantal: 12, eenheid: 'm3', prijs: 145 }]);
    expect(res[0]).toContain('✔');
    expect(useAppStore.getState().items.find(i => i.description === 'Beton')?.unit).toBe('m³');
  });

  it('draait de hele batch terug als een latere actie na verwijderen niet meer kan', () => {
    const before = useAppStore.getState().items;
    const res = applyActies([
      { type: 'verwijder', nr: '21.01' },
      { type: 'update', nr: '21.01.01', veld: 'aantal', waarde: 5 },
    ]);
    expect(res.join(' ')).toContain('No changes applied');
    expect(useAppStore.getState().items).toBe(before);
  });
});

describe('buildBudgetContext', () => {
  it('bevat projectregels met nr en totalen', () => {
    const s = useAppStore.getState();
    const ctx = buildBudgetContext(s.schedule, s.items);
    expect(ctx).toContain('21.01.01');
    expect(ctx).toContain('Betonbak');
    expect(ctx).toContain('Tarieven per uur');
  });
});
