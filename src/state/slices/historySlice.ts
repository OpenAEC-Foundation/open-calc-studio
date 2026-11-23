import type { StateCreator } from 'zustand';
import type { CostItem } from '@/types/costModel';
import { effectiveTarieven } from '@/services/calculation/calculator';
import { activeLibrariesOf, priceCountryOf } from '@/services/pricing/priceLibraries';

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
  /** Land van de prijsbibliotheek vóór deze stap; alleen gezet als de stap het land wijzigt (issue #93). */
  priceCountry?: string;
  /** Actieve prijsbibliotheken vóór deze stap; alleen gezet als de stap ze wijzigt (issue #104). */
  priceLibraries?: string[];
}

type ScheduleExtra = Pick<HistoryEntry, 'currency' | 'priceCountry' | 'priceLibraries'>;

/**
 * Zet valuta en land van de prijsbibliotheek terug en geeft de huidige terug
 * (voor de tegenovergestelde stack). Alleen de velden die de stap wijzigde.
 */
function swapScheduleExtra(state: any, entry: HistoryEntry): ScheduleExtra {
  const back: ScheduleExtra = {};
  const restore: ScheduleExtra = {};
  if (entry.currency !== undefined) { back.currency = state.schedule?.currency; restore.currency = entry.currency; }
  if (entry.priceCountry !== undefined) { back.priceCountry = priceCountryOf(state.schedule); restore.priceCountry = entry.priceCountry; }
  if (entry.priceLibraries !== undefined) { back.priceLibraries = activeLibrariesOf(state.schedule); restore.priceLibraries = [...entry.priceLibraries]; }
  if (Object.keys(restore).length > 0) state.setSchedule?.(restore);
  return back;
}

/** Alleen de gezette velden, zodat een stap zonder valuta- of landwijziging ze ook niet krijgt. */
function definedExtra(extra: ScheduleExtra | undefined): ScheduleExtra {
  const out: ScheduleExtra = {};
  if (extra?.currency !== undefined) out.currency = extra.currency;
  if (extra?.priceCountry !== undefined) out.priceCountry = extra.priceCountry;
  if (extra?.priceLibraries !== undefined) out.priceLibraries = [...extra.priceLibraries];
  return out;
}

export interface HistorySlice {
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
  /**
   * `tarieven`: de tarieven die bij `items` horen, als die al gewijzigd zijn (MCP legt de stap pas na de actie vast).
   * `extra.currency`: de valuta vóór deze stap, als de stap de valuta wijzigt.
   * `extra.priceCountry`: het land van de prijsbibliotheek vóór deze stap, als de stap het land wijzigt.
   * `extra.priceLibraries`: de actieve prijsbibliotheken vóór deze stap, als de stap ze wijzigt.
   */
  pushHistory: (items: CostItem[], description: string, tarieven?: Record<string, number>, extra?: ScheduleExtra) => void;
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
      undoStack: [...state.undoStack.slice(-MAX_HISTORY + 1), { items: JSON.parse(JSON.stringify(items)), description, tarieven: tarieven ? { ...tarieven } : tarievenOf(state), ...definedExtra(extra) }],
      redoStack: [],
    }));
  },

  undo: () => {
    const state = get() as any;
    if (state.undoStack.length === 0) return null;
    const entry = state.undoStack[state.undoStack.length - 1];
    // Save current items to redo stack so redo restores the correct state
    const currentItems: CostItem[] = state.items;
    const back = swapScheduleExtra(state, entry);
    set((s: any) => ({
      undoStack: s.undoStack.slice(0, -1),
      redoStack: [...s.redoStack, { items: JSON.parse(JSON.stringify(currentItems)), description: entry.description, tarieven: tarievenOf(s), ...definedExtra(back) }],
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
    const back = swapScheduleExtra(state, entry);
    set((s: any) => ({
      redoStack: s.redoStack.slice(0, -1),
      undoStack: [...s.undoStack, { items: JSON.parse(JSON.stringify(currentItems)), description: entry.description, tarieven: tarievenOf(s), ...definedExtra(back) }],
    }));
    restoreTarieven(set, entry);
    markActiveModified(state);
    return entry.items;
  },

  canUndo: () => get().undoStack.length > 0,
  canRedo: () => get().redoStack.length > 0,
});
