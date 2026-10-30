import type { StateCreator } from 'zustand';
import type { AppStore } from '../appStore';
import { reviewBudget, type ReviewFilter } from '@/services/review/budgetReview';
import { uiText } from '@/i18n/uiText';

export interface ReviewSlice {
  reviewFilter: ReviewFilter;
  reviewIssueId: string | null;
  reviewReturnItemId: string | null;
  setReviewFilter: (filter: ReviewFilter) => void;
  setReviewIssue: (id: string | null) => void;
  openReviewItem: (itemId: string) => void;
}

export const createReviewSlice: StateCreator<ReviewSlice> = (set, get) => ({
  reviewFilter: 'all', reviewIssueId: null, reviewReturnItemId: null,
  setReviewFilter: reviewFilter => set({ reviewFilter }),
  setReviewIssue: reviewIssueId => set({ reviewIssueId }),
  openReviewItem: itemId => {
    const state = get() as AppStore;
    if (!state.activeDocumentId || !reviewBudget(state).issues.some(issue => issue.itemId === itemId)) throw Error(uiText('review.unavailable', 'This row no longer has a review issue in the active variant.'));
    const byId = new Map(state.items.map(item => [item.id, item]));
    const parents = new Set<string>();
    let parent = byId.get(itemId)?.parentId;
    while (parent) {
      if (parents.has(parent) || !byId.has(parent)) throw Error(uiText('review.unreachable', 'The row has an invalid parent structure and cannot be shown in the grid.'));
      parents.add(parent); parent = byId.get(parent)!.parentId;
    }
    // Expanding rows is view navigation, just like the grid's own collapse button.
    const items = state.items.some(item => parents.has(item.id) && item.isCollapsed)
      ? state.items.map(item => parents.has(item.id) && item.isCollapsed ? { ...item, isCollapsed: false } : item) : state.items;
    set({ items } as Partial<AppStore>);
    const row = state.getGridRows().findIndex(item => item.id === itemId);
    if (row < 0) { set({ items: state.items } as Partial<AppStore>); throw Error(uiText('review.unreachable', 'The row has an invalid parent structure and cannot be shown in the grid.')); }
    state.setActiveSubSheet(null);
    state.clearSelectedColumns();
    state.setActiveCell(row, 1, itemId);
    set({ reviewReturnItemId: itemId });
    state.setActiveContentTab('grid');
  },
});
