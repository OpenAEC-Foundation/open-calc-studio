import { createPdfQuantityResolver } from '@/services/pdf/pdfWorkspace';
import { variantCalculatedItems } from '@/services/grid/variantTotals';
import { effectiveTarieven } from '@/services/calculation/calculator';
import type { CostItem } from '@/types/costModel';
import { getQuantityOrigin, type QuantityOriginContext, type QuantityOriginInfo } from '@/services/quantity/quantityOrigin';

export type ReviewCategory = 'price' | 'source' | 'unit';
export type ReviewFilter = 'all' | ReviewCategory;
export type ReviewCode = 'missing-price' | 'missing-source' | 'unchecked-excel' | 'unverified-source' | 'different-quantity' | 'unit-mismatch';
export interface BudgetReviewIssue {
  id: string;
  itemId: string;
  number: string;
  description: string;
  category: ReviewCategory;
  code: ReviewCode;
  severity: 'error' | 'warning' | 'info';
  quantity: number | null;
  unit: string;
  source?: Pick<QuantityOriginInfo, 'source' | 'label' | 'sources' | 'value' | 'unit' | 'currentValue'>;
}
export interface BudgetReviewReport {
  issues: BudgetReviewIssue[];
  counts: Record<ReviewFilter, number>;
  rowCount: number;
  affectedRows: number;
}
export interface BudgetReviewContext extends QuantityOriginContext { items: CostItem[] }

/** Read-only diagnostics: zero prices are explicit prices, not missing prices.
 * No PDF bytes, geometry, spreadsheet contents or input mutation; with an active variant
 * the totals are recalculated on a copy of that variant's rows only.
 */
export function reviewBudget(input: BudgetReviewContext): BudgetReviewReport {
  const context = { ...input, pdfResolver: createPdfQuantityResolver(input.schedule.pdfWorkspace) };
  // Totalen over alleen de gekozen variant, net als het grid (knownbug 12).
  const rows = variantCalculatedItems(context.items, context.schedule), byId = new Map(rows.map(item => [item.id, item]));
  const isCostRow = (item: CostItem) => item.rowType === 'regel' || item.rowType === 'begrotingspost' || item.rowType === 'bewakingspost';
  const costRows = rows.filter(isCostRow);
  const children = new Map<string, CostItem[]>();
  for (const item of costRows) {
    if (!item.parentId) continue;
    const list = children.get(item.parentId);
    if (list) list.push(item); else children.set(item.parentId, [item]);
  }
  const tarieven = effectiveTarieven(context.schedule);
  // Bij een normregel met tariefgroep is het loon afgeleid; een groep zonder
  // tarief maakt dat loon 0, en dat is geen ingevulde prijs (knownbug 14).
  const derivedLabor = (item: CostItem) => item.rowType === 'regel' && item.normQuantity != null && !!item.tariefGroep;
  const hasOwnPrice = (item: CostItem) => {
    if (derivedLabor(item) && Number.isFinite(tarieven[item.tariefGroep!])) return true;
    const inputs = item.rowType === 'regel' ? [item.normUnitPrice, derivedLabor(item) ? null : item.laborPrice] : [item.normUnitPrice, item.materialPrice, item.laborPrice];
    return inputs.some(value => value != null && Number.isFinite(value));
  };
  const isExempt = (item: CostItem) => item.unit === 'pm' || item.quantity == null || item.quantity === 0;
  // Een lege onderliggende regel (geen hoeveelheid, geen prijs, geen pm) dekt
  // de post erboven niet: anders telde de post stil op tot € 0 (knownbug 11).
  const coverMemo = new Map<string, boolean>();
  const covers = (item: CostItem): boolean => {
    let result = coverMemo.get(item.id);
    if (result === undefined) {
      coverMemo.set(item.id, false);
      result = !(item.quantity == null || item.quantity === 0) || item.unit === 'pm' || hasOwnPrice(item) || (children.get(item.id) ?? []).some(covers);
      coverMemo.set(item.id, result);
    }
    return result;
  };
  // Leveren de onderliggende regels samen niets op, dan telt de eigen prijs
  // van de post (calculator: `childSum === 0`). Lege regels eronder zijn dan
  // geen fout (knownbug 13).
  const carriedByPost = (item: CostItem) => {
    const seen = new Set<string>();
    for (let parent = item.parentId ? byId.get(item.parentId) : undefined; parent && !seen.has(parent.id); parent = parent.parentId ? byId.get(parent.parentId) : undefined) {
      seen.add(parent.id);
      if (!isCostRow(parent)) break;
      const childSum = (children.get(parent.id) ?? []).reduce((sum, child) => sum + (child.total ?? 0), 0);
      if (childSum === 0 && !isExempt(parent) && hasOwnPrice(parent)) return true;
    }
    return false;
  };
  const issues: BudgetReviewIssue[] = [];
  const origins = new Map<string, QuantityOriginInfo>();
  const add = (item: CostItem, code: ReviewCode, category: ReviewCategory, severity: BudgetReviewIssue['severity'], origin?: QuantityOriginInfo) => {
    issues.push({ id: `${item.id}:${code}`, itemId: item.id, number: item.nr || item.code, description: item.description, code, category, severity, quantity: item.quantity, unit: item.unit,
      ...(origin ? { source: { source: origin.source, label: origin.label, sources: origin.sources, value: origin.value, unit: origin.unit, currentValue: origin.currentValue } } : {}) });
  };
  for (const item of costRows) {
    const coveredByChildren = (children.get(item.id) ?? []).some(covers);
    if (!coveredByChildren && !isExempt(item) && !hasOwnPrice(item) && !carriedByPost(item)) add(item, 'missing-price', 'price', 'warning');
    if (!item.quantityLink && !item.excelLink) continue;
    const key = JSON.stringify([item.quantityLink, item.excelLink, item.quantity, item.unit, item.quantityOrigin]);
    let origin = origins.get(key);
    if (!origin) { origin = getQuantityOrigin(item, context); origins.set(key, origin); }
    if (origin.source === 'excel') add(item, 'unchecked-excel', 'source', 'info', origin);
    else if (origin.status === 'missing') add(item, 'missing-source', 'source', 'error', origin);
    else if (origin.status === 'different') add(item, 'different-quantity', 'source', 'warning', origin);
    if (origin.verified === false && origin.status !== 'missing') add(item, 'unverified-source', 'source', 'warning', origin);
    if (origin.unitMismatch) add(item, 'unit-mismatch', 'unit', 'warning', origin);
  }
  const priority = { error: 0, warning: 1, info: 2 };
  issues.sort((a, b) => priority[a.severity] - priority[b.severity]);
  return { issues, counts: { all: issues.length, price: issues.filter(i => i.category === 'price').length, source: issues.filter(i => i.category === 'source').length, unit: issues.filter(i => i.category === 'unit').length },
    rowCount: rows.filter(item => !item.rowType.startsWith('staart_')).length, affectedRows: new Set(issues.map(issue => issue.itemId)).size };
}
