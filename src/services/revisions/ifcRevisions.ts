import type { TakeoffModel, TakeoffElement } from '@/services/ifc/ifcTakeoff';
export interface IfcRevisionDifference { globalId: string; name: string; status: 'added' | 'removed' | 'changed' | 'renumbered' | 'unchanged' | 'ambiguous'; oldId?: number; newId?: number; quantities: { key: string; before: number | null; after: number | null; unit: string }[] }
export function indexGlobalIds(model: TakeoffModel): Map<string, TakeoffElement[]> {
  const result = new Map<string, TakeoffElement[]>();
  for (const element of model.elements) {
    const key = element.globalId || `missing:${model.id}:${element.expressId}`;
    const entries = result.get(key) ?? []; entries.push(element); result.set(key, entries);
  }
  return result;
}
/** Quantity/identity comparison. Geometry-only changes require the original IFC viewer. */
export function compareIfcRevisions(previous: TakeoffModel, next: TakeoffModel): IfcRevisionDifference[] {
  const old = indexGlobalIds(previous), current = indexGlobalIds(next);
  return [...new Set([...old.keys(), ...current.keys()])].map(globalId => {
    const a = old.get(globalId) ?? [], b = current.get(globalId) ?? [];
    const before = a[0], after = b[0];
    const oldQ = new Map(before?.quantities.map(q => [q.key, q]) ?? []), newQ = new Map(after?.quantities.map(q => [q.key, q]) ?? []);
    const quantities = [...new Set([...oldQ.keys(), ...newQ.keys()])].map(key => ({ key, before: oldQ.get(key)?.value ?? null, after: newQ.get(key)?.value ?? null, unit: newQ.get(key)?.unit ?? oldQ.get(key)!.unit }));
    const changed = before?.type !== after?.type || before?.name !== after?.name || quantities.some(q => q.before !== q.after || oldQ.get(q.key)?.unit !== newQ.get(q.key)?.unit);
    const status = a.length > 1 || b.length > 1 || globalId.startsWith('missing:') ? 'ambiguous' : !before ? 'added' : !after ? 'removed' : changed ? 'changed' : before.expressId !== after.expressId ? 'renumbered' : 'unchanged';
    return { globalId, name: after?.name ?? before?.name ?? '', status, oldId: before?.expressId, newId: after?.expressId, quantities };
  });
}
