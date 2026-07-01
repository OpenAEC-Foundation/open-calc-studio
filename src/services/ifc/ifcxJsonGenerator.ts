import type { CostItem, CostSchedule, OfferteDocument } from '@/types/costModel';
import { createDefaultProjectProperties } from '@/types/costModel';
import { getGrandTotal } from '@/services/calculation/calculator';

/**
 * IfcX JSON generator — IFC5-development (IfcX alpha) format
 *
 * Produces a hierarchical tree structure with:
 * - `path` based references instead of UUID refs
 * - `inherits` instead of `type`
 * - `attributes` with namespaced keys (bsi::ifc::prop::, ifcx::cost::, ifcx::ocs::)
 * - `children` instead of flat array + IfcRelNests
 * - No separate relationship entities
 *
 * Conforms to https://github.com/buildingSMART/IFC5-development
 */

/** Generate a UUID v4 string */
function uuid4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Map OCS resourceType to ifcx::cost::breakdown category */
function mapResourceTypeToBreakdownKey(rt: string | null): string {
  switch (rt) {
    case 'materiaal': return 'material';
    case 'arbeid': return 'labor';
    case 'materieel': return 'equipment';
    case 'onderaannemer': return 'subcontractor';
    default: return 'material';
  }
}

/** Map staart rowType to NEN 2699 phase */
function mapStagartToPhase(rowType: string): Record<string, unknown> | null {
  switch (rowType) {
    case 'staart_ukk':
      return {
        standard: 'NEN 2699:2017',
        phase: 'B',
        phaseName: 'Bouwkosten',
        subPhase: 'B3',
        subPhaseName: 'Uitvoeringskosten',
        investmentType: 'overhead',
        lifecyclePhase: 'construction',
      };
    case 'staart_ak':
      return {
        standard: 'NEN 2699:2017',
        phase: 'C',
        phaseName: 'Bijkomende kosten',
        subPhase: 'C1',
        subPhaseName: 'Algemene kosten',
        investmentType: 'overhead',
        lifecyclePhase: 'construction',
      };
    case 'staart_wr':
      return {
        standard: 'NEN 2699:2017',
        phase: 'C',
        phaseName: 'Bijkomende kosten',
        subPhase: 'C2',
        subPhaseName: 'Winst en risico',
        investmentType: 'profit',
        lifecyclePhase: 'construction',
      };
    default:
      return null;
  }
}

/** Sanitize a string for use in a path segment */
function pathSegment(s: string): string {
  return s.replace(/[^a-zA-Z0-9_\-. ]/g, '').trim() || 'unnamed';
}

// ── IfcX node types ──

interface IfcxNode {
  path: string;
  inherits: string[];
  attributes: Record<string, unknown>;
  children?: Record<string, IfcxNode>;
}

interface IfcxDocument {
  header: {
    id: string;
    version: string;
    author: string;
    timestamp: string;
    description: string;
  };
  imports: { uri: string }[];
  schemas: Record<string, unknown>;
  data: IfcxNode[];
}

/** Build the cost breakdown attribute for a non-chapter item */
function buildBreakdown(item: CostItem): Record<string, unknown> | null {
  const materialAmount = item.materialPrice ?? 0;
  const laborAmount = item.laborPrice ?? 0;
  const totalAmount = materialAmount + laborAmount;

  if (totalAmount <= 0) return null;

  const breakdown: Record<string, unknown> = {
    material: {
      amount: materialAmount,
      percentage: totalAmount > 0 ? Math.round((materialAmount / totalAmount) * 1000) / 10 : 0,
    },
    labor: {
      amount: laborAmount,
      percentage: totalAmount > 0 ? Math.round((laborAmount / totalAmount) * 1000) / 10 : 0,
    },
    equipment: { amount: 0, percentage: 0 },
    subcontractor: { amount: 0, percentage: 0 },
    total: totalAmount,
    unit: item.unit || 'st',
  };

  // For resource rows (regels), set the right breakdown category
  if (item.rowType === 'regel' && item.resourceType) {
    const key = mapResourceTypeToBreakdownKey(item.resourceType);
    if (key === 'equipment' || key === 'subcontractor') {
      (breakdown[key] as Record<string, unknown>).amount = materialAmount;
      (breakdown[key] as Record<string, unknown>).percentage =
        totalAmount > 0 ? Math.round((materialAmount / totalAmount) * 1000) / 10 : 0;
      (breakdown.material as Record<string, unknown>).amount = 0;
      (breakdown.material as Record<string, unknown>).percentage = 0;
    }
  }

  // For staart items, add surcharge info
  const isStagart = item.rowType.startsWith('staart_');
  if (isStagart && item.staartPercentage !== null) {
    (breakdown as Record<string, unknown>).surcharges = {
      [item.rowType.replace('staart_', '').toUpperCase()]: {
        percentage: item.staartPercentage,
        amount: item.total,
      },
    };
  }

  return breakdown;
}

/** Build an IfcX node for a single CostItem, recursively including children */
function buildCostItemNode(
  item: CostItem,
  parentPath: string,
  childrenByParent: Map<string, CostItem[]>,
): IfcxNode {
  const code = item.code || item.nr || item.id.slice(0, 8);
  const segment = pathSegment(code);
  const path = `${parentPath}/${segment}`;
  const isStagart = item.rowType.startsWith('staart_');

  const attributes: Record<string, unknown> = {
    'bsi::ifc::prop::Name': item.code || '',
    'bsi::ifc::prop::Description': item.description || '',
    'ifcx::ocs::rowType': item.rowType,
    'ifcx::ocs::ifcGuid': item.ifcGuid,
  };

  // Quantity
  if (item.quantity != null && item.quantity !== 0) {
    attributes['bsi::ifc::prop::Quantity'] = {
      value: item.quantity,
      unit: item.unit || 'st',
    };
  }

  // Cost breakdown for non-chapter items
  if (item.rowType !== 'chapter') {
    const breakdown = buildBreakdown(item);
    if (breakdown) {
      attributes['ifcx::cost::breakdown'] = breakdown;
    }

    // Unit prices
    if (item.materialPrice != null && item.materialPrice !== 0) {
      attributes['ifcx::cost::materialPrice'] = item.materialPrice;
    }
    if (item.laborPrice != null && item.laborPrice !== 0) {
      attributes['ifcx::cost::laborPrice'] = item.laborPrice;
    }
    if (item.unitPrice !== 0) {
      attributes['ifcx::cost::unitPrice'] = item.unitPrice;
    }
    if (item.total !== 0) {
      attributes['ifcx::cost::total'] = item.total;
    }
  }

  // NEN 2699 phase for staart items
  if (isStagart) {
    const phase = mapStagartToPhase(item.rowType);
    if (phase) {
      attributes['ifcx::cost::phase'] = phase;
    }
    if (item.staartPercentage !== null) {
      attributes['ifcx::cost::staartPercentage'] = item.staartPercentage;
    }
  }

  // Norm calculation fields (for 'regel' rows)
  if (item.rowType === 'regel') {
    if (item.normQuantity != null || item.normFactor != null || item.normDivisor != null || item.normUnitPrice != null) {
      attributes['ifcx::ocs::normCalculation'] = {
        ...(item.normQuantity != null ? { quantity: item.normQuantity } : {}),
        ...(item.normFactor != null ? { factor: item.normFactor } : {}),
        ...(item.normDivisor != null ? { divisor: item.normDivisor } : {}),
        ...(item.normUnitPrice != null ? { unitPrice: item.normUnitPrice } : {}),
      };
    }
  }

  // Optional OCS properties
  if (item.tariefGroep) {
    attributes['ifcx::ocs::tariefGroep'] = item.tariefGroep;
  }
  if (item.resourceType) {
    attributes['ifcx::ocs::resourceType'] = item.resourceType;
  }
  if (item.verrekenbaar) {
    attributes['ifcx::ocs::verrekenbaar'] = item.verrekenbaar;
  }

  const node: IfcxNode = {
    path,
    inherits: ['IfcCostItem'],
    attributes,
  };

  // Recurse into children
  const children = childrenByParent.get(item.id);
  if (children && children.length > 0) {
    node.children = {};
    const sorted = [...children].sort((a, b) => a.sortOrder - b.sortOrder);
    const usedKeys = new Set<string>();
    for (const child of sorted) {
      const base = pathSegment(child.code || child.nr || child.id.slice(0, 8));
      let childKey = base;
      let n = 1;
      while (usedKeys.has(childKey)) childKey = `${base}_${++n}`;
      usedKeys.add(childKey);
      node.children[childKey] = buildCostItemNode(child, path, childrenByParent);
    }
  }

  return node;
}

export function generateIfcxJson(
  schedule: CostSchedule,
  items: CostItem[],
  offerte?: OfferteDocument,
): string {
  const projectName = pathSegment(schedule.projectName || schedule.name || 'Project');
  const scheduleName = pathSegment(schedule.name || 'CostSchedule');

  // Build parent->children map
  const childrenByParent = new Map<string, CostItem[]>();
  for (const item of items) {
    if (item.parentId) {
      const list = childrenByParent.get(item.parentId) ?? [];
      list.push(item);
      childrenByParent.set(item.parentId, list);
    }
  }

  // Top-level items (no parent)
  const topLevelItems = items
    .filter(i => i.parentId === null)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  // Build schedule attributes
  const scheduleAttributes: Record<string, unknown> = {
    'bsi::ifc::prop::Name': schedule.name,
    'bsi::ifc::prop::Description': schedule.description || '',
    'bsi::ifc::prop::PredefinedType': schedule.predefinedType,
    'bsi::ifc::prop::Status': schedule.status,
    'bsi::ifc::prop::Identification': schedule.projectNumber || '',
    'ifcx::cost::currency': {
      currency: schedule.currency || 'EUR',
      vatRate: 21,
      vatIncluded: false,
    },
  };

  // Tarieven metadata
  if (schedule.tarieven && Object.keys(schedule.tarieven).length > 0) {
    scheduleAttributes['ifcx::cost::metadata'] = {
      tarieven: schedule.tarieven,
      uitvoeringskosten: schedule.uitvoeringskosten,
      algemeneKosten: schedule.algemeneKosten,
      winstRisico: schedule.winstRisico,
    };
  }

  // Build cost item children for the schedule
  const costItemChildren: Record<string, IfcxNode> = {};
  const schedulePath = `/Project/${projectName}/CostSchedules/${scheduleName}`;

  const usedTopKeys = new Set<string>();
  for (const item of topLevelItems) {
    const base = pathSegment(item.code || item.nr || item.id.slice(0, 8));
    let key = base;
    let n = 1;
    while (usedTopKeys.has(key)) key = `${base}_${++n}`;
    usedTopKeys.add(key);
    costItemChildren[key] = buildCostItemNode(
      item,
      `${schedulePath}/CostItems`,
      childrenByParent,
    );
  }

  // Build schedule node
  const scheduleNode: IfcxNode = {
    path: schedulePath,
    inherits: ['IfcCostSchedule'],
    attributes: scheduleAttributes,
  };
  if (Object.keys(costItemChildren).length > 0) {
    scheduleNode.children = costItemChildren;
  }

  // ── Project metrics (building metrics / kengetallen) ──
  const projectProps = schedule.projectProperties ?? createDefaultProjectProperties();
  const grandTotal = getGrandTotal(items);
  const metricsObj: Record<string, unknown> = {};
  for (const prop of projectProps) {
    if (prop.value != null) {
      const key = prop.name.replace(/\s+/g, '_');
      const pricePerUnit = prop.value > 0 && grandTotal > 0 ? grandTotal / prop.value : null;
      metricsObj[key] = {
        value: prop.value,
        unit: prop.unit,
        ...(pricePerUnit != null ? { pricePerUnit: Math.round(pricePerUnit * 100) / 100 } : {}),
      };
    }
  }

  // Build project node
  const projectAttributes: Record<string, unknown> = {
    'bsi::ifc::prop::Name': schedule.projectName || schedule.name,
    'bsi::ifc::prop::Description': schedule.description || '',
    'bsi::ifc::prop::Author': schedule.author || '',
    'bsi::ifc::prop::Client': schedule.client || '',
  };

  if (Object.keys(metricsObj).length > 0) {
    projectAttributes['ifcx::ocs::projectMetrics'] = metricsObj;
  }

  const projectNode: IfcxNode = {
    path: `/Project/${projectName}`,
    inherits: ['IfcProject'],
    attributes: projectAttributes,
    children: {
      CostSchedules: scheduleNode,
    },
  };

  // Add offerte data if available
  if (offerte) {
    const offerteAttributes: Record<string, unknown> = {
      'ifcx::contract::quote': {
        status: 'draft',
        offerteNummer: offerte.offerteNummer,
        offerteDatum: offerte.offerteDatum,
        geldigheid: offerte.geldigheid,
        type: offerte.type,
      },
    };

    if (offerte.geadresseerde) {
      offerteAttributes['ifcx::contract::recipient'] = offerte.geadresseerde;
    }

    if (offerte.betalingstermijnen && offerte.betalingstermijnen.length > 0) {
      offerteAttributes['ifcx::contract::paymentSchedule'] = {
        milestones: offerte.betalingstermijnen.map(t => ({
          description: t.beschrijving,
          percentage: t.percentage,
          notes: t.toelichting,
        })),
      };
    }

    if (offerte.garanties && offerte.garanties.length > 0) {
      offerteAttributes['ifcx::contract::warranties'] = offerte.garanties.map(g => ({
        component: g.onderdeel,
        term: g.termijn,
        notes: g.toelichting,
        linkedCostItemIds: g.linkedCostItemIds,
      }));
    }

    if (offerte.voorwaarden) {
      offerteAttributes['ifcx::contract::conditions'] = {
        text: offerte.voorwaarden,
      };
    }

    // Add offerte as sibling to CostSchedules
    if (!projectNode.children) projectNode.children = {};
    projectNode.children['Offerte'] = {
      path: `/Project/${projectName}/Offerte`,
      inherits: ['IfcApproval'],
      attributes: offerteAttributes,
    };
  }

  const doc: IfcxDocument = {
    header: {
      id: uuid4(),
      version: 'ifcx_alpha',
      author: 'Open Calc Studio',
      timestamp: new Date().toISOString(),
      description: `Cost schedule export: ${schedule.name}`,
    },
    imports: [
      { uri: 'https://ifcx.dev/@standards.buildingsmart.org/ifc/core/ifc@v5a.ifcx' },
    ],
    schemas: {},
    data: [projectNode],
  };

  return JSON.stringify(doc, null, 2);
}
