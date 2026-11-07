import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/state/appStore';
import type { CostItem, RowType } from '@/types/costModel';
import './panels.css';

/**
 * Structuurboom: een smalle inhoudsopgave van de begroting.
 *
 * - Toont hoofdstukken, paragrafen en begrotingsposten; bewakingsposten,
 *   regels, tekst-/witregels en staartregels staan alleen in het raster.
 * - Open/dicht is dezelfde `isCollapsed` als in het raster: klap je hier
 *   iets open, dan klapt het raster mee, en andersom.
 * - Klik = naar de rij in het raster (bovenliggende rijen gaan open),
 *   dubbelklik of Enter = ook het eigenschappenpaneel openen.
 * - Verplaatsen: Alt+↑/↓ wisselt met de vorige/volgende zuster, het
 *   rechtermuisknopmenu verplaatst naar een ander hoofdstuk. Beide gaan
 *   via de bestaande store-actie `moveItems` (één undo-stap per zet).
 */

const TREE_TYPES: ReadonlySet<RowType> = new Set<RowType>(['chapter', 'begrotingspost']);

interface TreeNode {
  item: CostItem;
  level: number;
  parentId: string | null;
  hasChildren: boolean;
}

function sortSiblings(list: CostItem[], indexOf: Map<string, number>): void {
  list.sort((a, b) => {
    const so = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    return so !== 0 ? so : (indexOf.get(a.id) ?? 0) - (indexOf.get(b.id) ?? 0);
  });
}

/** Kinderen per ouder (alleen boomtypes), gesorteerd zoals het raster. */
function buildChildren(items: CostItem[]): Map<string | null, CostItem[]> {
  const indexOf = new Map<string, number>();
  items.forEach((it, i) => indexOf.set(it.id, i));
  const byParent = new Map<string | null, CostItem[]>();
  for (const item of items) {
    if (!TREE_TYPES.has(item.rowType)) continue;
    const key = item.parentId ?? null;
    const list = byParent.get(key);
    if (list) list.push(item);
    else byParent.set(key, [item]);
  }
  for (const list of byParent.values()) sortSiblings(list, indexOf);
  return byParent;
}

/** Zichtbare boomknopen: kinderen alleen onder een opengeklapte ouder. */
function flattenTree(byParent: Map<string | null, CostItem[]>): TreeNode[] {
  const out: TreeNode[] = [];
  const seen = new Set<string>();
  const walk = (parentId: string | null, level: number) => {
    for (const item of byParent.get(parentId) ?? []) {
      if (seen.has(item.id)) continue; // kapotte/cyclische ouderketen
      seen.add(item.id);
      // De boom stopt bij begrotingsposten: die krijgen geen pijltje.
      const hasChildren = item.rowType === 'chapter' && (byParent.get(item.id)?.length ?? 0) > 0;
      out.push({ item, level, parentId, hasChildren });
      if (hasChildren && !item.isCollapsed) walk(item.id, level + 1);
    }
  };
  walk(null, 1);
  return out;
}

/** Alle hoofdstukken in boomvolgorde, ongeacht open/dicht. */
function allChapters(byParent: Map<string | null, CostItem[]>): { item: CostItem; level: number }[] {
  const out: { item: CostItem; level: number }[] = [];
  const seen = new Set<string>();
  const walk = (parentId: string | null, level: number) => {
    for (const item of byParent.get(parentId) ?? []) {
      if (item.rowType !== 'chapter' || seen.has(item.id)) continue;
      seen.add(item.id);
      out.push({ item, level });
      walk(item.id, level + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** Ids van alle nakomelingen van een item (via parentId). */
function descendantIds(items: CostItem[], rootId: string): Set<string> {
  const byParent = new Map<string | null, CostItem[]>();
  for (const it of items) {
    const list = byParent.get(it.parentId ?? null);
    if (list) list.push(it); else byParent.set(it.parentId ?? null, [it]);
  }
  const out = new Set<string>();
  const walk = (id: string) => {
    for (const child of byParent.get(id) ?? []) {
      if (out.has(child.id)) continue;
      out.add(child.id);
      walk(child.id);
    }
  };
  walk(rootId);
  return out;
}

function label(item: CostItem, fallback: string): string {
  const code = item.code?.trim();
  const description = item.description?.trim();
  if (code && description) return `${code} ${description}`;
  return code || description || fallback;
}

interface MenuState { x: number; y: number; id: string }

export const SchedulePanel: React.FC = () => {
  const { t } = useTranslation();
  const items = useAppStore((s) => s.items);
  const scheduleName = useAppStore((s) => s.schedule.name);
  const activeItemId = useAppStore((s) => s.activeItemId);
  const activeRow = useAppStore((s) => s.activeRow);
  const toggleCollapse = useAppStore((s) => s.toggleCollapse);
  const revealItem = useAppStore((s) => s.revealItem);
  const moveItems = useAppStore((s) => s.moveItems);
  const pushHistory = useAppStore((s) => s.pushHistory);

  const byParent = useMemo(() => buildChildren(items), [items]);
  const nodes = useMemo(() => flattenTree(byParent), [byParent]);
  const nodeIndex = useMemo(() => new Map(nodes.map((n, i) => [n.item.id, i])), [nodes]);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

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

  const treeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!highlightId) return;
    const el = treeRef.current?.querySelector<HTMLElement>(`[data-tree-id="${CSS.escape(highlightId)}"]`);
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [highlightId]);

  const openProperties = () => useAppStore.setState({ showPropertiesPanel: true });

  // ── Verplaatsen ──────────────────────────────────────────────────────
  // Zusters zijn alleen boomrijen onder dezelfde ouder; staartregels en
  // regels staan daar niet in, dus een hoofdstuk kan nooit tussen de staart
  // belanden en een post nooit onder een andere post.
  const siblingTarget = (id: string, dir: -1 | 1): CostItem | null => {
    const item = byId.get(id);
    if (!item) return null;
    const siblings = byParent.get(item.parentId ?? null) ?? [];
    const i = siblings.findIndex((s) => s.id === id);
    return i < 0 ? null : siblings[i + dir] ?? null;
  };

  const moveAmongSiblings = (id: string, dir: -1 | 1): boolean => {
    const target = siblingTarget(id, dir);
    if (!target) return false;
    pushHistory(items, t('grid:undo.moveRow'));
    moveItems([id], target.id, dir < 0 ? 'before' : 'after');
    useAppStore.getState().revealItem(id); // rij-index opnieuw koppelen
    return true;
  };

  const canMoveToChapter = (id: string, chapterId: string): boolean => {
    const item = byId.get(id);
    const chapter = byId.get(chapterId);
    if (!item || !chapter || chapter.rowType !== 'chapter') return false;
    if (chapterId === id || chapterId === item.parentId) return false;
    return !descendantIds(items, id).has(chapterId); // geen kringetje
  };

  /** Als laatste kind onder het hoofdstuk (na de laatste bestaande rij). */
  const moveToChapter = (id: string, chapterId: string): boolean => {
    if (!canMoveToChapter(id, chapterId)) return false;
    const indexOf = new Map<string, number>();
    items.forEach((it, i) => indexOf.set(it.id, i));
    const children = items.filter((it) => it.parentId === chapterId && !it.rowType.startsWith('staart_'));
    sortSiblings(children, indexOf);
    const last = children[children.length - 1];
    pushHistory(items, t('grid:undo.moveToChapter'));
    if (last) moveItems([id], last.id, 'after');
    else moveItems([id], chapterId, 'inside');
    useAppStore.getState().revealItem(id);
    return true;
  };

  // ── Rechtermuisknopmenu ───────────────────────────────────────────────
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [showMoveSub, setShowMoveSub] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeMenu = () => { setMenu(null); setShowMoveSub(false); };

  useEffect(() => {
    if (!menu) return;
    const onMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) closeMenu();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeMenu(); };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  useEffect(() => {
    if (!menu || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    if (rect.right > window.innerWidth) menuRef.current.style.left = `${menu.x - rect.width}px`;
    if (rect.bottom > window.innerHeight) menuRef.current.style.top = `${menu.y - rect.height}px`;
  }, [menu]);

  const menuChapters = useMemo(() => {
    if (!menu) return [];
    return allChapters(byParent).filter(({ item }) => canMoveToChapter(menu.id, item.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu, byParent, items]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (nodes.length === 0) return;
    const index = highlightId ? nodeIndex.get(highlightId) ?? -1 : -1;
    const node = index >= 0 ? nodes[index] : null;
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      if (node) moveAmongSiblings(node.item.id, e.key === 'ArrowUp' ? -1 : 1);
      e.preventDefault();
      return;
    }
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
        if (!node?.hasChildren) break;
        if (node.item.isCollapsed) toggleCollapse(node.item.id);
        else go(index + 1);
        break;
      case 'ArrowLeft':
        if (!node) break;
        if (node.hasChildren && !node.item.isCollapsed) toggleCollapse(node.item.id);
        else if (node.parentId) revealItem(node.parentId);
        break;
      case 'Enter':
        if (node) { revealItem(node.item.id); openProperties(); }
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  const menuItem = menu ? byId.get(menu.id) : undefined;

  return (
    <div className="schedule-tree-wrap">
      <div className="schedule-tree-title" title={scheduleName}>{scheduleName}</div>
      <div
        ref={treeRef}
        className="schedule-tree"
        role="tree"
        aria-label={t('explorer')}
        tabIndex={0}
        onKeyDown={onKeyDown}
      >
        {nodes.map(({ item, level, hasChildren }) => {
          const text = label(item, t('chapter'));
          const isChapter = item.rowType === 'chapter';
          return (
            <div
              key={item.id}
              data-tree-id={item.id}
              role="treeitem"
              aria-level={level}
              aria-selected={item.id === highlightId}
              aria-expanded={hasChildren ? !item.isCollapsed : undefined}
              className={`schedule-item${item.id === highlightId ? ' active' : ''}`}
              style={{ paddingLeft: (level - 1) * 12 + 4 }}
              title={text}
              onClick={() => revealItem(item.id)}
              onDoubleClick={() => { revealItem(item.id); openProperties(); }}
              onContextMenu={(e) => {
                e.preventDefault();
                revealItem(item.id);
                setShowMoveSub(false);
                setMenu({ x: e.clientX, y: e.clientY, id: item.id });
              }}
            >
              {hasChildren ? (
                <button
                  className="grid-collapse-btn"
                  tabIndex={-1}
                  aria-hidden="true"
                  onClick={(e) => { e.stopPropagation(); toggleCollapse(item.id); }}
                  onDoubleClick={(e) => e.stopPropagation()}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    {item.isCollapsed
                      ? <polyline points="3,2 7,5 3,8" />
                      : <polyline points="2,3 5,7 8,3" />}
                  </svg>
                </button>
              ) : (
                <span className="schedule-item-spacer" />
              )}
              {isChapter ? (
                <svg className="schedule-item-icon" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
                </svg>
              ) : (
                <svg className="schedule-item-icon" width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                  <rect x="3" y="3" width="4" height="4" rx="0.5" />
                </svg>
              )}
              <span className="schedule-item-label">
                {item.code?.trim() && item.description?.trim()
                  ? <><span className="schedule-item-code">{item.code.trim()}</span>{item.description.trim()}</>
                  : text}
              </span>
            </div>
          );
        })}
      </div>

      {menu && menuItem && (
        <div ref={menuRef} className="grid-context-menu schedule-tree-menu" role="menu" style={{ left: menu.x, top: menu.y }}>
          <button
            className="grid-context-menu-item"
            role="menuitem"
            disabled={!siblingTarget(menu.id, -1)}
            onClick={() => { moveAmongSiblings(menu.id, -1); closeMenu(); }}
          >
            <span>{t('ribbon:budget.moveUp')}</span>
            <span className="grid-context-menu-shortcut">Alt+↑</span>
          </button>
          <button
            className="grid-context-menu-item"
            role="menuitem"
            disabled={!siblingTarget(menu.id, 1)}
            onClick={() => { moveAmongSiblings(menu.id, 1); closeMenu(); }}
          >
            <span>{t('ribbon:budget.moveDown')}</span>
            <span className="grid-context-menu-shortcut">Alt+↓</span>
          </button>
          <div className="grid-context-menu-separator" />
          <div style={{ position: 'relative' }}>
            <button
              className="grid-context-menu-item"
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={showMoveSub}
              disabled={menuChapters.length === 0}
              onClick={() => setShowMoveSub((v) => !v)}
            >
              <span>{t('grid:contextMenu.moveTo')}</span>
              <span className="grid-context-menu-shortcut">▸</span>
            </button>
            {showMoveSub && (
              <div className="grid-context-submenu" role="menu" style={{ position: 'absolute', left: '100%', top: 0 }}>
                {menuChapters.map(({ item: ch, level }) => (
                  <button
                    key={ch.id}
                    className="grid-context-menu-item"
                    role="menuitem"
                    data-move-target={ch.id}
                    style={{ paddingLeft: 12 + level * 12 }}
                    onClick={() => { moveToChapter(menu.id, ch.id); closeMenu(); }}
                  >
                    <span>{label(ch, t('chapter'))}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
