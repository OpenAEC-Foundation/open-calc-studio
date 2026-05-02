import type { StateCreator } from 'zustand';
import type {
  InstalledExtension,
  ExtensionStatus,
  CatalogEntry,
  RibbonButtonRegistration,
  BackstagePanelRegistration,
  ImporterDefinition,
} from '../../extensions/types';

export interface ExtensionRibbonButton extends RibbonButtonRegistration {
  extensionId: string;
}

export interface ExtensionBackstagePanel extends BackstagePanelRegistration {
  extensionId: string;
}

export interface ExtensionImporter extends ImporterDefinition {
  extensionId: string;
}

export interface ExtensionSlice {
  // State
  installedExtensions: Record<string, InstalledExtension>;
  extensionRibbonButtons: ExtensionRibbonButton[];
  extensionBackstagePanels: ExtensionBackstagePanel[];
  extensionImporters: ExtensionImporter[];
  catalogEntries: CatalogEntry[];
  catalogLoading: boolean;
  catalogError: string | null;
  catalogLastFetched: number | null;

  // Extension CRUD
  registerExtension: (ext: InstalledExtension) => void;
  unregisterExtension: (id: string) => void;
  setExtensionStatus: (id: string, status: ExtensionStatus, error?: string) => void;

  // Ribbon buttons
  addExtensionRibbonButton: (btn: ExtensionRibbonButton) => void;
  removeExtensionRibbonButton: (extensionId: string, label: string) => void;

  // Backstage panels
  addExtensionBackstagePanel: (panel: ExtensionBackstagePanel) => void;
  removeExtensionBackstagePanel: (extensionId: string, panelId: string) => void;

  // Importers
  addExtensionImporter: (imp: ExtensionImporter) => void;
  removeExtensionImporter: (extensionId: string, importerId: string) => void;

  // Remove all UI for an extension
  removeAllExtensionUI: (extensionId: string) => void;

  // Catalog
  setCatalog: (entries: CatalogEntry[], fetchedAt: number) => void;
  setCatalogLoading: (loading: boolean) => void;
  setCatalogError: (error: string | null) => void;
}

export const createExtensionSlice: StateCreator<ExtensionSlice> = (set) => ({
  installedExtensions: {},
  extensionRibbonButtons: [],
  extensionBackstagePanels: [],
  extensionImporters: [],
  catalogEntries: [],
  catalogLoading: false,
  catalogError: null,
  catalogLastFetched: null,

  registerExtension: (ext) =>
    set((s) => ({
      installedExtensions: { ...s.installedExtensions, [ext.id]: ext },
    })),

  unregisterExtension: (id) =>
    set((s) => {
      const { [id]: _, ...rest } = s.installedExtensions;
      return { installedExtensions: rest };
    }),

  setExtensionStatus: (id, status, error) =>
    set((s) => {
      const ext = s.installedExtensions[id];
      if (!ext) return s;
      return {
        installedExtensions: {
          ...s.installedExtensions,
          [id]: { ...ext, status, error },
        },
      };
    }),

  addExtensionRibbonButton: (btn) =>
    set((s) => {
      const exists = s.extensionRibbonButtons.some(
        (b) => b.extensionId === btn.extensionId && b.label === btn.label
      );
      if (exists) return s;
      return { extensionRibbonButtons: [...s.extensionRibbonButtons, btn] };
    }),

  removeExtensionRibbonButton: (extensionId, label) =>
    set((s) => ({
      extensionRibbonButtons: s.extensionRibbonButtons.filter(
        (b) => !(b.extensionId === extensionId && b.label === label)
      ),
    })),

  addExtensionBackstagePanel: (panel) =>
    set((s) => {
      const exists = s.extensionBackstagePanels.some(
        (p) => p.extensionId === panel.extensionId && p.id === panel.id
      );
      if (exists) return s;
      return { extensionBackstagePanels: [...s.extensionBackstagePanels, panel] };
    }),

  removeExtensionBackstagePanel: (extensionId, panelId) =>
    set((s) => ({
      extensionBackstagePanels: s.extensionBackstagePanels.filter(
        (p) => !(p.extensionId === extensionId && p.id === panelId)
      ),
    })),

  addExtensionImporter: (imp) =>
    set((s) => {
      const exists = s.extensionImporters.some(
        (i) => i.extensionId === imp.extensionId && i.id === imp.id
      );
      if (exists) return s;
      return { extensionImporters: [...s.extensionImporters, imp] };
    }),

  removeExtensionImporter: (extensionId, importerId) =>
    set((s) => ({
      extensionImporters: s.extensionImporters.filter(
        (i) => !(i.extensionId === extensionId && i.id === importerId)
      ),
    })),

  removeAllExtensionUI: (extensionId) =>
    set((s) => ({
      extensionRibbonButtons: s.extensionRibbonButtons.filter(
        (b) => b.extensionId !== extensionId
      ),
      extensionBackstagePanels: s.extensionBackstagePanels.filter(
        (p) => p.extensionId !== extensionId
      ),
      extensionImporters: s.extensionImporters.filter(
        (i) => i.extensionId !== extensionId
      ),
    })),

  setCatalog: (entries, fetchedAt) =>
    set({ catalogEntries: entries, catalogLastFetched: fetchedAt, catalogError: null }),

  setCatalogLoading: (catalogLoading) => set({ catalogLoading }),

  setCatalogError: (catalogError) => set({ catalogError }),
});
