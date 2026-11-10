import type { StateCreator } from 'zustand';
import type { CostItem } from '@/types/costModel';
import { effectiveTarieven } from '@/services/calculation/calculator';

interface HistoryEntry {
  items: CostItem[];
  description: string;
  /**
   * Uurtarieven op het moment van de stap. Arbeid op een regel met een
   * tariefgroep is norm ÷ capaciteit × tarief; zonder de tarieven zou
   * ongedaan maken oude regels met nieuwe tarieven doorrekenen (knownbugs 8, 10).
   */
  tarieven?: Record<string, number>;
  /** Valuta van de begroting vóór deze stap; alleen gezet als de stap de valuta wijzigt (issue #65). */
  currency?: string;
}

/** Zet de valuta terug en geeft de huidige terug (voor de tegenovergestelde stack). */
function swapCurrency(state: any, entry: HistoryEntry): string | undefined {
  if (entry.currency === undefined) return undefined;
  const current: string | undefined = state.schedule?.currency;
  state.setSchedule?.({ currency: entry.currency });
  return current;
}

export interface HistorySlice {
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
  /**
   * `tarieven`: de tarieven die bij `items` horen, als die al gewijzigd zijn (MCP legt de stap pas na de actie vast).
   * `extra.currency`: de valuta vóór deze stap, als de stap de valuta wijzigt.
   */
  pushHistory: (items: CostItem[], description: string, tarieven?: Record<string, number>, extra?: { currency?: string }) => void;
  undo: () => CostItem[] | null;
  redo: () => CostItem[] | null;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

const MAX_HISTORY = 50;

// Ook zonder eigen tarieven in het schema: dan rekent alles met de standaard,
// en die hoort dan bij de stap (anders herstelt ongedaan maken niets).
const tarievenOf = (state: any): Record<string, number> | undefined =>
  state.schedule ? effectiveTarieven(state.schedule) : undefined;

/** Zet de tarieven van een stap terug in het schema (zonder herberekening: setItems doet dat). */
function restoreTarieven(set: any, entry: HistoryEntry) {
  if (!entry.tarieven) return;
  set((s: any) => (s.schedule ? { schedule: { ...s.schedule, tarieven: { ...entry.tarieven } } } : {}));
}

/** Undo/redo changes the document content, so a saved document is dirty again. */
function markActiveModified(state: any) {
  if (state.activeDocumentId && state.updateDocument) {
    state.updateDocument(state.activeDocumentId, { isModified: true });
  }
}

export const createHistorySlice: StateCreator<HistorySlice> = (set, get) => ({
  undoStack: [],
  redoStack: [],

  pushHistory: (items, description, tarieven, extra) => {
    set((state) => ({
      undoStack: [...state.undoStack.slice(-MAX_HISTORY + 1), { items: JSON.parse(JSON.stringify(items)), description, tarieven: tarieven ? { ...tarieven } : tarievenOf(state), ...(extra?.currency !== undefined ? { currency: extra.currency } : {}) }],
      redoStack: [],
    }));
  },

  undo: () => {
    const state = get() as any;
    if (state.undoStack.length === 0) return null;
    const entry = state.undoStack[state.undoStack.length - 1];
    // Save current items to redo stack so redo restores the correct state
    const currentItems: CostItem[] = state.items;
    const currency = swapCurrency(state, entry);
    set((s: any) => ({
      undoStack: s.undoStack.slice(0, -1),
      redoStack: [...s.redoStack, { items: JSON.parse(JSON.stringify(currentItems)), description: entry.description, tarieven: tarievenOf(s), ...(currency !== undefined ? { currency } : {}) }],
    }));
    restoreTarieven(set, entry);
    markActiveModified(state);
    return entry.items;
  },

  redo: () => {
    const state = get() as any;
    if (state.redoStack.length === 0) return null;
    const entry = state.redoStack[state.redoStack.length - 1];
    // Save current items to undo stack so undo can reverse the redo
    const currentItems: CostItem[] = state.items;
    const currency = swapCurrency(state, entry);
    set((s: any) => ({
      redoStack: s.redoStack.slice(0, -1),
      undoStack: [...s.undoStack, { items: JSON.parse(JSON.stringify(currentItems)), description: entry.description, tarieven: tarievenOf(s), ...(currency !== undefined ? { currency } : {}) }],
    }));
    restoreTarieven(set, entry);
    markActiveModified(state);
    return entry.items;
  },

  canUndo: () => get().undoStack.length > 0,
  canRedo: () => get().redoStack.length > 0,
});
