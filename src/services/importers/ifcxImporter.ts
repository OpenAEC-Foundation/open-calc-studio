import { uiText } from '../../i18n/uiText';
import { makeCostItem, normalizeUnit } from './core';
import type { ImportResult } from './types';
import type { Branch, CostItem, CostSchedule, ResourceType, RowType } from '@/types/costModel';
import { importOpenaecIfcx } from './openaecIfcxImporter';

/**
 * IfcX-JSON importer (IFC5-development / IfcX-alpha).
 *
 * Inverse van {@link generateIfcxJson}: leest de boom
 *   data[0] (IfcProject) → children.CostSchedules (IfcCostSchedule)
 *     → geneste IfcCostItem-knopen (children)
 * met attributen in namespaced sleutels (bsi::ifc::prop::, ifcx::cost::,
 * ifcx::ocs::). De volgorde komt uit `ifcx::ocs::sortOrder`, anders uit de sleutelvolgorde.
 */

type Attrs = Record<string, unknown>;
interface IfcxNode { path?: string; inherits?: string[]; attributes?: Attrs; children?: Record<string, IfcxNode> }

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const inheritsAny = (n: IfcxNode | undefined, type: string): boolean =>
  Array.isArray(n?.inherits) && n!.inherits!.includes(type);
/**
 * Kinderen in exportvolgorde. JSON-objectsleutels die op gehele getallen lijken ('2', '10')
 * komen bij het doorlopen altijd eerst, dus `ifcx::ocs::sortOrder` bepaalt de volgorde waar
 * die er is; oudere bestanden zonder dat attribuut houden de sleutelvolgorde (knownbug 99).
 */
function orderedChildren(node: IfcxNode | undefined): IfcxNode[] {
  const kids = Object.values(node?.children ?? {});
  const order = (n: IfcxNode) => numOrNull(n.attributes?.['ifcx::ocs::sortOrder']);
  if (!kids.every((n) => order(n) != null)) return kids;
  return kids.map((n, i) => ({ n, i })).sort((a, b) => order(a.n)! - order(b.n)! || a.i - b.i).map(({ n }) => n);
}

export function importIfcx(jsonText: string): ImportResult {
  const warnings: string[] = [];
  const items: CostItem[] = [];

  let doc: { data?: IfcxNode[] };
  try {
    doc = JSON.parse(jsonText);
  } catch {
    throw new Error(uiText("diagnostics.ifcxImporter.invalidIfcxFileNotValidJSON", "Invalid ifcx file: not valid JSON."));
  }

  const data = Array.isArray(doc.data) ? doc.data : [];
  const shared = importOpenaecIfcx(data);
  if (shared) return shared;
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
  // Een lege waarde niet als `undefined` meegeven: samengevoegd met de bestaande schedule
  // overschrijft die de standaard '' en struikelt de IFC STEP-export erover (knownbug 104).
  for (const key of Object.keys(schedule) as (keyof CostSchedule)[]) {
    if (schedule[key] === undefined) delete schedule[key];
  }
  const meta = schedA['ifcx::cost::metadata'];
  if (meta && typeof meta === 'object') {
    const m = meta as Record<string, unknown>;
    if (m.tarieven && typeof m.tarieven === 'object') schedule.tarieven = m.tarieven as Record<string, number>;
    if (numOrNull(m.uitvoeringskosten) != null) schedule.uitvoeringskosten = m.uitvoeringskosten as number;
    if (numOrNull(m.algemeneKosten) != null) schedule.algemeneKosten = m.algemeneKosten as number;
    if (numOrNull(m.winstRisico) != null) schedule.winstRisico = m.winstRisico as number;
  }
  // Valuta (ISO 4217-code) — alleen overnemen als het een geldige 3-lettercode is,
  // anders blijft currency leeg en geldt de normale standaard.
  const cur = schedA['ifcx::cost::currency'];
  if (cur && typeof cur === 'object') {
    const code = str((cur as Record<string, unknown>).currency).trim().toUpperCase();
    if (/^[A-Z]{3}$/.test(code)) schedule.currency = code;
  }
  // Varianten (knownbug 105): de boom en de gekozen variant; de regels dragen hun branchId.
  const variants = schedA['ifcx::ocs::variants'];
  if (variants && typeof variants === 'object') {
    const v = variants as Record<string, unknown>;
    const branches = Array.isArray(v.branches)
      ? v.branches.filter((b): b is Branch => !!b && typeof b === 'object' && typeof (b as Branch).id === 'string' && typeof (b as Branch).name === 'string')
        .map((b) => ({ id: b.id, name: b.name, parentId: typeof b.parentId === 'string' ? b.parentId : null, ...(typeof b.color === 'string' ? { color: b.color } : {}) }))
      : [];
    if (branches.length > 0) {
      schedule.branches = branches;
      if (typeof v.enabled === 'boolean') schedule.branchesEnabled = v.enabled;
      if (typeof v.activeBranchId === 'string' && branches.some((b) => b.id === v.activeBranchId)) schedule.activeBranchId = v.activeBranchId;
    }
  }

  let sort = 0;
  const walk = (node: IfcxNode, parentId: string | null, depth: number): void => {
    const a: Attrs = node.attributes ?? {};
    const rowType = (str(a['ifcx::ocs::rowType']) || 'regel') as RowType;
    const qty = a['bsi::ifc::prop::Quantity'];
    const quantity = qty && typeof qty === 'object' ? numOrNull((qty as Record<string, unknown>).value) : null;
    const unitStr = (qty && typeof qty === 'object' ? str((qty as Record<string, unknown>).unit) : '') || str(a['ifcx::ocs::unit']);
    const norm = (a['ifcx::ocs::normCalculation'] ?? {}) as Record<string, unknown>;
    const verr = str(a['ifcx::ocs::verrekenbaar']);
    const verrekenbaar = verr === 'V' || verr === 'A' || verr === 'N' || verr === 'F' ? verr : null;
    const tg = str(a['ifcx::ocs::tariefGroep']);
    const tariefGroep = tg === 'A' || tg === 'B' || tg === 'C' ? tg : null;
    const btw = str(a['ifcx::ocs::btwTarief']);

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
      notes: str(a['ifcx::ocs::notes']),
      ...(btw === 'hoog' || btw === 'laag' ? { btwTarief: btw } : {}),
      ...(str(a['ifcx::ocs::branchId']) ? { branchId: str(a['ifcx::ocs::branchId']) } : {}),
    };
    // Alleen een bestaande ifcGuid overnemen; anders laat makeCostItem er één genereren.
    const guid = str(a['ifcx::ocs::ifcGuid']);
    if (guid) partial.ifcGuid = guid;

    const item = makeCostItem(partial);
    items.push(item);

    for (const child of orderedChildren(node)) walk(child, item.id, depth + 1);
  };

  for (const node of orderedChildren(scheduleNode)) walk(node, null, 0);

  if (items.length === 0) warnings.push(uiText("diagnostics.ifcxImporter.theIfcxFileContainsNoCostItems", "The ifcx file contains no cost items."));

  return { schedule, items, warnings, format: 'ifcx' };
}
