import type { StateCreator } from 'zustand';
import type { CostItem, CostUnit, RowType, ExcelLink, QuantityLink } from '@/types/costModel';
import i18next from 'i18next';
import { recalculateItems } from '@/services/calculation/calculator';
import { prorateUrenForTariefGroep, prorateUrenAll, prorateUrenForChapter } from '@/services/calculation/urenProrate';
import { createDefaultItems } from '@/data/defaultBudget';
import { appendHistory, shouldTrackField } from '@/services/history/itemHistory';
import { getCachedOsUsername } from '@/services/system/osUser';

function generateId(): string {
  return crypto.randomUUID();
}

function generateIfcGuid(): string {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';
  let result = '';
  for (let i = 0; i < 22; i++) {
    result += chars[Math.floor(Math.random() * 64)];
  }
  return result;
}

export interface CostItemsSlice {
  items: CostItem[];
  setItems: (items: CostItem[]) => void;
  addItem: (parentId: string | null, afterIndex?: number) => string;
  addChapter: (parentId: string | null, afterItemId?: string) => string;
  addBewakingspost: (parentId: string, afterItemId?: string) => string;
  addRegel: (parentId: string, afterItemId?: string) => string;
  /**
   * Voeg een rekenregel toe "direct onder" het gegeven item — de gedeelde
   * actie achter de +-knop bij de rij én de lint-knoppen:
   *  - regel → als broertje direct onder die regel
   *  - begrotings-/bewakingspost → als laatste regel ín die post
   *  - hoofdstuk → in de laatste post van dat hoofdstuk (of maakt er één aan)
   *  - null / lege begroting → maakt hoofdstuk + post + regel aan
   */
  insertRegelBelow: (itemId: string | null) => string;
  addTekstregel: (parentId: string, afterItemId?: string) => string;
  addWitregel: (parentId: string | null, afterItemId?: string) => string;
  deleteItem: (id: string) => void;
  updateItem: (id: string, field: string, value: string | number | null | boolean | CostUnit | ExcelLink | QuantityLink) => void;
  moveItems: (ids: string[], targetId: string, position: 'before' | 'after' | 'inside') => void;
  indentItem: (id: string) => void;
  outdentItem: (id: string) => void;
  toggleCollapse: (id: string) => void;
  /**
   * Klap alle bewakingsposten in één keer in of uit (lint-knop): zijn er nog
   * uitgeklapte bewakingsposten, dan gaan ze allemaal dicht; anders allemaal
   * open. Geeft terug of ze nu ingeklapt zijn.
   */
  toggleAllBewakingspostenCollapsed: () => boolean;
  /**
   * Klap de hele begroting in tot een gekozen niveau:
   * - 'hoofdstuk': alleen de top-hoofdstukken zichtbaar
   * - 'paragraaf': sub-hoofdstukken dicht, top-hoofdstukken open
   * - 'begrotingspost': posten dicht (regels/bewakingsposten verborgen)
   * - 'bewakingspost': bewakingsposten dicht, de rest open
   * - 'alles': alles openklappen
   */
  collapseToLevel: (niveau: 'hoofdstuk' | 'paragraaf' | 'begrotingspost' | 'bewakingspost' | 'alles') => void;
  /**
   * Vermenigvuldig alle prijsvelden (prijs/middel, materiaal, arbeid) met een
   * factor — bv. 1.10 voor +10%. Staart-percentages blijven ongemoeid; de
   * totalen worden herrekend.
   */
  scaleAllPrices: (factor: number) => void;
  recalculate: () => void;
  /**
   * Proportionally rescale `normQuantity` of all `regel` items with the given
   * tariefGroep so that the sum of their uren equals `newTotal`.
   *
   * Used by the WPCalc "Uren" overview where the user can edit a group total
   * to redistribute hours over the underlying regels naar rato.
   */
  prorateUrenByTariefGroep: (tariefGroep: 'A' | 'B' | 'C' | null, newTotal: number) => void;
  /** Rescale normQuantity of ALL regels so the grand-total uren equals newTotal. */
  prorateUrenTotal: (newTotal: number) => void;
  /** Rescale normQuantity of all regel descendants in a chapter so its total uren equals newTotal. */
  prorateUrenForChapter: (chapterId: string, newTotal: number) => void;
  getVisibleItems: () => CostItem[];
}

/** Find the insert index after the given item's subtree, or at end of parent's children */
function findInsertIndex(items: CostItem[], parentId: string | null, afterItemId?: string): number {
  if (afterItemId) {
    const afterIdx = items.findIndex((i) => i.id === afterItemId);
    if (afterIdx >= 0) {
      const afterItem = items[afterIdx];
      // Skip past the entire subtree of afterItem
      let endIdx = afterIdx + 1;
      while (endIdx < items.length && items[endIdx].depth > afterItem.depth) {
        endIdx++;
      }
      return endIdx;
    }
  }
  // Fallback: insert after the last child of parent (or at end)
  if (parentId) {
    const parentIdx = items.findIndex((i) => i.id === parentId);
    if (parentIdx >= 0) {
      const parentItem = items[parentIdx];
      let endIdx = parentIdx + 1;
      while (endIdx < items.length && items[endIdx].depth > parentItem.depth) {
        endIdx++;
      }
      return endIdx;
    }
  }
  return items.length;
}

function createDefaultItem(parentId: string | null, sortOrder: number, depth: number, rowType: RowType = 'begrotingspost'): CostItem {
  return {
    id: generateId(),
    parentId,
    sortOrder,
    code: '',
    description: '',
    unit: 'st',
    quantity: null,
    materialPrice: null,
    laborPrice: null,
    unitPrice: 0,
    total: 0,
    isCollapsed: false,
    depth,
    notes: '',
    ifcGuid: generateIfcGuid(),
    rowType,
    staartPercentage: null,
    nr: '',
    normQuantity: null,
    normFactor: null,
    normDivisor: null,
    normUnitPrice: null,
    resourceType: null,
    resourceLibraryId: null,
    verrekenbaar: rowType === 'chapter' ? 'V' : null,
    tariefGroep: null,
  };
}

export const createCostItemsSlice: StateCreator<CostItemsSlice> = (set, get) => {
  /** Mark the active document as modified */
  const markModified = () => {
    const s = get() as any; // full AppStore at runtime
    if (s.activeDocumentId && s.updateDocument) {
      s.updateDocument(s.activeDocumentId, { isModified: true });
    }
  };

  return {
  items: recalculateItems(createDefaultItems()),

  setItems: (items) => set({ items: recalculateItems(items) }),

  addItem: (parentId, afterIndex) => {
    const state = get();
    const siblings = state.items.filter((i) => i.parentId === parentId);
    const depth = parentId ? (state.items.find((i) => i.id === parentId)?.depth ?? 0) + 1 : 0;
    const sortOrder = afterIndex !== undefined ? afterIndex + 1 : siblings.length;
    const newItem = createDefaultItem(parentId, sortOrder, depth);

    // Insert at correct position in flat array
    let insertIndex = state.items.length;
    if (afterIndex !== undefined) {
      const siblingItems = state.items.filter((i) => i.parentId === parentId);
      if (siblingItems[afterIndex]) {
        const afterItem = siblingItems[afterIndex];
        const flatIdx = state.items.indexOf(afterItem);
        // Find end of afterItem's subtree
        let endIdx = flatIdx + 1;
        while (endIdx < state.items.length && state.items[endIdx].depth > afterItem.depth) {
          endIdx++;
        }
        insertIndex = endIdx;
      }
    }

    const newItems = [...state.items];
    newItems.splice(insertIndex, 0, newItem);
    set({ items: recalculateItems(newItems) });
    markModified();
    return newItem.id;
  },

  addChapter: (parentId, afterItemId) => {
    const state = get();
    const depth = parentId ? (state.items.find((i) => i.id === parentId)?.depth ?? 0) + 1 : 0;
    const siblings = state.items.filter((i) => i.parentId === parentId);
    const newItem: CostItem = {
      ...createDefaultItem(parentId, siblings.length, depth, 'chapter'),
      description: i18next.t('newChapter', { defaultValue: 'New chapter' }),
    };
    const newItems = [...state.items];
    newItems.splice(findInsertIndex(state.items, parentId, afterItemId), 0, newItem);
    set({ items: recalculateItems(newItems) });
    markModified();
    return newItem.id;
  },

  addBewakingspost: (parentId, afterItemId) => {
    const state = get();
    const parent = state.items.find((i) => i.id === parentId);
    if (!parent) return '';
    const depth = parent.depth + 1;
    const siblings = state.items.filter((i) => i.parentId === parentId);
    const newItem: CostItem = {
      ...createDefaultItem(parentId, siblings.length, depth, 'bewakingspost'),
      description: i18next.t('newMonitorPost', { defaultValue: 'New monitor post' }),
    };
    const newItems = [...state.items];
    newItems.splice(findInsertIndex(state.items, parentId, afterItemId), 0, newItem);
    set({ items: recalculateItems(newItems) });
    markModified();
    return newItem.id;
  },

  addRegel: (parentId, afterItemId) => {
    const state = get();
    const parent = state.items.find((i) => i.id === parentId);
    if (!parent) return '';
    const depth = parent.depth + 1;
    const siblings = state.items.filter((i) => i.parentId === parentId);
    const newItem: CostItem = {
      ...createDefaultItem(parentId, siblings.length, depth, 'regel'),
      description: i18next.t('newCalculationRule', { defaultValue: 'New calculation rule' }),
    };
    const newItems = [...state.items];
    newItems.splice(findInsertIndex(state.items, parentId, afterItemId), 0, newItem);
    set({ items: recalculateItems(newItems) });
    markModified();
    return newItem.id;
  },

  insertRegelBelow: (itemId) => {
    const state = get();
    const item = itemId ? state.items.find((i) => i.id === itemId) : undefined;

    // Lege begroting of geen item: hoofdstuk + post + regel aanmaken.
    if (!item || state.items.length === 0) {
      const chapterId = state.addChapter(null);
      const postId = state.addItem(chapterId);
      return get().addRegel(postId);
    }

    // Vind de post (begrotings-/bewakingspost) waar de regel in hoort.
    let parentId = '';
    if (item.rowType === 'bewakingspost' || item.rowType === 'begrotingspost') {
      parentId = item.id;
    } else if (item.rowType === 'chapter') {
      // Op een hoofdstuk: laatste post-kind gebruiken of er één aanmaken.
      const child = state.items
        .filter((i) => i.parentId === item.id && (i.rowType === 'begrotingspost' || i.rowType === 'bewakingspost'))
        .pop();
      parentId = child ? child.id : state.addItem(item.id);
    } else {
      // Regel/tekstregel/witregel: loop omhoog naar de dichtstbijzijnde post.
      let current: CostItem | undefined = item;
      while (current) {
        if (current.rowType === 'bewakingspost' || current.rowType === 'begrotingspost') {
          parentId = current.id;
          break;
        }
        current = state.items.find((i) => i.id === current!.parentId);
      }
    }
    if (!parentId) return '';
    // afterItemId = het aangeklikte item → de regel komt direct onder zijn
    // subtree. Bij een hoofdstuk: gewoon achteraan in de gevonden post.
    return get().addRegel(parentId, item.rowType === 'chapter' ? undefined : item.id);
  },

  addTekstregel: (parentId, afterItemId) => {
    const state = get();
    const parent = state.items.find((i) => i.id === parentId);
    if (!parent) return '';
    const depth = parent.depth + 1;
    const siblings = state.items.filter((i) => i.parentId === parentId);
    const newItem: CostItem = {
      ...createDefaultItem(parentId, siblings.length, depth, 'tekstregel'),
      description: '',
    };
    const newItems = [...state.items];
    newItems.splice(findInsertIndex(state.items, parentId, afterItemId), 0, newItem);
    set({ items: recalculateItems(newItems) });
    markModified();
    return newItem.id;
  },

  addWitregel: (parentId, afterItemId) => {
    const state = get();
    const depth = parentId ? (state.items.find((i) => i.id === parentId)?.depth ?? 0) + 1 : 0;
    const newItem: CostItem = {
      ...createDefaultItem(parentId, 0, depth, 'witregel'),
      description: '',
    };
    const newItems = [...state.items];
    newItems.splice(findInsertIndex(state.items, parentId, afterItemId), 0, newItem);
    set({ items: recalculateItems(newItems) });
    markModified();
    return newItem.id;
  },

  deleteItem: (id) => {
    const state = get();
    const idsToDelete = new Set<string>();
    function collectChildren(parentId: string) {
      idsToDelete.add(parentId);
      state.items.filter((i) => i.parentId === parentId).forEach((i) => collectChildren(i.id));
    }
    collectChildren(id);
    set({ items: recalculateItems(state.items.filter((i) => !idsToDelete.has(i.id))) });
    markModified();
  },

  updateItem: (id, field, value) => {
    // Verrekenbaar only allowed on chapter rows
    if (field === 'verrekenbaar') {
      const item = get().items.find((i) => i.id === id);
      if (item && item.rowType !== 'chapter') return;
    }
    const state = get() as any;
    const tarieven = (field === 'tariefGroep' || field === 'normQuantity')
      ? (state.schedule?.tarieven ?? { A: 64, B: 43, C: 82 })
      : undefined;
    const historyUser = getCachedOsUsername();
    const historyNow = Date.now();
    set((s: any) => ({
      items: recalculateItems(
        s.items.map((item: any) => {
          if (item.id !== id) return item;
          const updated = { ...item, [field]: value };
          // Wijzigingshistorie: leg bewerkbare waarde-velden vast (wie/wanneer/wat)
          if (shouldTrackField(field)) {
            updated.history = appendHistory(item, field, item[field], value, historyUser, historyNow);
          }
          // Sync staartPercentage when quantity changes on staart rows
          if (field === 'quantity' && item.rowType.startsWith('staart_')) {
            updated.staartPercentage = value;
          }
          // When unit is set to 'uur': auto-set tariefGroep=A, resourceType=arbeid, normQuantity=1
          if (field === 'unit' && value === 'uur' && item.rowType === 'regel') {
            if (!updated.tariefGroep) updated.tariefGroep = 'A';
            if (!updated.resourceType) updated.resourceType = 'arbeid';
            if (!updated.normQuantity) updated.normQuantity = 1;
          }
          return updated;
        }),
        tarieven ?? (s.schedule?.tarieven ?? { A: 64, B: 43, C: 82 }),
      ),
    }));
    markModified();
  },

  moveItems: (ids, targetId, position) => {
    const state = get();
    if (!ids || ids.length === 0) return;
    const idsSet = new Set(ids);
    if (idsSet.has(targetId)) return;

    // Build parent lookup for current items
    const byId = new Map(state.items.map((it) => [it.id, it] as const));

    // Reject if target is a descendant of any moving item
    const isDescendantOf = (candidateId: string, ancestorId: string): boolean => {
      let cur = byId.get(candidateId);
      while (cur?.parentId) {
        if (cur.parentId === ancestorId) return true;
        cur = byId.get(cur.parentId);
      }
      return false;
    };
    for (const movingId of ids) {
      if (targetId === movingId) return;
      if (isDescendantOf(targetId, movingId)) return;
    }

    const target = byId.get(targetId);
    if (!target) return;

    // Determine new parent + depth base
    let newParentId: string | null;
    let newParentDepth: number;
    if (position === 'inside') {
      if (target.rowType !== 'chapter' && target.rowType !== 'begrotingspost' && target.rowType !== 'bewakingspost') {
        return; // cannot drop inside a non-container
      }
      newParentId = target.id;
      newParentDepth = target.depth;
    } else {
      newParentId = target.parentId;
      newParentDepth = target.parentId
        ? (byId.get(target.parentId)?.depth ?? -1)
        : -1;
    }

    // Collect each moving item with its full subtree (contiguous descendants in flat array)
    // so hierarchy is preserved. Use flat-array walk since children follow their parent.
    type Block = { root: typeof state.items[number]; items: typeof state.items };
    const blocks: Block[] = [];
    const indexOf = (id: string) => state.items.findIndex((it) => it.id === id);
    // Sort ids by their current index to maintain visual order
    const orderedIds = [...ids].sort((a, b) => indexOf(a) - indexOf(b));
    // Skip ids that are descendants of another moving id (their block is already included)
    const topLevelMovers: string[] = [];
    for (const id of orderedIds) {
      const isInsideAnother = ids.some((other) => other !== id && isDescendantOf(id, other));
      if (!isInsideAnother) topLevelMovers.push(id);
    }

    const movedItemIds = new Set<string>();
    for (const rootId of topLevelMovers) {
      const rootIdx = indexOf(rootId);
      if (rootIdx < 0) continue;
      const root = state.items[rootIdx];
      let endIdx = rootIdx + 1;
      while (endIdx < state.items.length && state.items[endIdx].depth > root.depth) {
        endIdx++;
      }
      const blockItems = state.items.slice(rootIdx, endIdx);
      blockItems.forEach((bi) => movedItemIds.add(bi.id));
      blocks.push({ root, items: blockItems });
    }

    // Remaining items with moved items removed
    const remaining = state.items.filter((it) => !movedItemIds.has(it.id));

    const targetIdxRemaining = remaining.findIndex((it) => it.id === targetId);
    if (targetIdxRemaining === -1) return;

    // Determine insertion point in the remaining array
    let insertAt: number;
    if (position === 'before') {
      insertAt = targetIdxRemaining;
    } else if (position === 'inside') {
      // Insert right after target (as first child)
      insertAt = targetIdxRemaining + 1;
    } else {
      // 'after' → after target AND after its subtree
      const targetItem = remaining[targetIdxRemaining];
      let endIdx = targetIdxRemaining + 1;
      while (endIdx < remaining.length && remaining[endIdx].depth > targetItem.depth) {
        endIdx++;
      }
      insertAt = endIdx;
    }

    // Reparent + rewrite depth for each block
    const depthDelta = (rootOldDepth: number) => (newParentDepth + 1) - rootOldDepth;
    const rewrittenBlocks: CostItem[][] = blocks.map((block) => {
      const delta = depthDelta(block.root.depth);
      return block.items.map((bi, i) => ({
        ...bi,
        parentId: i === 0 ? newParentId : bi.parentId,
        depth: Math.max(0, bi.depth + delta),
      }));
    });
    const flatMoving = rewrittenBlocks.flat();

    const newItems = [
      ...remaining.slice(0, insertAt),
      ...flatMoving,
      ...remaining.slice(insertAt),
    ];

    // Reassign sortOrder based on position among siblings (per parent)
    const siblingCounter = new Map<string, number>();
    const finalItems = newItems.map((it) => {
      const key = it.parentId ?? '__root__';
      const next = (siblingCounter.get(key) ?? 0);
      siblingCounter.set(key, next + 1);
      return { ...it, sortOrder: next };
    });

    set({ items: recalculateItems(finalItems) });
    markModified();
  },

  indentItem: (id) => {
    const state = get();
    const item = state.items.find((i) => i.id === id);
    if (!item) return;
    const siblings = state.items.filter((i) => i.parentId === item.parentId);
    const idx = siblings.findIndex((s) => s.id === id);
    if (idx <= 0) return;
    const newParent = siblings[idx - 1];
    // Can only indent into a container row type
    if (newParent.rowType !== 'chapter' && newParent.rowType !== 'begrotingspost' && newParent.rowType !== 'bewakingspost') return;
    const newItems = state.items.map((i) =>
      i.id === id ? { ...i, parentId: newParent.id, depth: newParent.depth + 1 } : i
    );
    set({ items: recalculateItems(newItems) });
    markModified();
  },

  outdentItem: (id) => {
    const state = get();
    const item = state.items.find((i) => i.id === id);
    if (!item || !item.parentId) return;
    const parent = state.items.find((i) => i.id === item.parentId);
    if (!parent) return;
    const newItems = state.items.map((i) =>
      i.id === id ? { ...i, parentId: parent.parentId, depth: Math.max(0, item.depth - 1) } : i
    );
    set({ items: recalculateItems(newItems) });
    markModified();
  },

  toggleCollapse: (id) => {
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id ? { ...item, isCollapsed: !item.isCollapsed } : item
      ),
    }));
  },

  toggleAllBewakingspostenCollapsed: () => {
    const state = get();
    // Nog minstens één open bewakingspost → alles inklappen; anders uitklappen.
    const collapse = state.items.some(
      (i) => i.rowType === 'bewakingspost' && !i.isCollapsed,
    );
    set({
      items: state.items.map((item) =>
        item.rowType === 'bewakingspost' ? { ...item, isCollapsed: collapse } : item,
      ),
    });
    return collapse;
  },

  collapseToLevel: (niveau) => {
    const state = get();
    // Bepaal per item of het dicht moet: alles óp en boven het gekozen
    // niveau blijft open, het gekozen niveau zelf gaat dicht.
    const dicht = (i: CostItem): boolean => {
      switch (niveau) {
        case 'hoofdstuk':
          return i.rowType === 'chapter' && i.depth === 0;
        case 'paragraaf':
          return i.rowType === 'chapter' && i.depth >= 1;
        case 'begrotingspost':
          return i.rowType === 'begrotingspost';
        case 'bewakingspost':
          return i.rowType === 'bewakingspost';
        case 'alles':
          return false;
      }
    };
    set({
      items: state.items.map((item) => {
        const isContainer =
          item.rowType === 'chapter' || item.rowType === 'begrotingspost' || item.rowType === 'bewakingspost';
        if (!isContainer) return item;
        const val = dicht(item);
        return item.isCollapsed === val ? item : { ...item, isCollapsed: val };
      }),
    });
  },

  scaleAllPrices: (factor) => {
    const state = get();
    if (!Number.isFinite(factor) || factor <= 0) return;
    const schaal = (v: number | null): number | null => (v == null ? null : v * factor);
    set({
      items: recalculateItems(
        state.items.map((item) => {
          if (item.rowType.startsWith('staart_')) return item; // percentages, geen prijzen
          if (item.normUnitPrice == null && item.materialPrice == null && item.laborPrice == null) return item;
          return {
            ...item,
            normUnitPrice: schaal(item.normUnitPrice),
            materialPrice: schaal(item.materialPrice),
            laborPrice: schaal(item.laborPrice),
          };
        }),
      ),
    });
    markModified();
  },

  recalculate: () => {
    set((state) => ({ items: recalculateItems(state.items) }));
  },

  prorateUrenByTariefGroep: (tariefGroep, newTotal) => {
    set((s: any) => {
      const tarieven = s.schedule?.tarieven ?? { A: 64, B: 43, C: 82 };
      const rescaled = prorateUrenForTariefGroep(s.items, tariefGroep, newTotal);
      return { items: recalculateItems(rescaled, tarieven) };
    });
    markModified();
  },

  prorateUrenTotal: (newTotal: number) => {
    set((s: any) => {
      const tarieven = s.schedule?.tarieven ?? { A: 64, B: 43, C: 82 };
      const rescaled = prorateUrenAll(s.items, newTotal);
      return { items: recalculateItems(rescaled, tarieven) };
    });
    markModified();
  },

  prorateUrenForChapter: (chapterId: string, newTotal: number) => {
    set((s: any) => {
      const tarieven = s.schedule?.tarieven ?? { A: 64, B: 43, C: 82 };
      const rescaled = prorateUrenForChapter(s.items, chapterId, newTotal);
      return { items: recalculateItems(rescaled, tarieven) };
    });
    markModified();
  },

  getVisibleItems: () => {
    const state = get();
    // Render the tree depth-first with each sibling group ordered by sortOrder
    // (stable on flat-array index). This keeps every row under its correct parent
    // regardless of the flat `items` array order — e.g. when items are appended
    // out of hierarchical order (MCP add_item, imports). Collapsed containers keep
    // their own row but their descendants are skipped.
    const indexOf = new Map<string, number>();
    state.items.forEach((it, i) => indexOf.set(it.id, i));

    const childrenByParent = new Map<string | null, CostItem[]>();
    for (const item of state.items) {
      const key = item.parentId ?? null;
      const list = childrenByParent.get(key);
      if (list) list.push(item);
      else childrenByParent.set(key, [item]);
    }
    for (const list of childrenByParent.values()) {
      list.sort((a, b) => {
        const so = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
        return so !== 0 ? so : (indexOf.get(a.id) ?? 0) - (indexOf.get(b.id) ?? 0);
      });
    }

    const visible: CostItem[] = [];
    const seen = new Set<string>();
    const walk = (parentId: string | null) => {
      const children = childrenByParent.get(parentId);
      if (!children) return;
      for (const item of children) {
        // Guard against broken/cyclic parentId data (e.g. malformed .calc imports):
        // visiting an item already seen would recurse forever → stack overflow → crash.
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        visible.push(item);
        if (!item.isCollapsed) walk(item.id);
      }
    };
    walk(null);
    return visible;
  },
};
};
