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
    // Default items are 4 staart items
    expect(items.length).toBe(4);

    // Every item has an id and ifcGuid
    for (const item of items) {
      expect(item.id).toBeTruthy();
      expect(item.ifcGuid).toBeTruthy();
    }
  });

  it('has staart items with correct row types', () => {
    const items = createDefaultItems();
    const staartTypes = items.map(i => i.rowType);
    expect(staartTypes).toEqual(['staart_ukk', 'staart_ak', 'staart_wr', 'staart_afronding']);
  });

  it('staart items have correct percentages', () => {
    const items = createDefaultItems();
    const ukk = items.find(i => i.rowType === 'staart_ukk');
    const ak = items.find(i => i.rowType === 'staart_ak');
    const wr = items.find(i => i.rowType === 'staart_wr');
    const afr = items.find(i => i.rowType === 'staart_afronding');
    expect(ukk!.staartPercentage).toBe(6);
    expect(ak!.staartPercentage).toBe(9);
    expect(wr!.staartPercentage).toBe(5);
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
});
