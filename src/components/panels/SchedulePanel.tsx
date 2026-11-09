import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/state/appStore';
import { localStore } from '@/utils/browserStorage';
import { getKostprijs } from '@/services/calculation/calculator';
import { variantItems } from '@/services/grid/variantScope';
import type { CostItem, RowType } from '@/types/costModel';
import './panels.css';

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
 */

const TREE_TYPES: ReadonlySet<RowType> = new Set<RowType>(['chapter', 'begrotingspost', 'bewakingspost', 'regel']);
const CONTAINER_TYPES: ReadonlySet<RowType> = new Set<RowType>(['chapter', 'begrotingspost', 'bewakingspost']);

/**
 * Hoe diep de boom kijkt. Alleen een weergavekeuze van de boom: de
 * open/dicht-stand (gedeeld met het raster) verandert er niet door, dus de
 * begroting houdt altijd al zijn regels. Per gebruiker onthouden.
 */
export type TreeDepth = 'chapter' | 'post' | 'all';
const DEPTH_TYPES: Record<TreeDepth, ReadonlySet<RowType>> = {
  chapter: new Set<RowType>(['chapter']),
  // Een bewakingspost is een onderverdeling van een begrotingspost: hoort bij dit niveau.
  post: new Set<RowType>(['chapter', 'begrotingspost', 'bewakingspost']),
  all: TREE_TYPES,
};
const DEPTH_KEY = 'ocs.structureTree.depth';
// Via localStore: in een afgeschermd frame (SuperCloud-werkplek) is
// localStorage er niet en valt dit terug op het geheugen.
function loadDepth(): TreeDepth {
  const v = localStore.getItem(DEPTH_KEY);
  return v === 'chapter' || v === 'post' || v === 'all' ? v : 'post';
}
function saveDepth(depth: TreeDepth): void {
  localStore.setItem(DEPTH_KEY, depth);
}

/**
 * Weergave-instellingen van de boom (per gebruiker onthouden):
 * - code: de code vóór de omschrijving (een regel heeft er meestal geen);
 * - amounts: totaal per rij rechts uitgelijnd;
 * - percent: aandeel in de kostprijs.
 * Nummer (10.01.02) of code (01) maakt in een boom weinig uit: de inspringing
 * laat al zien waar een rij hoort. Dus alleen: code aan of uit.
 */
export interface TreeView { code: boolean; amounts: boolean; percent: boolean }
const VIEW_KEY = 'ocs.structureTree.view';
const DEFAULT_VIEW: TreeView = { code: true, amounts: true, percent: false };
function loadView(): TreeView {
  try {
    const v = JSON.parse(localStore.getItem(VIEW_KEY) ?? 'null') as (Partial<TreeView> & { label?: string }) | null;
    return {
      // `label` is de eerdere (nooit uitgebrachte) keuze nummer/code/geen.
      code: typeof v?.code === 'boolean' ? v.code : v?.label ? v.label !== 'none' : DEFAULT_VIEW.code,
      amounts: typeof v?.amounts === 'boolean' ? v.amounts : DEFAULT_VIEW.amounts,
      percent: typeof v?.percent === 'boolean' ? v.percent : DEFAULT_VIEW.percent,
    };
  } catch {
    return DEFAULT_VIEW;
  }
}
function saveView(view: TreeView): void {
  localStore.setItem(VIEW_KEY, JSON.stringify(view));
}

/** De code vóór de omschrijving; zonder code (bijv. na een import) het nummer. */
function prefixOf(item: CostItem, showCode: boolean): string {
  if (!showCode) return '';
  return item.code?.trim() || item.nr?.trim() || '';
}

// Zelfde notatie als het raster (formatCurrency: altijd nl-NL), maar zonder centen.
const euroFormatter = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 0 });
const centFormatter = new Intl.NumberFormat('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Bedrag in de boom: hele euro's; onder € 1 met centen (anders staat er "0"
 *  terwijl de rij wel geld kost). 0 = niets tonen. */
function formatTreeAmount(total: number | null | undefined): string {
  if (!total) return '';
  return Math.abs(total) < 1 ? centFormatter.format(total) : euroFormatter.format(total);
}
/** DOM-id van een boomrij (voor aria-activedescendant). */
const treeRowDomId = (id: string) => `schedule-tree-row-${id}`;

/**
 * Na in-/uitklappen vanuit de boom schuiven de rijen in het raster op, maar
 * `activeRow` (een rijnummer) niet. Dan wijst het raster naar een ándere rij
 * dan de geselecteerde, en werken pijltjes of Delete in het raster daar.
 * Hier het raster weer laten wijzen naar de geselecteerde rij, of, als die nu
 * verborgen is, naar de dichtstbijzijnde zichtbare rij erboven.
 */
function syncGridSelection(): void {
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
      if (row !== s.activeRow || cur !== id) s.setActiveCell(row, s.activeCol, cur);
      return;
    }
  }
}
const pctFormatter = new Intl.NumberFormat('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

interface TreeNode {
  item: CostItem;
  level: number;
  parentId: string | null;
  hasChildren: boolean;
  /** Pijltje tonen: er hangt iets onder in de begroting, ook als de boom dat
   *  bij deze diepte niet laat zien (dan klapt alleen het raster open/dicht). */
  foldable: boolean;
}

function sortSiblings(list: CostItem[], indexOf: Map<string, number>): void {
  list.sort((a, b) => {
    const so = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    return so !== 0 ? so : (indexOf.get(a.id) ?? 0) - (indexOf.get(b.id) ?? 0);
  });
}

/** Kinderen per ouder (alleen de gegeven types), gesorteerd zoals het raster. */
function buildChildren(items: CostItem[], types: ReadonlySet<RowType> = TREE_TYPES): Map<string | null, CostItem[]> {
  const indexOf = new Map<string, number>();
  items.forEach((it, i) => indexOf.set(it.id, i));
  const byParent = new Map<string | null, CostItem[]>();
  for (const item of items) {
    if (!types.has(item.rowType)) continue;
    const key = item.parentId ?? null;
    const list = byParent.get(key);
    if (list) list.push(item);
    else byParent.set(key, [item]);
  }
  for (const list of byParent.values()) sortSiblings(list, indexOf);
  return byParent;
}

/** Zichtbare boomknopen: kinderen alleen onder een opengeklapte ouder.
 *  `foldedId` toont één rij dicht zonder de begroting te veranderen: de rij
 *  die je sleept, zodat zijn inhoud niet als een blok meeschuift. */
function flattenTree(
  byParent: Map<string | null, CostItem[]>,
  foldedId: string | null = null,
  /** Toon deze rij open, ook als `isCollapsed` (alleen voor het sleepvoorbeeld). */
  openId: string | null = null,
  /** Volledige structuur, voor het pijltje bij rijen waarvan de inhoud
   *  dieper zit dan de boom nu toont. */
  fullByParent: Map<string | null, CostItem[]> = byParent,
): TreeNode[] {
  const out: TreeNode[] = [];
  const seen = new Set<string>();
  const walk = (parentId: string | null, level: number) => {
    for (const item of byParent.get(parentId) ?? []) {
      if (seen.has(item.id)) continue; // kapotte/cyclische ouderketen
      seen.add(item.id);
      // Pijltje alleen bij hoofdstukken en (bewakings)posten met inhoud.
      const hasChildren = CONTAINER_TYPES.has(item.rowType) && (byParent.get(item.id)?.length ?? 0) > 0;
      const foldable = hasChildren || (CONTAINER_TYPES.has(item.rowType) && (fullByParent.get(item.id)?.length ?? 0) > 0);
      out.push({ item, level, parentId, hasChildren, foldable });
      if (hasChildren && (!item.isCollapsed || item.id === openId) && item.id !== foldedId) walk(item.id, level + 1);
    }
  };
  walk(null, 1);
  return out;
}

/**
 * Voorbeeld tijdens het slepen: dezelfde kinderenlijst, maar met het gesleepte
 * item (en alles eronder, dat blijft onder zijn eigen id hangen) alvast op
 * de nieuwe plek. De begroting zelf verandert pas bij loslaten.
 */
function previewChildren(
  byParent: Map<string | null, CostItem[]>,
  dragged: CostItem,
  target: CostItem,
  position: DropPos,
): Map<string | null, CostItem[]> {
  const out = new Map<string | null, CostItem[]>();
  for (const [key, list] of byParent) out.set(key, list.filter((i) => i.id !== dragged.id));
  if (position === 'inside') {
    const list = out.get(target.id) ?? [];
    list.push(dragged);
    out.set(target.id, list);
    return out;
  }
  const key = target.parentId ?? null;
  const list = out.get(key) ?? [];
  const idx = list.findIndex((i) => i.id === target.id);
  list.splice(position === 'before' ? idx : idx + 1, 0, dragged);
  out.set(key, list);
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

type DropPos = 'before' | 'after' | 'inside';
interface DropTarget { id: string; position: DropPos }
interface MenuState { x: number; y: number; id: string }

/** requestAnimationFrame met terugval (sommige testomgevingen hebben het niet). */
const nextFrame = (cb: () => void): number =>
  typeof requestAnimationFrame === 'function' ? requestAnimationFrame(cb) : (setTimeout(cb, 16) as unknown as number);
const cancelFrame = (id: number): void => {
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id); else clearTimeout(id);
};

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
  const [showViewMenu, setShowViewMenu] = useState(false);
  const viewMenuRef = useRef<HTMLDivElement>(null);
  const viewButtonRef = useRef<HTMLButtonElement>(null);
  const viewPanelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showViewMenu) return;
    // Bij openen de focus op de eerste optie, zodat het menu met het toetsenbord werkt.
    viewPanelRef.current?.querySelector<HTMLInputElement>('input')?.focus();
    const onMouseDown = (e: MouseEvent) => {
      if (viewMenuRef.current && !viewMenuRef.current.contains(e.target as Node)) setShowViewMenu(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation(); // alleen dit menu dicht, niet ook nog iets anders
      setShowViewMenu(false);
      viewButtonRef.current?.focus(); // terug naar het knopje
    };
    document.addEventListener('pointerdown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [showViewMenu]);
  // Kostprijs = som van de hoofdstukken op het hoogste niveau (zonder staart).
  const kostprijs = useMemo(() => (view.percent ? getKostprijs(items) : 0), [items, view.percent]);
  // Wat de boom toont (tot de gekozen diepte)…
  const byParent = useMemo(() => buildChildren(items, DEPTH_TYPES[depth]), [items, depth]);
  // …en de volledige structuur voor de verplaatsregels: die mogen niet
  // afhangen van wat er toevallig in beeld is.
  const fullByParent = useMemo(() => buildChildren(items), [items]);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  /** Echt dicht: dichtgeklapt én er hangt in de boom iets onder. Een lege
   *  post met een oude `isCollapsed` gedraagt zich als open. */
  const isFolded = (item: CostItem): boolean => !!item.isCollapsed && (fullByParent.get(item.id)?.length ?? 0) > 0;
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

  // Slepen: zolang de muis ingedrukt is, toont de boom alvast de nieuwe plek.
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<DropTarget | null>(null);
  const dropHintRef = useRef<DropTarget | null>(null); // altijd gelijk aan dropHint, maar direct bijgewerkt

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
    () => flattenTree(shownByParent, draggingId, previewOpenId, fullByParent),
    [shownByParent, draggingId, previewOpenId, fullByParent],
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

  const treeRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!highlightId) return;
    const el = treeRef.current?.querySelector<HTMLElement>(`[data-tree-id="${CSS.escape(highlightId)}"]`);
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [highlightId]);

  const openProperties = () => useAppStore.setState({ showPropertiesPanel: true });

  // ── Verplaatsen ──────────────────────────────────────────────────────
  // Alles blijft op zijn eigen niveau. Waar mag een rij onder hangen?
  //   hoofdstuk       → hetzelfde niveau als nu: een hoofdstuk blijft op het
  //                     hoogste niveau, een paragraaf gaat alleen naar een
  //                     hoofdstuk één niveau hoger. Nooit tussen posten.
  //   begrotingspost  → een hoofdstuk zonder paragrafen (nooit tussen paragrafen)
  //   bewakingspost   → een begrotingspost
  //   regel           → een begrotingspost of bewakingspost
  // Staartregels zitten niet in de boom, dus daar komt nooit iets tussen.
  const hasPosts = (chapterId: string): boolean =>
    (fullByParent.get(chapterId) ?? []).some((c) => c.rowType === 'begrotingspost');
  const hasChapters = (chapterId: string): boolean =>
    (fullByParent.get(chapterId) ?? []).some((c) => c.rowType === 'chapter');
  /** Niveau in de boom (0 = hoogste), via de ouderketen; niet via `depth`. */
  const levelOf = (id: string): number => {
    let level = 0;
    const seen = new Set<string>();
    let parent = byId.get(id)?.parentId ?? null;
    while (parent && !seen.has(parent)) { seen.add(parent); level++; parent = byId.get(parent)?.parentId ?? null; }
    return level;
  };
  const allowedParent = (item: CostItem, parent: CostItem | null | undefined): boolean => {
    switch (item.rowType) {
      case 'chapter': {
        const level = levelOf(item.id);
        if (!parent) return level === 0;
        return parent.rowType === 'chapter' && !hasPosts(parent.id) && levelOf(parent.id) + 1 === level;
      }
      case 'begrotingspost': return parent?.rowType === 'chapter' && !hasChapters(parent.id);
      case 'bewakingspost': return parent?.rowType === 'begrotingspost';
      case 'regel': return parent?.rowType === 'begrotingspost' || parent?.rowType === 'bewakingspost';
      default: return false;
    }
  };

  const siblingTarget = (id: string, dir: -1 | 1): CostItem | null => {
    const item = byId.get(id);
    if (!item) return null;
    const siblings = fullByParent.get(item.parentId ?? null) ?? [];
    const i = siblings.findIndex((s) => s.id === id);
    const target = i < 0 ? null : siblings[i + dir] ?? null;
    // Alleen wisselen met een rij van hetzelfde soort (oude, gemengde
    // begrotingen: een hoofdstuk schuift niet langs een post).
    if (target && target.rowType !== item.rowType) return null;
    return target;
  };

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
    runMove(id, target.id, dir < 0 ? 'before' : 'after', t('grid:undo.moveRow'));
    return true;
  };

  const canMoveInto = (id: string, containerId: string): boolean => {
    const item = byId.get(id);
    const container = byId.get(containerId);
    if (!item || !container || !CONTAINER_TYPES.has(container.rowType)) return false;
    if (containerId === id || containerId === item.parentId) return false;
    if (!allowedParent(item, container)) return false;
    return !descendantsOf(id).has(containerId); // geen kringetje
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
  // Bewust alleen via het menu (niet slepen: dan is niet duidelijk wat er
  // gebeurt) en via moveItems, niet indentItem/outdentItem: die passen alleen
  // de rij zelf aan, niet de diepte en volgorde van wat eronder hangt.
  /** Hoofdstukken waar hoofdstuk `id` een paragraaf van mag worden: alleen een
   *  hoofdstuk op het hoogste niveau zonder eigen paragrafen (er is maar één
   *  niveau paragrafen), onder een ander hoofdstuk op het hoogste niveau
   *  zonder begrotingsposten (posten en paragrafen niet door elkaar). */
  const paragraphTargets = (id: string): CostItem[] => {
    const item = byId.get(id);
    if (!item || item.rowType !== 'chapter' || levelOf(id) !== 0 || hasChapters(id)) return [];
    return (fullByParent.get(null) ?? []).filter((c) => c.rowType === 'chapter' && c.id !== id && !hasPosts(c.id));
  };
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
  /** Een paragraaf (hoofdstuk één niveau diep) kan weer hoofdstuk worden. */
  const canMakeChapter = (id: string): boolean => byId.get(id)?.rowType === 'chapter' && levelOf(id) === 1;
  /** Paragraaf wordt hoofdstuk, direct ná zijn oude hoofdstuk. */
  const makeChapter = (id: string): boolean => {
    const parentId = byId.get(id)?.parentId;
    if (!canMakeChapter(id) || !parentId) return false;
    return runMove(id, parentId, 'after', t('grid:undo.moveRow'));
  };

  // ── Verwijderen ──────────────────────────────────────────────────────
  /** Verwijdert de rij met alles eronder, net als in het raster (store-actie
   *  `deleteItem`), als één undo-stap. Alleen via het rechtermuisknopmenu en
   *  ALTIJD na een vraag: in het raster maakt Delete een cel leeg, en na een
   *  klik in de boom heeft de boom de focus. Een Delete-toets hier zou dan
   *  ongemerkt een hele post weggooien. Daarna gaat de selectie naar de
   *  volgende zichtbare rij (of de vorige). */
  const deleteNode = (id: string): boolean => {
    const store = useAppStore.getState();
    const item = store.items.find((i) => i.id === id);
    if (!item) return false;
    const gone = descendantIds(store.items, id);
    // Zelfde naam als in de boom (met of zonder code, zoals ingesteld).
    const prefix = prefixOf(item, view.code);
    const description = item.description?.trim() ?? '';
    const name = (prefix && description ? `${prefix} ${description}` : description || prefix) || (item.rowType === 'chapter' ? t('chapter') : '—');
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

  // ── Slepen ───────────────────────────────────────────────────────────
  // Pointer-gebaseerd, net als het raster: HTML5 drag&drop werkt niet in de
  // Tauri-webview zolang de native bestand-drop aanstaat.

  /** Waar komt `dragId` terecht als hij boven `targetId` losgelaten wordt?
   *  Het soort rij beslist, niet waar je precies in de rij mikt:
   *  - zelfde soort en niveau (post op post, regel op regel, hoofdstuk op
   *    hoofdstuk) → ervoor of erna, afhankelijk van de bovenste/onderste helft;
   *  - de juiste ouder (post op hoofdstuk, regel op post) → erin, achteraan.
   *  null = verboden doel (geen voorbeeld, niets bij loslaten);
   *  'same' = het item staat daar al (neutraal: niets doen, maar ook geen ⦸). */
  const resolveDrop = (dragId: string, targetId: string, half: 'top' | 'bottom'): DropTarget | 'same' | null => {
    const item = byId.get(dragId);
    const target = byId.get(targetId);
    if (!item || !target || dragId === targetId) return null;
    if (descendantsOf(dragId).has(targetId)) return null; // kringetje
    const sameLevel = target.rowType === item.rowType
      && (item.rowType !== 'chapter' || levelOf(targetId) === levelOf(dragId));
    if (!sameLevel) {
      // Boven de eigen ouder (regel boven zijn post): daar staat hij al.
      if (targetId === item.parentId) return 'same';
      return canMoveInto(dragId, targetId) ? { id: targetId, position: 'inside' } : null;
    }
    const position: DropPos = half === 'top' ? 'before' : 'after';
    // Naast `target` = onder dezelfde ouder; die moet passen.
    const newParent = target.parentId ? byId.get(target.parentId) : null;
    if (target.parentId && !newParent) return null; // verweesde rij
    // Binnen de huidige ouder herschikken mag altijd (ook in oude, gemengde
    // bestanden); naar een andere ouder alleen als die past.
    if ((newParent?.id ?? null) !== (item.parentId ?? null) && !allowedParent(item, newParent)) return null;
    // Al op die plek: niets doen (en geen undo-stap).
    if (position === 'before' && siblingTarget(dragId, 1)?.id === targetId) return 'same';
    if (position === 'after' && siblingTarget(dragId, -1)?.id === targetId) return 'same';
    return { id: targetId, position };
  };

  /** Is er ergens binnen `containerId` (ook dieper) een plek waar `dragId`
   *  mag landen? Dan klapt een dichte map open als je erboven blijft hangen,
   *  ook als het item er niet rechtstreeks in mag (post boven een hoofdstuk
   *  met paragrafen → de paragrafen worden bereikbaar). Zoals mappen in Verkenner. */
  const hasTargetInside = (dragId: string, containerId: string): boolean => {
    const stack = [...(fullByParent.get(containerId) ?? [])];
    const seen = new Set<string>();
    while (stack.length) {
      const child = stack.pop()!;
      if (seen.has(child.id) || child.id === dragId) continue;
      seen.add(child.id);
      const drop = resolveDrop(dragId, child.id, 'top');
      if (drop && drop !== 'same') return true;
      stack.push(...(fullByParent.get(child.id) ?? []));
    }
    return false;
  };

  /** true als er echt iets verplaatst is. */
  const applyDrop = (dragId: string, d: DropTarget): boolean =>
    d.position === 'inside' ? moveInto(dragId, d.id) : runMove(dragId, d.id, d.position, t('grid:undo.moveRow'));

  // De window-listeners van een sleepbeweging leven langer dan één render.
  // Ze roepen daarom altijd de functies van de laatste render aan (verse
  // items, regels en open/dicht-stand), nooit die van het moment van indrukken.
  const latest = useRef({ resolveDrop, applyDrop, hasTargetInside, isFolded, byId, items });
  latest.current = { resolveDrop, applyDrop, hasTargetInside, isFolded, byId, items };

  /** Opruimen van een lopende sleepbeweging (ook bij het sluiten van het paneel). */
  const dragCleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => () => dragCleanupRef.current?.(), []);
  /** Na een sleepbeweging volgt nog een klik op de rij onder de muis: negeren. */
  const suppressClickRef = useRef(false);
  /** Label dat met de muis meebeweegt; positie zetten we direct (geen render per muisbeweging). */
  const dragLabelRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef({ x: 0, y: 0 });
  const [dropBlocked, setDropBlocked] = useState(false);
  // Het label verschijnt pas na de eerste render van de sleepbeweging: meteen
  // op de muispositie zetten, anders knippert het linksboven.
  useLayoutEffect(() => {
    const el = dragLabelRef.current;
    if (el && draggingId) el.style.transform = `translate(${pointerRef.current.x + 14}px, ${pointerRef.current.y + 12}px)`;
  }, [draggingId]);

  const onRowPointerDown = (e: React.PointerEvent<HTMLDivElement>, id: string) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
    dragCleanupRef.current?.();
    suppressClickRef.current = false;
    // Geen tekstselectie of native tekst-slepen bij indrukken; focus zelf zetten
    // zodat de pijltjestoetsen blijven werken.
    e.preventDefault();
    treeRef.current?.focus({ preventScroll: true });
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* niet ondersteund */ }

    const startX = e.clientX, startY = e.clientY;
    let lastX = startX, lastY = startY;
    let started = false;
    let scrollFrame = 0;
    let expandTimer: ReturnType<typeof setTimeout> | null = null;
    let expandFor: string | null = null;
    /** Laatste dichte map waar niets in paste (zie scheduleExpand). */
    let noTargetFor: string | null = null;
    /** Muispositie (in de inhoud) bij de laatste wissel van doel; zie hitTest. */
    let lockY: number | null = null;
    /** Wat deze sleepbeweging openklapte: na afloop weer dicht, behalve waar het item in terechtkwam. */
    const openedByDrag: string[] = [];
    /** Eén keer bij indrukken: de rijen onder het gesleepte item (niet bij elke muisbeweging opnieuw). */
    const draggedDescendants = descendantIds(latest.current.items, id);
    const scrollEl = treeRef.current?.closest<HTMLElement>('.left-panel-body') ?? treeRef.current;

    const setHint = (next: DropTarget | null, blocked: boolean) => {
      const prev = dropHintRef.current;
      if (prev?.id !== next?.id || prev?.position !== next?.position) {
        dropHintRef.current = next; // direct, zodat loslaten nooit een oude stand leest
        setDropHint(next);
      }
      setDropBlocked(blocked);
    };

    /** Na 0,6 s zweven boven een dichte map (hoofdstuk/post): openklappen, als
     *  het item erin mag of ergens dieper in kan landen. */
    const scheduleExpand = (targetId: string | null, hint: DropTarget | null) => {
      const cur = latest.current;
      const target = targetId ? cur.byId.get(targetId) : undefined;
      // Goedkope tests eerst: alleen een dichte map, en niet opnieuw voor
      // dezelfde. Pas dan (duur bij grote begrotingen) zoeken naar een plek binnenin.
      const folded = !!target && cur.isFolded(target);
      if (folded && target.id === expandFor) return;
      // Al eens "hier past niets in" gevonden: niet bij elke muisbeweging de hele map opnieuw doorzoeken.
      const directInside = folded && hint?.position === 'inside' && hint.id === target.id;
      if (folded && !directInside && target.id === noTargetFor) {
        if (expandTimer) clearTimeout(expandTimer);
        expandTimer = null;
        expandFor = null;
        return;
      }
      const canLandInside = folded && (directInside || cur.hasTargetInside(id, target.id));
      if (folded && !canLandInside) noTargetFor = target.id;
      const want = canLandInside ? target!.id : null;
      if (want === expandFor) return;
      if (expandTimer) clearTimeout(expandTimer);
      expandTimer = null;
      expandFor = want;
      if (!want) return;
      expandTimer = setTimeout(() => {
        expandTimer = null;
        if (latest.current.byId.get(want)?.isCollapsed) {
          useAppStore.getState().toggleCollapse(want);
          openedByDrag.push(want);
          syncGridSelection();
        }
      }, 600);
    };

    /** Klapt weer dicht wat deze sleepbeweging opende, behalve de map(pen)
     *  waar het item in terechtkomt (`dropOn` en alles erboven). */
    const restoreOpened = (dropOn: string | null) => {
      if (openedByDrag.length === 0) return;
      const keep = new Set<string>();
      const map = new Map(useAppStore.getState().items.map((i) => [i.id, i]));
      for (let cur = dropOn; cur && !keep.has(cur); cur = map.get(cur)?.parentId ?? null) keep.add(cur);
      for (const openedId of openedByDrag) {
        if (!keep.has(openedId) && map.get(openedId) && !map.get(openedId)!.isCollapsed) {
          useAppStore.getState().toggleCollapse(openedId);
        }
      }
      openedByDrag.length = 0;
      syncGridSelection();
    };

    /** Bepaal het doel onder (x, y). */
    const hitTest = (x: number, y: number) => {
      // Boven de vaste kop: kijk net eronder (anders is omhoog scrollen
      // tijdens slepen steeds "geen doel").
      const headBottom = headRef.current?.getBoundingClientRect().bottom ?? -Infinity;
      const probeY = y < headBottom && y >= headBottom - 40 ? headBottom + 2 : y;
      const under = (document.elementFromPoint?.(x, probeY) ?? null) as HTMLElement | null;
      const rowEl = under?.closest<HTMLElement>('[data-tree-id]') ?? null;
      const targetId = rowEl?.dataset.treeId;
      if (!rowEl || !targetId || !treeRef.current?.contains(rowEl)) {
        lockY = null; // terug in de boom: meteen weer een doel kiezen
        setHint(null, true);
        scheduleExpand(null, null);
        return;
      }
      y = probeY;
      // Boven het gesleepte item zelf (dat in het voorbeeld al op zijn nieuwe
      // plek staat, onder de muis): voorbeeld laten staan, anders springt het.
      if (targetId === id || draggedDescendants.has(targetId)) return;
      const rect = rowEl.getBoundingClientRect();
      const rel = y - rect.top, h = rect.height || 1;
      const prev = dropHintRef.current;
      // Dode zone rond het midden: pas wisselen tussen ervoor/erna als je
      // duidelijk boven of onder het midden bent.
      if (prev?.id === targetId && prev.position !== 'inside' && Math.abs(rel - h / 2) < h * 0.2) return;
      // Na een wissel schuiven de rijen in het voorbeeld onder de muis door.
      // Pas weer wisselen als de muis een halve rij verder is (gemeten in de
      // inhoud, zodat automatisch scrollen gewoon doorgaat); anders springt
      // het voorbeeld bij elke kleine beweging heen en weer.
      const contentY = y + (scrollEl?.scrollTop ?? 0);
      if (lockY !== null && Math.abs(contentY - lockY) < h / 2) {
        // Wel de open-klap-timer bijhouden: anders gaat een map open waar je al voorbij bent.
        scheduleExpand(targetId, prev?.id === targetId ? prev : null);
        return;
      }
      const resolved = latest.current.resolveDrop(id, targetId, rel < h / 2 ? 'top' : 'bottom');
      const next = resolved === 'same' ? null : resolved;
      if (prev?.id !== next?.id || prev?.position !== next?.position) lockY = contentY;
      if (resolved === 'same') {
        // Staat er al: geen voorbeeld, geen ⦸, loslaten doet niets.
        setHint(null, false);
        scheduleExpand(targetId, null);
        return;
      }
      setHint(next, next === null);
      scheduleExpand(targetId, next);
    };

    /** Automatisch scrollen bij de rand, ook als de muis stilstaat. */
    const scrollLoop = () => {
      scrollFrame = 0;
      if (!started || !scrollEl) return;
      const r = scrollEl.getBoundingClientRect();
      const EDGE = 32;
      // Bovenrand = onderkant van de vaste kop; alleen scrollen als de muis
      // ook horizontaal boven het paneel is (niet boven het raster ernaast).
      const topEdge = Math.max(r.top, headRef.current?.getBoundingClientRect().bottom ?? r.top);
      if (lastX < r.left || lastX > r.right) { scrollFrame = nextFrame(scrollLoop); return; }
      const top = lastY - topEdge, bottom = r.bottom - lastY;
      let dy = 0;
      if (top < EDGE) dy = -Math.ceil(((EDGE - Math.max(0, top)) / EDGE) * 14);
      else if (bottom < EDGE) dy = Math.ceil(((EDGE - Math.max(0, bottom)) / EDGE) * 14);
      if (dy !== 0) {
        const before = scrollEl.scrollTop;
        scrollEl.scrollTop = Math.max(0, before + dy);
        if (scrollEl.scrollTop !== before) hitTest(lastX, lastY);
      }
      scrollFrame = nextFrame(scrollLoop);
    };

    const moveLabel = () => {
      pointerRef.current = { x: lastX, y: lastY };
      const el = dragLabelRef.current;
      if (el) el.style.transform = `translate(${lastX + 14}px, ${lastY + 12}px)`;
    };

    /** `dropOn`: undefined = terugklappen gebeurt later (onUp, na de zet). */
    const finish = (dropOn: string | null | undefined = null) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('blur', onCancel);
      window.removeEventListener('keydown', onKey, true);
      if (scrollFrame) cancelFrame(scrollFrame);
      if (expandTimer) clearTimeout(expandTimer);
      dragCleanupRef.current = null;
      if (dropOn !== undefined) restoreOpened(dropOn);
      // De klik die direct op het loslaten volgt negeren. Komt die niet
      // (losgelaten buiten de boom), dan zet de volgende pointerdown de vlag
      // weer terug (onRowPointerDown), dus een echte klik werkt altijd.
      if (started) suppressClickRef.current = true;
      dropHintRef.current = null;
      setDropHint(null);
      setDropBlocked(false);
      setDraggingId(null);
    };
    const onMove = (ev: PointerEvent) => {
      // Knop is al los maar de 'pointerup' kwam nooit aan: niets doen.
      if (started && ev.buttons === 0 && ev.pointerType === 'mouse') { finish(null); return; }
      lastX = ev.clientX; lastY = ev.clientY;
      if (!started) {
        if (Math.abs(lastX - startX) < 4 && Math.abs(lastY - startY) < 4) return; // sleep-drempel
        started = true;
        pointerRef.current = { x: lastX, y: lastY };
        setDraggingId(id);
        scrollFrame = nextFrame(scrollLoop);
      }
      ev.preventDefault();
      moveLabel();
      hitTest(lastX, lastY);
    };
    const onUp = () => {
      const hint = dropHintRef.current;
      const doMove = started && hint;
      if (!doMove) { finish(null); return; }
      finish(undefined); // terugklappen pas na de zet: geweigerd = alles weer dicht
      const moved = latest.current.applyDrop(id, hint);
      restoreOpened(moved ? hint.id : null);
      // De zet koppelde de rij-index toen er nog mappen open stonden die nu
      // weer dicht zijn: opnieuw koppelen, anders wijst het raster ernaast.
      if (moved) useAppStore.getState().revealItem(id);
    };
    const onCancel = () => finish(null);
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape' || !started) return;
      ev.stopPropagation();
      ev.preventDefault();
      finish(null);
    };
    dragCleanupRef.current = finish;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('blur', onCancel);
    window.addEventListener('keydown', onKey, true);
  };

  /** Tekst van het meelopende label, alleen het doel (de gesleepte rij zie je
   *  al in de boom): ↑/↓ = komt boven/onder, → = komt in, ⦸ = kan hier niet. */
  const dragLabelText = (() => {
    if (!draggingId) return '';
    const target = dropHint ? byId.get(dropHint.id) : undefined;
    if (!target || !dropHint) return dropBlocked ? '⦸' : '';
    const arrow = dropHint.position === 'inside' ? '→' : dropHint.position === 'before' ? '↑' : '↓';
    return `${arrow}  ${label(target, target.rowType === 'chapter' ? t('chapter') : '—')}`;
  })();

  // ── Rechtermuisknopmenu ───────────────────────────────────────────────
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [showMoveSub, setShowMoveSub] = useState(false);
  const [showParaSub, setShowParaSub] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeMenu = () => { setMenu(null); setShowMoveSub(false); setShowParaSub(false); };

  useEffect(() => {
    if (!menu) return;
    const onMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) closeMenu();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeMenu(); };
    document.addEventListener('pointerdown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onMouseDown);
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
    // Alleen hoofdstukken en posten gaan via dit menu; regels sleep je.
    const rowType = byId.get(menu.id)?.rowType;
    if (rowType !== 'chapter' && rowType !== 'begrotingspost') return [];
    return allChapters(fullByParent).filter(({ item }) => canMoveInto(menu.id, item.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu, fullByParent, items]);
  const menuParagraphTargets = useMemo(
    () => (menu ? paragraphTargets(menu.id) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [menu, fullByParent, items],
  );

  // ── In-/uitklappen onder een rij ─────────────────────────────────────
  /** Deze rij en alles eronder in één keer open of dicht (alleen rijen met
   *  inhoud). Eén store-wijziging, geen undo-stap: weergave, net als het
   *  pijltje. Gedeeld met het raster, zoals alle open/dicht. */
  const setCollapsedBelow = (id: string, collapsed: boolean) => {
    const ids = new Set<string>();
    const stack = [id];
    while (stack.length) {
      const cur = stack.pop()!;
      const children = fullByParent.get(cur) ?? [];
      if (children.length === 0 || ids.has(cur)) continue;
      ids.add(cur);
      for (const child of children) stack.push(child.id);
    }
    const store = useAppStore.getState();
    const changes = (i: CostItem) => ids.has(i.id) && !!i.isCollapsed !== collapsed;
    if (!store.items.some(changes)) return;
    useAppStore.setState({ items: store.items.map((i) => (changes(i) ? { ...i, isCollapsed: collapsed } : i)) });
    syncGridSelection();
  };
  const hasTreeChildren = (id: string) => (fullByParent.get(id)?.length ?? 0) > 0;
  /** Eén rij open/dicht vanuit de boom (pijltje, ←/→), en het raster bijsturen. */
  const toggleFold = (id: string) => {
    toggleCollapse(id);
    syncGridSelection();
  };

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

  const menuItem = menu ? byId.get(menu.id) : undefined;

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
        <div
          className="schedule-tree-view"
          ref={viewMenuRef}
          // Focus verlaat het menu (Tab weg): dicht.
          onBlur={(e) => {
            if (showViewMenu && !viewMenuRef.current?.contains(e.relatedTarget as Node | null)) setShowViewMenu(false);
          }}
        >
          <button
            ref={viewButtonRef}
            type="button"
            className="schedule-tree-view-btn"
            aria-label={t('structureTree.view')}
            title={t('structureTree.view')}
            aria-haspopup="dialog"
            aria-expanded={showViewMenu}
            onClick={() => setShowViewMenu((v) => !v)}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <line x1="2" y1="4" x2="14" y2="4" /><line x1="2" y1="8" x2="14" y2="8" /><line x1="2" y1="12" x2="14" y2="12" />
              <circle cx="10" cy="4" r="1.6" fill="var(--theme-surface)" />
              <circle cx="5" cy="8" r="1.6" fill="var(--theme-surface)" />
              <circle cx="11" cy="12" r="1.6" fill="var(--theme-surface)" />
            </svg>
          </button>
          {showViewMenu && (
            <div ref={viewPanelRef} className="schedule-tree-view-menu" role="dialog" aria-label={t('structureTree.view')}>
              <div className="schedule-tree-view-heading">{t('structureTree.show')}</div>
              <label className="schedule-tree-view-option">
                <input type="checkbox" name="schedule-tree-code" checked={view.code} onChange={(e) => setView({ code: e.target.checked })} />
                {t('structureTree.labelCode')}
              </label>
              <label className="schedule-tree-view-option">
                <input type="checkbox" name="schedule-tree-amounts" checked={view.amounts} onChange={(e) => setView({ amounts: e.target.checked })} />
                {t('structureTree.amounts')}
              </label>
              <label className="schedule-tree-view-option">
                <input type="checkbox" name="schedule-tree-percent" checked={view.percent} onChange={(e) => setView({ percent: e.target.checked })} />
                {t('structureTree.percent')}
              </label>
            </div>
          )}
        </div>
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
        {nodes.map(({ item, level, hasChildren, foldable }) => {
          const prefix = prefixOf(item, view.code);
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
              aria-expanded={hasChildren ? !shownCollapsed : undefined}
              // Tijdens slepen alleen de gesleepte rij markeren, niet ook nog de selectie.
              className={`schedule-item${item.id === highlightId && !draggingId ? ' active' : ''}${item.id === draggingId ? ' dragging' : ''}${dropHint?.position === 'inside' && dropHint.id === item.id ? ' drop-inside' : ''}`}
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
                setShowMoveSub(false);
                setShowParaSub(false);
                setMenu({ x: e.clientX, y: e.clientY, id: item.id });
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
              {pct && <span className="schedule-item-pct">{pct}</span>}
            </div>
          );
        })}
      </div>

      {draggingId && dragLabelText && (
        <div
          ref={dragLabelRef}
          className={`schedule-drag-label${dropBlocked ? ' is-blocked' : ''}`}
          aria-hidden="true"
        >
          {dragLabelText}
        </div>
      )}

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
          {/* Een hoofdstuk op het hoogste niveau kan nergens heen: dan geen (grijze) optie. */}
          {(menuItem.rowType === 'begrotingspost' || (menuItem.rowType === 'chapter' && levelOf(menuItem.id) > 0)) && <>
          <div className="grid-context-menu-separator" />
          <div style={{ position: 'relative' }}>
            <button
              className="grid-context-menu-item"
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={showMoveSub}
              disabled={menuChapters.length === 0}
              onClick={() => { setShowMoveSub((v) => !v); setShowParaSub(false); }}
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
                    style={{ paddingInlineStart: 12 + level * 12 }}
                    onClick={() => { moveInto(menu.id, ch.id); closeMenu(); }}
                  >
                    <span>{label(ch, t('chapter'))}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          </>}
          {(menuParagraphTargets.length > 0 || canMakeChapter(menuItem.id)) && <>
            <div className="grid-context-menu-separator" />
            {menuParagraphTargets.length > 0 && (
              <div style={{ position: 'relative' }}>
                <button
                  className="grid-context-menu-item"
                  role="menuitem"
                  data-action="make-paragraph"
                  aria-haspopup="menu"
                  aria-expanded={showParaSub}
                  onClick={() => { setShowParaSub((v) => !v); setShowMoveSub(false); }}
                >
                  <span>{t('structureTree.makeParagraphOf')}</span>
                  <span className="grid-context-menu-shortcut">▸</span>
                </button>
                {showParaSub && (
                  <div className="grid-context-submenu" role="menu" style={{ position: 'absolute', left: '100%', top: 0 }}>
                    {menuParagraphTargets.map((ch) => (
                      <button
                        key={ch.id}
                        className="grid-context-menu-item"
                        role="menuitem"
                        data-paragraph-target={ch.id}
                        onClick={() => { makeParagraph(menu.id, ch.id); closeMenu(); }}
                      >
                        <span>{label(ch, t('chapter'))}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {canMakeChapter(menuItem.id) && (
              <button
                className="grid-context-menu-item"
                role="menuitem"
                data-action="make-chapter"
                onClick={() => { makeChapter(menu.id); closeMenu(); }}
              >
                <span>{t('structureTree.makeChapter')}</span>
              </button>
            )}
          </>}
          {hasTreeChildren(menuItem.id) && <>
            <div className="grid-context-menu-separator" />
            <button
              className="grid-context-menu-item"
              role="menuitem"
              data-action="expand-below"
              onClick={() => { setCollapsedBelow(menu.id, false); closeMenu(); }}
            >
              <span>{t('structureTree.expandBelow')}</span>
              <span className="grid-context-menu-shortcut">*</span>
            </button>
            <button
              className="grid-context-menu-item"
              role="menuitem"
              data-action="collapse-below"
              onClick={() => { setCollapsedBelow(menu.id, true); closeMenu(); }}
            >
              <span>{t('structureTree.collapseBelow')}</span>
            </button>
          </>}
          <div className="grid-context-menu-separator" />
          <button
            className="grid-context-menu-item"
            role="menuitem"
            data-action="delete"
            onClick={() => { const id = menu.id; closeMenu(); deleteNode(id); treeRef.current?.focus({ preventScroll: true }); }}
          >
            <span>{t('delete')}</span>
          </button>
        </div>
      )}
    </div>
  );
};

/** Klein icoon per rijtype: map, blokje (post), ruit (bewakingspost), streep (regel). */
const RowIcon: React.FC<{ rowType: RowType }> = ({ rowType }) => {
  switch (rowType) {
    case 'chapter':
      return (
        <svg className="schedule-item-icon" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
        </svg>
      );
    case 'begrotingspost':
      return (
        <svg className="schedule-item-icon" width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
          <rect x="3" y="3" width="4" height="4" rx="0.5" />
        </svg>
      );
    case 'bewakingspost':
      return (
        <svg className="schedule-item-icon" width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
          <path d="M5 2.2 7.8 5 5 7.8 2.2 5z" />
        </svg>
      );
    default:
      return (
        <svg className="schedule-item-icon" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
          <line x1="3" y1="5" x2="7" y2="5" />
        </svg>
      );
  }
};
