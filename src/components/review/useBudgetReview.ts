import { useMemo } from 'react';
import { useAppStore } from '@/state/appStore';
import { reviewBudget } from '@/services/review/budgetReview';

export function useBudgetReview() {
  const items = useAppStore(s => s.items), schedule = useAppStore(s => s.schedule);
  const subSheets = useAppStore(s => s.subSheets), ifcQuantities = useAppStore(s => s.ifcQuantities);
  return useMemo(() => reviewBudget({ items, schedule, subSheets, ifcQuantities }), [items, schedule, subSheets, ifcQuantities]);
}
