import type { StateCreator } from 'zustand';
import i18next from 'i18next';
import type { CostItem } from '@/types/costModel';
import { recalculateItems } from '@/services/calculation/calculator';
import { isFooterRow } from '@/services/grid/gridRows';

export interface ClipboardSlice {
  clipboardItems: CostItem[];
  clipboardMode: 'copy' | 'cut' | null;
  copyItems: (items: CostItem[]) => void;
  cutItems: (items: CostItem[]) => void;
  pasteItems: () => void;
  clearClipboard: () => void;
}

/** Preserve calculation children when copying a collapsed chapter or cost item. */
function clipboardTree(selected: CostItem[], all: CostItem[]): CostItem[] {
  const roots = new Map(selected.map(item => [item.id, item]));
  const included = new Set(roots.keys());
  const children = new Map<string, CostItem[]>();
  for (const item of all) if (item.parentId) { const group = children.get(item.parentId) ?? []; group.push(item); children.set(item.parentId, group); }
  const pending = [...included];
  for (let index = 0; index < pending.length; index++) for (const child of children.get(pending[index]) ?? []) {
    if (!included.has(child.id)) { included.add(child.id); pending.push(child.id); }
  }
  const storedIds = new Set(all.map(item => item.id));
  return [...all.filter(item => included.has(item.id)).map(item => roots.get(item.id) ?? item), ...selected.filter(item => !storedIds.has(item.id))];
}

export const createClipboardSlice: StateCreator<ClipboardSlice> = (set, get) => ({
  clipboardItems: [],
  clipboardMode: null,
  copyItems: (items) => set({ clipboardItems: JSON.parse(JSON.stringify(clipboardTree(items, (get() as ClipboardSlice & { items: CostItem[] }).items))), clipboardMode: 'copy' }),
  cutItems: (items) => set({ clipboardItems: JSON.parse(JSON.stringify(clipboardTree(items, (get() as ClipboardSlice & { items: CostItem[] }).items))), clipboardMode: 'cut' }),

  pasteItems: () => {
    const state = get() as any; // full AppStore at runtime
    const { clipboardItems, clipboardMode, items, activeRow, activeItemId } = state;
    if (!clipboardItems || clipboardItems.length === 0) return;

    // Het actieve item op identiteit (activeItemId hoort bij de geselecteerde
    // grid-rij); rij-index alleen als fallback en dan via de gerenderde
    // rijenlijst — getVisibleItems() kent de footerrijen niet en wees dan
    // een verkeerd plak-doel aan.
    const gridRows: CostItem[] = state.getGridRows();
    const rowItem = gridRows[activeRow];
    const activeItem: CostItem | undefined =
      (activeItemId ? items.find((i: CostItem) => i.id === activeItemId) : undefined)
      ?? (rowItem && !isFooterRow(rowItem.id) ? rowItem : undefined);

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
    state.pushHistory(items, clipboardMode === 'cut' ? i18next.t('history.cutPaste') : i18next.t('history.paste'));
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
