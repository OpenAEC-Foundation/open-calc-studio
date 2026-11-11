import type { StateCreator } from 'zustand';
import type { CostItem, CostUnit, RowType, ExcelLink, QuantityLink } from '@/types/costModel';
import i18next from 'i18next';
import { recalculateItems, effectiveTarieven } from '@/services/calculation/calculator';
import { withVariantTotals } from '@/services/grid/variantTotals';
import { prorateUrenForTariefGroep, prorateUrenAll, prorateUrenForChapter } from '@/services/calculation/urenProrate';
import { createDefaultItems } from '@/data/defaultBudget';
import { appendHistory, shouldTrackField } from '@/services/history/itemHistory';
import { getCachedOsUsername } from '@/services/system/osUser';
import { buildGridRows } from '@/services/grid/gridRows';
import { captureQuantityOrigin } from '@/services/quantity/quantityOrigin';

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
   * Toon een rij in het raster: klap de bovenliggende rijen open, ga naar het
   * raster en selecteer de rij. Geeft false terug als de rij niet bestaat of
   * door een kapotte ouderketen niet getoond kan worden.
   */
  revealItem: (id: string) => boolean;
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
  /**
   * De gerenderde grid-rijenlijst: getVisibleItems() minus staart-rijen,
   * met branch-filtering en (in WPCalc-weergave) hoofdstuk-footerrijen.
   * `activeRow`/selectie-indices horen bij DEZE lijst — gebruik deze om
   * een rij-index naar een item te vertalen, nooit getVisibleItems().
   */
  getGridRows: () => CostItem[];
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
  /**
   * Na in- of uitklappen verschuiven de rij-nummers in het raster. Een
   * selectiebereik bestaat uit rij-nummers en zou dan naar ándere rijen wijzen
   * (Delete zou daar werken): terug naar alleen de actieve cel. De actieve rij
   * volgt zijn item; is dat nu verborgen (zijn hoofdstuk ging dicht), dan gaat
   * de selectie naar de dichtstbijzijnde zichtbare ouder.
   */
  /**
   * Na verplaatsen staan de rijen op andere rij-nummers. De selectie blijft
   * op de verplaatste rijen (anders zou een Delete direct na het slepen
   * ándere rijen raken). Zijn ze niet te zien (in een dichte map gezet), dan
   * gaat de selectie naar de dichtstbijzijnde zichtbare ouder.
   */
  const selectMovedRows = (movedIds: string[]) => {
    const s = get() as any; // volledige AppStore at runtime (selectie)
    if (!s.getGridRows || movedIds.length === 0) return;
    const rows: { id: string }[] = s.getGridRows();
    const indices = movedIds
      .map((movedId) => rows.findIndex((r) => r.id === movedId))
      .filter((row) => row >= 0)
      .sort((a, b) => a - b);
    if (indices.length === 0) {
      set({ activeItemId: movedIds[0] } as Partial<CostItemsSlice>);
      keepSelectionAfterFold();
      return;
    }
    const first = indices[0], last = indices[indices.length - 1];
    // Een bereik alleen als de rijen ook echt aaneensluiten.
    const range = indices.length > 1 && last - first === indices.length - 1;
    set({
      activeItemId: rows[first].id, activeRow: first,
      selectionStart: range ? first : null, selectionEnd: range ? last : null,
      cellSelectionStart: null, cellSelectionEnd: null,
    } as Partial<CostItemsSlice>);
  };

  const keepSelectionAfterFold = () => {
    set({ selectionStart: null, selectionEnd: null, cellSelectionStart: null, cellSelectionEnd: null } as Partial<CostItemsSlice>);
    const s = get() as any; // volledige AppStore at runtime (selectie)
    if (!s.activeItemId || !s.getGridRows) return;
    const rows: { id: string }[] = s.getGridRows();
    const rowOf = (rowId: string) => rows.findIndex((r) => r.id === rowId);
    const byId = new Map<string, CostItem>(s.items.map((i: CostItem) => [i.id, i]));
    let id: string | null = s.activeItemId;
    const seen = new Set<string>();
    while (id && rowOf(id) < 0 && !seen.has(id)) {
      seen.add(id);
      id = byId.get(id)?.parentId ?? null;
    }
    const row = id ? rowOf(id) : -1;
    if (row < 0) return;
    if (id !== s.activeItemId || row !== s.activeRow) {
      set({ activeItemId: id, activeRow: row } as Partial<CostItemsSlice>);
    }
  };

  const markModified = () => {
    const s = get() as any; // full AppStore at runtime
    if (s.activeDocumentId && s.updateDocument) {
      s.updateDocument(s.activeDocumentId, { isModified: true });
    }
  };

  return {
  items: recalculateItems(createDefaultItems()),

  // Met de tarieven van het schema, net als elke bewerking: zonder rekende
  // ongedaan maken arbeid met oude prijzen door terwijl de tarieven al nieuw
  // waren, en sprong de volgende losse bewerking stil naar een ander bedrag
  // (knownbug 10). Regels zonder norm houden hun direct ingevulde uurloon.
  setItems: (items) => set((s: any) => ({ items: recalculateItems(items, effectiveTarieven(s.schedule)) })),

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
      ? effectiveTarieven(state.schedule)
      : undefined;
    const historyUser = getCachedOsUsername();
    const historyNow = Date.now();
    set((s: any) => ({
      items: recalculateItems(
        s.items.map((item: any) => {
          if (item.id !== id) return item;
          const updated = { ...item, [field]: value };
          if (item.priceOrigin && ['normUnitPrice', 'materialPrice', 'laborPrice', 'unit'].includes(field) && item[field] !== value) {
            updated.priceOrigin = { ...item.priceOrigin, locked: true };
          }
          // Norm leegmaken op een regel met tariefgroep: het loon kwam uit
          // norm × tarief, dus dat vervalt ook — net als bij norm 0 (knownbug 7).
          if (field === 'normQuantity' && value == null && item.rowType === 'regel' && item.tariefGroep && item.normQuantity != null) {
            updated.laborPrice = null;
          }
          if (field === 'quantityLink') updated.quantityOrigin = value ? captureQuantityOrigin(value as QuantityLink, s) : undefined;
          // Wijzigingshistorie: leg bewerkbare waarde-velden vast (wie/wanneer/wat)
          if (shouldTrackField(field)) {
            updated.history = appendHistory(item, field, item[field], value, historyUser, historyNow);
          }
          // Sync staartPercentage when quantity changes on staart rows
          if (field === 'quantity' && item.rowType.startsWith('staart_')) {
            updated.staartPercentage = value;
          }
          // When unit is set to 'uur': auto-set tariefGroep=A, resourceType=arbeid, normQuantity=1.
          // Tariefgroep en norm alleen op een regel zonder norm en zonder prijs: anders
          // rekent de tariefgroep een uurloon bij en verandert het totaal (knownbugs 5),
          // of wordt een bewuste norm 0 een 1 (knownbugs 6).
          if (field === 'unit' && value === 'uur' && item.rowType === 'regel') {
            if (!updated.resourceType) updated.resourceType = 'arbeid';
            const heeftPrijs = !!(updated.normUnitPrice || updated.materialPrice || updated.laborPrice);
            if (updated.normQuantity == null && !heeftPrijs) {
              if (!updated.tariefGroep) updated.tariefGroep = 'A';
              updated.normQuantity = 1;
            }
          }
          return updated;
        }),
        tarieven ?? effectiveTarieven(s.schedule),
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
      newParentId = target.parentId ?? null; // oude opslag: undefined = hoogste niveau
      newParentDepth = target.parentId
        ? (byId.get(target.parentId)?.depth ?? -1)
        : -1;
    }

    // Work on the tree in VISIBLE order — exactly how getVisibleItems() orders a
    // sibling group: by sortOrder, ties by flat-array index. The flat array may
    // differ from that order (imports, MCP add_item); recalculateItems() later
    // re-derives sortOrder from array order, so the array we hand it must already
    // be in visible tree order, otherwise unrelated sibling groups get reshuffled.
    const arrayIndex = new Map<string, number>();
    state.items.forEach((it, i) => arrayIndex.set(it.id, i));
    const childrenByParent = new Map<string | null, CostItem[]>();
    for (const item of state.items) {
      const key = item.parentId ?? null;
      const list = childrenByParent.get(key);
      if (list) list.push(item);
      else childrenByParent.set(key, [item]);
    }
    for (const list of childrenByParent.values()) {
      list.sort((a, b) => {
        // Staartregels houden hun volgorde in de opslag (exports en de staart
        // lezen ze zo); alleen gewone rijen volgen de zichtbare volgorde.
        if (a.rowType.startsWith('staart_') && b.rowType.startsWith('staart_')) {
          return (arrayIndex.get(a.id) ?? 0) - (arrayIndex.get(b.id) ?? 0);
        }
        const so = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
        return so !== 0 ? so : (arrayIndex.get(a.id) ?? 0) - (arrayIndex.get(b.id) ?? 0);
      });
    }
    // Visible (depth-first, collapse ignored) position of every reachable item.
    const visibleIndex = new Map<string, number>();
    const walkOld = (parentId: string | null) => {
      for (const child of childrenByParent.get(parentId) ?? []) {
        if (visibleIndex.has(child.id)) continue; // cycle guard
        visibleIndex.set(child.id, visibleIndex.size);
        walkOld(child.id);
      }
    };
    walkOld(null);
    const orderKey = (id: string) =>
      visibleIndex.get(id) ?? state.items.length + (arrayIndex.get(id) ?? 0);

    // Moving roots in visible order; ids inside another moving id travel along
    // with that ancestor's subtree.
    const topLevelMovers = [...new Set(ids)]
      .filter((id) => byId.has(id))
      .filter((id) => !ids.some((other) => other !== id && isDescendantOf(id, other)))
      .sort((a, b) => orderKey(a) - orderKey(b));
    if (topLevelMovers.length === 0) return;
    const moverSet = new Set(topLevelMovers);

    // New sibling list of the destination parent.
    const oldDest = childrenByParent.get(newParentId) ?? [];
    const dest = oldDest.filter((it) => !moverSet.has(it.id));
    let insertAt: number;
    if (position === 'inside') {
      insertAt = 0; // first child in visible order
    } else {
      const t = dest.findIndex((it) => it.id === targetId);
      if (t === -1) return;
      insertAt = position === 'before' ? t : t + 1;
    }
    const newDest = [
      ...dest.slice(0, insertAt),
      ...topLevelMovers.map((id) => byId.get(id)!),
      ...dest.slice(insertAt),
    ];

    // No-op: every mover already sits under the destination parent and the
    // visible sibling order is unchanged → keep the same items reference.
    const sameParent = topLevelMovers.every((id) => (byId.get(id)!.parentId ?? null) === newParentId);
    if (sameParent && newDest.length === oldDest.length && newDest.every((it, i) => it === oldDest[i])) {
      return;
    }

    // Detach movers from their old sibling groups (others keep their order).
    for (const id of topLevelMovers) {
      const oldKey = byId.get(id)!.parentId ?? null;
      const list = childrenByParent.get(oldKey);
      if (list) childrenByParent.set(oldKey, list.filter((it) => it.id !== id));
    }

    // Reparent movers + shift the depth of their whole subtree.
    const replaced = new Map<string, CostItem>();
    const shiftSubtree = (id: string, delta: number, seen: Set<string>) => {
      for (const child of childrenByParent.get(id) ?? []) {
        if (seen.has(child.id)) continue;
        seen.add(child.id);
        replaced.set(child.id, { ...child, depth: Math.max(0, child.depth + delta) });
        shiftSubtree(child.id, delta, seen);
      }
    };
    for (const id of topLevelMovers) {
      const root = byId.get(id)!;
      const delta = (newParentDepth + 1) - root.depth;
      replaced.set(id, { ...root, parentId: newParentId, depth: Math.max(0, root.depth + delta) });
      if (delta !== 0) shiftSubtree(id, delta, new Set([id]));
    }
    // Destination group gets fresh sortOrders matching its new visible order.
    childrenByParent.set(newParentId, newDest.map((it, i) => {
      const cur = replaced.get(it.id) ?? it;
      const next = cur.sortOrder === i ? cur : { ...cur, sortOrder: i };
      replaced.set(it.id, next);
      return next;
    }));

    // Rebuild the flat array in visible tree order; unreachable items
    // (orphans / cycles) keep their relative order at the end.
    const newItems: CostItem[] = [];
    const placed = new Set<string>();
    const walkNew = (parentId: string | null) => {
      for (const child of childrenByParent.get(parentId) ?? []) {
        if (placed.has(child.id)) continue;
        placed.add(child.id);
        newItems.push(replaced.get(child.id) ?? child);
        walkNew(child.id);
      }
    };
    walkNew(null);
    for (const it of state.items) {
      if (!placed.has(it.id)) newItems.push(replaced.get(it.id) ?? it);
    }

    set({ items: recalculateItems(newItems) });
    markModified();
    selectMovedRows(topLevelMovers);
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
    keepSelectionAfterFold();
  },

  revealItem: (id) => {
    const state = get() as any; // full AppStore at runtime (selectie, tabs)
    const byId = new Map<string, CostItem>(state.items.map((item: CostItem) => [item.id, item]));
    if (!byId.has(id)) return false;
    const parents = new Set<string>();
    let parent = byId.get(id)!.parentId;
    while (parent) {
      // Cyclus of verweesde ouder: niet te tonen.
      if (parents.has(parent) || !byId.has(parent)) return false;
      parents.add(parent);
      parent = byId.get(parent)!.parentId;
    }
    // Openklappen is weergave-navigatie, net als de inklapknop in het raster:
    // geen undo-stap en geen 'document gewijzigd'.
    if (state.items.some((item: CostItem) => parents.has(item.id) && item.isCollapsed)) {
      set({
        items: state.items.map((item: CostItem) =>
          parents.has(item.id) && item.isCollapsed ? { ...item, isCollapsed: false } : item
        ),
      });
    }
    const after = get() as any;
    const row = after.getGridRows().findIndex((r: { id: string }) => r.id === id);
    if (row < 0) return false;
    after.setActiveSubSheet?.(null);
    after.clearSelectedColumns?.();
    after.setActiveContentTab?.('grid');
    after.setActiveCell(row, 1, id);
    return true;
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
    keepSelectionAfterFold();
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
    keepSelectionAfterFold();
  },

  scaleAllPrices: (factor) => {
    const state = get() as any;
    if (!Number.isFinite(factor) || factor <= 0) return;
    const schaal = (v: number | null): number | null => (v == null ? null : v * factor);
    // Arbeid op een regel met tariefgroep wordt bij elke bewerking opnieuw
    // norm ÷ capaciteit × tarief. Alleen laborPrice schalen werd dus bij de
    // volgende bewerking teruggedraaid: schaal de tarieven mee (knownbug 8).
    // Ook zonder eigen tarieven (nieuwe begroting) rekent elke bewerking met de
    // standaardtarieven, dus die worden dan geschaald en vastgelegd. Op centen.
    const tarieven = Object.fromEntries(
      Object.entries(effectiveTarieven(state.schedule)).map(([k, v]) => [k, Math.round(v * factor * 100) / 100]),
    );
    set({
      ...(state.schedule ? { schedule: { ...state.schedule, tarieven } } : {}),
      items: recalculateItems(
        state.items.map((item: CostItem) => {
          if (item.rowType.startsWith('staart_')) return item; // percentages, geen prijzen
          if (item.normUnitPrice == null && item.materialPrice == null && item.laborPrice == null) return item;
          return {
            ...item,
            normUnitPrice: schaal(item.normUnitPrice),
            materialPrice: schaal(item.materialPrice),
            laborPrice: schaal(item.laborPrice),
          };
        }),
        tarieven,
      ),
    });
    markModified();
  },

  recalculate: () => {
    set((state) => ({ items: recalculateItems(state.items) }));
  },

  prorateUrenByTariefGroep: (tariefGroep, newTotal) => {
    set((s: any) => {
      const tarieven = effectiveTarieven(s.schedule);
      const rescaled = prorateUrenForTariefGroep(s.items, tariefGroep, newTotal);
      return { items: recalculateItems(rescaled, tarieven) };
    });
    markModified();
  },

  prorateUrenTotal: (newTotal: number) => {
    set((s: any) => {
      const tarieven = effectiveTarieven(s.schedule);
      const rescaled = prorateUrenAll(s.items, newTotal);
      return { items: recalculateItems(rescaled, tarieven) };
    });
    markModified();
  },

  prorateUrenForChapter: (chapterId: string, newTotal: number) => {
    set((s: any) => {
      const tarieven = effectiveTarieven(s.schedule);
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

  getGridRows: () => {
    const state = get() as any; // full AppStore at runtime (gridView/schedule)
    const schedule = state.schedule ?? {};
    // Totalen over alleen de gekozen variant (knownbug 12/264).
    return buildGridRows(withVariantTotals(state.getVisibleItems(), state.items, schedule), state.gridView ?? 'wpcalc', schedule);
  },
};
};
