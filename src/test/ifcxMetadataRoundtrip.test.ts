import { describe, it, expect } from 'vitest';
import { generateIfcxJson } from '@/services/ifc/ifcxJsonGenerator';
import { importIfcx } from '@/services/importers/ifcxImporter';
import { makeCostItem } from '@/services/importers/core';
import { createDefaultSchedule } from '@/data/defaultBudget';
import type { CostSchedule } from '@/types/costModel';

function sampleItems() {
  const chapter = makeCostItem({ parentId: null, sortOrder: 0, depth: 0, rowType: 'chapter', code: '01', description: 'Grondwerk' });
  const regel = makeCostItem({ parentId: chapter.id, sortOrder: 1, depth: 1, rowType: 'regel', code: '01.01', description: 'Ontgraven', unit: 'm³', quantity: 10, normQuantity: 1, normFactor: 1, normDivisor: 1, normUnitPrice: 5, resourceType: 'arbeid' });
  return [chapter, regel];
}

/** Schedule-attributen uit de gegenereerde ifcx-JSON. */
function scheduleAttrs(json: string): Record<string, unknown> {
  const doc = JSON.parse(json) as { data: Array<{ children?: Record<string, { attributes?: Record<string, unknown> }> }> };
  return doc.data[0].children!.CostSchedules.attributes!;
}

describe('ifcx cost metadata (round-trip)', () => {
  it('keeps percentages when there are no tarieven', () => {
    const schedule: CostSchedule = { ...createDefaultSchedule(), name: 'geen tarieven', tarieven: undefined, uitvoeringskosten: 7, algemeneKosten: 6.5, winstRisico: 3 };
    const json = generateIfcxJson(schedule, sampleItems());

    const meta = scheduleAttrs(json)['ifcx::cost::metadata'] as Record<string, unknown>;
    expect(meta).toEqual({ uitvoeringskosten: 7, algemeneKosten: 6.5, winstRisico: 3 });

    const res = importIfcx(json);
    expect(res.schedule.uitvoeringskosten).toBe(7);
    expect(res.schedule.algemeneKosten).toBe(6.5);
    expect(res.schedule.winstRisico).toBe(3);
    expect(res.schedule.tarieven).toBeUndefined();
  });

  it('keeps tarieven and percentages together', () => {
    const tarieven = { A: 64, B: 43, C: 82 };
    const schedule: CostSchedule = { ...createDefaultSchedule(), name: 'met tarieven', tarieven, uitvoeringskosten: 8, algemeneKosten: 5, winstRisico: 2.5 };

    const res = importIfcx(generateIfcxJson(schedule, sampleItems()));
    expect(res.schedule.tarieven).toEqual(tarieven);
    expect(res.schedule.uitvoeringskosten).toBe(8);
    expect(res.schedule.algemeneKosten).toBe(5);
    expect(res.schedule.winstRisico).toBe(2.5);
  });

  it('keeps tarieven when the percentages are missing', () => {
    const tarieven = { A: 64, B: 43 };
    const schedule = {
      ...createDefaultSchedule(),
      name: 'alleen tarieven',
      tarieven,
      uitvoeringskosten: undefined,
      algemeneKosten: undefined,
      winstRisico: undefined,
    } as unknown as CostSchedule;
    const json = generateIfcxJson(schedule, sampleItems());

    expect(scheduleAttrs(json)['ifcx::cost::metadata']).toEqual({ tarieven });
    expect(importIfcx(json).schedule.tarieven).toEqual(tarieven);
  });

  it('keeps an explicit 0 percentage', () => {
    const schedule: CostSchedule = { ...createDefaultSchedule(), name: 'nul', tarieven: undefined, uitvoeringskosten: 0, algemeneKosten: 0, winstRisico: 0 };
    const json = generateIfcxJson(schedule, sampleItems());

    expect(scheduleAttrs(json)['ifcx::cost::metadata']).toEqual({ uitvoeringskosten: 0, algemeneKosten: 0, winstRisico: 0 });

    const res = importIfcx(json);
    expect(res.schedule.uitvoeringskosten).toBe(0);
    expect(res.schedule.algemeneKosten).toBe(0);
    expect(res.schedule.winstRisico).toBe(0);
  });

  it('writes no metadata attribute when nothing is set', () => {
    // Oudere/externe schedules kunnen deze velden missen ondanks het type.
    const schedule = {
      ...createDefaultSchedule(),
      name: 'leeg',
      tarieven: {},
      uitvoeringskosten: undefined,
      algemeneKosten: undefined,
      winstRisico: Number.NaN,
    } as unknown as CostSchedule;
    const json = generateIfcxJson(schedule, sampleItems());

    expect(scheduleAttrs(json)).not.toHaveProperty(['ifcx::cost::metadata']);

    const res = importIfcx(json);
    expect(res.schedule.tarieven).toBeUndefined();
    expect(res.schedule.uitvoeringskosten).toBeUndefined();
    expect(res.schedule.algemeneKosten).toBeUndefined();
    expect(res.schedule.winstRisico).toBeUndefined();
  });
});
