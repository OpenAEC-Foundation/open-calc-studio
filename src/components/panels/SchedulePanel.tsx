import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/state/appStore';
import { getKostprijs } from '@/services/calculation/calculator';
import { variantItems } from '@/services/grid/variantScope';
import type { CostItem } from '@/types/costModel';
import {
  DEPTH_TYPES, buildChildren, descendantIds, flattenTree, formatTreeAmount, label, loadDepth, loadView,
  pctFormatter, prefixOf, previewChildren, saveDepth, saveView, treeRowDomId,
  type TreeDepth, type TreeView,
} from './structureTree/treeModel';
import { createTreeRules } from './structureTree/treeRules';
import { createTreeActions } from './structureTree/treeActions';
import { useTreeDrag } from './structureTree/useTreeDrag';
import { TreeContextMenu, useTreeMenu } from './structureTree/TreeContextMenu';
import { TreeViewOptions } from './structureTree/TreeViewOptions';
import { RowIcon } from './structureTree/RowIcon';
import './panels.css';

export type { TreeDepth, TreeNumber, TreeView } from './structureTree/treeModel';

/**
 * Structuurboom: een smalle inhoudsopgave van de begroting.
 *
 * - Toont hoofdstukken, paragrafen, begrotingsposten, bewakingsposten en
 *   regels; tekst-/witregels en staartregels staan alleen in het raster.
 * - Open/dicht is dezelfde `isCollapsed` als in het raster: klap je hier
 *   iets open, dan klapt het raster mee, en andersom.
 * - Klik = naar de rij in het raster (bovenliggende rijen gaan open),
 *   dubbelklik of Enter = ook het eigenschappenpaneel openen.
 * - Verplaatsen: Alt+↑/↓ wisselt met de vorige/volgende zuster, het
 *   rechtermuisknopmenu verplaatst een hoofdstuk of post naar een ander
 *   hoofdstuk, en slepen kan overal. Alles gaat via de bestaande
 *   store-actie `moveItems` (één undo-stap per zet).
 *
 * Dit bestand zet de onderdelen in elkaar; de rest staat in structureTree/:
 * - treeModel.ts       boom opbouwen, weergave-instellingen, opmaak (puur)
 * - treeRules.ts       welke rij waar mag (puur)
 * - treeActions.ts     verplaatsen, verwijderen, in-/uitklappen (store)
 * - useTreeDrag.ts     slepen met de muis
 * - TreeContextMenu    rechtermuisknopmenu
 * - TreeViewOptions    knopje "Weergave" in de kop
 */

export const SchedulePanel: React.FC = () => {
  const { t } = useTranslation();
  const allItems = useAppStore((s) => s.items);
  const branchesEnabled = useAppStore((s) => s.schedule.branchesEnabled);
  const activeBranchId = useAppStore((s) => s.schedule.activeBranchId);
  const branches = useAppStore((s) => s.schedule.branches);
  // Alleen de actieve variant, net als het raster (`gridRows`): rijen van een
  // andere variant staan niet in het raster, dus ook niet in de boom.
  const items = useMemo(
    () => variantItems(allItems, { branchesEnabled, activeBranchId, branches }),
    [allItems, branchesEnabled, activeBranchId, branches],
  );
  const scheduleName = useAppStore((s) => s.schedule.name);
  const activeItemId = useAppStore((s) => s.activeItemId);
  const activeRow = useAppStore((s) => s.activeRow);
  const toggleCollapse = useAppStore((s) => s.toggleCollapse);
  const revealItem = useAppStore((s) => s.revealItem);

  const [depth, setDepthState] = useState<TreeDepth>(loadDepth);
  const setDepth = (d: TreeDepth) => { setDepthState(d); saveDepth(d); };
  const [view, setViewState] = useState<TreeView>(loadView);
  const setView = (patch: Partial<TreeView>) => setViewState((v) => { const next = { ...v, ...patch }; saveView(next); return next; });
  // Basis voor "% van totaal": som van alle rijen op het hoogste niveau
  // (zonder staart). In oude, gemengde begrotingen tellen posten op het
  // hoogste niveau mee, ook als de boom ze bij "Hoofdstukken" niet toont:
  // het blijft een aandeel in het geheel. Bij 0 of minder geen % (zie onder).
  const kostprijs = useMemo(() => (view.percent ? getKostprijs(items) : 0), [items, view.percent]);
  // Wat de boom toont (tot de gekozen diepte)…
  const byParent = useMemo(() => buildChildren(items, DEPTH_TYPES[depth]), [items, depth]);
  // …en de volledige structuur voor de verplaatsregels: die mogen niet
  // afhangen van wat er toevallig in beeld is.
  const fullByParent = useMemo(() => buildChildren(items), [items]);
  // Rijen met échte inhoud in de begroting (ook alleen tekst- of witregels,
  // die de boom niet toont), zelfde regel als het pijltje in het raster.
  // Staartrijen tellen niet mee.
  const foldParents = useMemo(() => {
    const set = new Set<string>();
    for (const it of items) if (it.parentId && !it.rowType.startsWith('staart_')) set.add(it.parentId);
    return set;
  }, [items]);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  /** Echt dicht: dichtgeklapt én er hangt iets onder (ook alleen tekstregels:
   *  dan klapt het raster dicht). Een lege post met een oude `isCollapsed`
   *  gedraagt zich als open. */
  const isFolded = (item: CostItem): boolean => !!item.isCollapsed && foldParents.has(item.id);
  /** Nakomelingen van één rij, onthouden zolang de rijen niet veranderen: bij
   *  slepen wordt dit per muisbeweging vaak gevraagd (8.000 rijen = merkbaar). */
  const descCache = useRef<{ items: CostItem[]; id: string; set: Set<string> } | null>(null);
  const descendantsOf = (id: string): Set<string> => {
    const c = descCache.current;
    if (c && c.items === items && c.id === id) return c.set;
    const set = descendantIds(items, id);
    descCache.current = { items, id, set };
    return set;
  };

  // Regels (puur) en acties (via de store); elke render vers, zodat ze
  // altijd de huidige rijen zien.
  const rules = createTreeRules({ byId, fullByParent, descendantsOf });
  const actions = createTreeActions({ items, byId, fullByParent, foldParents, rules, t, toggleCollapse });
  const { moveAmongSiblings, setCollapsedBelow, toggleFold } = actions;

  const treeRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);

  // Slepen: de hook roept altijd de regels en acties van de laatste render aan.
  const { draggingId, dropHint, dropBlocked, expandPending, suppressClickRef, placeDragLabel, onRowPointerDown } = useTreeDrag({
    treeRef,
    headRef,
    resolveDrop: rules.resolveDrop,
    hasTargetInside: rules.hasTargetInside,
    applyDrop: actions.applyDrop,
    isFolded,
    byId,
    items,
  });

  const shownByParent = useMemo(() => {
    const dragged = draggingId ? byId.get(draggingId) : undefined;
    const target = dropHint ? byId.get(dropHint.id) : undefined;
    if (!dragged || !target || !dropHint) return byParent;
    // In een dichtgeklapt hoofdstuk kun je niets laten zien: alleen de omlijning.
    if (dropHint.position === 'inside' && isFolded(target)) return byParent;
    return previewChildren(byParent, dragged, target, dropHint.position);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byParent, byId, draggingId, dropHint]);

  // Een lege map met een oude `isCollapsed` waar het voorbeeld de rij in zet:
  // die even open tonen, anders verdwijnt de gesleepte rij uit beeld.
  const previewOpenId = useMemo(() => {
    if (!draggingId || dropHint?.position !== 'inside') return null;
    const target = byId.get(dropHint.id);
    return target && target.isCollapsed && !isFolded(target) ? target.id : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggingId, dropHint, byId]);
  const nodes = useMemo(
    () => flattenTree(shownByParent, draggingId, previewOpenId, foldParents),
    [shownByParent, draggingId, previewOpenId, foldParents],
  );
  const nodeIndex = useMemo(() => new Map(nodes.map((n, i) => [n.item.id, i])), [nodes]);

  // Geselecteerde rij in het raster → dichtstbijzijnde zichtbare boomknoop
  // (een regel markeert zijn begrotingspost, een rij in een dichtgeklapt
  // hoofdstuk markeert dat hoofdstuk).
  const highlightId = useMemo(() => {
    const selectedId = activeItemId ?? useAppStore.getState().getGridRows()[activeRow]?.id ?? null;
    if (!selectedId) return null;
    const guard = new Set<string>();
    let current: string | null = selectedId;
    while (current && !guard.has(current)) {
      if (nodeIndex.has(current)) return current;
      guard.add(current);
      current = byId.get(current)?.parentId ?? null;
    }
    return null;
  }, [activeItemId, activeRow, byId, nodeIndex]);

  useEffect(() => {
    if (!highlightId) return;
    const el = treeRef.current?.querySelector<HTMLElement>(`[data-tree-id="${CSS.escape(highlightId)}"]`);
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [highlightId]);

  const openProperties = () => useAppStore.setState({ showPropertiesPanel: true });

  /** Tekst van het meelopende label, alleen het doel (de gesleepte rij zie je
   *  al in de boom): ↑/↓ = komt boven/onder, → = komt in, ⦸ = kan hier niet. */
  const dragLabelText = (() => {
    if (!draggingId) return '';
    const target = dropHint ? byId.get(dropHint.id) : undefined;
    if (!target || !dropHint) return dropBlocked ? '⦸' : '';
    const arrow = dropHint.position === 'inside' ? '→' : dropHint.position === 'before' ? '↑' : '↓';
    return `${arrow}  ${label(target, target.rowType === 'chapter' ? t('chapter') : '—', view.number)}`;
  })();

  // ── Rechtermuisknopmenu ───────────────────────────────────────────────
  const treeMenu = useTreeMenu();
  const { menu } = treeMenu;

  // ── Typen om te springen ─────────────────────────────────────────────
  // Letters typen springt naar de volgende rij waarvan de code of de
  // omschrijving zo begint (zoals in Verkenner). Snel na elkaar = één woord.
  const typeAhead = useRef({ text: '', at: 0 });
  const findByTyping = (key: string, fromIndex: number): number => {
    const now = Date.now();
    const ta = typeAhead.current;
    const text = (now - ta.at < 800 ? ta.text : '') + key.toLowerCase();
    ta.text = text;
    ta.at = now;
    // Eerste letter: vanaf de volgende rij (nog eens "f" = volgende f-rij);
    // langer woord: de huidige rij mag blijven als die nog past.
    const start = text.length === 1 ? fromIndex + 1 : Math.max(fromIndex, 0);
    for (let k = 0; k < nodes.length; k++) {
      const i = (start + k) % nodes.length;
      const { item } = nodes[i];
      const description = item.description?.trim().toLowerCase() ?? '';
      const code = item.code?.trim().toLowerCase() ?? '';
      if (description.startsWith(text) || (code && code.startsWith(text)) || `${code} ${description}`.startsWith(text)) return i;
    }
    return -1;
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Tijdens slepen geen toetsen (Alt+pijl, *, typen): alleen Escape, en die
    // vangt de sleepbeweging zelf op.
    if (nodes.length === 0 || draggingId) return;
    const index = highlightId ? nodeIndex.get(highlightId) ?? -1 : -1;
    const node = index >= 0 ? nodes[index] : null;
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      if (node) moveAmongSiblings(node.item.id, e.key === 'ArrowUp' ? -1 : 1);
      e.preventDefault();
      return;
    }
    // Alt+pijl is alleen verplaatsen: Alt+←/→ klapt niets in of uit.
    if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return;
    const go = (i: number) => {
      const target = nodes[Math.max(0, Math.min(nodes.length - 1, i))];
      if (target) revealItem(target.item.id);
    };
    switch (e.key) {
      case 'ArrowDown': go(index + 1); break;
      case 'ArrowUp': go(index < 0 ? 0 : index - 1); break;
      case 'Home': go(0); break;
      case 'End': go(nodes.length - 1); break;
      case 'ArrowRight':
        if (!node?.foldable) break;
        if (node.item.isCollapsed) toggleFold(node.item.id);
        else if (node.hasChildren) go(index + 1);
        break;
      case 'ArrowLeft':
        if (!node) break;
        if (node.foldable && !node.item.isCollapsed) toggleFold(node.item.id);
        else if (node.parentId) revealItem(node.parentId);
        break;
      case 'Enter':
        if (node) { revealItem(node.item.id); openProperties(); }
        break;
      // Geen 'Delete' hier (bewust): zie deleteNode. Verwijderen gaat via het menu.
      case '*': // zoals in Verkenner: alles onder de rij openklappen
        if (node) setCollapsedBelow(node.item.id, false);
        break;
      default: {
        const printable = e.key.length === 1 && e.key !== ' ' && !e.ctrlKey && !e.metaKey && !e.altKey;
        if (!printable || draggingId) return;
        const found = findByTyping(e.key, index);
        if (found >= 0) go(found);
        break;
      }
    }
    e.preventDefault();
  };


  return (
    <div className="schedule-tree-wrap">
      <div className="schedule-tree-head" ref={headRef}>
        <div className="schedule-tree-title" title={scheduleName}>{scheduleName}</div>
        <select
          className="schedule-tree-depth"
          aria-label={t('display')}
          title={t('display')}
          value={depth}
          onChange={(e) => setDepth(e.target.value as TreeDepth)}
        >
          <option value="chapter">{t('structureTree.chapters')}</option>
          <option value="post">{t('structureTree.posts')}</option>
          <option value="all">{t('structureTree.all')}</option>
        </select>
        <TreeViewOptions view={view} setView={setView} />
      </div>
      <div
        ref={treeRef}
        className={`schedule-tree${draggingId ? ' is-dragging' : ''}${draggingId && dropBlocked ? ' is-blocked' : ''}`}
        role="tree"
        aria-label={t('explorer')}
        // Schermlezer: de geselecteerde rij wordt voorgelezen bij pijltjes.
        aria-activedescendant={highlightId && nodeIndex.has(highlightId) ? treeRowDomId(highlightId) : undefined}
        tabIndex={0}
        onKeyDown={onKeyDown}
      >
        {nodes.map(({ item, level, foldable }) => {
          const prefix = prefixOf(item, view.number);
          const description = item.description?.trim() ?? '';
          const fallback = item.rowType === 'chapter' ? t('chapter') : '—';
          const text = prefix && description ? `${prefix} ${description}` : description || prefix || fallback;
          const amount = view.amounts ? formatTreeAmount(item.total) : '';
          // % alleen voor hoofdstukken en posten (een regel geeft vooral "0,0 %"),
          // en niet bij een kostprijs van 0 of minder (dan klopt het teken niet).
          const pct = view.percent && kostprijs > 0 && item.total && item.rowType !== 'regel'
            ? `${pctFormatter.format((item.total / kostprijs) * 100)}%` : '';
          // De gesleepte rij staat dicht in beeld: pijltje en aria ook.
          const shownCollapsed = !!item.isCollapsed || item.id === draggingId;
          return (
            <div
              key={item.id}
              id={treeRowDomId(item.id)}
              data-tree-id={item.id}
              data-row-type={item.rowType}
              role="treeitem"
              aria-level={level}
              aria-selected={item.id === highlightId}
              // Ook als alleen het raster in-/uitklapt (inhoud dieper dan de boom toont).
              aria-expanded={foldable ? !shownCollapsed : undefined}
              // Tijdens slepen alleen de gesleepte rij markeren, niet ook nog de selectie.
              className={`schedule-item${item.id === highlightId && !draggingId ? ' active' : ''}${item.id === draggingId ? ' dragging' : ''}${dropHint?.position === 'inside' && dropHint.id === item.id ? ' drop-inside' : ''}${item.id === expandPending ? ' expand-pending' : ''}`}
              style={{ paddingInlineStart: (level - 1) * 12 + 4 }}
              title={text}
              onPointerDown={(e) => onRowPointerDown(e, item.id)}
              onClick={() => {
                if (suppressClickRef.current) { suppressClickRef.current = false; return; }
                revealItem(item.id);
              }}
              onDoubleClick={() => { revealItem(item.id); openProperties(); }}
              onContextMenu={(e) => {
                e.preventDefault();
                revealItem(item.id);
                treeMenu.openMenu(e.clientX, e.clientY, item.id);
              }}
            >
              {foldable ? (
                <button
                  className="grid-collapse-btn"
                  tabIndex={-1}
                  aria-hidden="true"
                  onClick={(e) => { e.stopPropagation(); toggleFold(item.id); }}
                  onDoubleClick={(e) => e.stopPropagation()}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    {shownCollapsed
                      ? <polyline points="3,2 7,5 3,8" />
                      : <polyline points="2,3 5,7 8,3" />}
                  </svg>
                </button>
              ) : (
                <span className="schedule-item-spacer" />
              )}
              <RowIcon rowType={item.rowType} />
              <span className="schedule-item-label">
                {prefix && description
                  ? <><span className="schedule-item-code">{prefix}</span>{description}</>
                  : text}
              </span>
              {amount && <span className="schedule-item-amount">{amount}</span>}
              {/* Altijd een %-vakje (desnoods leeg), anders schuiven de bedragen
                  van rijen zonder % naar rechts en staan ze niet onder elkaar. */}
              {view.percent && <span className="schedule-item-pct" aria-hidden={pct ? undefined : true}>{pct}</span>}
            </div>
          );
        })}
      </div>

      {draggingId && dragLabelText && (
        <div
          ref={placeDragLabel}
          className={`schedule-drag-label${dropBlocked ? ' is-blocked' : ''}`}
          aria-hidden="true"
        >
          {dragLabelText}
        </div>
      )}

      {menu && (
        <TreeContextMenu
          state={{ ...treeMenu, menu }}
          menuItem={byId.get(menu.id)}
          treeRef={treeRef}
          number={view.number}
          items={items}
          fullByParent={fullByParent}
          rules={rules}
          actions={actions}
          onDelete={(id) => actions.deleteNode(id, view.number, nodes, nodeIndex)}
        />
      )}
    </div>
  );
};
