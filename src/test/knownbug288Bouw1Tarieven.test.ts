import { describe, it, expect, beforeAll } from 'vitest';
import { buildBouw1Html } from '@/services/print/bouw1PrintService';
import { createDefaultSchedule } from '@/data/defaultBudget';
import { useAppStore } from '@/state/appStore';
import type { CostItem, CostSchedule } from '@/types/costModel';

// Knownbug 288: de Bouw 1-afdruk viel alleen terug op de standaardtarieven als
// de tabel ontbrak. Bij een lege tabel (`{}`) kreeg elke groep 64 (`?? 64`),
// dus groep B rekende 64 in plaats van 43.
beforeAll(() => {
  const { settings, setSettings } = useAppStore.getState();
  setSettings({ ...settings, reportLocale: 'nl' });
});

function schedule(tarieven: Record<string, number> | undefined): CostSchedule {
  return { ...createDefaultSchedule(), name: 'Testbegroting', projectName: 'Testproject', tarieven } as CostSchedule;
}

// Regel zonder middelsoort: de afdruk splitst het totaal in loon
// (uren × tarief) en materiaal (de rest). 10 × norm 1 = 10 uur.
function regel(tariefGroep: string): CostItem {
  return {
    id: 'r1', parentId: null, sortOrder: 0, depth: 0, rowType: 'regel', nr: '1',
    code: '', description: 'Metselwerk', unit: 'm2', quantity: 10,
    normQuantity: 1, normFactor: 1, normDivisor: 1, normUnitPrice: 0,
    tariefGroep, unitPrice: 1000, total: 1000,
  } as unknown as CostItem;
}

function loonCell(html: string): string {
  const m = html.match(/<td class="col-loon num">([^<]*)<\/td>/);
  expect(m).not.toBeNull();
  return m![1];
}

describe('Bouw 1-afdruk: tarieven (knownbug 288)', () => {
  it('rekent groep B tegen 43 bij een lege tarieventabel', () => {
    const html = buildBouw1Html(schedule({}), [regel('B')], false);
    expect(loonCell(html)).toMatch(/^430[.,]00$/);
  });

  it('rekent groep B tegen 43 als de tabel ontbreekt', () => {
    const html = buildBouw1Html(schedule(undefined), [regel('B')], false);
    expect(loonCell(html)).toMatch(/^430[.,]00$/);
  });

  it('een groep die in een eigen tabel ontbreekt telt als tarief 0, net als de rekenkern', () => {
    const html = buildBouw1Html(schedule({ A: 50 }), [regel('B')], false);
    expect(loonCell(html)).toBe('');
  });
});
