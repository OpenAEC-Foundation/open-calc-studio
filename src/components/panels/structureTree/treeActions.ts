import type { TFunction } from 'i18next';
import { useAppStore } from '@/state/appStore';
import { variantItems } from '@/services/grid/variantScope';
import type { CostItem } from '@/types/costModel';
import { descendantIds, label, sortSiblings, type DropPos, type DropTarget, type TreeNode, type TreeNumber } from './treeModel';
import type { TreeRules } from './treeRules';

/**
 * Structuurboom, de acties: verplaatsen, verwijderen en in-/uitklappen. Ze
 * gaan altijd via de bestaande store-acties (`moveItems`, `deleteItem`,
 * `toggleCollapse`), elk als één undo-stap waar dat hoort. Of een zet mag,
 * beslissen de regels uit treeRules.ts.
 */

/**
 * Na in-/uitklappen vanuit de boom schuiven de rijen in het raster op, maar
 * `activeRow` (een rijnummer) niet. Dan wijst het raster naar een ándere rij
 * dan de geselecteerde, en werken pijltjes of Delete in het raster daar.
 * Hier het raster weer laten wijzen naar de geselecteerde rij, of, als die nu
 * verborgen is, naar de dichtstbijzijnde zichtbare rij erboven.
 */
export function syncGridSelection(): void {
  const s = useAppStore.getState();
  const id = s.activeItemId;
  if (!id) return;
  const rows = s.getGridRows();
  const byId = new Map(s.items.map((i) => [i.id, i]));
  const guard = new Set<string>();
  for (let cur: string | null = id; cur && !guard.has(cur); cur = byId.get(cur)?.parentId ?? null) {
    guard.add(cur);
    const row = rows.findIndex((r) => r.id === cur);
    if (row >= 0) {
      // Een selectiebereik (rijnummers) wijst na in-/uitklappen naar andere
      // rijen: setActiveCell maakt het weer alleen de actieve cel.
      const hasRange = s.selectionStart != null || s.selectionEnd != null
        || s.cellSelectionStart != null || s.cellSelectionEnd != null;
      if (row !== s.activeRow || cur !== id || hasRange) s.setActiveCell(row, s.activeCol, cur);
      return;
    }
  }
}

export interface TreeActionInput {
  /** Rijen van de actieve variant, zoals de boom ze nu toont. */
  items: CostItem[];
  byId: Map<string, CostItem>;
  fullByParent: Map<string | null, CostItem[]>;
  /** Rijen met échte inhoud in de begroting (zie SchedulePanel). */
  foldParents: ReadonlySet<string>;
  rules: TreeRules;
  t: TFunction;
  toggleCollapse: (id: string) => void;
}

export type TreeActions = ReturnType<typeof createTreeActions>;

export function createTreeActions({ items, byId, fullByParent, foldParents, rules, t, toggleCollapse }: TreeActionInput) {
  const { siblingTarget, canMoveInto, paragraphTargets, canMakeChapter, topChapters, afterTargets, canMoveToTop } = rules;

  /** Dé verplaatsactie: de bestaande store-actie, en alleen als die echt iets
   *  veranderde één undo-stap (geen lege stap bij een geweigerde zet). Leest
   *  de verse store-stand, zodat een sleepbeweging nooit met oude gegevens
   *  eindigt. Alt+pijl, het menu en slepen komen hier allemaal langs. */
  const runMove = (id: string, targetId: string, position: DropPos, undoLabel: string): boolean => {
    const store = useAppStore.getState();
    const before = store.items;
    store.moveItems([id], targetId, position);
    if (useAppStore.getState().items === before) return false;
    useAppStore.getState().pushHistory(before, undoLabel);
    useAppStore.getState().revealItem(id); // rij-index opnieuw koppelen
    return true;
  };

  const moveAmongSiblings = (id: string, dir: -1 | 1): boolean => {
    const target = siblingTarget(id, dir);
    if (!target) return false;
    return runMove(id, target.id, dir < 0 ? 'before' : 'after', t('grid:undo.moveRow'));
  };

  /** Als laatste kind onder het hoofdstuk/de post (na de laatste bestaande rij). */
  const moveInto = (id: string, containerId: string): boolean => {
    if (!canMoveInto(id, containerId)) return false;
    const indexOf = new Map<string, number>();
    items.forEach((it, i) => indexOf.set(it.id, i));
    const children = items.filter((it) => it.parentId === containerId && !it.rowType.startsWith('staart_'));
    sortSiblings(children, indexOf);
    const last = children[children.length - 1];
    const undoLabel = byId.get(containerId)?.rowType === 'chapter' ? t('grid:undo.moveToChapter') : t('grid:undo.moveRow');
    return last ? runMove(id, last.id, 'after', undoLabel) : runMove(id, containerId, 'inside', undoLabel);
  };

  // ── Hoofdstuk ↔ paragraaf ────────────────────────────────────────────
  /** Hoofdstuk wordt de laatste paragraaf van `targetId`; alles eronder gaat mee. */
  const makeParagraph = (id: string, targetId: string): boolean => {
    if (!paragraphTargets(id).some((c) => c.id === targetId)) return false;
    const indexOf = new Map<string, number>();
    items.forEach((it, i) => indexOf.set(it.id, i));
    const children = items.filter((it) => it.parentId === targetId && !it.rowType.startsWith('staart_'));
    sortSiblings(children, indexOf);
    const last = children[children.length - 1];
    const undoLabel = t('grid:undo.moveToChapter');
    return last ? runMove(id, last.id, 'after', undoLabel) : runMove(id, targetId, 'inside', undoLabel);
  };
  /** Paragraaf wordt hoofdstuk, direct ná zijn oude hoofdstuk. */
  const makeChapter = (id: string): boolean => {
    const parentId = byId.get(id)?.parentId;
    if (!canMakeChapter(id) || !parentId) return false;
    return runMove(id, parentId, 'after', t('grid:undo.moveRow'));
  };

  // ── Hoofdstuk op het hoogste niveau verplaatsen ──────────────────────
  const moveChapterToTop = (id: string): boolean => {
    if (!canMoveToTop(id)) return false;
    return runMove(id, topChapters()[0].id, 'before', t('grid:undo.moveRow'));
  };
  const moveChapterAfter = (id: string, targetId: string): boolean => {
    if (!afterTargets(id).some((c) => c.id === targetId)) return false;
    return runMove(id, targetId, 'after', t('grid:undo.moveRow'));
  };

  // ── Verwijderen ──────────────────────────────────────────────────────
  /** Verwijdert de rij met alles eronder, net als in het raster (store-actie
   *  `deleteItem`), als één undo-stap. Alleen via het rechtermuisknopmenu en
   *  ALTIJD na een vraag: in het raster maakt Delete een cel leeg, en na een
   *  klik in de boom heeft de boom de focus. Een Delete-toets hier zou dan
   *  ongemerkt een hele post weggooien. Daarna gaat de selectie naar de
   *  volgende zichtbare rij (of de vorige). */
  const deleteNode = (id: string, number: TreeNumber, nodes: TreeNode[], nodeIndex: Map<string, number>): boolean => {
    const store = useAppStore.getState();
    const item = store.items.find((i) => i.id === id);
    if (!item) return false;
    // Alleen rijen tellen die je in de actieve variant ziet (zoals het
    // raster): rijen van een andere variant staan nergens in beeld, dus ook
    // niet in de vraag. Let op: `deleteItem` haalt ze wél mee weg (net als
    // Delete in het raster).
    const gone = descendantIds(variantItems(store.items, store.schedule), id);
    // Zelfde naam als in de boom (met of zonder code, zoals ingesteld).
    const name = label(item, item.rowType === 'chapter' ? t('chapter') : '—', number);
    const question = gone.size > 0
      ? t('structureTree.deleteConfirm', { name, count: gone.size })
      : t('structureTree.deleteConfirmOne', { name });
    if (!window.confirm(question)) return false;
    gone.add(id);
    const index = nodeIndex.get(id) ?? -1;
    let nextId: string | null = null;
    for (let i = index + 1; i < nodes.length && !nextId; i++) if (!gone.has(nodes[i].item.id)) nextId = nodes[i].item.id;
    for (let i = index - 1; i >= 0 && !nextId; i--) if (!gone.has(nodes[i].item.id)) nextId = nodes[i].item.id;

    const before = store.items;
    store.deleteItem(id);
    if (useAppStore.getState().items === before) return false;
    useAppStore.getState().pushHistory(before, t('history.delete'));
    // Niets meer om te selecteren (of de rij is niet te tonen): selectie leeg,
    // niet blijven wijzen naar een verwijderde rij.
    if (!nextId || !useAppStore.getState().revealItem(nextId)) useAppStore.setState({ activeItemId: null, activeRow: -1 });
    return true;
  };

  /** true als er echt iets verplaatst is. */
  const applyDrop = (dragId: string, d: DropTarget): boolean =>
    d.position === 'inside' ? moveInto(dragId, d.id) : runMove(dragId, d.id, d.position, t('grid:undo.moveRow'));

  // ── In-/uitklappen onder een rij ─────────────────────────────────────
  /** Deze rij en alles eronder in één keer open of dicht (alleen rijen met
   *  inhoud). Eén store-wijziging, geen undo-stap: weergave, net als het
   *  pijltje. Gedeeld met het raster, zoals alle open/dicht. */
  const setCollapsedBelow = (id: string, collapsed: boolean) => {
    const ids = new Set<string>();
    const stack = [id];
    while (stack.length) {
      const cur = stack.pop()!;
      // Ook een rij met alleen tekstregels eronder klapt mee (in het raster).
      if (!foldParents.has(cur) || ids.has(cur)) continue;
      ids.add(cur);
      for (const child of fullByParent.get(cur) ?? []) stack.push(child.id);
    }
    const store = useAppStore.getState();
    const changes = (i: CostItem) => ids.has(i.id) && !!i.isCollapsed !== collapsed;
    if (!store.items.some(changes)) return;
    useAppStore.setState({ items: store.items.map((i) => (changes(i) ? { ...i, isCollapsed: collapsed } : i)) });
    syncGridSelection();
  };
  const hasTreeChildren = (id: string) => foldParents.has(id);
  /** Eén rij open/dicht vanuit de boom (pijltje, ←/→), en het raster bijsturen. */
  const toggleFold = (id: string) => {
    toggleCollapse(id);
    syncGridSelection();
  };

  return {
    runMove,
    moveAmongSiblings,
    moveInto,
    makeParagraph,
    makeChapter,
    moveChapterToTop,
    moveChapterAfter,
    deleteNode,
    applyDrop,
    setCollapsedBelow,
    hasTreeChildren,
    toggleFold,
  };
}
