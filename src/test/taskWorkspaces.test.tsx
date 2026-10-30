import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useAppStore } from '@/state/appStore';
import { builtinWorkspaceLayouts } from '@/state/slices/workspaceSlice';
import { WorkspaceLayoutBar } from '@/components/layout/WorkspaceLayoutBar';
import { createDefaultItems } from '@/data/defaultBudget';
import { loadSettings, saveSettings, sanitizeWorkspaceLayouts, defaultSettings } from '@/utils/settings';
import { changeLanguage } from '@/i18n/config';

const initial = useAppStore.getState();
let root: Root | undefined, container: HTMLDivElement;
beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await changeLanguage('en');
  useAppStore.setState({ ...initial, settings: { ...defaultSettings, workspaceLayouts: [] } }, true);
  useAppStore.getState().addDocument({ id: 'layout-document', items: createDefaultItems() });
});
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; container?.remove(); });

describe('task workspaces', () => {
  it('changes the actual view and panels without editing the project or its history', () => {
    const state = useAppStore.getState(), items = state.items, schedule = state.schedule, undo = state.undoStack;
    state.applyWorkspaceLayout('measure');
    expect(useAppStore.getState()).toMatchObject({ activeContentTab: 'pdf', showPropertiesPanel: false, showSchedulePanel: false });
    state.applyWorkspaceLayout('review');
    expect(useAppStore.getState()).toMatchObject({ activeContentTab: 'grid', showPropertiesPanel: true, showSchedulePanel: true, rightPanelWidth: 340 });
    expect(useAppStore.getState().items).toBe(items); expect(useAppStore.getState().schedule).toBe(schedule); expect(useAppStore.getState().undoStack).toBe(undo);
    expect(useAppStore.getState().documents[0].isModified).toBe(false);
  });
  it('persists custom panel widths, zoom, column visibility and the selected workspace', async () => {
    useAppStore.setState({ activeContentTab: 'viewer3d', leftPanelWidth: 275, rightPanelWidth: 380, pdfZoom: 2, gridZoom: 125, ifcSplitPercent: 65, hiddenColumns: { 'wpcalc:notes': true } });
    const id = useAppStore.getState().saveWorkspaceLayout('My takeoff');
    await saveSettings(useAppStore.getState().settings);
    const settings = await loadSettings();
    expect(settings.lastWorkspaceLayoutId).toBe(id);
    useAppStore.getState().applyWorkspaceLayout('measure');
    useAppStore.getState().setSettings(settings);
    useAppStore.getState().applyWorkspaceLayout(id);
    expect(useAppStore.getState()).toMatchObject({ activeContentTab: 'viewer3d', leftPanelWidth: 275, rightPanelWidth: 380, gridZoom: 125, ifcSplitPercent: 65, hiddenColumns: { 'wpcalc:notes': true } });
    useAppStore.getState().toggleColumnHidden('wpcalc', 'notes');
    expect(settings.workspaceLayouts![0].hiddenColumns['wpcalc:notes']).toBe(true);
  });
  it('updates and deletes a saved layout while keeping built-in workspaces available', () => {
    const state = useAppStore.getState(), id = state.saveWorkspaceLayout('Site');
    state.saveWorkspaceLayout('Site updated', id);
    expect(useAppStore.getState().settings.workspaceLayouts).toHaveLength(1);
    expect(useAppStore.getState().settings.workspaceLayouts![0].name).toBe('Site updated');
    state.deleteWorkspaceLayout(id);
    expect(useAppStore.getState().settings.workspaceLayouts).toEqual([]);
    expect(useAppStore.getState().settings.lastWorkspaceLayoutId).toBeNull();
    expect(() => state.saveWorkspaceLayout('Overwrite default', 'measure')).toThrow();
    expect(builtinWorkspaceLayouts()).toHaveLength(3);
  });
  it('rejects malformed persisted layouts and clamps panel dimensions', () => {
    const layout = { ...builtinWorkspaceLayouts()[0], id: 'valid', leftPanelWidth: 20000, rightPanelWidth: -2 };
    const layouts = sanitizeWorkspaceLayouts([null, {}, layout, layout, { ...layout, id: 'bad', activeContentTab: 'anything' }]);
    expect(layouts).toHaveLength(1); expect(layouts[0].leftPanelWidth).toBe(480); expect(layouts[0].rightPanelWidth).toBe(200);
    expect(sanitizeWorkspaceLayouts({})).toEqual([]);
  });
  it('renders functional task buttons and updates their labels when the language changes', async () => {
    container = document.createElement('div'); document.body.append(container); root = createRoot(container);
    await act(async () => root!.render(<WorkspaceLayoutBar />));
    const button = [...container.querySelectorAll('button')].find(button => button.textContent === 'Review')!;
    await act(async () => button.click());
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(useAppStore.getState().showSchedulePanel).toBe(true);
    await act(async () => { await changeLanguage('nl'); });
    expect(container.textContent).toContain('Controleren');
  });
});
