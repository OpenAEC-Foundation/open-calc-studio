import type { CostItem, CostSchedule } from '@/types/costModel';
export function variantItems(items: CostItem[], schedule: Pick<CostSchedule, 'branchesEnabled' | 'activeBranchId' | 'branches'>): CostItem[] {
  if (!schedule.branchesEnabled || !schedule.activeBranchId) return items;
  const branches = new Map((schedule.branches ?? []).map(branch => [branch.id, branch]));
  const allowed = new Set<string>(['main']);
  const visited = new Set<string>();
  let id: string | null | undefined = schedule.activeBranchId;
  while (id && !visited.has(id)) { visited.add(id); allowed.add(id); id = branches.get(id)?.parentId; }
  return items.filter(item => allowed.has(item.branchId ?? 'main'));
}
