import type { CostItem, CostSchedule, PriceOrigin, ResourceLibraryItem } from '@/types/costModel';
import { getGrandTotal, recalculateItems } from '@/services/calculation/calculator';
import { variantItems } from '@/services/grid/variantScope';
import { appendHistory } from '@/services/history/itemHistory';

export function capturePriceOrigin(article: ResourceLibraryItem, currency: string): PriceOrigin {
  if (article.defaultUnitPrice == null || !Number.isFinite(article.defaultUnitPrice) || article.defaultUnitPrice < 0) throw Error('A verified numeric price is required.');
  if (article.unitSupported === false) throw Error('Convert the source unit first.');
  if (article.currency && article.currency !== currency) throw Error('Catalogue and estimate currencies differ.');
  return { itemId: article.id, catalogueId: article.catalogueId ?? article.source ?? 'legacy', catalogueVersion: article.catalogueVersion ?? 'unversioned',
    source: article.source ?? '', priceDate: article.priceDate ?? null, currency, unit: article.unit,
    price: article.defaultUnitPrice, appliedAt: new Date().toISOString(), locked: false };
}
export type PriceUpdateStatus = 'changed' | 'unchanged' | 'unmatched' | 'ambiguous' | 'override' | 'inactive' | 'unit' | 'currency' | 'missing-price' | 'tariff';
export interface PriceUpdateRow { itemId: string; description: string; before: number | null; after: number | null; status: PriceUpdateStatus; article?: ResourceLibraryItem }
export interface PriceUpdatePlan { rows: PriceUpdateRow[]; beforeTotal: number; afterTotal: number; chapters: { id: string; description: string; before: number; after: number }[] }

/** Read-only preview; never infer matches from a similar description or list position. */
export function previewPriceUpdates(items: CostItem[], schedule: CostSchedule, catalogue: ResourceLibraryItem[]): PriceUpdatePlan {
  const byId = new Map<string, ResourceLibraryItem[]>();
  for (const article of catalogue) { const group = byId.get(article.id) ?? []; group.push(article); byId.set(article.id, group); }
  const active = new Set(variantItems(items, schedule).map(item => item.id));
  const rows = items.filter(item => item.priceOrigin || item.resourceLibraryId).map(item => {
    const matches = byId.get(item.priceOrigin?.itemId ?? item.resourceLibraryId!) ?? [];
    const article = matches.length === 1 ? matches[0] : undefined;
    const origin = item.priceOrigin;
    let status: PriceUpdateStatus;
    if (!active.has(item.id)) status = 'inactive';
    else if (!origin || !matches.length) status = 'unmatched';
    else if (matches.length > 1) status = 'ambiguous';
    else if (item.tariefGroep) status = 'tariff';
    else if (origin.locked || item.normUnitPrice !== origin.price) status = 'override';
    else if (article!.unitSupported === false || item.unit !== article!.unit || origin.unit !== article!.unit) status = 'unit';
    else if (!article!.currency || article!.currency !== schedule.currency || origin.currency !== schedule.currency) status = 'currency';
    else if (article!.defaultUnitPrice == null || !Number.isFinite(article!.defaultUnitPrice) || article!.defaultUnitPrice! < 0) status = 'missing-price';
    else status = article!.defaultUnitPrice === item.normUnitPrice ? 'unchanged' : 'changed';
    return { itemId: item.id, description: item.description, before: item.normUnitPrice, after: article?.defaultUnitPrice ?? null, status, article };
  });
  const updated = applyPriceUpdateRows(items, schedule, rows, rows.filter(row => row.status === 'changed').map(row => row.itemId));
  const before = recalculateItems(variantItems(items, schedule), schedule.tarieven);
  const after = recalculateItems(variantItems(updated, schedule), schedule.tarieven);
  const next = new Map(after.map(item => [item.id, item]));
  return { rows, beforeTotal: getGrandTotal(before), afterTotal: getGrandTotal(after),
    chapters: before.filter(item => item.rowType === 'chapter' && item.depth === 0).map(item => ({ id: item.id, description: item.description, before: item.total, after: next.get(item.id)?.total ?? item.total })) };
}

export function applyPriceUpdateRows(items: CostItem[], schedule: CostSchedule, rows: PriceUpdateRow[], selected: string[]): CostItem[] {
  const ids = new Set(selected), updates = new Map(rows.map(row => [row.itemId, row]));
  for (const id of ids) if (updates.get(id)?.status !== 'changed') throw Error('Only reviewed, compatible price changes can be applied.');
  const now = Date.now();
  return recalculateItems(items.map(item => {
    if (!ids.has(item.id)) return item;
    const row = updates.get(item.id)!;
    if (item.normUnitPrice !== row.before || !row.article) throw Error('The estimate changed. Create a new preview.');
    return { ...item, normUnitPrice: row.after, priceOrigin: capturePriceOrigin(row.article, schedule.currency),
      history: appendHistory(item, 'normUnitPrice', item.normUnitPrice, row.after, 'catalogue', now) };
  }), schedule.tarieven);
}

/** Embed only the source articles actually used in this estimate. */
export function usedPriceArticles(items: CostItem[]): ResourceLibraryItem[] {
  const articles = new Map<string, ResourceLibraryItem>();
  const dates = new Map<string, string>();
  for (const item of items) if (item.priceOrigin) {
    const p = item.priceOrigin;
    const key = p.itemId;
    if ((dates.get(key) ?? '') > p.appliedAt) continue;
    dates.set(key, p.appliedAt);
    articles.set(key, { id: p.itemId, catalogueId: p.catalogueId, catalogueVersion: p.catalogueVersion, currency: p.currency,
      source: p.source, priceDate: p.priceDate, code: item.code, description: item.description, unit: p.unit,
      resourceType: item.resourceType ?? 'overig', defaultUnitPrice: p.price, category: '' });
  }
  return [...articles.values()];
}
