import type { StateCreator } from 'zustand';
import i18next from 'i18next';
import type { CostItem, DocumentTab } from '@/types/costModel';
import { effectiveTarieven, recalculateItems } from '@/services/calculation/calculator';
import { isFooterRow } from '@/services/grid/gridRows';
import { generateIfcGuid } from '@/services/ifc/ifcHelpers';

export interface ClipboardSlice {
  clipboardItems: CostItem[];
  clipboardMode: 'copy' | 'cut' | null;
  /** Document the rows were cut from: a cut-paste in another document removes them there. */
  clipboardSourceDocumentId: string | null;
  copyItems: (items: CostItem[]) => void;
  cutItems: (items: CostItem[]) => void;
  pasteItems: () => void;
  clearClipboard: () => void;
}

/** Preserve calculation children when copying a collapsed chapter or cost item. */
function clipboardTree(selected: CostItem[], all: CostItem[]): CostItem[] {
  const roots = new Map(selected.map(item => [item.id, item]));
  const included = new Set(roots.keys());
  const children = new Map<string, CostItem[]>();
  for (const item of all) if (item.parentId) { const group = children.get(item.parentId) ?? []; group.push(item); children.set(item.parentId, group); }
  const pending = [...included];
  for (let index = 0; index < pending.length; index++) for (const child of children.get(pending[index]) ?? []) {
    if (!included.has(child.id)) { included.add(child.id); pending.push(child.id); }
  }
  const storedIds = new Set(all.map(item => item.id));
  return [...all.filter(item => included.has(item.id)).map(item => roots.get(item.id) ?? item), ...selected.filter(item => !storedIds.has(item.id))];
}

const CONTAINER_TYPES = new Set<string>(['chapter', 'begrotingspost', 'bewakingspost']);

/**
 * May a pasted top row hang under `parent` (null = top level)? The same levels
 * as the structure tree (treeRules.ts): a begrotingspost in a chapter without
 * paragraphs, a bewakingspost in a begrotingspost, a regel in a (bewakings)post,
 * a chapter on the top level or as paragraph of a top chapter without posts.
 */
function allowedParent(root: CostItem, rootHasChapters: boolean, parent: CostItem | null, childrenOf: (id: string) => CostItem[]): boolean {
  switch (root.rowType) {
    case 'chapter':
      if (!parent) return true;
      return parent.rowType === 'chapter' && !parent.parentId && !rootHasChapters
        && !childrenOf(parent.id).some(child => child.rowType === 'begrotingspost');
    case 'begrotingspost':
      return parent?.rowType === 'chapter' && !childrenOf(parent.id).some(child => child.rowType === 'chapter');
    case 'bewakingspost': return parent?.rowType === 'begrotingspost';
    case 'regel': return parent?.rowType === 'begrotingspost' || parent?.rowType === 'bewakingspost';
    case 'tekstregel':
    case 'witregel': return !parent || CONTAINER_TYPES.has(parent.rowType);
    default: return !parent; // staartregels
  }
}

/** Remove cut rows from the (inactive) document they came from, as an undoable step there. */
function removeFromSourceDocument(doc: DocumentTab, cutIds: Set<string>, description: string): DocumentTab {
  const remaining = doc.items.filter(item => !cutIds.has(item.id));
  if (remaining.length === doc.items.length) return doc;
  const tarieven = effectiveTarieven(doc.schedule);
  const context = doc.context && {
    ...doc.context,
    undoStack: [...doc.context.undoStack.slice(-49), { items: JSON.parse(JSON.stringify(doc.items)), description, tarieven }],
    redoStack: [],
  };
  return { ...doc, items: recalculateItems(remaining, tarieven), isModified: true, ...(context ? { context } : {}) };
}

export const createClipboardSlice: StateCreator<ClipboardSlice> = (set, get) => ({
  clipboardItems: [],
  clipboardMode: null,
  clipboardSourceDocumentId: null,
  copyItems: (items) => set({ clipboardItems: JSON.parse(JSON.stringify(clipboardTree(items, (get() as ClipboardSlice & { items: CostItem[] }).items))), clipboardMode: 'copy', clipboardSourceDocumentId: null }),
  cutItems: (items) => {
    const state = get() as ClipboardSlice & { items: CostItem[]; activeDocumentId?: string };
    set({ clipboardItems: JSON.parse(JSON.stringify(clipboardTree(items, state.items))), clipboardMode: 'cut', clipboardSourceDocumentId: state.activeDocumentId || null });
  },

  pasteItems: () => {
    const state = get() as any; // full AppStore at runtime
    const { clipboardItems, clipboardMode, items, activeRow, activeItemId } = state;
    if (!clipboardItems || clipboardItems.length === 0) return;
    const isCut = clipboardMode === 'cut';
    const sourceDocId: string | null = state.clipboardSourceDocumentId ?? null;
    // Cut in this document: the originals are here and go away after the paste.
    // Cut in another document: they are removed there (at the end).
    const cutHere = isCut && (!sourceDocId || sourceDocId === state.activeDocumentId);
    const clipIds = new Set<string>(clipboardItems.map((item: CostItem) => item.id));
    const originals = cutHere ? clipIds : new Set<string>();

    const byId = new Map<string, CostItem>(items.map((item: CostItem) => [item.id, item]));
    const childrenByParent = new Map<string, CostItem[]>();
    for (const item of items as CostItem[]) {
      if (!item.parentId || originals.has(item.id)) continue;
      const list = childrenByParent.get(item.parentId);
      if (list) list.push(item); else childrenByParent.set(item.parentId, [item]);
    }
    const childrenOf = (id: string) => childrenByParent.get(id) ?? [];
    // Row types that already sit under each parent ('' = top level). Pasting
    // next to rows of the same type is always fine, also in estimates that do
    // not follow the tree rules (posts without chapters, older mixed files).
    const typesUnder = new Map<string, Set<string>>();
    for (const item of items as CostItem[]) {
      if (originals.has(item.id)) continue;
      const key = item.parentId ?? '';
      const set = typesUnder.get(key);
      if (set) set.add(item.rowType); else typesUnder.set(key, new Set([item.rowType]));
    }
    const fits = (root: CostItem, hasChapters: boolean, parent: CostItem | null) =>
      allowedParent(root, hasChapters, parent, childrenOf)
      || (typesUnder.get(parent?.id ?? '')?.has(root.rowType) ?? false);
    const parentOf = (item: CostItem): CostItem | null => (item.parentId ? byId.get(item.parentId) ?? null : null);
    /** Flat index just past the subtree of `item` (items are in tree order). */
    const subtreeEnd = (item: CostItem): number => {
      let end = items.indexOf(item) + 1;
      while (end < items.length && items[end].depth > item.depth) end++;
      return end;
    };

    // Het actieve item op identiteit (activeItemId hoort bij de geselecteerde
    // grid-rij); rij-index alleen als fallback en dan via de gerenderde
    // rijenlijst — getVisibleItems() kent de footerrijen niet en wees dan
    // een verkeerd plak-doel aan.
    const gridRows: CostItem[] = state.getGridRows();
    const rowItem = gridRows[activeRow];
    let anchor: CostItem | undefined =
      (activeItemId ? byId.get(activeItemId) : undefined)
      ?? (rowItem && !isFooterRow(rowItem.id) ? byId.get(rowItem.id) : undefined);
    // Plakken op een van de geknipte rijen: ze blijven dan staan waar ze stonden.
    if (anchor && originals.has(anchor.id)) {
      for (let parent = parentOf(anchor); parent && originals.has(parent.id); parent = parentOf(parent)) anchor = parent;
    }
    // Geen actieve rij: na de laatste rij op het hoogste niveau.
    anchor ??= [...items as CostItem[]].reverse()
      .find(item => !item.parentId && !item.rowType.startsWith('staart_') && !originals.has(item.id));

    // Places for a pasted top row, nearest first: next to the active row,
    // inside it, inside its last (sub)container, then next to each ancestor.
    // Every place inserts just past a subtree, so the rows land at its end.
    const candidates: { parent: CostItem | null; at: number }[] = [];
    if (anchor) {
      candidates.push({ parent: parentOf(anchor), at: subtreeEnd(anchor) });
      const seen = new Set<string>();
      for (let c: CostItem | undefined = anchor; c && CONTAINER_TYPES.has(c.rowType) && !seen.has(c.id);
        c = [...childrenOf(c.id)].reverse().find(child => CONTAINER_TYPES.has(child.rowType))) {
        seen.add(c.id);
        candidates.push({ parent: c, at: subtreeEnd(c) });
      }
      seen.clear();
      for (let x = parentOf(anchor); x && !seen.has(x.id); x = parentOf(x)) {
        seen.add(x.id);
        candidates.push({ parent: parentOf(x), at: subtreeEnd(x) });
      }
    } else {
      candidates.push({ parent: null, at: items.length });
    }
    const usable = candidates.filter(c => !c.parent || !originals.has(c.parent.id));

    // Clone: a copy gets new ids and new IFC GUIDs; a cut moves the same
    // objects, so it keeps them (unless that id is already used here).
    const takenIds = new Set<string>((items as CostItem[]).filter(item => !originals.has(item.id)).map(item => item.id));
    const idMap = new Map<string, string>();
    const cloned: CostItem[] = clipboardItems.map((item: CostItem) => {
      const keep = isCut && !takenIds.has(item.id);
      const newId = keep ? item.id : crypto.randomUUID();
      idMap.set(item.id, newId);
      return { ...item, id: newId, ifcGuid: keep || !item.ifcGuid ? item.ifcGuid : generateIfcGuid() };
    });

    // Children travel along under their cloned parent; each top row gets the
    // nearest valid place at the paste target.
    const atOfRoot = new Map<string, number>(); // original root id → insert index
    for (const [index, item] of cloned.entries()) {
      const original: CostItem = clipboardItems[index];
      if (original.parentId && clipIds.has(original.parentId)) {
        item.parentId = idMap.get(original.parentId)!;
        continue;
      }
      const hasChapters = clipboardItems.some((other: CostItem) => other.parentId === original.id && other.rowType === 'chapter');
      const place = usable.find(c => fits(item, hasChapters, c.parent));
      if (!place) return; // nowhere valid to paste: change nothing
      item.parentId = place.parent?.id ?? null;
      item.depth = place.parent ? place.parent.depth + 1 : 0;
      atOfRoot.set(original.id, place.at);
    }
    const clipById = new Map<string, CostItem>(clipboardItems.map((item: CostItem) => [item.id, item]));
    const rootAt = (original: CostItem): number => {
      const seen = new Set<string>();
      let current = original;
      while (!atOfRoot.has(current.id) && current.parentId && clipById.has(current.parentId) && !seen.has(current.id)) {
        seen.add(current.id);
        current = clipById.get(current.parentId)!;
      }
      return atOfRoot.get(current.id) ?? items.length;
    };
    const groups = new Map<number, CostItem[]>();
    for (const [index, item] of cloned.entries()) {
      const at = rootAt(clipboardItems[index]);
      const group = groups.get(at);
      if (group) group.push(item); else groups.set(at, [item]);
    }

    let newItems: CostItem[] = [];
    for (let index = 0; index <= items.length; index++) {
      newItems.push(...(groups.get(index) ?? []));
      if (index < items.length) newItems.push(items[index]);
    }
    // A cut removes the originals (the moved rows may carry the same ids).
    if (cutHere) newItems = newItems.filter(item => !(originals.has(item.id) && byId.get(item.id) === item));

    // Push history, update items, clear clipboard if cut
    const description = isCut ? i18next.t('history.cutPaste') : i18next.t('history.paste');
    state.pushHistory(items, description);
    const updates: any = { items: recalculateItems(newItems) };
    if (isCut) {
      updates.clipboardItems = [];
      updates.clipboardMode = null;
      updates.clipboardSourceDocumentId = null;
    }

    // Mark document as modified
    state.updateDocument(state.activeDocumentId, { isModified: true });
    // Cut in another document: the rows leave that document (undoable there).
    if (isCut && !cutHere) {
      updates.documents = (get() as any).documents.map((doc: DocumentTab) =>
        doc.id === sourceDocId ? removeFromSourceDocument(doc, clipIds, description) : doc);
    }

    set(updates);
  },

  clearClipboard: () => set({ clipboardItems: [], clipboardMode: null, clipboardSourceDocumentId: null }),
});
