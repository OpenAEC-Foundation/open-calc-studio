import { useAppStore } from '@/state/appStore';
import { aggregateTakeoff, type TakeoffEntry } from '@/services/ifc/ifcTakeoff';
import { compareIfcRevisions, indexGlobalIds } from './ifcRevisions';
import { serializeDocument, projectContentKey } from '@/services/file/documentSnapshot';
import { variantItems } from '@/services/grid/variantScope';
import { recalculateItems } from '@/services/calculation/calculator';
import { captureQuantityOrigin } from '@/services/quantity/quantityOrigin';
import { appendHistory } from '@/services/history/itemHistory';

export interface RevisionUpdateRow { itemId: string; description: string; before: number | null; after: number | null; unit: string; status: 'changed' | 'unchanged' | 'missing' | 'ambiguous' | 'override' | 'unit' | 'inactive'; entry?: TakeoffEntry }
export interface RevisionPreview { proposalId: string; differences: ReturnType<typeof compareIfcRevisions>; rows: RevisionUpdateRow[] }
const proposals = new Map<string, { documentId: string; base: string; nextModelId: string; oldModelId: string; created: number; preview: RevisionPreview }>();

export function revisionCommand(action: string, p: Record<string, unknown>): unknown {
  const s = useAppStore.getState(), doc = s.documents.find(d => d.id === s.activeDocumentId);
  if (!doc) throw Error('Open an estimate first.');
  if (action === 'open') { s.openDialog('revisions'); return { opened: true }; }
  if (action === 'pdf') {
    const sources = s.schedule.pdfWorkspace?.sources ?? [];
    const old = sources.find(v => v.id === p.previousId), next = sources.find(v => v.id === p.nextId);
    if (!old || !next || old.id === next.id) throw Error('Select two different PDF revisions.');
    // Match only explicit external annotation identities; equal labels alone are not a match.
    const group = (measurements: typeof old.measurements) => {
      const result = new Map<string, typeof measurements>();
      for (const m of measurements) { const key = m.annotationId ?? m.id, list = result.get(key) ?? []; list.push(m); result.set(key, list); }
      return result;
    };
    const before = group(old.measurements), after = group(next.measurements);
    return { previousId: old.id, nextId: next.id, sameFileName: old.fileName === next.fileName,
      pageScalesBefore: old.pageScales, pageScalesAfter: next.pageScales,
      rows: [...new Set([...before.keys(), ...after.keys()])].map(id => {
        const a = before.get(id) ?? [], b = after.get(id) ?? [], x = a[0], y = b[0];
        return { id, label: y?.label ?? x?.label, before: x?.value ?? null, after: y?.value ?? null,
          status: a.length > 1 || b.length > 1 ? 'ambiguous' : !x ? 'added' : !y ? 'removed' : x.type !== y.type || x.page !== y.page || x.mmPerPoint !== y.mmPerPoint || x.value !== y.value ? 'changed' : 'unchanged',
          verified: !!x?.sourceVerified && !!y?.sourceVerified };
      }) };
  }
  if (action === 'preview') {
    const takeoff = s.schedule.ifcTakeoff;
    const old = takeoff?.models.find(m => m.id === p.previousId), next = takeoff?.models.find(m => m.id === p.nextId);
    if (!old || !next || old.id === next.id) throw Error('Select two different IFC revisions.');
    const oldIds = new Map(old.elements.map(e => [e.expressId, e])), oldGlobals = indexGlobalIds(old), nextIds = indexGlobalIds(next);
    const entries = new Map(takeoff!.entries.map(e => [e.fragmentId, e])), active = new Set(variantItems(s.items, s.schedule).map(item => item.id));
    const rows: RevisionUpdateRow[] = [];
    for (const item of s.items) {
      const link = item.quantityLink;
      if (link?.source !== 'ifc') continue;
      const entry = entries.get(link.fragmentId); if (!entry || entry.modelId !== old.id) continue;
      const row: RevisionUpdateRow = { itemId: item.id, description: item.description, before: item.quantity, after: null, unit: item.unit, status: 'missing' };
      rows.push(row);
      if (!active.has(item.id)) { row.status = 'inactive'; continue; }
      if (item.quantity !== entry[link.quantity]) { row.status = 'override'; continue; }
      const ids: number[] = []; let valid = true;
      for (const id of entry.elementIds) {
        const element = oldIds.get(id), matches = element?.globalId ? nextIds.get(element.globalId) : undefined;
        const originals = element?.globalId ? oldGlobals.get(element.globalId) ?? [] : [];
        if (!matches?.length) { valid = false; break; }
        if (matches.length !== 1 || originals.length !== 1) { row.status = 'ambiguous'; valid = false; break; }
        ids.push(matches[0].expressId);
      }
      if (!valid) continue;
      try {
        const q = aggregateTakeoff(next, ids, entry.quantityKey);
        row.after = q.value;
        if (q.unit !== item.unit || q.kind !== link.quantity) { row.status = 'unit'; continue; }
        const selected = [...new Set(ids)].sort((a, b) => a - b);
        row.entry = { ...entry, fragmentId: `${next.id}:${selected.join(',')}:${q.key}`, modelId: next.id, elementIds: selected, [q.kind]: q.value, label: `${next.fileName} · ${q.label}` };
        // Renumbering/relinking is a change even when the numeric quantity is equal.
        row.status = row.entry.fragmentId !== entry.fragmentId || q.value !== item.quantity ? 'changed' : 'unchanged';
      } catch { row.status = 'missing'; }
    }
    for (const [id, proposal] of proposals) if (Date.now() - proposal.created > 30 * 60_000) proposals.delete(id);
    if (proposals.size >= 16) proposals.delete(proposals.keys().next().value!);
    const proposalId = crypto.randomUUID(), preview = { proposalId, differences: compareIfcRevisions(old, next), rows };
    proposals.set(proposalId, { documentId: doc.id, base: projectContentKey(serializeDocument(s, doc)), oldModelId: old.id, nextModelId: next.id, created: Date.now(), preview });
    return preview;
  }
  if (typeof p.proposalId !== 'string') throw Error('proposalId is required.');
  const proposal = proposals.get(p.proposalId);
  if (!proposal) throw Error('Unknown revision proposal.');
  if (action === 'discard') { proposals.delete(p.proposalId); return { discarded: true }; }
  if (action !== 'apply') throw Error('Unknown revision action.');
  if (proposal.documentId !== doc.id || Date.now() - proposal.created > 30 * 60_000 || projectContentKey(serializeDocument(s, doc)) !== proposal.base) throw Error('The estimate changed or the proposal expired. Compare again.');
  if (!Array.isArray(p.itemIds) || !p.itemIds.length || p.itemIds.some(id => typeof id !== 'string')) throw Error('Select estimate rows.');
  const selected = new Set(p.itemIds as string[]), rows = new Map(proposal.preview.rows.map(row => [row.itemId, row]));
  for (const id of selected) if (rows.get(id)?.status !== 'changed' || !rows.get(id)?.entry) throw Error('Only compatible reviewed changes may be applied.');
  const takeoff = s.schedule.ifcTakeoff!, entries = new Map(takeoff.entries.map(entry => [entry.fragmentId, entry]));
  for (const id of selected) { const entry = rows.get(id)!.entry!; entries.set(entry.fragmentId, entry); }
  const schedule = { ...s.schedule, ifcTakeoff: { ...takeoff, entries: [...entries.values()], models: takeoff.models.map(model => model.id === proposal.nextModelId ? { ...model, revision: { label: model.revision?.label ?? model.fileName, importedAt: model.revision?.importedAt ?? new Date().toISOString(), previousModelId: proposal.oldModelId } } : model) } };
  const items = recalculateItems(s.items.map(item => {
    if (!selected.has(item.id)) return item;
    const row = rows.get(item.id)!, link = { ...item.quantityLink!, source: 'ifc' as const, fragmentId: row.entry!.fragmentId, quantity: (item.quantityLink as { quantity: 'volume' | 'area' | 'length' | 'count' }).quantity };
    return { ...item, quantity: row.after, quantityLink: link, quantityOrigin: captureQuantityOrigin(link, { ...s, schedule }), history: appendHistory(item, 'quantity', item.quantity, row.after, 'IFC revision', Date.now()) };
  }), s.schedule.tarieven);
  s.pushHistory(s.items, 'Apply IFC revision'); useAppStore.setState({ schedule, items }); s.updateDocument(doc.id, { isModified: true });
  proposals.delete(p.proposalId); return { applied: true, count: selected.size };
}
