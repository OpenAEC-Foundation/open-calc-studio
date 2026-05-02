import { describe, it, expect } from 'vitest';
import { generateIfcCostFile } from '@/services/ifc/ifcCostGenerator';
import { parseIfcCostFile } from '@/services/ifc/ifcCostParser';
import { createDefaultSchedule, createDefaultItems } from '@/data/defaultBudget';
import { recalculateItems } from '@/services/calculation/calculator';
import type { CostItem } from '@/types/costModel';

/** Helper: create a small test budget with chapters, posts, and regels */
function createTestBudget(): CostItem[] {
  const chapterId = crypto.randomUUID();
  const postId = crypto.randomUUID();

  const items: CostItem[] = [
    {
      id: chapterId, parentId: null, sortOrder: 0, code: '01', description: 'Grondwerk',
      unit: 'st', quantity: null, materialPrice: null, laborPrice: null,
      unitPrice: 0, total: 0, isCollapsed: false, depth: 0, notes: '',
      ifcGuid: 'TestGuid0000000000001', rowType: 'chapter', staartPercentage: null,
      nr: '01', normQuantity: null, normFactor: null, normDivisor: null,
      normUnitPrice: null, resourceType: null, resourceLibraryId: null,
      tariefGroep: null, verrekenbaar: null,
    },
    {
      id: postId, parentId: chapterId, sortOrder: 1, code: '01.01', description: 'Ontgraven bouwput',
      unit: 'm³', quantity: 120, materialPrice: 15, laborPrice: 25,
      unitPrice: 40, total: 4800, isCollapsed: false, depth: 1, notes: '',
      ifcGuid: 'TestGuid0000000000002', rowType: 'begrotingspost', staartPercentage: null,
      nr: '01.01', normQuantity: null, normFactor: null, normDivisor: null,
      normUnitPrice: null, resourceType: null, resourceLibraryId: null,
      tariefGroep: null, verrekenbaar: null,
    },
    {
      id: crypto.randomUUID(), parentId: chapterId, sortOrder: 2, code: '01.02', description: 'Aanvulling zand',
      unit: 'm³', quantity: 50, materialPrice: 18, laborPrice: null,
      unitPrice: 18, total: 900, isCollapsed: false, depth: 1, notes: '',
      ifcGuid: 'TestGuid0000000000003', rowType: 'begrotingspost', staartPercentage: null,
      nr: '01.02', normQuantity: null, normFactor: null, normDivisor: null,
      normUnitPrice: null, resourceType: null, resourceLibraryId: null,
      tariefGroep: null, verrekenbaar: null,
    },
    // Staart items
    ...createDefaultItems(),
  ];
  return recalculateItems(items);
}

describe('Full IFC round-trip', () => {
  const schedule = { ...createDefaultSchedule(), name: 'Test Budget', author: 'Test', projectName: 'Test Project' };
  const items = createTestBudget();

  it('generates IFC from budget', () => {
    const ifc = generateIfcCostFile(schedule, items);
    expect(ifc.length).toBeGreaterThan(1000);
    expect(ifc).toContain('IFCCOSTSCHEDULE');
    expect(ifc).toContain('IFCCOSTITEM');
    expect(ifc).toContain('IFCRELNESTS');
  });

  it('preserves all items through round-trip', () => {
    const ifc = generateIfcCostFile(schedule, items);
    const parsed = parseIfcCostFile(ifc);
    expect(parsed.items.length).toBe(items.length);
  });

  it('preserves schedule name', () => {
    const ifc = generateIfcCostFile(schedule, items);
    const parsed = parseIfcCostFile(ifc);
    expect(parsed.schedule.name).toBe(schedule.name);
  });

  it('preserves project name', () => {
    const ifc = generateIfcCostFile(schedule, items);
    const parsed = parseIfcCostFile(ifc);
    expect(parsed.schedule.projectName).toBe(schedule.projectName);
  });

  it('preserves all chapter codes', () => {
    const ifc = generateIfcCostFile(schedule, items);
    const parsed = parseIfcCostFile(ifc);

    const origCodes = items.filter(i => i.rowType === 'chapter').map(i => i.code).sort();
    const parsedCodes = parsed.items.filter(i => i.rowType === 'chapter').map(i => i.code).sort();
    expect(parsedCodes).toEqual(origCodes);
  });

  it('preserves parent-child structure', () => {
    const ifc = generateIfcCostFile(schedule, items);
    const parsed = parseIfcCostFile(ifc);

    // Count top-level items
    const origTopLevel = items.filter(i => i.parentId === null).length;
    const parsedTopLevel = parsed.items.filter(i => i.parentId === null).length;
    expect(parsedTopLevel).toBe(origTopLevel);

    // Count chapters with children
    const origChaptersWithKids = items
      .filter(i => i.rowType === 'chapter')
      .filter(ch => items.some(i => i.parentId === ch.id))
      .length;
    const parsedChaptersWithKids = parsed.items
      .filter(i => i.rowType === 'chapter')
      .filter(ch => parsed.items.some(i => i.parentId === ch.id))
      .length;
    expect(parsedChaptersWithKids).toBe(origChaptersWithKids);
  });

  it('preserves item descriptions', () => {
    const ifc = generateIfcCostFile(schedule, items);
    const parsed = parseIfcCostFile(ifc);

    const origDescs = items.map(i => i.description).sort();
    const parsedDescs = parsed.items.map(i => i.description).sort();
    expect(parsedDescs).toEqual(origDescs);
  });

  it('generates valid quantity entities for volume units', () => {
    const ifc = generateIfcCostFile(schedule, items);
    // Test budget uses m³
    expect(ifc).toContain('IFCQUANTITYVOLUME');
  });

  it('generates IFCCOSTVALUE for material and labor prices', () => {
    const ifc = generateIfcCostFile(schedule, items);
    const materialCount = (ifc.match(/MATERIAL/g) ?? []).length;
    const laborCount = (ifc.match(/'LABOR'/g) ?? []).length;

    const itemsWithMaterial = items.filter(i => i.materialPrice !== null && i.materialPrice !== 0).length;
    const itemsWithLabor = items.filter(i => i.laborPrice !== null && i.laborPrice !== 0).length;

    expect(materialCount).toBe(itemsWithMaterial);
    expect(laborCount).toBe(itemsWithLabor);
  });
});
