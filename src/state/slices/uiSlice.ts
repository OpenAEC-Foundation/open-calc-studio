import type { StateCreator } from 'zustand';

export type ThemeName = 'default' | 'light' | 'dark' | 'blue' | 'amber-navy' | 'warm-ember' | 'highContrast';
export type DialogType = 'settings' | 'about' | 'company' | 'wizard' | null;
export type ContentTab = 'grid' | 'urenstaart' | 'rapport' | 'samenvatting' | 'ifc' | 'offerte' | 'spreadsheet' | 'viewer3d' | 'pdf';
export type ReportMode = 'client' | 'internal';
export type ReportView = 'werkbeschrijving' | 'hoofdaanneming' | 'onderaanneming' | 'inschrijfstaat' | 'nacalculatie' | 'bouw1' | 'ibis' | 'directie' | 'offerte';
export type PageOrientation = 'portrait' | 'landscape';
export type PageSize = 'A4' | 'A3';
export type GridView = 'st' | 'wpcalc' | 'inschrijfstaat' | 'simple';

export interface UiSlice {
  theme: ThemeName;
  activeDialog: DialogType;
  activeContentTab: ContentTab;
  reportMode: ReportMode;
  reportView: ReportView;
  showSchedulePanel: boolean;
  showPropertiesPanel: boolean;
  showChatPanel: boolean;
  showHoeveelheid: boolean;
  // Hidden grid columns, keyed by "<gridView>:<colKey>" so each view has its own set
  hiddenColumns: Record<string, boolean>;
  pageOrientation: PageOrientation;
  pageSize: PageSize;
  gridView: GridView;
  contextMenuPos: { x: number; y: number } | null;
  gridZoom: number;
  includeCover: boolean;
  includeSummary: boolean;
  splitView: boolean;
  splitDocumentId: string | null;
  setTheme: (theme: ThemeName) => void;
  openDialog: (dialog: DialogType) => void;
  closeDialog: () => void;
  setActiveContentTab: (tab: ContentTab) => void;
  setReportMode: (mode: ReportMode) => void;
  setReportView: (view: ReportView) => void;
  toggleSchedulePanel: () => void;
  togglePropertiesPanel: () => void;
  toggleChatPanel: () => void;
  toggleHoeveelheid: () => void;
  toggleColumnHidden: (gridView: string, colKey: string) => void;
  setColumnHidden: (gridView: string, colKey: string, hidden: boolean) => void;
  showAllColumns: (gridView: string) => void;
  setPageOrientation: (orientation: PageOrientation) => void;
  setPageSize: (size: PageSize) => void;
  setGridView: (view: GridView) => void;
  setContextMenuPos: (pos: { x: number; y: number } | null) => void;
  setGridZoom: (zoom: number) => void;
  toggleIncludeCover: () => void;
  toggleIncludeSummary: () => void;
  toggleSplitView: () => void;
  setSplitDocumentId: (id: string | null) => void;
}

export const createUiSlice: StateCreator<UiSlice> = (set) => ({
  theme: 'light',
  activeDialog: null,
  activeContentTab: 'grid',
  reportMode: 'client',
  reportView: 'bouw1',
  setReportMode: (reportMode) => set({ reportMode }),
  setReportView: (reportView) => set({ reportView }),
  // Structuurpaneel standaard dicht — zelden nodig; aan te zetten via Panelen
  showSchedulePanel: false,
  showPropertiesPanel: true,
  showChatPanel: false,
  showHoeveelheid: true,
  hiddenColumns: {},
  pageOrientation: 'landscape',
  pageSize: 'A4',
  gridView: 'wpcalc',
  toggleHoeveelheid: () => set((s) => ({ showHoeveelheid: !s.showHoeveelheid })),
  toggleColumnHidden: (gridView, colKey) =>
    set((s) => {
      const key = `${gridView}:${colKey}`;
      const next = { ...s.hiddenColumns };
      if (next[key]) delete next[key];
      else next[key] = true;
      return { hiddenColumns: next };
    }),
  setColumnHidden: (gridView, colKey, hidden) =>
    set((s) => {
      const key = `${gridView}:${colKey}`;
      const next = { ...s.hiddenColumns };
      if (hidden) next[key] = true;
      else delete next[key];
      return { hiddenColumns: next };
    }),
  showAllColumns: (gridView) =>
    set((s) => {
      const prefix = `${gridView}:`;
      const next: Record<string, boolean> = {};
      for (const k of Object.keys(s.hiddenColumns)) {
        if (!k.startsWith(prefix)) next[k] = s.hiddenColumns[k];
      }
      return { hiddenColumns: next };
    }),
  setPageOrientation: (pageOrientation) => set({ pageOrientation }),
  setPageSize: (pageSize) => set({ pageSize }),
  setGridView: (gridView) => set({ gridView }),
  contextMenuPos: null,
  gridZoom: 100,
  includeCover: false,
  includeSummary: false,
  splitView: false,
  splitDocumentId: null,
  toggleIncludeCover: () => set((s) => ({ includeCover: !s.includeCover })),
  toggleIncludeSummary: () => set((s) => ({ includeSummary: !s.includeSummary })),
  toggleSplitView: () => set((s) => ({ splitView: !s.splitView, splitDocumentId: s.splitView ? null : s.splitDocumentId })),
  setSplitDocumentId: (id) => set({ splitDocumentId: id, splitView: id !== null }),
  setGridZoom: (zoom) => set({ gridZoom: Math.max(50, Math.min(200, zoom)) }),
  setActiveContentTab: (activeContentTab) => {
    const HIDE_EXP = import.meta.env.VITE_HIDE_EXPERIMENTAL === 'true';
    if (HIDE_EXP && (['pdf', 'viewer3d', 'offerte'] as ContentTab[]).includes(activeContentTab)) {
      set({ activeContentTab: 'grid' });
      return;
    }
    set({ activeContentTab });
  },
  setTheme: (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    set({ theme });
  },
  openDialog: (activeDialog) => set({ activeDialog }),
  closeDialog: () => set({ activeDialog: null }),
  toggleSchedulePanel: () => set((s) => ({ showSchedulePanel: !s.showSchedulePanel })),
  togglePropertiesPanel: () => set((s) => ({ showPropertiesPanel: !s.showPropertiesPanel })),
  toggleChatPanel: () => set((s) => ({ showChatPanel: !s.showChatPanel })),
  setContextMenuPos: (contextMenuPos) => set({ contextMenuPos }),
});
