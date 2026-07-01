import { makeCostItem, normalizeUnit } from './core';
import type { ImportResult } from './types';
import type { CostItem, CostSchedule, ResourceType, RowType } from '@/types/costModel';

/**
 * IfcX-JSON importer (IFC5-development / IfcX-alpha).
 *
 * Inverse van {@link generateIfcxJson}: leest de boom
 *   data[0] (IfcProject) → children.CostSchedules (IfcCostSchedule)
 *     → geneste IfcCostItem-knopen (children)
 * met attributen in namespaced sleutels (bsi::ifc::prop::, ifcx::cost::,
 * ifcx::ocs::). Object-sleutel-volgorde is de export-volgorde (sortOrder).
 */

type Attrs = Record<string, unknown>;
interface IfcxNode { path?: string; inherits?: string[]; attributes?: Attrs; children?: Record<string, IfcxNode> }

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const inheritsAny = (n: IfcxNode | undefined, type: string): boolean =>
  Array.isArray(n?.inherits) && n!.inherits!.includes(type);

export function importIfcx(jsonText: string): ImportResult {
  const warnings: string[] = [];
  const items: CostItem[] = [];

  let doc: { data?: IfcxNode[] };
  try {
    doc = JSON.parse(jsonText);
  } catch {
    throw new Error('Ongeldig ifcx-bestand: geen geldige JSON.');
  }

  const data = Array.isArray(doc.data) ? doc.data : [];
  const projectNode = data.find((n) => inheritsAny(n, 'IfcProject')) ?? data[0];
  const projA: Attrs = projectNode?.attributes ?? {};

  const projectChildren = Object.values(projectNode?.children ?? {});
  const scheduleNode =
    (projectNode?.children?.CostSchedules as IfcxNode | undefined) ??
    projectChildren.find((n) => inheritsAny(n, 'IfcCostSchedule'));
  const schedA: Attrs = scheduleNode?.attributes ?? {};

  const schedule: Partial<CostSchedule> = {
    name: str(schedA['bsi::ifc::prop::Name']) || str(projA['bsi::ifc::prop::Name']) || 'ifcx-import',
    description: str(schedA['bsi::ifc::prop::Description']) || undefined,
    projectName: str(projA['bsi::ifc::prop::Name']) || undefined,
    projectNumber: str(schedA['bsi::ifc::prop::Identification']) || undefined,
    author: str(projA['bsi::ifc::prop::Author']) || undefined,
    client: str(projA['bsi::ifc::prop::Client']) || undefined,
  };
  const meta = schedA['ifcx::cost::metadata'];
  if (meta && typeof meta === 'object') {
    const m = meta as Record<string, unknown>;
    if (m.tarieven && typeof m.tarieven === 'object') schedule.tarieven = m.tarieven as Record<string, number>;
    if (numOrNull(m.uitvoeringskosten) != null) schedule.uitvoeringskosten = m.uitvoeringskosten as number;
    if (numOrNull(m.algemeneKosten) != null) schedule.algemeneKosten = m.algemeneKosten as number;
    if (numOrNull(m.winstRisico) != null) schedule.winstRisico = m.winstRisico as number;
  }

  let sort = 0;
  const walk = (node: IfcxNode, parentId: string | null, depth: number): void => {
    const a: Attrs = node.attributes ?? {};
    const rowType = (str(a['ifcx::ocs::rowType']) || 'regel') as RowType;
    const qty = a['bsi::ifc::prop::Quantity'];
    const quantity = qty && typeof qty === 'object' ? numOrNull((qty as Record<string, unknown>).value) : null;
    const unitStr = qty && typeof qty === 'object' ? str((qty as Record<string, unknown>).unit) : '';
    const norm = (a['ifcx::ocs::normCalculation'] ?? {}) as Record<string, unknown>;
    const verr = str(a['ifcx::ocs::verrekenbaar']);
    const verrekenbaar = verr === 'V' || verr === 'A' || verr === 'N' || verr === 'F' ? verr : null;
    const tg = str(a['ifcx::ocs::tariefGroep']);
    const tariefGroep = tg === 'A' || tg === 'B' || tg === 'C' ? tg : null;

    const partial: Partial<CostItem> & { rowType: RowType } = {
      parentId,
      sortOrder: sort++,
      depth,
      rowType,
      code: str(a['bsi::ifc::prop::Name']),
      description: str(a['bsi::ifc::prop::Description']),
      unit: normalizeUnit(unitStr),
      quantity,
      materialPrice: numOrNull(a['ifcx::cost::materialPrice']),
      laborPrice: numOrNull(a['ifcx::cost::laborPrice']),
      unitPrice: numOrNull(a['ifcx::cost::unitPrice']) ?? 0,
      total: numOrNull(a['ifcx::cost::total']) ?? 0,
      normQuantity: numOrNull(norm.quantity),
      normFactor: numOrNull(norm.factor),
      normDivisor: numOrNull(norm.divisor),
      normUnitPrice: numOrNull(norm.unitPrice),
      staartPercentage: numOrNull(a['ifcx::cost::staartPercentage']),
      resourceType: (str(a['ifcx::ocs::resourceType']) || null) as ResourceType | null,
      tariefGroep,
      verrekenbaar,
    };
    // Alleen een bestaande ifcGuid overnemen; anders laat makeCostItem er één genereren.
    const guid = str(a['ifcx::ocs::ifcGuid']);
    if (guid) partial.ifcGuid = guid;

    const item = makeCostItem(partial);
    items.push(item);

    for (const child of Object.values(node.children ?? {})) walk(child, item.id, depth + 1);
  };

  for (const node of Object.values(scheduleNode?.children ?? {})) walk(node, null, 0);

  if (items.length === 0) warnings.push('ifcx-bestand bevat geen kostenposten.');

  return { schedule, items, warnings, format: 'ifcx' };
}
