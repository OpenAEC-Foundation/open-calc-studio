import type { StateCreator } from 'zustand';
import type { CostItem } from '@/types/costModel';
import { recalculateItems } from '@/services/calculation/calculator';

export interface ClipboardSlice {
  clipboardItems: CostItem[];
  clipboardMode: 'copy' | 'cut' | null;
  copyItems: (items: CostItem[]) => void;
  cutItems: (items: CostItem[]) => void;
  pasteItems: () => void;
  clearClipboard: () => void;
}

export const createClipboardSlice: StateCreator<ClipboardSlice> = (set, get) => ({
  clipboardItems: [],
  clipboardMode: null,
  copyItems: (items) => set({ clipboardItems: JSON.parse(JSON.stringify(items)), clipboardMode: 'copy' }),
  cutItems: (items) => set({ clipboardItems: JSON.parse(JSON.stringify(items)), clipboardMode: 'cut' }),

  pasteItems: () => {
    const state = get() as any; // full AppStore at runtime
    const { clipboardItems, clipboardMode, items, activeRow } = state;
    if (!clipboardItems || clipboardItems.length === 0) return;

    // Determine visible items to find the active item
    const visibleItems: CostItem[] = state.getVisibleItems();
    const activeItem: CostItem | undefined = visibleItems[activeRow];

    // Clone clipboard items with new IDs
    const idMap = new Map<string, string>();
    const cloned: CostItem[] = clipboardItems.map((item: CostItem) => {
      const newId = crypto.randomUUID();
      idMap.set(item.id, newId);
      return { ...item, id: newId };
    });

    // Remap parentIds for items whose parents are also in the clipboard
    for (const item of cloned) {
      if (item.parentId && idMap.has(item.parentId)) {
        item.parentId = idMap.get(item.parentId)!;
      }
    }

    // Insert after the active row
    let insertIndex = items.length;
    if (activeItem) {
      const flatIdx = items.findIndex((i: CostItem) => i.id === activeItem.id);
      // Find end of activeItem's subtree
      let endIdx = flatIdx + 1;
      while (endIdx < items.length && items[endIdx].depth > activeItem.depth) {
        endIdx++;
      }
      insertIndex = endIdx;
    }

    let newItems = [...items];
    newItems.splice(insertIndex, 0, ...cloned);

    // If mode was 'cut', remove original items
    if (clipboardMode === 'cut') {
      const originalIds = new Set(clipboardItems.map((i: CostItem) => i.id));
      newItems = newItems.filter((i: CostItem) => !originalIds.has(i.id));
    }

    // Push history, update items, clear clipboard if cut
    state.pushHistory(items, clipboardMode === 'cut' ? 'Knippen en plakken' : 'Plakken');
    const updates: any = { items: recalculateItems(newItems) };
    if (clipboardMode === 'cut') {
      updates.clipboardItems = [];
      updates.clipboardMode = null;
    }

    // Mark document as modified
    state.updateDocument(state.activeDocumentId, { isModified: true });

    set(updates);
  },

  clearClipboard: () => set({ clipboardItems: [], clipboardMode: null }),
});
