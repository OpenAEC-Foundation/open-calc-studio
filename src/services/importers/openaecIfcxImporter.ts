import { makeCostItem, normalizeUnit } from './core';
import type { ImportResult } from './types';

export interface SharedIfcxNode {
  path?: string;
  attributes?: Record<string, unknown>;
  children?: Record<string, SharedIfcxNode>;
}
const object = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const text = (v: unknown): string => typeof v === 'string' ? v : '';
function finite(v: unknown, path: string, field: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`IFCX ${path}: invalid ${field}.`);
  return v;
}

/** Read-only interoperability profile. No remote imports, geometry inference or export migration. */
export function importOpenaecIfcx(data: SharedIfcxNode[]): ImportResult | null {
  const nodes = new Map<string, SharedIfcxNode>();
  const rows: SharedIfcxNode[] = [];
  const visit = (node: SharedIfcxNode) => {
    if (node.attributes?.['openaec::cost::costItem'] || Object.keys(node.attributes ?? {}).some(key => key.startsWith('ifcx::cost::'))) {
      throw new Error('IFCX: mixed cost profiles are not supported; import an estimateItem-only cost document to avoid omitting rows.');
    }
    if (node.path) {
      if (nodes.has(node.path)) throw new Error(`IFCX: duplicate path ${node.path}; compose the document before importing.`);
      nodes.set(node.path, node);
    }
    if (node.attributes?.['openaec::cost::estimateItem']) rows.push(node);
    for (const child of Object.values(node.children ?? {})) visit(child);
  };
  // First detect the profile: legacy IFCX remains on its existing reader.
  const hasShared = (node: SharedIfcxNode): boolean => !!node.attributes?.['openaec::cost::estimateItem']
    || Object.values(node.children ?? {}).some(hasShared);
  if (!data.some(hasShared)) return null;
  data.forEach(visit);
  let currency = '';
  const items = rows.map((node, index) => {
    const path = text(node.path);
    if (!path) throw new Error('IFCX estimateItem: missing path.');
    const attrs = node.attributes ?? {};
    const cost = object(attrs['openaec::cost::estimateItem']);
    // `quantity` is a reference to a quantity node, or (free item without a
    // model quantity) an inline `{ value, unit, formula? }` object.
    const inline = cost.quantity && typeof cost.quantity === 'object' && !Array.isArray(cost.quantity);
    const quantityPath = inline ? '' : text(cost.quantity);
    const quantity = inline ? object(cost.quantity) : object(nodes.get(quantityPath)?.attributes?.['openaec::quantity']);
    if (!inline && (!quantityPath || !nodes.has(quantityPath))) {
      throw new Error(`IFCX ${path}: unresolved quantity ${quantityPath || '(missing)'}. Include the referenced quantity nodes in the same IFCX document, or give an inline { value, unit } quantity; remote imports are not fetched.`);
    }
    const value = finite(quantity.value, path, 'quantity');
    const rate = finite(cost.rate, path, 'rate');
    const total = finite(cost.total, path, 'total');
    const code = text(cost.currency).trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(code) || (currency && currency !== code)) throw new Error(`IFCX ${path}: missing or mixed currency; no exchange rate is assumed.`);
    currency = code;
    const unit = text(quantity.unit);
    const normalizedUnit = normalizeUnit(unit);
    // normalizeUnit defaults unknown units to st: never silently reinterpret an external quantity.
    if (!unit || (normalizedUnit === 'st' && !['st', 'stk', 'stl', 'stuk', 'stuks'].includes(unit.toLowerCase()))) {
      throw new Error(`IFCX ${path}: unsupported quantity unit ${unit}.`);
    }
    if (text(cost.unit) !== `${code}/${unit}`) throw new Error(`IFCX ${path}: rate unit does not match currency / quantity unit.`);
    if (Math.abs(Math.round(value * rate * 100) - Math.round(total * 100)) > 0 || (value === 0 && total !== 0)) {
      throw new Error(`IFCX ${path}: total does not match quantity × rate rounded to cents.`);
    }
    const links = Array.isArray(attrs['openaec::links']) ? attrs['openaec::links'] : [];
    const targets = [...new Set(links.map(link => text(object(link).target)).filter(Boolean))];
    const label = text(attrs['openaec::label']) || path;
    // Preserve the source's rounded amount after recalculation, as Explorer's adapter does.
    const nativeRate = value !== 0 ? total / value : rate;
    const sources = [
      ...(quantityPath ? [{ id: quantityPath, name: 'IFCX', quantityKey: 'openaec::quantity.value' }] : []),
      ...targets.map(target => ({ id: target, name: 'IFCX model reference' })),
    ];
    return makeCostItem({
      id: path, rowType: 'begrotingspost', sortOrder: index, code: String(index + 1),
      description: label, quantity: value, unit: normalizedUnit, normUnitPrice: nativeRate,
      unitPrice: nativeRate, total,
      // A typed (inline) quantity without model links is an ordinary free item.
      ...(sources.length ? { quantityOrigin: { source: 'ifc' as const, label, verified: false, value, unit: normalizedUnit,
        formula: text(quantity.formula), sources } } : {}),
      notes: JSON.stringify({ ifcx: { document: path, quantity: quantityPath || 'inline', elements: targets },
        sourceRate: rate, sourceRateUnit: cost.unit, sourceRoundedAmount: total,
        status: cost.status, assumption: cost.assumption,
        rounding: 'Native rate = rounded source amount / quantity. Source rate retained in notes.' }),
    });
  });
  return { format: 'ifcx', items, schedule: { name: 'OpenAEC IFCX', currency, directCostsOnly: true },
    warnings: ['OpenAEC IFCX import: model references and source rates are retained. Quantities are captured values, not live model links. Only direct costs are included; review assumptions before use.'] };
}
