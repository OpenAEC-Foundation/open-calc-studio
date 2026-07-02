import { describe, it, expect } from 'vitest';
import { createDefaultSchedule, createDefaultItems } from '@/data/defaultBudget';
import { recalculateItems, getGrandTotal } from '@/services/calculation/calculator';

describe('Default Budget', () => {
  it('creates a valid schedule', () => {
    const schedule = createDefaultSchedule();
    // i18next.t() returns undefined in test env (not initialized)
    // so schedule.name is undefined — just check it exists as a key
    expect('name' in schedule).toBe(true);
    expect(schedule.projectName).toBe('');
    expect(schedule.currency).toBe('EUR');
    expect(schedule.status).toBe('DRAFT');
    expect(schedule.id).toBeTruthy();
    expect(schedule.ifcGuid).toBeTruthy();
  });

  it('creates items with correct structure', () => {
    const items = createDefaultItems();
    // Default items are 9 staart items (gedetailleerde staartkosten-breakdown)
    expect(items.length).toBe(9);

    // Every item has an id and ifcGuid
    for (const item of items) {
      expect(item.id).toBeTruthy();
      expect(item.ifcGuid).toBeTruthy();
    }
  });

  it('has staart items with correct row types', () => {
    const items = createDefaultItems();
    const staartTypes = items.map(i => i.rowType);
    expect(staartTypes).toEqual([
      'staart_ak_oa', 'staart_abk', 'staart_garanties', 'staart_wvpm',
      'staart_risico', 'staart_winst', 'staart_verzekering', 'staart_btw', 'staart_afronding',
    ]);
  });

  it('staart items have correct percentages', () => {
    const items = createDefaultItems();
    const akOa = items.find(i => i.rowType === 'staart_ak_oa');
    const abk = items.find(i => i.rowType === 'staart_abk');
    const risico = items.find(i => i.rowType === 'staart_risico');
    const winst = items.find(i => i.rowType === 'staart_winst');
    const btw = items.find(i => i.rowType === 'staart_btw');
    const afr = items.find(i => i.rowType === 'staart_afronding');
    expect(akOa!.staartPercentage).toBe(9);
    expect(abk!.staartPercentage).toBe(6);
    expect(risico!.staartPercentage).toBe(3);
    expect(winst!.staartPercentage).toBe(5);
    expect(btw!.staartPercentage).toBe(21);
    expect(afr!.staartPercentage).toBeNull();
  });

  it('recalculates without errors', () => {
    const items = recalculateItems(createDefaultItems());
    const total = getGrandTotal(items);
    // Empty budget with only staart items has 0 total
    expect(total).toBe(0);
  });

  it('all parent references are valid', () => {
    const items = createDefaultItems();
    const ids = new Set(items.map(i => i.id));
    for (const item of items) {
      if (item.parentId !== null) {
        expect(ids.has(item.parentId)).toBe(true);
      }
    }
  });

  it('all staart items have null parentId', () => {
    const items = createDefaultItems();
    for (const item of items) {
      expect(item.parentId).toBeNull();
    }
  });

  it('legacy opslag-scalars blijven in sync met de detail-staart-items', () => {
    // De schedule-scalars (legacy 3-opslagmodel) worden afgeleid uit de
    // staart-items (bron van waarheid). Deze test bewaakt dat ze niet uit
    // elkaar lopen als de default-percentages ooit wijzigen.
    const schedule = createDefaultSchedule();
    const items = createDefaultItems();
    const pctOf = (rt: string) => items.find((i) => i.rowType === rt)!.staartPercentage;
    expect(schedule.uitvoeringskosten).toBe(pctOf('staart_abk'));
    expect(schedule.algemeneKosten).toBe(pctOf('staart_ak_oa'));
    expect(schedule.winstRisico).toBe(pctOf('staart_winst'));
    // Waarden ongewijzigd t.o.v. voorheen (geen gedragswijziging):
    expect(schedule.uitvoeringskosten).toBe(6);
    expect(schedule.algemeneKosten).toBe(9);
    expect(schedule.winstRisico).toBe(5);
  });
});
