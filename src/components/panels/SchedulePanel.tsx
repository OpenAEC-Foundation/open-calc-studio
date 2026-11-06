import React, { useEffect, useMemo, useRef } from 'react';
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
 */

const TREE_TYPES: ReadonlySet<RowType> = new Set<RowType>(['chapter', 'begrotingspost']);

interface TreeNode {
  item: CostItem;
  level: number;
  parentId: string | null;
  hasChildren: boolean;
}

/** Kinderen per ouder, gesorteerd zoals het raster (sortOrder, dan arrayvolgorde). */
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
  for (const list of byParent.values()) {
    list.sort((a, b) => {
      const so = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      return so !== 0 ? so : (indexOf.get(a.id) ?? 0) - (indexOf.get(b.id) ?? 0);
    });
  }
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

function label(item: CostItem, fallback: string): string {
  const code = item.code?.trim();
  const description = item.description?.trim();
  if (code && description) return `${code} ${description}`;
  return code || description || fallback;
}

export const SchedulePanel: React.FC = () => {
  const { t } = useTranslation();
  const items = useAppStore((s) => s.items);
  const scheduleName = useAppStore((s) => s.schedule.name);
  const activeItemId = useAppStore((s) => s.activeItemId);
  const activeRow = useAppStore((s) => s.activeRow);
  const toggleCollapse = useAppStore((s) => s.toggleCollapse);
  const revealItem = useAppStore((s) => s.revealItem);

  const byParent = useMemo(() => buildChildren(items), [items]);
  const nodes = useMemo(() => flattenTree(byParent), [byParent]);
  const nodeIndex = useMemo(() => new Map(nodes.map((n, i) => [n.item.id, i])), [nodes]);

  // Geselecteerde rij in het raster → dichtstbijzijnde zichtbare boomknoop
  // (een regel markeert zijn begrotingspost, een rij in een dichtgeklapt
  // hoofdstuk markeert dat hoofdstuk).
  const highlightId = useMemo(() => {
    const selectedId = activeItemId ?? useAppStore.getState().getGridRows()[activeRow]?.id ?? null;
    if (!selectedId) return null;
    const byId = new Map(items.map((i) => [i.id, i]));
    const guard = new Set<string>();
    let current: string | null = selectedId;
    while (current && !guard.has(current)) {
      if (nodeIndex.has(current)) return current;
      guard.add(current);
      current = byId.get(current)?.parentId ?? null;
    }
    return null;
  }, [activeItemId, activeRow, items, nodeIndex]);

  const treeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!highlightId) return;
    const el = treeRef.current?.querySelector<HTMLElement>(`[data-tree-id="${CSS.escape(highlightId)}"]`);
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [highlightId]);

  const openProperties = () => useAppStore.setState({ showPropertiesPanel: true });

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (nodes.length === 0) return;
    const index = highlightId ? nodeIndex.get(highlightId) ?? -1 : -1;
    const node = index >= 0 ? nodes[index] : null;
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
    </div>
  );
};
