import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { changeLanguage } from '@/i18n/config';
import { useAppStore } from '@/state/appStore';
import { WorkspaceNavigation } from '@/components/layout/WorkspaceNavigation';
import { WorkspaceHeader } from '@/components/layout/WorkspaceHeader';
import { SubSheetTabBar } from '@/components/grid/SubSheetTabBar';
import { createDefaultItems, createDefaultSchedule } from '@/data/defaultBudget';
import { getStaartBreakdown } from '@/services/calculation/calculator';

let container: HTMLDivElement;
let root: Root;
const saveFile = vi.fn();
vi.mock('@/hooks/useFileOperations', () => ({ useFileOperations: () => ({ saveFile }) }));
async function renderShell() {
  await act(async () => root.render(<><WorkspaceNavigation onStart={vi.fn()} onSettings={vi.fn()} /><WorkspaceHeader /><SubSheetTabBar sheetsOnly /></>));
}
function button(name: string) {
  return [...container.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === name || b.textContent?.trim() === name)!;
}
async function click(name: string) { await act(async () => button(name).click()); }
beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await changeLanguage('en');
  useAppStore.setState({ documents: [], activeDocumentId: '', subSheets: [], activeSubSheetId: null, activeContentTab: 'grid' });
  useAppStore.getState().addDocument({ id: 'workspace-test', fileName: 'Test estimate', items: createDefaultItems(), schedule: { ...createDefaultSchedule(), projectName: 'Office renovation', projectNumber: 'P-42' } });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  saveFile.mockClear();
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

describe('desktop workspace navigation', () => {
  it('moves from a spreadsheet back to the estimate without losing sheet data', async () => {
    await renderShell();
    await click('Spreadsheets');
    const state = useAppStore.getState();
    const id = state.activeSubSheetId!;
    expect(state.activeContentTab).toBe('spreadsheet');
    expect(state.subSheets).toHaveLength(1);
    await click('Estimate');
    expect(useAppStore.getState().activeContentTab).toBe('grid');
    expect(useAppStore.getState().activeSubSheetId).toBeNull();
    await click('Spreadsheets');
    expect(useAppStore.getState().activeSubSheetId).toBe(id);
    expect(useAppStore.getState().subSheets).toHaveLength(1);
    expect(button('Spreadsheets')).toHaveAttribute('aria-current', 'page');
  });
  it('opens the assistant, drawing and reporting workspaces on the same document', async () => {
    await renderShell();
    for (const [label, tab] of [['Prompt & Estimate', 'promptBudget'], ['PDF & measurements', 'pdf'], ['3D & quantities', 'viewer3d'], ['Reports', 'rapport']]) {
      await click(label);
      expect(useAppStore.getState().activeContentTab).toBe(tab);
      expect(useAppStore.getState().activeDocumentId).toBe('workspace-test');
      expect(button(label)).toHaveAttribute('aria-current', 'page');
    }
    expect(container.querySelectorAll('button[aria-current="page"]')).toHaveLength(1);
  });
  it('updates the project heading, unsaved status and total when the estimate changes', async () => {
    await renderShell();
    expect(container.querySelector('h1')).toHaveTextContent('Office renovation');
    expect(container.textContent).toContain('P-42');
    expect(container.textContent).toContain('Local document');
    await act(async () => {
      const state = useAppStore.getState();
      const chapter = state.addChapter(null);
      const post = state.addItem(chapter);
      const rule = state.addRegel(post);
      state.updateItem(rule, 'quantity', 10);
      state.updateItem(rule, 'normUnitPrice', 25);
    });
    expect(container.textContent).toContain('Unsaved changes');
    const breakdown = getStaartBreakdown(useAppStore.getState().items);
    expect(breakdown.aanneemsom).toBeGreaterThan(0);
    expect(breakdown.btwAmount + breakdown.btwLaagAmount).toBeGreaterThan(0);
    const expected = new Intl.NumberFormat('en', { style: 'currency', currency: 'EUR' }).format(breakdown.aanneemsom + breakdown.afronding);
    expect(container.querySelector('.workspace-total strong')).toHaveTextContent(expected);
    await click('Save');
    expect(saveFile).toHaveBeenCalledOnce();
  });
  it('changes navigation and project metadata labels to Dutch live', async () => {
    await renderShell();
    await act(async () => { await changeLanguage('nl'); });
    expect(button('Begroting')).toHaveAttribute('aria-current', 'page');
    expect(button('PDF & metingen')).toBeInTheDocument();
    expect(container.textContent).toContain('Begroting · excl. btw');
    expect(container.querySelector('h1')).toHaveTextContent('Office renovation');
  });
  it('disables document navigation when there are no open estimates', async () => {
    await act(async () => useAppStore.getState().removeDocument('workspace-test'));
    await renderShell();
    expect(button('Estimate')).toBeDisabled();
    expect(button('Spreadsheets')).toBeDisabled();
    expect(button('Projects & files')).not.toBeDisabled();
  });
});
