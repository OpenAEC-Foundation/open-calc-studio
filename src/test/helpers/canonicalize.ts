import type { CostItem } from '@/types/costModel';

/**
 * Strip transient fields (UUIDs, sortOrder) and return a comparable shape.
 * Tree identity is captured via parent-code path instead of parent-id.
 */
export function canonicalize(items: CostItem[]): any[] {
  const byId = new Map(items.map((it) => [it.id, it]));
  const pathOf = (it: CostItem): string => {
    const parts: string[] = [];
    let cur: CostItem | undefined = it;
    while (cur) {
      parts.unshift(cur.code ?? cur.description ?? '');
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return parts.join(' > ');
  };
  return items
    .map((it) => ({
      path: pathOf(it),
      rowType: it.rowType,
      code: it.code,
      description: it.description,
      quantity: round(it.quantity),
      unit: it.unit,
      unitPrice: round(it.unitPrice),
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

function round(n: number | null | undefined, decimals = 2): number | undefined {
  if (n === undefined || n === null) return undefined;
  return Math.round(n * 10 ** decimals) / 10 ** decimals;
}
