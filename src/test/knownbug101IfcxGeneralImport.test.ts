import { describe, it, expect } from 'vitest';
import { generateIfcxJson } from '@/services/ifc/ifcxJsonGenerator';
import { importBudget } from '@/lib/importers';
import { recalculateItems } from '@/services/calculation/calculator';
import { makeCostItem } from '@/services/importers/core';
import { createDefaultSchedule } from '@/data/defaultBudget';

// Knownbug 101 was al opgelost: `isIfcxExchangeJson` (ifcxDetection.ts) stuurt een IfcX-export
// in lib/importers.ts, hostFileActions.ts en MCP fileCommands.ts naar importIfcx.
function chapterWithPosts(codes: string[]) {
  const chapter = makeCostItem({ parentId: null, sortOrder: 0, depth: 0, rowType: 'chapter', code: 'H', description: 'Hoofdstuk' });
  return [chapter, ...codes.map((code, i) => makeCostItem({ parentId: chapter.id, sortOrder: i + 1, depth: 1, rowType: 'begrotingspost', code, description: `Post ${code}`, unit: 'st', quantity: 1, materialPrice: 1 }))];
}

describe('knownbug 101: een echt IfcX-bestand via de algemene import', () => {
  it('importBudget herkent een IfcX-export als IfcX en niet als native project', async () => {
    const schedule = { ...createDefaultSchedule(), name: 'ifcx-algemeen' };
    const json = generateIfcxJson(schedule, recalculateItems(chapterWithPosts(['01'])));
    const data = new TextEncoder().encode(json);
    const result = await importBudget(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer, 'export.ifcx');
    expect(result.format).toBe('ifcx');
    expect(result.items.some((i) => i.code === '01')).toBe(true);
  });
});
