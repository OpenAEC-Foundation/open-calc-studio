import type { StateCreator } from 'zustand';

export interface CellCoord {
  row: number;
  col: number;
}

export interface SelectionSlice {
  activeRow: number;
  activeCol: number;
  activeItemId: string | null;
  selectionStart: number | null;
  selectionEnd: number | null;
  isEditing: boolean;
  editValue: string;
  selectOnFocus: boolean;
  cellSelectionStart: CellCoord | null;
  cellSelectionEnd: CellCoord | null;
  setCellSelection: (start: CellCoord | null, end: CellCoord | null) => void;
  setActiveCell: (row: number, col: number, itemId?: string) => void;
  setActiveCellExtend: (row: number, col: number) => void;
  setSelectionRange: (start: number, end: number) => void;
  clearSelection: () => void;
  getSelectedRowIndices: () => number[];
  startEditing: (initialValue?: string) => void;
  stopEditing: () => void;
  setEditValue: (value: string) => void;
}

/** Item-id van een grid-rij-index, via getGridRows uit de items-slice. */
function resolveRowItemId(get: () => SelectionSlice, row: number): string | null {
  const state = get() as any; // full AppStore at runtime
  const rows = state.getGridRows?.();
  return rows?.[row]?.id ?? null;
}

export const createSelectionSlice: StateCreator<SelectionSlice> = (set, get) => ({
  activeRow: 0,
  activeCol: 1,
  activeItemId: null,
  selectionStart: null,
  selectionEnd: null,
  isEditing: false,
  editValue: '',
  selectOnFocus: false,
  cellSelectionStart: null,
  cellSelectionEnd: null,
  setCellSelection: (start, end) => set({ cellSelectionStart: start, cellSelectionEnd: end }),
  setActiveCell: (row, col, itemId) => set(() => ({
    activeRow: row,
    activeCol: col,
    // Geen id meegekregen (bv. rij-overgang via Tab in de celeditor)?
    // Zelf resolven uit de gerenderde rijenlijst, zodat activeItemId
    // ALTIJD bij activeRow hoort en id-consumers (eigenschappenpaneel,
    // plakken, sneltoetsen) nooit een verouderd/verkeerd item zien.
    activeItemId: itemId !== undefined ? itemId : (resolveRowItemId(get, row)),
    isEditing: false,
    selectionStart: null,
    selectionEnd: null,
    cellSelectionStart: null,
    cellSelectionEnd: null,
  })),
  setActiveCellExtend: (row, col) => {
    const { selectionStart, activeRow } = get();
    const anchor = selectionStart ?? activeRow;
    set({
      activeRow: row,
      activeCol: col,
      activeItemId: resolveRowItemId(get, row),
      isEditing: false,
      selectionStart: anchor,
      selectionEnd: row,
    });
  },
  setSelectionRange: (start, end) => set({ selectionStart: start, selectionEnd: end }),
  clearSelection: () => set({ selectionStart: null, selectionEnd: null }),
  getSelectedRowIndices: () => {
    const { selectionStart, selectionEnd, activeRow } = get();
    if (selectionStart == null || selectionEnd == null) {
      return [activeRow];
    }
    const min = Math.min(selectionStart, selectionEnd);
    const max = Math.max(selectionStart, selectionEnd);
    const indices: number[] = [];
    for (let i = min; i <= max; i++) {
      indices.push(i);
    }
    return indices;
  },
  startEditing: (initialValue) =>
    set(() => ({ isEditing: true, editValue: initialValue ?? '', selectOnFocus: !initialValue })),
  stopEditing: () => set({ isEditing: false }),
  setEditValue: (value) => set({ editValue: value }),
});
