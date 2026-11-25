import { COST_ROW_TYPES } from '@/types/costModel';
import type { CostItem, CostSchedule, CostUnit, ResourceType, RowType } from '@/types/costModel';
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

/** Waarde van een IFCPROPERTYSINGLEVALUE: IFCLABEL('x') wordt 'x', IFCREAL(1.5) wordt 1.5. */
function extractTypedValue(val: string): string | number | null {
  const match = val.match(/^IFC\w+\(([\s\S]*)\)$/i);
  const inner = (match ? match[1] : val).trim();
  if (inner === '$' || inner === '') return null;
  if (inner.startsWith("'")) return extractString(inner);
  if (/^\.(T|F)\.$/i.test(inner)) return inner.toUpperCase() === '.T.' ? 1 : 0;
  const num = parseFloat(inner);
  return isNaN(num) ? null : num;
}

/** Eenheid bij het type IfcPhysicalQuantity zoals de generator ze schrijft. */
const QUANTITY_UNITS: Record<string, CostUnit> = {
  IFCQUANTITYLENGTH: 'm', IFCQUANTITYAREA: 'm²', IFCQUANTITYVOLUME: 'm³',
  IFCQUANTITYWEIGHT: 'kg', IFCQUANTITYTIME: 'uur', IFCQUANTITYCOUNT: 'st',
};

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
    ifcGuid: generateIfcGuid(),
    uitvoeringskosten: 6,
    algemeneKosten: 9,
    winstRisico: 5,
  };

  // Valuta uit IfcMonetaryUnit: IFC4 schrijft een label ('USD'), IFC2x3 een
  // enum (.USD.). Alleen een geldige 3-lettercode; anders blijft EUR staan.
  const monetary = entities.find((e) => e.type === 'IFCMONETARYUNIT');
  const currencyCode = monetary?.args.trim().replace(/^'(.*)'$/, '$1').replace(/^\.(.*)\.$/, '$1').trim().toUpperCase() ?? '';
  if (/^[A-Z]{3}$/.test(currencyCode)) schedule.currency = currencyCode;

  // Find IfcProject for project name. De generator schrijft schedule.ifcGuid als GlobalId van
  // het project (de schedule krijgt een eigen id), dus die lezen we hier terug (knownbug 151).
  const projectEntity = entities.find((e) => e.type === 'IFCPROJECT');
  const projectGuid = projectEntity ? extractString(splitStepArgs(projectEntity.args)[0] ?? '$') : '';
  const scheduleGuid = extractString(schedArgs[0] ?? '$');
  schedule.ifcGuid = projectGuid || scheduleGuid || schedule.ifcGuid;
  if (projectEntity) {
    const pArgs = splitStepArgs(projectEntity.args);
    schedule.projectName = extractString(pArgs[2] ?? '$');
  }

  // Property sets per object (IfcRelDefinesByProperties): setnaam → eigenschap → waarde.
  const psetsByObject = new Map<number, Map<string, Map<string, string | number | null>>>();
  for (const rel of entities.filter((e) => e.type === 'IFCRELDEFINESBYPROPERTIES')) {
    const rArgs = splitStepArgs(rel.args);
    const pset = entityMap.get(extractRef(rArgs[5] ?? '$') ?? -1);
    if (!pset || pset.type !== 'IFCPROPERTYSET') continue;
    const psArgs = splitStepArgs(pset.args);
    const props = new Map<string, string | number | null>();
    for (const ref of extractRefs(psArgs[4] ?? '()')) {
      const prop = entityMap.get(ref);
      if (prop?.type !== 'IFCPROPERTYSINGLEVALUE') continue;
      const propArgs = splitStepArgs(prop.args);
      props.set(extractString(propArgs[0] ?? '$'), extractTypedValue(propArgs[2] ?? '$'));
    }
    for (const objectRef of extractRefs(rArgs[4] ?? '()')) {
      const sets = psetsByObject.get(objectRef) ?? new Map();
      sets.set(extractString(psArgs[2] ?? '$'), props);
      psetsByObject.set(objectRef, sets);
    }
  }

  // Tarieven per tariefgroep (OCS_Tarieven op de IfcCostSchedule).
  const tarieven = schedEntity ? psetsByObject.get(schedEntity.id)?.get('OCS_Tarieven') : undefined;
  if (tarieven) {
    const parsed: Record<string, number> = {};
    for (const [name, value] of tarieven) {
      if (name.startsWith('Tarief_') && typeof value === 'number') parsed[name.slice('Tarief_'.length)] = value;
    }
    if (Object.keys(parsed).length > 0) schedule.tarieven = parsed;
  }

  // Build cost items from IfcCostItem entities
  const costItemEntities = entities.filter((e) => e.type === 'IFCCOSTITEM');
  const itemMap = new Map<number, CostItem>();
  const ownRowType = new Set<number>(); // regeltype uit OCS_ItemProperties gelezen

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

    // Prijzen uit CostValues (IFC4X3: Category = 7e, Components = 10e attribuut van
    // IfcCostValue). Een opgeteld bedrag ('*') wordt via zijn componenten gelezen (knownbug 151).
    const readCostValue = (ref: number, depth: number) => {
      const cv = entityMap.get(ref);
      if (cv?.type !== 'IFCCOSTVALUE' || depth > 4) return;
      const cvArgs = splitStepArgs(cv.args);
      if (cvArgs.length < 10) return; // ouder formaat zonder koppeling: niet te herleiden
      const components = extractRefs(cvArgs[9] ?? '$');
      if (components.length > 0) { for (const c of components) readCostValue(c, depth + 1); return; }
      const category = extractString(cvArgs[6] ?? '$').toUpperCase();
      const value = extractNumber(cvArgs[2] ?? '$');
      if (category === 'MATERIAL') item.materialPrice = value;
      else if (category === 'LABOR' || category === 'LABOUR') item.laborPrice = value;
    };
    for (const ref of extractRefs(args[7] ?? '$')) readCostValue(ref, 0);

    // Hoeveelheid uit CostQuantities (4e attribuut van een IfcPhysicalSimpleQuantity).
    const quantity = entityMap.get(extractRefs(args[8] ?? '$')[0] ?? -1);
    if (quantity && QUANTITY_UNITS[quantity.type]) {
      item.quantity = extractNumber(splitStepArgs(quantity.args)[3] ?? '$');
      item.unit = QUANTITY_UNITS[quantity.type];
    }

    // Eigen velden uit OCS_ItemProperties: regeltype, tariefgroep, middelsoort, verrekenbaarheid,
    // eenheid en staartpercentage. Zonder deze set werd een post een hoofdstuk en een
    // staartregel een gewone post zonder percentage (knownbug 106).
    const own = psetsByObject.get(entity.id)?.get('OCS_ItemProperties');
    if (own) {
      const text = (name: string) => { const v = own.get(name); return typeof v === 'string' ? v : ''; };
      const rowType = text('rowType');
      if ((COST_ROW_TYPES as readonly string[]).includes(rowType)) {
        item.rowType = rowType as RowType;
        ownRowType.add(entity.id);
      }
      const tg = text('tariefGroep');
      if (tg === 'A' || tg === 'B' || tg === 'C') item.tariefGroep = tg;
      const rt = text('resourceType');
      if (['onderaannemer', 'materieel', 'materiaal', 'arbeid', 'overig'].includes(rt)) item.resourceType = rt as ResourceType;
      const vk = text('verrekenbaar');
      if (vk === 'V' || vk === 'A' || vk === 'N' || vk === 'F') item.verrekenbaar = vk;
      if (text('unit')) item.unit = text('unit') as CostUnit;
      const pct = own.get('staartPercentage');
      if (typeof pct === 'number' && item.rowType.startsWith('staart_')) item.staartPercentage = pct;
    }
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
      // Parent is a cost item - set children's parentId. Zonder eigen regeltype (een IFC van
      // een ander programma) is een ouder een hoofdstuk.
      if (!ownRowType.has(relatingRef)) {
        parentItem.rowType = 'chapter';
        parentItem.verrekenbaar = 'V';
      }
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
