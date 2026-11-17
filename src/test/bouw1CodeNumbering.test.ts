import { describe, it, expect, beforeAll } from 'vitest';
import { buildBouw1Html } from '@/services/print/bouw1PrintService';
import { createDefaultSchedule } from '@/data/defaultBudget';
import { useAppStore } from '@/state/appStore';
import type { CostItem, CostSchedule } from '@/types/costModel';

// #95: de Bouw 1-afdruk vult Hst/Par/Nr uit de eigen codes van de begroting
// (bijv. Presto "12.01.003") als élke genummerde rij een puur numerieke code
// heeft; anders voor de hele afdruk uit het berekende Nr.
beforeAll(() => {
  const { settings, setSettings } = useAppStore.getState();
  setSettings({ ...settings, reportLocale: 'nl' });
});

const schedule = { ...createDefaultSchedule(), name: 'Test', projectName: 'Test' } as CostSchedule;

function item(p: Partial<CostItem> & Pick<CostItem, 'id' | 'rowType' | 'nr' | 'code'>): CostItem {
  return {
    parentId: null, sortOrder: 0, depth: 0, description: p.id, unit: 'st', quantity: null,
    normQuantity: null, normFactor: null, normDivisor: null, normUnitPrice: null,
    unitPrice: 0, total: 0, ...p,
  } as unknown as CostItem;
}

/** Hoofdstuk 12 › paragraaf 12.01 › post 12.01.003 met een regel eronder. */
function budget(postCode: string, chapterCode = '12'): CostItem[] {
  return [
    item({ id: 'h', rowType: 'chapter', nr: '01', code: chapterCode }),
    item({ id: 'p', rowType: 'chapter', nr: '01.01', code: '12.01', parentId: 'h', depth: 1 }),
    item({ id: 'post', rowType: 'begrotingspost', nr: '01.01.01', code: postCode, parentId: 'p', depth: 2, quantity: 2, unitPrice: 50, total: 100 }),
    item({ id: 'r', rowType: 'regel', nr: '01.01.01.01', code: 'M-123', parentId: 'post', depth: 3, quantity: 2, normUnitPrice: 50, unitPrice: 100, total: 100 }),
  ];
}

/** Hst/Par/Nr-cellen van de datarij met de gegeven omschrijving. */
function numberCells(html: string, description: string): string[] {
  // Diepere rijen krijgen &nbsp;-inspringing vóór de omschrijving.
  const row = html.split('<tr').find((r) => r.includes('data-row') && new RegExp(`[>;]${description}</td>`).test(r));
  expect(row, `datarij ${description}`).toBeDefined();
  return ['hst', 'par', 'nr'].map((c) => row!.match(new RegExp(`<td class="col-${c}">([^<]*)</td>`))![1]);
}

describe('Bouw 1-afdruk: Hst/Par/Nr uit de eigen codes (#95)', () => {
  it('splitst numerieke codes in Hst/Par/Nr', () => {
    const html = buildBouw1Html(schedule, budget('12.01.003'), false);
    expect(numberCells(html, 'post')).toEqual(['12', '01', '003']);
    // De regel draagt geen positie; zijn bibliotheekcode blokkeert niets.
    expect(numberCells(html, 'r')).toEqual(['', '', '']);
  });

  it('valt voor de hele afdruk terug op Nr bij één STABU-achtige code', () => {
    const html = buildBouw1Html(schedule, budget('21.12.31-a'), false);
    expect(numberCells(html, 'post')).toEqual(['01', '01', '01']);
    expect(numberCells(html, 'r')).toEqual(['01', '01', '01.01']);
    expect(html).not.toContain('>12</td>');
  });

  it('valt voor de hele afdruk terug op Nr als één genummerde rij geen code heeft', () => {
    const html = buildBouw1Html(schedule, budget('12.01.003', ''), false);
    expect(numberCells(html, 'post')).toEqual(['01', '01', '01']);
  });
});
