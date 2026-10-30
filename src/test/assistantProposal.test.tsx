import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useAppStore } from '@/state/appStore';
import { createDefaultItems } from '@/data/defaultBudget';
import { stageAssistantProposal, applyAssistantProposal, canUndoAssistantProposal, undoAssistantProposal, discardAssistantProposal } from '@/services/assistant/assistantProposal';
import { ProposalPreview } from '@/components/chat/ProposalPreview';
import { executeDesktopCommand } from '@/services/mcp/desktopCommand';
import { getGrandTotal } from '@/services/calculation/calculator';
import { changeLanguage } from '@/i18n/config';

const initial = useAppStore.getState();
let lineId: string, rowNumber: string;
beforeEach(async () => {
  await changeLanguage('en'); useAppStore.setState(initial, true);
  const state = useAppStore.getState(); state.addDocument({ id: 'proposal-doc', items: createDefaultItems() });
  const chapter = state.addChapter(null), post = state.addItem(chapter); lineId = state.addRegel(post);
  state.updateItem(lineId, 'quantity', 10); state.updateItem(lineId, 'normUnitPrice', 25);
  rowNumber = useAppStore.getState().items.find(item => item.id === lineId)!.nr;
  useAppStore.setState({ undoStack: [], redoStack: [] });
  state.updateDocument('proposal-doc', { isModified: false });
});
afterEach(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false; });
const actions = () => [{ type: 'update', nr: rowNumber, veld: 'aantal', waarde: 12 }, { type: 'update', nr: rowNumber, veld: 'prijs', waarde: 30 }];

describe('financial assistant proposals', () => {
  it('rejects arithmetic overflow even when all individual inputs are finite', () => {
    const before = useAppStore.getState().items;
    const proposal = stageAssistantProposal([{ type: 'update', nr: rowNumber, veld: 'aantal', waarde: 1e308 }, { type: 'update', nr: rowNumber, veld: 'prijs', waarde: 1e308 }]);
    expect(proposal.errors.join(' ')).toContain('numeric range');
    expect(() => applyAssistantProposal(proposal.id)).toThrow();
    expect(useAppStore.getState().items).toBe(before);
  });
  it('previews totals and changed rows without publishing any project mutation', () => {
    const before = useAppStore.getState(); let mutations = 0;
    const stop = useAppStore.subscribe(() => mutations++);
    const proposal = stageAssistantProposal(actions()); stop();
    expect(mutations).toBe(0); expect(useAppStore.getState()).toBe(before);
    expect(proposal.afterTotals.direct).toBeGreaterThan(proposal.beforeTotals.direct);
    expect(proposal.afterTotals.vat).toBeGreaterThan(0);
    expect(proposal.changes.find(change => change.id === lineId)?.after?.quantity).toBe(12);
    expect(proposal.changes.find(change => change.id === lineId)?.before?.normUnitPrice).toBe(25);
  });
  it('publishes the exact preview in one transaction and undoes the entire batch', () => {
    const state = useAppStore.getState(), before = JSON.stringify(state.items), proposal = stageAssistantProposal(actions());
    let count = 0; const stop = useAppStore.subscribe(() => count++);
    applyAssistantProposal(proposal.id); stop();
    expect(count).toBe(1); expect(useAppStore.getState().undoStack).toHaveLength(1);
    expect(getGrandTotal(useAppStore.getState().items)).toBe(proposal.afterTotals.includingVat);
    expect(useAppStore.getState().documents[0].isModified).toBe(true);
    expect(canUndoAssistantProposal(proposal.id)).toBe(true);
    undoAssistantProposal(proposal.id);
    expect(JSON.stringify(useAppStore.getState().items)).toBe(before);
    expect(useAppStore.getState().redoStack).toHaveLength(1);
    expect(() => applyAssistantProposal(proposal.id)).toThrow();
  });
  it('rejects stale changes and proposals for another document', () => {
    const state = useAppStore.getState(), proposal = stageAssistantProposal(actions());
    state.updateItem(lineId, 'normUnitPrice', 40);
    expect(() => applyAssistantProposal(proposal.id)).toThrow('changed');
    const fresh = stageAssistantProposal(actions()); state.addDocument({ id: 'another-doc' });
    expect(() => applyAssistantProposal(fresh.id)).toThrow('changed');
    expect(useAppStore.getState().items).toEqual([]);
  });
  it('does not undo subsequent edits or reuse a discarded proposal', () => {
    const proposal = stageAssistantProposal(actions()); applyAssistantProposal(proposal.id);
    useAppStore.getState().updateItem(lineId, 'description', 'Later edit');
    expect(canUndoAssistantProposal(proposal.id)).toBe(false);
    expect(() => undoAssistantProposal(proposal.id)).toThrow('later edits');
    const discarded = stageAssistantProposal(actions()); discardAssistantProposal(discarded.id);
    expect(() => applyAssistantProposal(discarded.id)).toThrow('expired');
  });
  it('keeps references bound to row IDs when deleting a sibling renumbers the estimate', () => {
    const state = useAppStore.getState(), parent = state.items.find(item => item.id === lineId)!.parentId!;
    const second = state.addRegel(parent), third = state.addRegel(parent);
    const rows = useAppStore.getState().items;
    const secondNumber = rows.find(item => item.id === second)!.nr;
    const proposal = stageAssistantProposal([{ type: 'verwijder', nr: rowNumber }, { type: 'update', nr: secondNumber, veld: 'omschrijving', waarde: 'Correct target' }]);
    applyAssistantProposal(proposal.id);
    expect(useAppStore.getState().items.find(item => item.id === second)?.description).toBe('Correct target');
    expect(useAppStore.getState().items.find(item => item.id === third)?.description).not.toBe('Correct target');
  });
  it('rejects linked quantity overrides and rolls back a batch with deleted targets', () => {
    const state = useAppStore.getState();
    state.updateItem(lineId, 'quantityLink', { source: 'pdf', measurementId: 'gone', kind: 'area' });
    const linked = stageAssistantProposal(actions()); expect(linked.errors.join(' ')).toContain('linked to a source');
    expect(() => applyAssistantProposal(linked.id)).toThrow();
    state.updateItem(lineId, 'quantityLink', null);
    const before = useAppStore.getState().items;
    const invalid = stageAssistantProposal([{ type: 'verwijder', nr: rowNumber }, ...actions()]);
    expect(invalid.errors.length).toBeGreaterThan(0); expect(() => applyAssistantProposal(invalid.id)).toThrow();
    expect(useAppStore.getState().items).toBe(before);
  });
  it('requires separate MCP preview and approval calls against the same live estimate', async () => {
    const before = useAppStore.getState().items;
    const preview = await executeDesktopCommand('assistant.preview', { actions: actions() }) as { id: string; afterItems?: unknown };
    expect(preview.afterItems).toBeUndefined(); expect(useAppStore.getState().items).toBe(before);
    await executeDesktopCommand('assistant.apply', { proposalId: preview.id });
    expect(useAppStore.getState().items.find(item => item.id === lineId)?.quantity).toBe(12);
    await executeDesktopCommand('assistant.undo', { proposalId: preview.id });
    expect(useAppStore.getState().items.find(item => item.id === lineId)?.quantity).toBe(10);
  });
  it('renders old/new amounts, row details and assumptions using the selected language', async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const node = document.createElement('div'); document.body.append(node); const root = createRoot(node);
    try {
      const proposal = stageAssistantProposal(actions());
      await act(async () => root.render(<ProposalPreview proposal={proposal} />));
      expect(node.textContent).toContain('Financial preview'); expect(node.textContent).toContain('Total excl. VAT');
      expect(node.querySelectorAll('tbody tr').length).toBeGreaterThan(4);
      await act(async () => { await changeLanguage('nl'); });
      expect(node.textContent).toContain('Financieel voorstel');
    } finally { await act(async () => root.unmount()); node.remove(); }
  });
});
