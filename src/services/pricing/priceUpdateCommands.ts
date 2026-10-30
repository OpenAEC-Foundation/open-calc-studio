import { useAppStore } from '@/state/appStore';
import { parseLibraryJson } from '@/state/slices/resourceLibrarySlice';
import { previewPriceUpdates, applyPriceUpdateRows, type PriceUpdatePlan } from './priceUpdates';
import { projectContentKey, serializeDocument } from '@/services/file/documentSnapshot';
const proposals = new Map<string, { documentId: string; base: string; plan: PriceUpdatePlan; created: number }>();
export function priceUpdateCommand(action: string, params: Record<string, unknown>) {
  const state = useAppStore.getState(), doc = state.documents.find(d => d.id === state.activeDocumentId);
  if (!doc) throw Error('Open an estimate first.');
  if (action === 'open') { state.openDialog('priceUpdates'); return { opened: true }; }
  if (action === 'preview') {
    for (const [id, p] of proposals) if (Date.now() - p.created > 30 * 60_000) proposals.delete(id);
    if (proposals.size >= 16) proposals.delete(proposals.keys().next().value!);
    const catalogue = params.catalogue == null ? state.resourceLibrary : parseLibraryJson(params.catalogue);
    if (!catalogue.length) throw Error('No catalogue articles.');
    const plan = previewPriceUpdates(state.items, state.schedule, catalogue), id = crypto.randomUUID();
    proposals.set(id, { documentId: doc.id, base: projectContentKey(serializeDocument(state, doc)), plan, created: Date.now() });
    return { proposalId: id, ...plan };
  }
  const id = params.proposalId;
  if (typeof id !== 'string' || !proposals.has(id)) throw Error('Unknown or expired price proposal.');
  const proposal = proposals.get(id)!;
  if (action === 'discard') { proposals.delete(id); return { discarded: true }; }
  if (action !== 'apply') throw Error('Unknown price action.');
  if (proposal.documentId !== doc.id || Date.now() - proposal.created > 30 * 60_000 || projectContentKey(serializeDocument(state, doc)) !== proposal.base) throw Error('The estimate changed or the proposal expired. Create a new preview.');
  if (!Array.isArray(params.itemIds) || !params.itemIds.length || params.itemIds.some(id => typeof id !== 'string')) throw Error('Select the rows to update.');
  const items = applyPriceUpdateRows(state.items, state.schedule, proposal.plan.rows, params.itemIds as string[]);
  state.pushHistory(state.items, 'Apply catalogue prices');
  useAppStore.setState({ items }); state.updateDocument(doc.id, { isModified: true });
  proposals.delete(id); return { applied: true, count: params.itemIds.length };
}
