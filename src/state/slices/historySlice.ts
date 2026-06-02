import type { StateCreator } from 'zustand';
import type { CostItem } from '@/types/costModel';

interface HistoryEntry {
  items: CostItem[];
  description: string;
}

export interface HistorySlice {
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
  pushHistory: (items: CostItem[], description: string) => void;
  undo: () => CostItem[] | null;
  redo: () => CostItem[] | null;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

const MAX_HISTORY = 50;

export const createHistorySlice: StateCreator<HistorySlice> = (set, get) => ({
  undoStack: [],
  redoStack: [],

  pushHistory: (items, description) => {
    set((state) => ({
      undoStack: [...state.undoStack.slice(-MAX_HISTORY + 1), { items: JSON.parse(JSON.stringify(items)), description }],
      redoStack: [],
    }));
  },

  undo: () => {
    const state = get() as any;
    if (state.undoStack.length === 0) return null;
    const entry = state.undoStack[state.undoStack.length - 1];
    // Save current items to redo stack so redo restores the correct state
    const currentItems: CostItem[] = state.items;
    set((s: any) => ({
      undoStack: s.undoStack.slice(0, -1),
      redoStack: [...s.redoStack, { items: JSON.parse(JSON.stringify(currentItems)), description: entry.description }],
    }));
    return entry.items;
  },

  redo: () => {
    const state = get() as any;
    if (state.redoStack.length === 0) return null;
    const entry = state.redoStack[state.redoStack.length - 1];
    // Save current items to undo stack so undo can reverse the redo
    const currentItems: CostItem[] = state.items;
    set((s: any) => ({
      redoStack: s.redoStack.slice(0, -1),
      undoStack: [...s.undoStack, { items: JSON.parse(JSON.stringify(currentItems)), description: entry.description }],
    }));
    return entry.items;
  },

  canUndo: () => get().undoStack.length > 0,
  canRedo: () => get().redoStack.length > 0,
});
