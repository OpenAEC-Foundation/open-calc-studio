import type { CostItem, CostSchedule } from '@/types/costModel';
import { getStaartBreakdown, recalculateItems } from '@/services/calculation/calculator';
import { useAppStore } from '@/state/appStore';
import { simulateActies, commitAssistantItems, type AssistantActie } from './assistantActions';
import { uiText } from '@/i18n/uiText';

export interface ProposalTotals { direct: number; excludingVat: number; vat: number; includingVat: number }
export interface ProposalChange { id: string; kind: 'added' | 'removed' | 'changed'; before?: CostItem; after?: CostItem }
export interface AssistantProposal {
  id: string; documentId: string; createdAt: string; basis: string; currency: string;
  actions: AssistantActie[]; results: string[]; errors: string[];
  beforeTotals: ProposalTotals; afterTotals: ProposalTotals; changes: ProposalChange[];
  assumptions: string[]; afterItems: CostItem[];
}
export type AssistantProposalSummary = Omit<AssistantProposal, 'afterItems' | 'basis'>;
export function summarizeAssistantProposal(proposal: AssistantProposal): AssistantProposalSummary {
  const { afterItems: _items, basis: _basis, ...summary } = proposal;
  return summary;
}
function totals(items: CostItem[]): ProposalTotals {
  const b = getStaartBreakdown(items);
  return { direct: b.kostprijs, excludingVat: b.aanneemsom + b.afronding, vat: b.btwAmount + b.btwLaagAmount, includingVat: b.aanneemsomAfgerond };
}
const basisCache = new WeakMap<CostItem[], WeakMap<CostSchedule, string>>();
export function proposalBasis(items: CostItem[], schedule: CostSchedule): string {
  const cached = basisCache.get(items)?.get(schedule);
  if (cached) return cached;
  const basis = JSON.stringify({ items: items.map(({ isCollapsed: _collapsed, ...data }) => data), tarieven: schedule.tarieven, currency: schedule.currency,
    pdf: schedule.pdfWorkspace?.sources.map(source => ({ id: source.id, fileName: source.fileName, pageScales: source.pageScales, measurements: source.measurements.map(({ originalAnnotation: _annotation, ...measurement }) => measurement) })),
    ifc: schedule.ifcTakeoff ? { models: schedule.ifcTakeoff.models.map(model => model.id), entries: schedule.ifcTakeoff.entries } : undefined });
  const bySchedule = basisCache.get(items) ?? new WeakMap<CostSchedule, string>();
  bySchedule.set(schedule, basis); basisCache.set(items, bySchedule);
  return basis;
}
const compareFields: (keyof CostItem)[] = ['description', 'code', 'quantity', 'unit', 'normUnitPrice', 'normQuantity', 'laborPrice', 'materialPrice', 'tariefGroep', 'resourceType', 'total', 'parentId'];
export function createAssistantProposal(actions: AssistantActie[], documentId: string, items: CostItem[], schedule: CostSchedule): AssistantProposal {
  if (!actions.length || actions.length > 100) throw Error(uiText('proposal.actionLimit', 'Provide between 1 and 100 proposed changes.'));
  const { items: afterItems, results } = simulateActies(actions, items, schedule);
  const before = new Map(items.map(item => [item.id, item]));
  const after = new Map(afterItems.map(item => [item.id, item]));
  const changes: ProposalChange[] = [];
  for (const item of items) {
    const next = after.get(item.id);
    if (!next) changes.push({ id: item.id, kind: 'removed', before: item });
    else if (compareFields.some(field => item[field] !== next[field])) changes.push({ id: item.id, kind: 'changed', before: item, after: next });
  }
  for (const item of afterItems) if (!before.has(item.id)) changes.push({ id: item.id, kind: 'added', after: item });
  const assumptions = [uiText('proposal.existingRates', 'Existing project rates, markups, rounding and VAT rules are reused.'), uiText('proposal.noMarketPrices', 'Proposed unit prices are inputs; no market price check was performed.')];
  for (const action of actions) {
    if (action.type === 'add_regel' && !action.eenheid) assumptions.push(uiText('proposal.defaultUnit', '“{{name}}”: unit defaults to pieces.', { name: action.omschrijving }));
    if (action.type === 'add_regel' && action.prijs == null && String(action.eenheid).toLowerCase() !== 'uur') assumptions.push(uiText('proposal.noPrice', '“{{name}}”: no unit price supplied.', { name: action.omschrijving }));
    if (action.type === 'add_regel' && String(action.eenheid).toLowerCase() === 'uur') assumptions.push(uiText('proposal.labourRate', '“{{name}}”: labour uses rate group {{group}}.', { name: action.omschrijving, group: action.tariefgroep ?? 'A' }));
  }
  return { id: crypto.randomUUID(), documentId, createdAt: new Date().toISOString(), basis: proposalBasis(items, schedule), currency: schedule.currency || 'EUR', actions: structuredClone(actions), results,
    errors: results.filter(line => line.startsWith('✖')), beforeTotals: totals(items), afterTotals: totals(afterItems), changes, assumptions, afterItems };
}

// Proposals are session-local capabilities. MCP approves an ID, never arbitrary
// caller-supplied afterItems. Bound the cache so long sessions cannot retain it all.
const proposals = new Map<string, AssistantProposal>();
const applied = new Map<string, { documentId: string; description: string; basis: string }>();
export function stageAssistantProposal(actions: AssistantActie[], documentId = useAppStore.getState().activeDocumentId, items = useAppStore.getState().items, schedule = useAppStore.getState().schedule) {
  if (!documentId) throw Error(uiText('proposal.openDocument', 'Open an estimate before preparing a proposal.'));
  const proposal = createAssistantProposal(actions, documentId, items, schedule);
  if (proposals.size >= 50) proposals.delete(proposals.keys().next().value!);
  proposals.set(proposal.id, proposal);
  return proposal;
}
export function applyAssistantProposal(id: string): AssistantProposal {
  const proposal = proposals.get(id);
  if (!proposal) throw Error(uiText('proposal.expired', 'This proposal has expired or was already applied. Prepare it again.'));
  const state = useAppStore.getState();
  if (proposal.errors.length) throw Error(proposal.errors.join('\n'));
  if (proposal.documentId !== state.activeDocumentId || proposal.basis !== proposalBasis(state.items, state.schedule)) throw Error(uiText('chat.stale', 'The estimate has changed since this proposal. Send the request again.'));
  const description = `${uiText('chat.actions.history', 'Estimating assistant')} · ${proposal.id.slice(0, 8)}`;
  commitAssistantItems(proposal.afterItems, description);
  if (applied.size >= 50) applied.delete(applied.keys().next().value!);
  applied.set(id, { documentId: proposal.documentId, description, basis: proposalBasis(proposal.afterItems, state.schedule) });
  proposals.delete(id);
  return proposal;
}
export function discardAssistantProposal(id: string): void { proposals.delete(id); }
export function canUndoAssistantProposal(id: string): boolean {
  const batch = applied.get(id), state = useAppStore.getState();
  return !!batch && batch.documentId === state.activeDocumentId && state.undoStack[state.undoStack.length - 1]?.description === batch.description && proposalBasis(state.items, state.schedule) === batch.basis;
}
export function undoAssistantProposal(id: string): void {
  if (!canUndoAssistantProposal(id)) throw Error(uiText('proposal.undoBlocked', 'Undo later edits first, then undo this proposal.'));
  const state = useAppStore.getState(), entry = state.undoStack[state.undoStack.length - 1];
  useAppStore.setState({ items: recalculateItems(structuredClone(entry.items), state.schedule.tarieven), undoStack: state.undoStack.slice(0, -1),
    redoStack: [...state.redoStack, { items: structuredClone(state.items), description: entry.description }],
    documents: state.documents.map(doc => doc.id === state.activeDocumentId ? { ...doc, isModified: true } : doc) });
  applied.delete(id);
}
