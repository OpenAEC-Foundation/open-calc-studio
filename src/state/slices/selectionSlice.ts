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
  setActiveCell: (row, col, itemId) => set((s) => ({
    activeRow: row,
    activeCol: col,
    activeItemId: itemId !== undefined ? itemId : s.activeItemId,
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
