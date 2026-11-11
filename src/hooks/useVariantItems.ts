import { useMemo } from 'react';
import { useAppStore } from '@/state/appStore';
import { variantCalculatedItems } from '@/services/grid/variantTotals';

/** Rijen van de gekozen variant met totalen over alleen die variant (zie `variantCalculatedItems`). */
export function useVariantItems() {
  const items = useAppStore(s => s.items);
  const branchesEnabled = useAppStore(s => s.schedule.branchesEnabled);
  const activeBranchId = useAppStore(s => s.schedule.activeBranchId);
  const branches = useAppStore(s => s.schedule.branches);
  return useMemo(() => variantCalculatedItems(items, { branchesEnabled, activeBranchId, branches }), [items, branchesEnabled, activeBranchId, branches]);
}
