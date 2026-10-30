import type { CostItem } from '@/types/costModel';
import { isFooterRow } from './gridRows';
export function selectedGridItems(rows: CostItem[], indices: number[]): CostItem[] {
  return [...new Set(indices)].map(index => rows[index]).filter((item): item is CostItem => !!item && !isFooterRow(item.id));
}
