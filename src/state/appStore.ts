import { create } from 'zustand';
import { pdfQuantities } from '@/services/pdf/pdfWorkspace';
import { libraryChoiceKeyOf, withActiveLibraries } from '@/services/pricing/priceLibraries';
import { subscribeOwnLibraries } from '@/services/pricing/ownLibraries';
import { createCostScheduleSlice, type CostScheduleSlice } from './slices/costScheduleSlice';
import { createCostItemsSlice, type CostItemsSlice } from './slices/costItemsSlice';
import { createSelectionSlice, type SelectionSlice } from './slices/selectionSlice';
import { createViewSlice, type ViewSlice } from './slices/viewSlice';
import { createUiSlice, savePropertiesPanel, type UiSlice } from './slices/uiSlice';
import { createHistorySlice, type HistorySlice } from './slices/historySlice';
import { createSettingsSlice, type SettingsSlice } from './slices/settingsSlice';
import { createClipboardSlice, type ClipboardSlice } from './slices/clipboardSlice';
import { createDocumentSlice, type DocumentSlice } from './slices/documentSlice';
import { createCompanySlice, type CompanySlice } from './slices/companySlice';
import { createResourceLibrarySlice, type ResourceLibrarySlice } from './slices/resourceLibrarySlice';
import { createExtensionSlice, type ExtensionSlice } from './slices/extensionSlice';
import { createSubSheetSlice, type SubSheetSlice } from './slices/subSheetSlice';
import { createOfferteSlice, type OfferteSlice } from './slices/offerteSlice';
import { createVersionSlice, type VersionSlice } from './slices/versionSlice';
import { createLinkableSourcesSlice, type LinkableSourcesSlice } from './slices/linkableSourcesSlice';
import { createSpreadsheetHistorySlice, type SpreadsheetHistorySlice } from './slices/spreadsheetHistorySlice';
import { createAccountsSlice, type AccountsSlice } from './slices/accountsSlice';
import { createChatSlice, type ChatSlice } from './slices/chatSlice';
import { createCodeLibrarySlice, type CodeLibrarySlice } from './slices/codeLibrarySlice';
import { createWorkspaceSlice, type WorkspaceSlice } from './slices/workspaceSlice';
import { createReviewSlice, type ReviewSlice } from './slices/reviewSlice';

export type AppStore = CostScheduleSlice &
  CostItemsSlice &
  SelectionSlice &
  ViewSlice &
  UiSlice &
  HistorySlice &
  SettingsSlice &
  ClipboardSlice &
  DocumentSlice &
  CompanySlice &
  ResourceLibrarySlice &
  ExtensionSlice &
  SubSheetSlice &
  OfferteSlice &
  VersionSlice &
  LinkableSourcesSlice &
  SpreadsheetHistorySlice &
  AccountsSlice &
  ChatSlice &
  CodeLibrarySlice & WorkspaceSlice & ReviewSlice;

export const useAppStore = create<AppStore>()((...a) => ({
  ...createCostScheduleSlice(...a),
  ...createCostItemsSlice(...a),
  ...createSelectionSlice(...a),
  ...createViewSlice(...a),
  ...createUiSlice(...a),
  ...createHistorySlice(...a),
  ...createSettingsSlice(...a),
  ...createClipboardSlice(...a),
  ...createDocumentSlice(...a),
  ...createCompanySlice(...a),
  ...createResourceLibrarySlice(...a),
  ...createExtensionSlice(...a),
  ...createSubSheetSlice(...a),
  ...createOfferteSlice(...a),
  ...createVersionSlice(...a),
  ...createChatSlice(...a),
  ...createLinkableSourcesSlice(...a),
  ...createSpreadsheetHistorySlice(...a),
  ...createAccountsSlice(...a),
  ...createCodeLibrarySlice(...a),
  ...createWorkspaceSlice(...a),
  ...createReviewSlice(...a),
}));

// PDF quantities are derived from the active, serialized document. Switching
// tabs or opening a project restores them without mounting the PDF viewer.
useAppStore.subscribe((state, previous) => {
  if (state.schedule.ifcTakeoff !== previous.schedule.ifcTakeoff) {
    useAppStore.setState({ ifcQuantities: state.schedule.ifcTakeoff?.entries ?? [] });
  }
  if (state.schedule.pdfWorkspace !== previous.schedule.pdfWorkspace) {
    useAppStore.setState({ pdfMeasurements: pdfQuantities(state.schedule.pdfWorkspace) });
  }
  // The library list follows the price libraries of the active estimate
  // (issues #93, #104): choosing a country or library, undo, opening a file
  // or switching tabs. Imported and added loose resources stay.
  if (state.schedule !== previous.schedule && libraryChoiceKeyOf(state.schedule) !== libraryChoiceKeyOf(previous.schedule)) {
    rebuildResourceLibrary();
  }
  // Eigenschappen open of dicht onthouden, ook als een werkplek het verandert.
  if (state.showPropertiesPanel !== previous.showPropertiesPanel) savePropertiesPanel(state.showPropertiesPanel);
});

function rebuildResourceLibrary(): void {
  const { resourceLibrary, schedule } = useAppStore.getState();
  useAppStore.setState({ resourceLibrary: withActiveLibraries(resourceLibrary, schedule) });
}

// Own libraries load after start-up and change on import, update or removal.
subscribeOwnLibraries(rebuildResourceLibrary);

// Debug: expose store on window in dev mode
if (import.meta.env.DEV) {
  (window as any).__APP_STORE__ = useAppStore;
}
