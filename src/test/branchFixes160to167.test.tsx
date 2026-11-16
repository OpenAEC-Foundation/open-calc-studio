import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useAppStore } from '@/state/appStore';
import { changeLanguage } from '@/i18n/config';
import { BranchTreeEditor } from '@/components/panels/BranchTreeEditor';
import { deserializeProject, migrateLegacyMainBranch, serializeProject } from '@/services/file/fileService';
import { createDefaultSchedule } from '@/data/defaultBudget';
import { makeCostItem } from '@/services/importers/core';

const initial = useAppStore.getState();
let root: Root | undefined, node: HTMLDivElement;
const modified = () => useAppStore.getState().documents.find(d => d.id === 'branch-doc')?.isModified;
const branches = () => useAppStore.getState().schedule.branches ?? [];

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await changeLanguage('en'); useAppStore.setState(initial, true);
  const state = useAppStore.getState(); state.addDocument({ id: 'branch-doc', items: [] });
  state.updateDocument('branch-doc', { isModified: false });
});
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; node?.remove(); });

async function renderEditor() {
  node = document.createElement('div'); document.body.append(node); root = createRoot(node);
  await act(async () => root!.render(<BranchTreeEditor />));
}
const buttons = () => [...node.querySelectorAll('button')];

describe('variant fixes (knownbugs 160, 166, 167)', () => {
  it('160: "Create main" creates the branch with id main, which cannot be removed', async () => {
    useAppStore.getState().setSchedule({ branchesEnabled: true, branches: [] });
    await renderEditor();
    const create = buttons().find(b => b.textContent?.includes('Create main'))!;
    await act(async () => create.click());
    expect(branches()).toEqual([expect.objectContaining({ id: 'main', parentId: null })]);
    expect(buttons().some(b => b.textContent === '✕')).toBe(false);
    useAppStore.getState().removeBranch('main');
    expect(branches().map(b => b.id)).toEqual(['main']);
  });

  it('160: opening a file with an old UUID "main" root converts it to main', async () => {
    const old = '5f0c2a8e-1111-4222-8333-944455556666';
    const schedule = { ...createDefaultSchedule(), branchesEnabled: true, activeBranchId: old,
      branches: [{ id: old, name: 'main', parentId: null }, { id: 'alt', name: 'Alt', parentId: old }] };
    const items = [makeCostItem({ rowType: 'begrotingspost', branchId: old }), makeCostItem({ rowType: 'begrotingspost', branchId: 'alt' })];
    const snapshot = { id: 's1', name: 'v1', createdAt: '', schedule: structuredClone(schedule), items: structuredClone(items) };
    const loaded = deserializeProject(serializeProject(schedule, items, undefined, undefined, undefined, [snapshot as never]));
    expect(loaded.schedule.branches).toEqual([{ id: 'main', name: 'main', parentId: null }, { id: 'alt', name: 'Alt', parentId: 'main' }]);
    expect(loaded.schedule.activeBranchId).toBe('main');
    expect(loaded.items.filter(i => i.rowType === 'begrotingspost').map(i => i.branchId)).toEqual(['main', 'alt']);
    expect(loaded.snapshots?.[0].schedule.branches?.[0].id).toBe('main');
    expect(loaded.snapshots?.[0].items[0].branchId).toBe('main');

    // Na het openen is main weer niet te verwijderen.
    useAppStore.getState().setSchedule({ branchesEnabled: true, branches: loaded.schedule.branches });
    await renderEditor();
    const rows = [...node.querySelectorAll('button')].filter(b => b.textContent === '✕');
    expect(rows).toHaveLength(1);
  });

  it('160: leaves files alone that already have main or no single root named main', () => {
    const two = { branches: [{ id: 'x', name: 'main', parentId: null }, { id: 'y', name: 'Other', parentId: null }] };
    migrateLegacyMainBranch(two, []);
    expect(two.branches.map(b => b.id)).toEqual(['x', 'y']);
    const renamed = { branches: [{ id: 'x', name: 'Basis', parentId: null }] };
    migrateLegacyMainBranch(renamed, []);
    expect(renamed.branches[0].id).toBe('x');
  });

  it('166: choosing another variant marks the document modified, the same one does not', () => {
    const s = useAppStore.getState();
    s.setSchedule({ branchesEnabled: true, activeBranchId: 'main', branches: [{ id: 'main', parentId: null, name: 'main' }, { id: 'alt', parentId: 'main', name: 'Alt' }] });
    s.setActiveBranch('main');
    expect(modified()).toBe(false);
    s.setActiveBranch('alt');
    expect(useAppStore.getState().schedule.activeBranchId).toBe('alt');
    expect(modified()).toBe(true);
  });

  it('167: Enter followed by blur adds the branch once', async () => {
    useAppStore.getState().setSchedule({ branchesEnabled: true, branches: [{ id: 'main', parentId: null, name: 'main' }] });
    await renderEditor();
    await act(async () => buttons().find(b => b.textContent === '+')!.click());
    const input = node.querySelector('input')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Alt');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    // Enter and blur before React re-renders (as some browsers do).
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    expect(branches().filter(b => b.name === 'Alt')).toHaveLength(1);
    expect(node.querySelector('input')).toBeNull();
  });

  it('167: Escape followed by blur adds nothing', async () => {
    useAppStore.getState().setSchedule({ branchesEnabled: true, branches: [{ id: 'main', parentId: null, name: 'main' }] });
    await renderEditor();
    await act(async () => buttons().find(b => b.textContent === '+')!.click());
    const input = node.querySelector('input')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Alt');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    expect(branches()).toHaveLength(1);
  });
});
