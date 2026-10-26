import type { StateCreator } from 'zustand';
import type { DocumentTab } from '@/types/costModel';
import { createDefaultSchedule } from '@/data/defaultBudget';
import { recalculateItems } from '@/services/calculation/calculator';
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
    activeRow: state.activeRow, activeCol: state.activeCol, selectionStart: state.selectionStart, selectionEnd: state.selectionEnd, scrollTop: state.scrollTop,
  } };
}

function documentContext(doc: DocumentTab) {
  return { companyInfo: { ...defaultCompanyInfo }, subSheets: [], activeSubSheetId: null,
    offerte: createDefaultOfferte(), projectInfo: doc.schedule.projectInfo ?? createDefaultProjectInfo(), snapshots: [],
    undoStack: [], redoStack: [], activeRow: 0, activeCol: 0, selectionStart: null, selectionEnd: null, scrollTop: 0,
    ...doc.context, activeItemId: null, cellSelectionStart: null, cellSelectionEnd: null, spreadsheetUndo: [], spreadsheetRedo: [],
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
    fileName: 'Nieuwe begroting',
    isModified: false,
    items: [],
    schedule: createDefaultSchedule(),
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
    const recalculated = recalculateItems(newDoc.items, newDoc.schedule.tarieven);
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
    const filtered = state.documents
      .map((d: DocumentTab) => captureDocument(state, d))
      .filter((d: DocumentTab) => d.id !== id);
    if (filtered.length === 0) {
      set({
        documents: [],
        activeDocumentId: '',
        items: [],
        schedule: createDefaultSchedule(),
        ...documentContext(makeEmptyDoc()),
      } as any);
    } else {
      const switchTo = state.activeDocumentId === id ? filtered[0] : filtered.find((d: DocumentTab) => d.id === state.activeDocumentId) ?? filtered[0];
      set({
        documents: filtered,
        activeDocumentId: switchTo.id,
        items: switchTo.items,
        schedule: switchTo.schedule,
        ...documentContext(switchTo),
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
