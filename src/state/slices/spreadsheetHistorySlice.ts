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
  /** Met een blad-id alleen de stappen van dat blad (knownbug 55); zonder de laatste stap van alle bladen. */
  undoSpreadsheet: (sheetId?: string) => void;
  redoSpreadsheet: (sheetId?: string) => void;
  clearSpreadsheetHistory: () => void;
}

type Deps = {
  subSheets: SubSheet[];
};

type StackKey = 'spreadsheetUndo' | 'spreadsheetRedo';

/** Undo/redo changes the sheet content, so a saved document is dirty again (knownbugs 121). */
function markActiveModified(state: unknown) {
  const s = state as { activeDocumentId?: string; updateDocument?: (id: string, patch: { isModified: boolean }) => void };
  if (s.activeDocumentId) s.updateDocument?.(s.activeDocumentId, { isModified: true });
}

/** Index van de laatste stap van dit blad, of zonder blad-id de laatste stap overall; -1 als er geen is. */
function lastStepOf(stack: Snapshot[], sheetId?: string): number {
  if (sheetId === undefined) return stack.length - 1;
  for (let i = stack.length - 1; i >= 0; i--) if (stack[i].sheetId === sheetId) return i;
  return -1;
}

/** De stapel zonder de oudste stap van dit blad als dat blad al MAX_HISTORY stappen heeft. */
function dropOldestOf(stack: Snapshot[], sheetId: string): Snapshot[] {
  let count = 0;
  let oldest = -1;
  for (let i = 0; i < stack.length; i++) {
    if (stack[i].sheetId !== sheetId) continue;
    if (oldest < 0) oldest = i;
    count++;
  }
  return count >= MAX_HISTORY ? stack.filter((_, i) => i !== oldest) : stack;
}

export const createSpreadsheetHistorySlice: StateCreator<
  SpreadsheetHistorySlice & Deps,
  [],
  [],
  SpreadsheetHistorySlice
> = (set, get) => {
  // Haal de laatste stap (van dit blad) van de ene stapel, zet de huidige
  // stand van dat blad op de andere stapel en herstel het blad.
  const step = (from: StackKey, to: StackKey, sheetId?: string) => {
    const state = get();
    const fromStack = state[from];
    const at = lastStepOf(fromStack, sheetId);
    if (at < 0) return;
    const entry = fromStack[at];
    const current = state.subSheets.find((ss) => ss.id === entry.sheetId);
    set({
      [from]: fromStack.filter((_, i) => i !== at),
      [to]: current
        ? [...state[to], { sheetId: current.id, snapshot: JSON.parse(JSON.stringify(current)) }]
        : state[to],
      subSheets: state.subSheets.map((ss) => (ss.id === entry.sheetId ? entry.snapshot : ss)),
    } as Partial<SpreadsheetHistorySlice & Deps>);
    markActiveModified(get());
  };

  return {
    spreadsheetUndo: [],
    spreadsheetRedo: [],

    pushSpreadsheetSnapshot: (sheet) =>
      set((s) => ({
        // Maximum per blad: veel bewerkingen in blad B duwen de stappen van
        // blad A niet weg (knownbug 55).
        spreadsheetUndo: [
          ...dropOldestOf(s.spreadsheetUndo, sheet.id),
          { sheetId: sheet.id, snapshot: JSON.parse(JSON.stringify(sheet)) },
        ],
        // Alleen de redo van dit blad vervalt; die van andere bladen blijft (knownbug 55).
        spreadsheetRedo: s.spreadsheetRedo.filter((e) => e.sheetId !== sheet.id),
      })),

    undoSpreadsheet: (sheetId) => step('spreadsheetUndo', 'spreadsheetRedo', sheetId),

    redoSpreadsheet: (sheetId) => step('spreadsheetRedo', 'spreadsheetUndo', sheetId),

    clearSpreadsheetHistory: () =>
      set({ spreadsheetUndo: [], spreadsheetRedo: [] }),
  };
};
