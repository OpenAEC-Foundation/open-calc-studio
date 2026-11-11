import { recalculateItems } from '@/services/calculation/calculator';
import { variantItems } from './variantScope';
import type { CostItem, CostSchedule } from '@/types/costModel';

type VariantScope = Pick<CostSchedule, 'branchesEnabled' | 'activeBranchId' | 'branches'>;

const cache = new WeakMap<CostItem[], { key: string; result: CostItem[] }>();

/**
 * De rijen van de gekozen variant, met totalen die alleen over díé variant
 * zijn berekend.
 *
 * In de store staan de totalen over álle varianten: een post telde zo ook de
 * regels van een niet-gekozen variant mee, terwijl het grid die regels niet
 * toont en de controle ze niet ziet. Zonder actieve variant is er niets
 * weggefilterd en zijn de opgeslagen totalen al juist; dan komt dezelfde
 * array terug. Het uurloon wordt niet opnieuw uit de tarieven afgeleid
 * (geen `tarieven`-argument), zodat alleen de optelling verschilt.
 */
export function variantCalculatedItems(items: CostItem[], schedule: VariantScope): CostItem[] {
  const scoped = variantItems(items, schedule);
  if (scoped.length === items.length) return items;
  const key = JSON.stringify([schedule.activeBranchId, (schedule.branches ?? []).map(branch => [branch.id, branch.parentId])]);
  const hit = cache.get(items);
  if (hit && hit.key === key) return hit.result;
  const result = recalculateItems(scoped);
  cache.set(items, { key, result });
  return result;
}

/** Vervang rijen door hun variant-berekende versie (zelfde volgorde, zelfde ids). */
export function withVariantTotals(rows: CostItem[], items: CostItem[], schedule: VariantScope): CostItem[] {
  const calculated = variantCalculatedItems(items, schedule);
  if (calculated === items) return rows;
  const byId = new Map(calculated.map(item => [item.id, item]));
  return rows.map(row => byId.get(row.id) ?? row);
}
