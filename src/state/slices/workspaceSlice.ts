import type { StateCreator } from 'zustand';
import type { AppStore } from '../appStore';
import type { WorkspaceLayout } from '@/types/workspaceLayout';
import { uiText } from '@/i18n/uiText';

export interface WorkspaceSlice {
  activeWorkspaceLayoutId: string | null;
  quantityOriginItemId: string | null;
  pdfTargetMeasurementId: string | null;
  sheetTargetCell: { sheetId: string; cellRef: string } | null;
  showQuantityOrigin: (itemId: string | null) => void;
  leftPanelWidth: number;
  rightPanelWidth: number;
  setLeftPanelWidth: (width: number) => void;
  setRightPanelWidth: (width: number) => void;
  applyWorkspaceLayout: (id: string) => void;
  saveWorkspaceLayout: (name: string, id?: string) => string;
  deleteWorkspaceLayout: (id: string) => void;
}

export function builtinWorkspaceLayouts(): WorkspaceLayout[] {
  const base = { showSchedulePanel: false, showPropertiesPanel: false, showChatPanel: false, leftPanelWidth: 220, rightPanelWidth: 300, ifcSplitPercent: 55, gridView: 'wpcalc' as const, gridZoom: 100, pdfZoom: 1.5, hiddenColumns: {} };
  return [
    { ...base, id: 'measure', name: uiText('layouts.measure', 'Measure'), activeContentTab: 'pdf' },
    { ...base, id: 'estimate', name: uiText('layouts.estimate', 'Estimate'), activeContentTab: 'grid', showPropertiesPanel: true },
    { ...base, id: 'review', name: uiText('layouts.review', 'Review'), activeContentTab: 'grid', showSchedulePanel: true, showPropertiesPanel: true, rightPanelWidth: 340 },
  ];
}

export const createWorkspaceSlice: StateCreator<WorkspaceSlice> = (set, get) => ({
  activeWorkspaceLayoutId: null, leftPanelWidth: 220, rightPanelWidth: 300,
  quantityOriginItemId: null, pdfTargetMeasurementId: null, sheetTargetCell: null,
  showQuantityOrigin: quantityOriginItemId => set({ quantityOriginItemId }),
  setLeftPanelWidth: width => { if (Number.isFinite(width)) set({ leftPanelWidth: Math.max(160, Math.min(480, width)) }); },
  setRightPanelWidth: width => { if (Number.isFinite(width)) set({ rightPanelWidth: Math.max(200, Math.min(540, width)) }); },
  applyWorkspaceLayout: id => {
    const state = get() as AppStore;
    const layout = [...builtinWorkspaceLayouts(), ...(state.settings.workspaceLayouts ?? [])].find(layout => layout.id === id);
    if (!layout) throw Error(uiText('layouts.missing', 'This workspace no longer exists.'));
    const { name: _name, id: _id, ...values } = layout;
    const next = { ...values, hiddenColumns: { ...values.hiddenColumns }, activeWorkspaceLayoutId: id };
    set(next);
    // Use the normal navigation guard and restore a valid sheet for this document.
    state.setActiveContentTab(layout.activeContentTab);
    if (layout.activeContentTab === 'spreadsheet') state.setActiveSubSheet(state.subSheets.find(sheet => sheet.id === state.activeSubSheetId)?.id ?? state.subSheets[0]?.id ?? null);
    else state.setActiveSubSheet(null);
    state.updateSettings({ lastWorkspaceLayoutId: id });
  },
  saveWorkspaceLayout: (name, id) => {
    const state = get() as AppStore;
    const title = name.trim().slice(0, 80);
    if (!title) throw Error(uiText('layouts.nameRequired', 'Enter a workspace name.'));
    const layouts = state.settings.workspaceLayouts ?? [];
    if (id && !layouts.some(layout => layout.id === id)) throw Error(uiText('layouts.customOnly', 'Only your saved workspaces can be overwritten.'));
    if (!id && layouts.length >= 20) throw Error(uiText('layouts.limit', 'You can save up to 20 workspaces.'));
    const layout: WorkspaceLayout = { id: id ?? crypto.randomUUID(), name: title, activeContentTab: state.activeContentTab, showSchedulePanel: state.showSchedulePanel, showPropertiesPanel: state.showPropertiesPanel, showChatPanel: state.showChatPanel,
      leftPanelWidth: state.leftPanelWidth, rightPanelWidth: state.rightPanelWidth, ifcSplitPercent: state.ifcSplitPercent, gridView: state.gridView, gridZoom: state.gridZoom, pdfZoom: state.pdfZoom, hiddenColumns: { ...state.hiddenColumns } };
    state.updateSettings({ workspaceLayouts: [...layouts.filter(value => value.id !== layout.id), layout], lastWorkspaceLayoutId: layout.id });
    set({ activeWorkspaceLayoutId: layout.id });
    return layout.id;
  },
  deleteWorkspaceLayout: id => {
    const state = get() as AppStore;
    state.updateSettings({ workspaceLayouts: (state.settings.workspaceLayouts ?? []).filter(layout => layout.id !== id), ...(state.activeWorkspaceLayoutId === id ? { lastWorkspaceLayoutId: null } : {}) });
    if (state.activeWorkspaceLayoutId === id) set({ activeWorkspaceLayoutId: null });
  },
});
