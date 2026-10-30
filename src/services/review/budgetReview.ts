import { createPdfQuantityResolver } from '@/services/pdf/pdfWorkspace';
import { variantItems } from '@/services/grid/variantScope';
import type { CostItem } from '@/types/costModel';
import { getQuantityOrigin, type QuantityOriginContext, type QuantityOriginInfo } from '@/services/quantity/quantityOrigin';

export type ReviewCategory = 'price' | 'source' | 'unit';
export type ReviewFilter = 'all' | ReviewCategory;
export type ReviewCode = 'missing-price' | 'missing-source' | 'unchecked-excel' | 'different-quantity' | 'unit-mismatch';
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
 * No PDF bytes, geometry, spreadsheet contents, recalculation or input mutation.
 */
export function reviewBudget(input: BudgetReviewContext): BudgetReviewReport {
  const context = { ...input, pdfResolver: createPdfQuantityResolver(input.schedule.pdfWorkspace) };
  const rows = variantItems(context.items, context.schedule), byId = new Map(rows.map(item => [item.id, item]));
  const costRows = rows.filter(item => ['regel', 'begrotingspost', 'bewakingspost'].includes(item.rowType));
  const parentsWithCosts = new Set<string>();
  for (const item of costRows) {
    let parent = item.parentId;
    while (parent && !parentsWithCosts.has(parent)) { parentsWithCosts.add(parent); parent = byId.get(parent)?.parentId ?? null; }
  }
  const issues: BudgetReviewIssue[] = [];
  const origins = new Map<string, QuantityOriginInfo>();
  const add = (item: CostItem, code: ReviewCode, category: ReviewCategory, severity: BudgetReviewIssue['severity'], origin?: QuantityOriginInfo) => {
    issues.push({ id: `${item.id}:${code}`, itemId: item.id, number: item.nr || item.code, description: item.description, code, category, severity, quantity: item.quantity, unit: item.unit,
      ...(origin ? { source: { source: origin.source, label: origin.label, sources: origin.sources, value: origin.value, unit: origin.unit, currentValue: origin.currentValue } } : {}) });
  };
  for (const item of costRows) {
    if (!parentsWithCosts.has(item.id) && item.unit !== 'pm' && item.quantity != null && item.quantity !== 0) {
      const inputs = item.rowType === 'regel' ? [item.normUnitPrice, item.laborPrice] : [item.normUnitPrice, item.materialPrice, item.laborPrice];
      const hasTariff = item.rowType === 'regel' && item.normQuantity != null && item.tariefGroep && Number.isFinite(context.schedule.tarieven?.[item.tariefGroep]);
      if (!hasTariff && !inputs.some(value => value != null && Number.isFinite(value))) add(item, 'missing-price', 'price', 'warning');
    }
    if (!item.quantityLink && !item.excelLink) continue;
    const key = JSON.stringify([item.quantityLink, item.excelLink, item.quantity, item.unit, item.quantityOrigin]);
    let origin = origins.get(key);
    if (!origin) { origin = getQuantityOrigin(item, context); origins.set(key, origin); }
    if (origin.source === 'excel') add(item, 'unchecked-excel', 'source', 'info', origin);
    else if (origin.status === 'missing') add(item, 'missing-source', 'source', 'error', origin);
    else if (origin.status === 'different') add(item, 'different-quantity', 'source', 'warning', origin);
    if (origin.unitMismatch) add(item, 'unit-mismatch', 'unit', 'warning', origin);
  }
  const priority = { error: 0, warning: 1, info: 2 };
  issues.sort((a, b) => priority[a.severity] - priority[b.severity]);
  return { issues, counts: { all: issues.length, price: issues.filter(i => i.category === 'price').length, source: issues.filter(i => i.category === 'source').length, unit: issues.filter(i => i.category === 'unit').length },
    rowCount: rows.filter(item => !item.rowType.startsWith('staart_')).length, affectedRows: new Set(issues.map(issue => issue.itemId)).size };
}
