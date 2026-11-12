import { afterEach, describe, expect, it } from 'vitest';
import { useAppStore } from '@/state/appStore';
import { calculateProject } from '@/lib/core';
import type { CostItem, ProjectFile } from '@/types/costModel';
import { createDefaultSchedule } from '@/data/defaultBudget';
import { DEFAULT_TARIEVEN } from '@/services/calculation/calculator';

// Knownbug 286: bij openen rekende de app de arbeid met de ruwe tarieven
// (`schedule.tarieven`), de rest van de app met `effectiveTarieven`. Een lege
// tarieventabel gaf zo loon 0 bij openen en het standaardtarief na de eerste
// bewerking.

const initial = useAppStore.getState();
afterEach(() => useAppStore.setState(initial, true));

function item(overrides: Partial<CostItem>): CostItem {
  return {
    id: crypto.randomUUID(), parentId: null, sortOrder: 0, code: '', description: '', unit: 'st',
    quantity: null, materialPrice: null, laborPrice: null, unitPrice: 0, total: 0, isCollapsed: false,
    depth: 0, notes: '', ifcGuid: 'test', rowType: 'begrotingspost', staartPercentage: null, nr: '',
    normQuantity: null, normFactor: null, normDivisor: null, normUnitPrice: null, resourceType: null,
    resourceLibraryId: null, verrekenbaar: null, tariefGroep: null,
    ...overrides,
  };
}

function budget(): CostItem[] {
  const post = item({ description: 'Metselwerk' });
  const regel = item({
    parentId: post.id, depth: 1, rowType: 'regel', description: 'Metselen',
    quantity: 10, normQuantity: 0.5, tariefGroep: 'A',
  });
  return [post, regel];
}

const labour = (items: CostItem[]) => items.find(i => i.rowType === 'regel')!.laborPrice;

describe('knownbug 286: arbeid bij openen met de echte tarieven', () => {
  it('een document met een lege tarieventabel rekent bij openen met het standaardtarief', () => {
    const schedule = { ...createDefaultSchedule(), tarieven: {} };
    useAppStore.getState().addDocument({ items: budget(), schedule });
    const opened = labour(useAppStore.getState().items);
    expect(opened).toBeCloseTo(0.5 * DEFAULT_TARIEVEN.A, 6);

    // De eerste willekeurige bewerking verandert het loon niet meer.
    const state = useAppStore.getState();
    state.setItems(state.items);
    expect(labour(useAppStore.getState().items)).toBeCloseTo(opened!, 6);
  });

  it('eigen tarieven blijven gelden', () => {
    const schedule = { ...createDefaultSchedule(), tarieven: { A: 50 } };
    useAppStore.getState().addDocument({ items: budget(), schedule });
    expect(labour(useAppStore.getState().items)).toBeCloseTo(25, 6);
  });

  it('de headless API (calculateProject) rekent net zo', () => {
    const project = { schedule: { ...createDefaultSchedule(), tarieven: {} }, items: budget() } as unknown as ProjectFile;
    expect(labour(calculateProject(project).items)).toBeCloseTo(0.5 * DEFAULT_TARIEVEN.A, 6);
  });
});
