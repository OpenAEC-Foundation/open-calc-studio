import { describe, it, expect } from 'vitest';
import { serializeProject, deserializeProject } from '@/services/file/fileService';
import { createDefaultSchedule, createDefaultItems } from '@/data/defaultBudget';
import { recalculateItems } from '@/services/calculation/calculator';

describe('File Service', () => {
  it('serializes and deserializes a project', () => {
    const schedule = createDefaultSchedule();
    const items = recalculateItems(createDefaultItems());

    const json = serializeProject(schedule, items);
    expect(typeof json).toBe('string');
    expect(json.length).toBeGreaterThan(0);

    const parsed = deserializeProject(json);
    expect(parsed.version).toBe('2.1.0');
    expect(parsed.schedule.name).toBe(schedule.name);
    expect(parsed.items.length).toBe(items.length);
  });

  it('preserves item data through round-trip', () => {
    const schedule = createDefaultSchedule();
    const items = recalculateItems(createDefaultItems());

    const json = serializeProject(schedule, items);
    const parsed = deserializeProject(json);

    // Check the first staart item survives
    const origItem = items.find(i => i.rowType === 'staart_ukk');
    const parsedItem = parsed.items.find(i => i.rowType === 'staart_ukk');
    expect(parsedItem).toBeTruthy();
    expect(parsedItem!.description).toBe(origItem!.description);
    expect(parsedItem!.staartPercentage).toBe(origItem!.staartPercentage);
  });

  it('throws on invalid JSON', () => {
    expect(() => deserializeProject('not json')).toThrow();
  });

  it('throws on missing fields', () => {
    expect(() => deserializeProject('{}')).toThrow('Invalid file format');
  });
});
