import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '@/state/appStore';
import { parseActies, applyActies, buildBudgetContext } from '@/services/assistant/assistantActions';
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

  it('meldt fouten per actie zonder de rest te blokkeren', () => {
    const res = applyActies([
      { type: 'update', nr: '99.99', veld: 'aantal', waarde: 1 },
      { type: 'update', nr: '21.01.01', veld: 'aantal', waarde: 5 },
    ]);
    expect(res[0]).toContain('✖');
    expect(res[1]).toContain('✔');
    expect(useAppStore.getState().items.find(i => i.id === 'r1')!.quantity).toBe(5);
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
