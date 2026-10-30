import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useAppStore } from '@/state/appStore';
import { reviewBudget } from '@/services/review/budgetReview';
import { ReviewCenter, ReviewReturnBar } from '@/components/review/ReviewCenter';
import { WorkspaceNavigation } from '@/components/layout/WorkspaceNavigation';
import { executeDesktopCommand } from '@/services/mcp/desktopCommand';
import { changeLanguage } from '@/i18n/config';
import { MobileWorkspace } from '@/components/mobile/MobileWorkspace';

const initial = useAppStore.getState();
let chapter: string, post: string, rule: string;
let root: Root | undefined, node: HTMLDivElement;
beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await changeLanguage('en'); useAppStore.setState(initial, true);
  const state = useAppStore.getState(); state.addDocument({ id: 'review-doc', items: [] });
  chapter = state.addChapter(null); post = state.addItem(chapter); rule = state.addRegel(post);
  state.updateItem(rule, 'description', 'Concrete'); state.updateItem(rule, 'quantity', 14);
  state.updateDocument('review-doc', { isModified: false }); useAppStore.setState({ undoStack: [], redoStack: [] });
});
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; node?.remove(); });
const report = () => reviewBudget(useAppStore.getState());
const codes = () => report().issues.map(issue => issue.code);

describe('estimate review checks', () => {
  it('flags missing price inputs on cost leaves, without flagging their parents', () => {
    const result = report();
    expect(result.counts).toEqual({ all: 1, price: 1, source: 0, unit: 0 });
    expect(result.issues[0]).toMatchObject({ itemId: rule, code: 'missing-price' });
    expect(result.affectedRows).toBe(1); expect(result.rowCount).toBe(3);
  });
  it('accepts an explicit zero price, a negative credit price and derived zero tariffs', () => {
    const state = useAppStore.getState();
    state.updateItem(rule, 'normUnitPrice', 0); expect(codes()).toEqual([]);
    state.updateItem(rule, 'normUnitPrice', -20); expect(codes()).toEqual([]);
    state.updateItem(rule, 'normUnitPrice', null); state.updateItem(rule, 'normQuantity', 2); state.updateItem(rule, 'tariefGroep', 'A');
    state.setSchedule({ tarieven: { A: 0, B: 0, C: 0 } }); expect(codes()).toEqual([]);
  });
  it('does not flag text, pro-memoria or zero-quantity rows', () => {
    const state = useAppStore.getState(); state.addTekstregel(post);
    state.updateItem(rule, 'unit', 'pm'); expect(codes()).toEqual([]);
    state.updateItem(rule, 'unit', 'm³'); state.updateItem(rule, 'quantity', 0); expect(codes()).toEqual([]);
  });
  it('checks bare posts with text children but does not double-count rollups', () => {
    const state = useAppStore.getState(); state.deleteItem(rule); state.addTekstregel(post); state.updateItem(post, 'quantity', 12);
    expect(report().issues.map(issue => issue.itemId)).toEqual([post]);
    state.updateItem(post, 'materialPrice', 0); expect(codes()).toEqual([]);
  });
  it('includes collapsed rows and limits checks to the active variant', () => {
    const state = useAppStore.getState(); state.toggleCollapse(chapter);
    state.updateItem(rule, 'branchId', 'alternative');
    state.setSchedule({ branchesEnabled: true, activeBranchId: 'main', branches: [{ id: 'main', parentId: null, name: 'Main' }, { id: 'alternative', parentId: 'main', name: 'Alternative' }] });
    expect(report().issues.some(issue => issue.itemId === rule)).toBe(false);
    state.setSchedule({ activeBranchId: 'alternative' });
    expect(report().issues.some(issue => issue.itemId === rule)).toBe(true);
  });
  it('reports unavailable sources and saved unit mismatches without losing the quantity', () => {
    const state = useAppStore.getState(); state.updateItem(rule, 'normUnitPrice', 2);
    state.updateItem(rule, 'quantityLink', { source: 'pdf', measurementId: 'missing', kind: 'area' });
    const saved = useAppStore.getState().items.map(item => item.id === rule ? { ...item, quantityOrigin: { source: 'pdf' as const, label: 'Ground floor', sources: [{ id: 'drawing', name: 'Plan.pdf', page: 3 }], formula: 'area', value: 14, unit: 'm²' } } : item);
    useAppStore.setState({ items: saved });
    const before = JSON.stringify(useAppStore.getState().items);
    expect(codes()).toEqual(['missing-source', 'unit-mismatch']);
    expect(report().issues[0].source?.sources[0].name).toBe('Plan.pdf');
    expect(JSON.stringify(useAppStore.getState().items)).toBe(before);
  });
  it('treats invalid spreadsheet cells as unavailable and a valid zero as available', () => {
    const state = useAppStore.getState(), sheetId = state.addSubSheet('Quantities');
    state.setSubSheetCell(sheetId, 'A1', '#REF!'); state.updateItem(rule, 'normUnitPrice', 1);
    state.updateItem(rule, 'quantityLink', { source: 'spreadsheet', sheetId, cellRef: 'A1' });
    expect(codes()).toEqual(['missing-source']);
    state.setSubSheetCell(sheetId, 'A1', '0'); state.updateItem(rule, 'quantity', 0);
    expect(codes()).toEqual([]);
  });
  it('uses persisted IFC quantities without requiring loaded geometry', () => {
    const state = useAppStore.getState(); state.updateItem(rule, 'unit', 'm³'); state.updateItem(rule, 'normUnitPrice', 1);
    state.setSchedule({ ifcTakeoff: { models: [{ id: 'model', fileName: 'Building.ifc', elements: [] }], entries: [{ fragmentId: 'entry', modelId: 'model', label: 'Walls', elementIds: [42], quantityKey: 'NetVolume', volume: 14 }] } });
    state.updateItem(rule, 'quantityLink', { source: 'ifc', fragmentId: 'entry', quantity: 'volume' });
    expect(codes()).toEqual([]);
    state.updateItem(rule, 'quantity', 15); expect(codes()).toEqual(['different-quantity']);
  });
  it('marks external Excel references as unchecked information rather than broken sources', () => {
    const state = useAppStore.getState(); state.updateItem(rule, 'normUnitPrice', 1);
    state.updateItem(rule, 'excelLink', { filePath: '/example.xlsx', sheet: 'Sheet1', cell: 'A1' });
    expect(report().issues[0]).toMatchObject({ code: 'unchecked-excel', severity: 'info' });
  });
});

describe('review navigation and MCP', () => {
  it('reveals the exact row through collapsed ancestors without financial edits, dirtying or history', async () => {
    const state = useAppStore.getState(); state.toggleCollapse(chapter); state.toggleCollapse(post);
    const before = useAppStore.getState(), financial = before.items.map(({ isCollapsed, ...item }) => item);
    const result = await executeDesktopCommand('review.list'); expect(result).toMatchObject({ counts: { all: 1 } });
    await executeDesktopCommand('review.open', { category: 'price' });
    await executeDesktopCommand('review.openItem', { itemId: rule });
    const after = useAppStore.getState();
    expect(after.activeContentTab).toBe('grid'); expect(after.activeItemId).toBe(rule);
    expect(after.getGridRows()[after.activeRow].id).toBe(rule);
    expect(after.items.map(({ isCollapsed, ...item }) => item)).toEqual(financial);
    expect(after.schedule).toBe(before.schedule); expect(after.undoStack).toBe(before.undoStack);
    expect(after.documents[0].isModified).toBe(false);
    expect(JSON.stringify(result)).not.toContain('dataBase64');
  });
  it('validates review commands, rejects stale rows and resets selection on document changes', async () => {
    await expect(executeDesktopCommand('review.list', { category: 'bad' })).rejects.toThrow();
    await expect(executeDesktopCommand('review.list', { extra: true })).rejects.toThrow();
    await expect(executeDesktopCommand('review.openItem', {})).rejects.toThrow();
    await expect(executeDesktopCommand('review.openItem', { itemId: 'missing' })).rejects.toThrow();
    useAppStore.getState().openReviewItem(rule);
    useAppStore.getState().setReviewFilter('source');
    useAppStore.getState().addDocument({ id: 'second', items: [] });
    expect(useAppStore.getState()).toMatchObject({ reviewFilter: 'all', reviewIssueId: null, reviewReturnItemId: null });
    await expect(executeDesktopCommand('review.openItem', { itemId: rule })).rejects.toThrow();
  });
  it('keeps generic MCP row navigation out of history too', async () => {
    useAppStore.getState().toggleCollapse(chapter);
    const undo = useAppStore.getState().undoStack;
    await executeDesktopCommand('openReviewItem', { itemId: rule });
    expect(useAppStore.getState().undoStack).toBe(undo);
    expect(useAppStore.getState().documents[0].isModified).toBe(false);
  });
  it('supports sidebar → filters → issue → exact row → return, and translates into Dutch', async () => {
    function Harness() {
      const tab = useAppStore(s => s.activeContentTab);
      return <><WorkspaceNavigation onStart={() => {}} onSettings={() => {}} />{tab === 'review' ? <ReviewCenter /> : <ReviewReturnBar />}</>;
    }
    node = document.createElement('div'); document.body.append(node); root = createRoot(node);
    await act(async () => root!.render(<Harness />));
    await act(async () => (node.querySelector('button[aria-label="Review center"]') as HTMLButtonElement).click());
    expect(node.querySelector('button[aria-label="Review center"]')).toHaveAttribute('aria-current', 'page');
    const filter = [...node.querySelectorAll('.review-filters button')].find(button => button.textContent?.startsWith('Prices')) as HTMLButtonElement;
    await act(async () => filter.click()); expect(filter).toHaveAttribute('aria-pressed', 'true');
    await act(async () => (node.querySelector('.review-issue') as HTMLButtonElement).click());
    await act(async () => (node.querySelector('.review-detail > button') as HTMLButtonElement).click());
    expect(useAppStore.getState().activeItemId).toBe(rule);
    await act(async () => (node.querySelector('.review-return-bar button') as HTMLButtonElement).click());
    expect(useAppStore.getState()).toMatchObject({ activeContentTab: 'review', reviewFilter: 'price' });
    await act(async () => { await changeLanguage('nl'); });
    expect(node.textContent).toContain('Controlecentrum'); expect(node.textContent).toContain('Prijs niet ingevuld');
    await act(async () => useAppStore.getState().updateItem(rule, 'normUnitPrice', 0));
    expect(node.querySelector('.review-empty')).toHaveTextContent('Geen meldingen gevonden');
    expect(node.querySelector('.workspace-review-count')).toHaveTextContent('0');
  });
  it('opens the flagged row editor on mobile and returns to the same review', async () => {
    node = document.createElement('div'); document.body.append(node); root = createRoot(node);
    await act(async () => root!.render(<MobileWorkspace />));
    const review = [...node.querySelectorAll('.mobile-nav button')].find(button => button.textContent?.startsWith('Review')) as HTMLButtonElement;
    await act(async () => review.click());
    expect(node.querySelector('.review-center')).toBeTruthy();
    await act(async () => (node.querySelector('.review-detail > button') as HTMLButtonElement).click());
    expect(node.querySelector('.mobile-edit-fields input')).toHaveValue('Concrete');
    const close = node.querySelector('.mobile-edit-head button') as HTMLButtonElement;
    await act(async () => close.click());
    await act(async () => (node.querySelector('.review-return-bar button') as HTMLButtonElement).click());
    expect(node.querySelector('.review-center')).toBeTruthy();
  });
});
