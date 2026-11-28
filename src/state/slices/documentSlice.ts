import { uiText } from '@/i18n/uiText';
import i18next from 'i18next';
import { newEstimatePriceCountry } from '@/services/pricing/priceLibraries';
import type { StateCreator } from 'zustand';
import type { DocumentTab } from '@/types/costModel';
import { createDefaultSchedule } from '@/data/defaultBudget';
import { effectiveTarieven, recalculateItems } from '@/services/calculation/calculator';
import type { AppStore } from '../appStore';
import { defaultCompanyInfo } from './companySlice';
import { createDefaultOfferte } from './offerteSlice';
import { createDefaultProjectInfo } from '@/types/costModel';

function captureDocument(state: AppStore, doc: DocumentTab): DocumentTab {
  if (doc.id !== state.activeDocumentId) return doc;
  return { ...doc, items: state.items, schedule: { ...state.schedule, projectInfo: state.projectInfo }, context: {
    companyInfo: state.companyInfo, subSheets: state.subSheets, activeSubSheetId: state.activeSubSheetId,
    offerte: state.offerte, projectInfo: state.projectInfo, snapshots: state.snapshots,
    undoStack: state.undoStack, redoStack: state.redoStack,
    spreadsheetUndo: state.spreadsheetUndo, spreadsheetRedo: state.spreadsheetRedo,
    activeRow: state.activeRow, activeCol: state.activeCol, selectionStart: state.selectionStart, selectionEnd: state.selectionEnd, scrollTop: state.scrollTop,
  } };
}

function documentContext(doc: DocumentTab) {
  return { reviewFilter: 'all' as const, reviewIssueId: null, reviewReturnItemId: null, quantityOriginItemId: null, pdfTargetMeasurementId: null, sheetTargetCell: null, companyInfo: { ...defaultCompanyInfo }, subSheets: [], activeSubSheetId: null,
    offerte: createDefaultOfferte(), projectInfo: doc.schedule.projectInfo ?? createDefaultProjectInfo(), snapshots: [],
    undoStack: [], redoStack: [], spreadsheetUndo: [], spreadsheetRedo: [], activeRow: 0, activeCol: 0, selectionStart: null, selectionEnd: null, scrollTop: 0,
    ...doc.context, activeItemId: null, cellSelectionStart: null, cellSelectionEnd: null,
  };
}

export interface DocumentSlice {
  documents: DocumentTab[];
  activeDocumentId: string;
  addDocument: (tab?: Partial<DocumentTab>) => void;
  removeDocument: (id: string) => void;
  setActiveDocument: (id: string) => void;
  updateDocument: (id: string, partial: Partial<DocumentTab>) => void;
}

function makeEmptyDoc(overrides?: Partial<DocumentTab>): DocumentTab {
  return {
    id: crypto.randomUUID(),
    filePath: null,
    fileName: uiText("newBudget", "New estimate"),
    isModified: false,
    items: [],
    // A new estimate (no schedule from a file or import) gets the library of the
    // UI language: Dutch for nl, else the English library (#86). Opened files
    // keep their own choice; old files without one stay NL.
    schedule: { ...createDefaultSchedule(), priceCountry: newEstimatePriceCountry(i18next.language) },
    // Aanmaakdatum voor het bestand; een geopend bestand geeft zijn eigen mee (knownbug 110).
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

export const createDocumentSlice: StateCreator<DocumentSlice> = (set, get) => ({
  documents: [],
  activeDocumentId: '',

  addDocument: (tab) => {
    const state = get() as any;
    // Save current document's data before switching
    const updatedDocs = state.documents.map((d: DocumentTab) => captureDocument(state, d));
    const newDoc = makeEmptyDoc(tab);
    // Recalculate so staart breakdowns are populated for live reporting
    const recalculated = recalculateItems(newDoc.items, effectiveTarieven(newDoc.schedule), newDoc.schedule?.priceRounding);
    newDoc.items = recalculated;
    set({
      documents: [...updatedDocs, newDoc],
      activeDocumentId: newDoc.id,
      items: recalculated,
      schedule: newDoc.schedule,
      ...documentContext(newDoc),
    } as any);
  },

  removeDocument: (id) => {
    const state = get() as any;
    const closedIndex = state.documents.findIndex((d: DocumentTab) => d.id === id);
    const filtered = state.documents
      .map((d: DocumentTab) => captureDocument(state, d))
      .filter((d: DocumentTab) => d.id !== id);
    // Het document in "Naast elkaar bekijken" sluit: de gesplitste weergave
    // zou anders op een verwijderd document blijven staan (knownbug 116).
    const split = state.splitDocumentId === id ? { splitDocumentId: null, splitView: false } : {};
    if (filtered.length === 0) {
      set({
        documents: [],
        activeDocumentId: '',
        items: [],
        schedule: createDefaultSchedule(),
        ...documentContext(makeEmptyDoc()),
        ...split,
      } as any);
    } else if (state.activeDocumentId !== id && filtered.some((d: DocumentTab) => d.id === state.activeDocumentId)) {
      // Closing a background tab leaves the live state of the active tab alone,
      // including its undo history and selection (knownbugs 121).
      set({ documents: filtered, ...split } as any);
    } else {
      // Het tabblad dat op de plek van het gesloten tabblad komt, of het
      // vorige als het laatste sluit (knownbug 261; voorheen altijd het eerste).
      const switchTo = filtered[Math.min(Math.max(closedIndex, 0), filtered.length - 1)];
      set({
        documents: filtered,
        activeDocumentId: switchTo.id,
        items: switchTo.items,
        schedule: switchTo.schedule,
        ...documentContext(switchTo),
        ...split,
      } as any);
    }
  },

  setActiveDocument: (id) => {
    const state = get() as any;
    if (id === state.activeDocumentId) return;
    // Save current document's data
    const updatedDocs = state.documents.map((d: DocumentTab) => captureDocument(state, d));
    const target = updatedDocs.find((d: DocumentTab) => d.id === id);
    if (!target) return;
    set({
      documents: updatedDocs,
      activeDocumentId: id,
      items: target.items,
      schedule: target.schedule,
      ...documentContext(target),
    } as any);
  },

  updateDocument: (id, partial) =>
    set((state) => ({
      documents: state.documents.map((d) => (d.id === id ? { ...d, ...partial } : d)),
    })),
});
