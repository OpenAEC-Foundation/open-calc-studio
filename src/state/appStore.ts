import { create } from 'zustand';
import { createCostScheduleSlice, type CostScheduleSlice } from './slices/costScheduleSlice';
import { createCostItemsSlice, type CostItemsSlice } from './slices/costItemsSlice';
import { createSelectionSlice, type SelectionSlice } from './slices/selectionSlice';
import { createViewSlice, type ViewSlice } from './slices/viewSlice';
import { createUiSlice, type UiSlice } from './slices/uiSlice';
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
  CodeLibrarySlice;

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
}));

// Debug: expose store on window in dev mode
if (import.meta.env.DEV) {
  (window as any).__APP_STORE__ = useAppStore;
}
