import type { CostItem, CostSchedule } from '@/types/costModel';
import { decodeStepString, generateIfcGuid } from './ifcHelpers';

interface StepEntity {
  id: number;
  type: string;
  args: string;
}

function parseStepFile(content: string): StepEntity[] {
  const entities: StepEntity[] = [];
  const dataMatch = content.match(/DATA;([\s\S]*?)ENDSEC;/);
  if (!dataMatch) return entities;

  const lines = dataMatch[1].split('\n');
  for (const line of lines) {
    const match = line.trim().match(/^#(\d+)\s*=\s*(\w+)\s*\((.*)\)\s*;$/);
    if (match) {
      entities.push({
        id: parseInt(match[1]),
        type: match[2].toUpperCase(),
        args: match[3],
      });
    }
  }
  return entities;
}

function splitStepArgs(args: string): string[] {
  const result: string[] = [];
  let depth = 0;
  let current = '';
  let inString = false;

  for (let i = 0; i < args.length; i++) {
    const ch = args[i];
    if (ch === "'" && !inString) {
      inString = true;
      current += ch;
    } else if (ch === "'" && inString) {
      if (args[i + 1] === "'") {
        current += "''";
        i++;
      } else {
        inString = false;
        current += ch;
      }
    } else if (!inString && ch === '(') {
      depth++;
      current += ch;
    } else if (!inString && ch === ')') {
      depth--;
      current += ch;
    } else if (!inString && ch === ',' && depth === 0) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) result.push(current.trim());
  return result;
}

function extractString(val: string): string {
  if (val === '$' || val === '*') return '';
  if (val.startsWith("'") && val.endsWith("'")) {
    return decodeStepString(val.slice(1, -1));
  }
  return val;
}

function extractNumber(val: string): number | null {
  if (val === '$' || val === '*') return null;
  // Handle IFCMONETARYMEASURE(123.) wrapping
  const match = val.match(/IFCMONETARYMEASURE\(([^)]+)\)/i);
  const numStr = match ? match[1] : val;
  const num = parseFloat(numStr);
  return isNaN(num) ? null : num;
}

function extractRef(val: string): number | null {
  const match = val.match(/^#(\d+)$/);
  return match ? parseInt(match[1]) : null;
}

function extractRefs(val: string): number[] {
  const refs: number[] = [];
  const matches = val.matchAll(/#(\d+)/g);
  for (const m of matches) {
    refs.push(parseInt(m[1]));
  }
  return refs;
}

export function parseIfcCostFile(content: string): { schedule: CostSchedule; items: CostItem[] } {
  const entities = parseStepFile(content);
  const entityMap = new Map<number, StepEntity>();
  for (const e of entities) entityMap.set(e.id, e);

  // Find IfcCostSchedule
  const schedEntity = entities.find((e) => e.type === 'IFCCOSTSCHEDULE');
  const schedArgs = schedEntity ? splitStepArgs(schedEntity.args) : [];

  const schedule: CostSchedule = {
    id: crypto.randomUUID(),
    name: schedArgs[2] ? extractString(schedArgs[2]) : 'Imported',
    description: schedArgs[3] ? extractString(schedArgs[3]) : '',
    status: 'DRAFT',
    predefinedType: 'ESTIMATE',
    currency: 'EUR',
    projectName: '',
    projectNumber: '',
    client: '',
    author: '',
    ifcGuid: schedArgs[0] ? extractString(schedArgs[0]) : generateIfcGuid(),
    uitvoeringskosten: 6,
    algemeneKosten: 9,
    winstRisico: 5,
  };

  // Find IfcProject for project name
  const projectEntity = entities.find((e) => e.type === 'IFCPROJECT');
  if (projectEntity) {
    const pArgs = splitStepArgs(projectEntity.args);
    schedule.projectName = extractString(pArgs[2] ?? '$');
  }

  // Build cost items from IfcCostItem entities
  const costItemEntities = entities.filter((e) => e.type === 'IFCCOSTITEM');
  const itemMap = new Map<number, CostItem>();

  for (const entity of costItemEntities) {
    const args = splitStepArgs(entity.args);
    const item: CostItem = {
      id: crypto.randomUUID(),
      parentId: null,
      sortOrder: 0,
      code: extractString(args[2] ?? '$'),
      description: extractString(args[3] ?? '$'),
      unit: 'st',
      quantity: null,
      materialPrice: null,
      laborPrice: null,
      unitPrice: 0,
      total: 0,
      isCollapsed: false,
      depth: 0,
      notes: '',
      ifcGuid: extractString(args[0] ?? '$') || generateIfcGuid(),
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
    };
    itemMap.set(entity.id, item);
  }

  // Store cost values for association with items
  const costValueMap = new Map<number, { category: string; value: number | null }>();
  const costValues = entities.filter((e) => e.type === 'IFCCOSTVALUE');
  for (const cv of costValues) {
    const args = splitStepArgs(cv.args);
    const category = extractString(args[3] ?? '$').toUpperCase();
    const value = extractNumber(args[5] ?? '$');
    costValueMap.set(cv.id, { category, value });
  }

  // Parse IfcRelNests for hierarchy
  const relNests = entities.filter((e) => e.type === 'IFCRELNESTS');
  for (const rel of relNests) {
    const args = splitStepArgs(rel.args);
    const relatingRef = extractRef(args[4] ?? '$');
    const relatedRefs = extractRefs(args[5] ?? '()');

    if (relatingRef === null) continue;

    const parentItem = itemMap.get(relatingRef);
    if (parentItem) {
      // Parent is a cost item - set children's parentId, mark parent as chapter
      parentItem.rowType = 'chapter';
      parentItem.verrekenbaar = 'V';
      for (let i = 0; i < relatedRefs.length; i++) {
        const childItem = itemMap.get(relatedRefs[i]);
        if (childItem) {
          childItem.parentId = parentItem.id;
          childItem.sortOrder = i;
        }
      }
    }
    // If parent is the schedule, children are top-level
    if (relatingRef === schedEntity?.id) {
      for (let i = 0; i < relatedRefs.length; i++) {
        const childItem = itemMap.get(relatedRefs[i]);
        if (childItem) {
          childItem.sortOrder = i;
        }
      }
    }
  }

  // Calculate depths
  const items = Array.from(itemMap.values());
  function setDepth(parentId: string | null, depth: number) {
    for (const item of items) {
      if (item.parentId === parentId) {
        item.depth = depth;
        if (item.rowType === 'chapter') setDepth(item.id, depth + 1);
      }
    }
  }
  setDepth(null, 0);

  return { schedule, items };
}
