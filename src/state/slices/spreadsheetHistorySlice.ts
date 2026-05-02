import type { StateCreator } from 'zustand';
import type { SubSheet } from '@/types/costModel';

const MAX_HISTORY = 50;

interface Snapshot {
  sheetId: string;
  snapshot: SubSheet;
}

export interface SpreadsheetHistorySlice {
  spreadsheetUndo: Snapshot[];
  spreadsheetRedo: Snapshot[];
  pushSpreadsheetSnapshot: (sheet: SubSheet) => void;
  undoSpreadsheet: () => void;
  redoSpreadsheet: () => void;
  clearSpreadsheetHistory: () => void;
}

type Deps = {
  subSheets: SubSheet[];
};

export const createSpreadsheetHistorySlice: StateCreator<
  SpreadsheetHistorySlice & Deps,
  [],
  [],
  SpreadsheetHistorySlice
> = (set, get) => ({
  spreadsheetUndo: [],
  spreadsheetRedo: [],

  pushSpreadsheetSnapshot: (sheet) =>
    set((s) => ({
      spreadsheetUndo: [
        ...s.spreadsheetUndo.slice(-(MAX_HISTORY - 1)),
        { sheetId: sheet.id, snapshot: JSON.parse(JSON.stringify(sheet)) },
      ],
      spreadsheetRedo: [],
    })),

  undoSpreadsheet: () => {
    const state = get();
    const undoStack = state.spreadsheetUndo;
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    const current = state.subSheets.find((ss) => ss.id === last.sheetId);
    set({
      spreadsheetUndo: undoStack.slice(0, -1),
      spreadsheetRedo: current
        ? [
            ...state.spreadsheetRedo,
            { sheetId: current.id, snapshot: JSON.parse(JSON.stringify(current)) },
          ]
        : state.spreadsheetRedo,
      subSheets: state.subSheets.map((ss) =>
        ss.id === last.sheetId ? last.snapshot : ss,
      ),
    } as any);
  },

  redoSpreadsheet: () => {
    const state = get();
    const redoStack = state.spreadsheetRedo;
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    const current = state.subSheets.find((ss) => ss.id === next.sheetId);
    set({
      spreadsheetRedo: redoStack.slice(0, -1),
      spreadsheetUndo: current
        ? [
            ...state.spreadsheetUndo,
            { sheetId: current.id, snapshot: JSON.parse(JSON.stringify(current)) },
          ]
        : state.spreadsheetUndo,
      subSheets: state.subSheets.map((ss) =>
        ss.id === next.sheetId ? next.snapshot : ss,
      ),
    } as any);
  },

  clearSpreadsheetHistory: () =>
    set({ spreadsheetUndo: [], spreadsheetRedo: [] }),
});
