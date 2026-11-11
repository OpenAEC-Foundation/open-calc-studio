import type { CostItem, CostSchedule } from '@/types/costModel';
import { variantCalculatedItems } from '@/services/grid/variantTotals';
import { uuid4 } from './ifcxJsonGenerator';

/**
 * Export in het gedeelde OpenAEC-kostenprofiel (`openaec::cost::estimateItem`, issue #69).
 *
 * Eén `estimateItem` per post met een bedrag: de bovenste kostenrij onder de
 * hoofdstukken (begrotingspost, bewakingspost of een losse rekenregel). De
 * hoofdstukstructuur en de onderliggende regels gaan níet mee; daarvoor blijft
 * de volledige Calc-export (`ifcx::cost::…` / `ifcx::ocs::…`) bestaan.
 *
 * - `quantity` verwijst naar een `/quantities/…`-knoop als de hoeveelheid uit
 *   een IFCX-model komt; anders staat de hoeveelheid inline als
 *   `{ value, unit, formula? }` (vrije post).
 * - `unit` op de post is de tariefeenheid (`EUR/m³`), net als in de Explorer;
 *   de hoeveelheidseenheid staat bij de hoeveelheid.
 * - `total` is het regelbedrag afgerond op centen; `rate` is het oorspronkelijke
 *   brontarief als dat nog klopt, anders bedrag ÷ hoeveelheid.
 * - Een post zonder hoeveelheid maar met een bedrag wordt 1 `post`.
 * - Alleen de gekozen variant; geen staartkosten of btw (alleen directe kosten).
 */
export function generateOpenaecIfcx(schedule: CostSchedule, allItems: CostItem[]): string {
  const items = variantCalculatedItems(allItems, schedule);
  const currency = (schedule.currency || 'EUR').toUpperCase();
  const byId = new Map(items.map(item => [item.id, item]));
  const isCost = (item: CostItem) => item.rowType === 'begrotingspost' || item.rowType === 'bewakingspost' || item.rowType === 'regel';
  const hasCostAncestor = (item: CostItem) => {
    const seen = new Set<string>();
    for (let parent = item.parentId ? byId.get(item.parentId) : undefined; parent && !seen.has(parent.id); parent = parent.parentId ? byId.get(parent.parentId) : undefined) {
      seen.add(parent.id);
      if (isCost(parent)) return true;
    }
    return false;
  };
  const cents = (n: number) => Math.round(n * 100) / 100;
  const usedPaths = new Set<string>();
  const unique = (base: string) => { let path = base, n = 2; while (usedPaths.has(path)) path = `${base}-${n++}`; usedPaths.add(path); return path; };
  const segment = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'item';

  const data: Record<string, unknown>[] = [];
  for (const item of items) {
    if (!isCost(item) || hasCostAncestor(item)) continue;
    const total = cents(item.total ?? 0);
    const hasQuantity = item.quantity != null && item.quantity !== 0;
    if (!hasQuantity && total === 0) continue;
    const value = hasQuantity ? item.quantity! : 1;
    const unit = hasQuantity ? item.unit : 'post';
    const notes = parseNotes(item.notes);
    const sourceRate = typeof notes.sourceRate === 'number' && Number.isFinite(notes.sourceRate) ? notes.sourceRate : null;
    const rate = sourceRate != null && notes.sourceRateUnit === `${currency}/${unit}` && Math.round(value * sourceRate * 100) === Math.round(total * 100)
      ? sourceRate : value !== 0 ? total / value : 0;

    const path = unique(item.id.startsWith('/') ? item.id : `/estimates/${segment(item.id)}`);
    const sources = item.quantityOrigin?.sources ?? [];
    const quantityRef = sources.find(source => source.name === 'IFCX' && source.quantityKey === 'openaec::quantity.value')?.id;
    const formula = item.quantityOrigin?.formula || '';
    const quantity = { value, unit, ...(formula ? { formula } : {}) };
    let quantityAttr: string | typeof quantity = quantity;
    if (quantityRef && hasQuantity) {
      const quantityPath = unique(quantityRef);
      data.push({ path: quantityPath, attributes: { 'openaec::quantity': quantity } });
      quantityAttr = quantityPath;
    }
    const links = sources.filter(source => source.name === 'IFCX model reference').map(source => ({ relation: 'costs', target: source.id }));
    const label = [item.nr || item.code, item.description].filter(Boolean).join(' ').trim() || path;
    data.push({
      path,
      attributes: {
        'openaec::label': label,
        'openaec::cost::estimateItem': {
          quantity: quantityAttr, rate, total, currency, unit: `${currency}/${unit}`,
          ...(typeof notes.status === 'string' ? { status: notes.status } : {}),
          ...(notes.assumption != null ? { assumption: notes.assumption } : {}),
        },
        ...(links.length ? { 'openaec::links': links } : {}),
      },
    });
  }
  // Hoeveelheidsknopen eerst, zodat de posten in volgorde blijven bij lezen.
  data.sort((a, b) => Number('openaec::cost::estimateItem' in (a.attributes as object)) - Number('openaec::cost::estimateItem' in (b.attributes as object)));

  return JSON.stringify({
    header: {
      id: uuid4(),
      version: 'ifcx_alpha',
      author: 'Open Calc Studio',
      timestamp: new Date().toISOString(),
      description: `OpenAEC shared cost export (openaec::cost::estimateItem, direct costs only): ${schedule.name}`,
    },
    imports: [],
    schemas: {},
    data,
  }, null, 2);
}

function parseNotes(notes: string | undefined): Record<string, unknown> {
  if (!notes || !notes.trimStart().startsWith('{')) return {};
  try { const parsed = JSON.parse(notes); return parsed && typeof parsed === 'object' ? parsed : {}; } catch { return {}; }
}
