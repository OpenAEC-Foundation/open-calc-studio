import { describe, it, expect } from 'vitest';
import { generateIfcCostFile } from '@/services/ifc/ifcCostGenerator';
import { parseIfcCostFile } from '@/services/ifc/ifcCostParser';
import type { CostItem, CostSchedule } from '@/types/costModel';

function makeSchedule(overrides: Partial<CostSchedule> = {}): CostSchedule {
  return {
    id: 'sched-1',
    name: 'Test begroting',
    description: 'Test',
    status: 'DRAFT',
    predefinedType: 'ESTIMATE',
    currency: 'EUR',
    projectName: 'Testproject',
    projectNumber: '2026-TEST',
    client: 'Test BV',
    author: 'Tester',
    ifcGuid: 'testguid12345678901234',
    uitvoeringskosten: 6,
    algemeneKosten: 9,
    winstRisico: 5,
    ...overrides,
  };
}

function makeItem(overrides: Partial<CostItem> = {}): CostItem {
  return {
    id: crypto.randomUUID(),
    parentId: null,
    sortOrder: 0,
    code: '',
    description: '',
    unit: 'st',
    quantity: null,
    materialPrice: null,
    laborPrice: null,
    unitPrice: 0,
    total: 0,
    isCollapsed: false,
    depth: 0,
    notes: '',
    ifcGuid: 'itemguid1234567890test',
    rowType: 'begrotingspost',
    staartPercentage: null,
    nr: '',
    normQuantity: null,
    normFactor: null,
    normDivisor: null,
    normUnitPrice: null,
    resourceType: null,
    resourceLibraryId: null,
    verrekenbaar: null,
    tariefGroep: null,
    ...overrides,
  };
}

describe('IFC Generator', () => {
  it('generates valid STEP file structure', () => {
    const schedule = makeSchedule();
    const items = [makeItem({ code: '01', description: 'Grondwerk', rowType: 'chapter' })];
    const ifc = generateIfcCostFile(schedule, items);

    expect(ifc).toContain('ISO-10303-21;');
    expect(ifc).toContain('HEADER;');
    expect(ifc).toContain('FILE_SCHEMA');
    expect(ifc).toContain('DATA;');
    expect(ifc).toContain('ENDSEC;');
    expect(ifc).toContain('END-ISO-10303-21;');
  });

  it('includes IFCPROJECT', () => {
    const schedule = makeSchedule({ projectName: 'Woning Kerkstraat' });
    const ifc = generateIfcCostFile(schedule, []);
    expect(ifc).toContain('IFCPROJECT');
    expect(ifc).toContain('Woning Kerkstraat');
  });

  it('includes IFCCOSTSCHEDULE', () => {
    const schedule = makeSchedule({ name: 'Mijn begroting' });
    const ifc = generateIfcCostFile(schedule, []);
    expect(ifc).toContain('IFCCOSTSCHEDULE');
    expect(ifc).toContain('Mijn begroting');
  });

  it('generates IFCCOSTITEM for each item', () => {
    const schedule = makeSchedule();
    const items = [
      makeItem({ code: '01', description: 'Hoofdstuk 1', rowType: 'chapter', id: 'h1' }),
      makeItem({ code: '01.01', description: 'Werk A', parentId: 'h1', depth: 1, quantity: 10, materialPrice: 5, laborPrice: 3 }),
    ];
    const ifc = generateIfcCostFile(schedule, items);

    expect(ifc).toContain('IFCCOSTITEM');
    expect(ifc).toContain('Hoofdstuk 1');
    expect(ifc).toContain('Werk A');
  });

  it('generates IFCRELNESTS for hierarchy', () => {
    const schedule = makeSchedule();
    const items = [
      makeItem({ code: '01', description: 'Hoofdstuk', rowType: 'chapter', id: 'ch1' }),
      makeItem({ code: '01.01', description: 'Kind', parentId: 'ch1', depth: 1 }),
    ];
    const ifc = generateIfcCostFile(schedule, items);
    expect(ifc).toContain('IFCRELNESTS');
  });

  it('generates IFCCOSTVALUE for material and labor', () => {
    const schedule = makeSchedule();
    const items = [
      makeItem({ materialPrice: 42.5, laborPrice: 18.0, quantity: 1 }),
    ];
    const ifc = generateIfcCostFile(schedule, items);
    expect(ifc).toContain('IFCCOSTVALUE');
    expect(ifc).toContain('MATERIAL');
    expect(ifc).toContain('LABOR');
  });

  it('generates correct quantity entities per unit type', () => {
    const schedule = makeSchedule();
    const items = [
      makeItem({ unit: 'm', quantity: 10 }),
      makeItem({ unit: 'm²', quantity: 20 }),
      makeItem({ unit: 'm³', quantity: 30 }),
      makeItem({ unit: 'kg', quantity: 40 }),
      makeItem({ unit: 'uur', quantity: 50 }),
      makeItem({ unit: 'st', quantity: 60 }),
    ];
    const ifc = generateIfcCostFile(schedule, items);
    expect(ifc).toContain('IFCQUANTITYLENGTH');
    expect(ifc).toContain('IFCQUANTITYAREA');
    expect(ifc).toContain('IFCQUANTITYVOLUME');
    expect(ifc).toContain('IFCQUANTITYWEIGHT');
    expect(ifc).toContain('IFCQUANTITYTIME');
    expect(ifc).toContain('IFCQUANTITYCOUNT');
  });

  it('handles special characters in strings', () => {
    const schedule = makeSchedule({ name: "Begr. 'test' bv" });
    const ifc = generateIfcCostFile(schedule, []);
    // STEP escapes single quotes as ''
    expect(ifc).toContain("Begr. ''test'' bv");
  });
});

describe('IFC Round-trip', () => {
  it('round-trips schedule name and project', () => {
    const schedule = makeSchedule({ name: 'Rondrit test', projectName: 'Project X' });
    const items = [
      makeItem({ code: '01', description: 'Grondwerk', rowType: 'chapter', id: 'h1' }),
      makeItem({ code: '01.01', description: 'Ontgraven', parentId: 'h1', depth: 1, unit: 'm³', quantity: 100, materialPrice: 0, laborPrice: 18.5 }),
    ];
    const ifc = generateIfcCostFile(schedule, items);
    const parsed = parseIfcCostFile(ifc);

    expect(parsed.schedule.name).toBe('Rondrit test');
    expect(parsed.schedule.projectName).toBe('Project X');
  });

  it('round-trips item codes and descriptions', () => {
    const schedule = makeSchedule();
    const items = [
      makeItem({ code: '01', description: 'Fundering', rowType: 'chapter', id: 'ch' }),
      makeItem({ code: '01.01', description: 'Heipalen', parentId: 'ch', depth: 1 }),
    ];
    const ifc = generateIfcCostFile(schedule, items);
    const parsed = parseIfcCostFile(ifc);

    expect(parsed.items.length).toBe(2);
    const codes = parsed.items.map(i => i.code).sort();
    expect(codes).toContain('01');
    expect(codes).toContain('01.01');
  });

  it('preserves parent-child relationships', () => {
    const schedule = makeSchedule();
    const items = [
      makeItem({ code: '01', description: 'Hoofdstuk', rowType: 'chapter', id: 'p' }),
      makeItem({ code: '01.01', description: 'Kind 1', parentId: 'p', depth: 1 }),
      makeItem({ code: '01.02', description: 'Kind 2', parentId: 'p', depth: 1 }),
    ];
    const ifc = generateIfcCostFile(schedule, items);
    const parsed = parseIfcCostFile(ifc);

    const parent = parsed.items.find(i => i.code === '01');
    const children = parsed.items.filter(i => i.parentId === parent?.id);
    expect(parent?.rowType).toBe('chapter');
    expect(children.length).toBe(2);
  });
});
