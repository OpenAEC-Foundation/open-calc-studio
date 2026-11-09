import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
/** Hoe lang je met slepen boven een dichte map hangt voordat die openklapt;
 *  boven het pijltje korter (dat is duidelijk "maak open"). */
const EXPAND_DELAY = 500;
const EXPAND_DELAY_FAST = 150;
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
 * - number: wat er vóór de omschrijving staat: het Nr (de plek, zoals de
 *   kolom Nr in het raster; verandert mee bij verplaatsen), de eigen Code
 *   (bijv. een STABU-code; verandert nooit) of niets;
 * - amounts: totaal per rij rechts uitgelijnd;
 * - percent: aandeel in het totaal van de rijen op het hoogste niveau (in
 *   beeld "% van totaal": niet de Kostprijs uit de staart, met AK, ABK enz.).
 */
export type TreeNumber = 'nr' | 'code' | 'none';
const TREE_NUMBERS: readonly TreeNumber[] = ['nr', 'code', 'none'];
export interface TreeView { number: TreeNumber; amounts: boolean; percent: boolean }
const VIEW_KEY = 'ocs.structureTree.view';
const DEFAULT_VIEW: TreeView = { number: 'nr', amounts: true, percent: false };
function loadView(): TreeView {
  try {
    const v = JSON.parse(localStore.getItem(VIEW_KEY) ?? 'null') as (Partial<TreeView> & { code?: boolean; label?: string }) | null;
    // Eerdere (nooit uitgebrachte) vormen: `code` (vinkje) en `label` ('none' = niets).
    const number: TreeNumber = TREE_NUMBERS.includes(v?.number as TreeNumber) ? v!.number as TreeNumber
      : typeof v?.code === 'boolean' ? (v.code ? 'nr' : 'none')
        : v?.label === 'none' ? 'none' : DEFAULT_VIEW.number;
    return {
      number,
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

/** Wat er vóór de omschrijving staat, zoals ingesteld: het Nr (hetzelfde als
 *  de kolom Nr in het raster), de eigen code, of niets. */
function prefixOf(item: CostItem, number: TreeNumber): string {
  if (number === 'nr') return item.nr?.trim() || '';
  if (number === 'code') return item.code?.trim() || '';
  return '';
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
      // Een selectiebereik (rijnummers) wijst na in-/uitklappen naar andere
      // rijen: setActiveCell maakt het weer alleen de actieve cel.
      const hasRange = s.selectionStart != null || s.selectionEnd != null
        || s.cellSelectionStart != null || s.cellSelectionEnd != null;
      if (row !== s.activeRow || cur !== id || hasRange) s.setActiveCell(row, s.activeCol, cur);
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
  const byId = new Map(items.map((it) => [it.id, it]));
  const byParent = new Map<string | null, CostItem[]>();
  /** Hoofdstuk onder een verborgen rij (oud, gemengd bestand: hoofdstuk onder
   *  een post): de verborgen voorouder direct onder de zichtbare ouder, voor
   *  de volgorde. Zonder dit verdween zo'n hoofdstuk helemaal uit de boom. */
  const anchorOf = new Map<string, CostItem>();
  for (const item of items) {
    if (!types.has(item.rowType)) continue;
    let key = item.parentId ?? null;
    if (item.rowType === 'chapter') {
      // Naar de dichtstbijzijnde voorouder die de boom wél toont.
      let anchor: CostItem | undefined;
      const guard = new Set<string>();
      for (let p = key ? byId.get(key) : undefined; p && !types.has(p.rowType) && !guard.has(p.id); p = p.parentId ? byId.get(p.parentId) : undefined) {
        guard.add(p.id);
        anchor = p;
        key = p.parentId ?? null;
      }
      if (anchor) anchorOf.set(item.id, anchor);
    }
    const list = byParent.get(key);
    if (list) list.push(item);
    else byParent.set(key, [item]);
  }
  for (const list of byParent.values()) sortSiblings(list, indexOf);
  if (anchorOf.size > 0) {
    // Opgetilde hoofdstukken direct ná hun verborgen voorouder.
    const so = (it: CostItem) => (anchorOf.get(it.id) ?? it).sortOrder ?? 0;
    const at = (it: CostItem) => indexOf.get((anchorOf.get(it.id) ?? it).id) ?? 0;
    for (const list of byParent.values()) {
      if (!list.some((it) => anchorOf.has(it.id))) continue;
      list.sort((a, b) => so(a) - so(b) || at(a) - at(b)
        || Number(anchorOf.has(a.id)) - Number(anchorOf.has(b.id))
        || (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || (indexOf.get(a.id) ?? 0) - (indexOf.get(b.id) ?? 0));
    }
  }
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
  /** Rijen met inhoud in de begroting, voor het pijltje bij rijen waarvan de
   *  inhoud dieper zit dan de boom nu toont (of alleen uit tekstregels bestaat). */
  foldParents: ReadonlySet<string> = new Set(),
): TreeNode[] {
  const out: TreeNode[] = [];
  const seen = new Set<string>();
  const walk = (parentId: string | null, level: number) => {
    for (const item of byParent.get(parentId) ?? []) {
      if (seen.has(item.id)) continue; // kapotte/cyclische ouderketen
      seen.add(item.id);
      // Pijltje alleen bij hoofdstukken en (bewakings)posten met inhoud.
      const hasChildren = CONTAINER_TYPES.has(item.rowType) && (byParent.get(item.id)?.length ?? 0) > 0;
      const foldable = hasChildren || (CONTAINER_TYPES.has(item.rowType) && foldParents.has(item.id));
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

/** Naam van een rij in de menu's: net als in de boom, met of zonder Nr. */
function label(item: CostItem, fallback: string, number: TreeNumber): string {
  const nr = prefixOf(item, number);
  const description = item.description?.trim();
  if (nr && description) return `${nr} ${description}`;
  return nr || description || fallback;
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
    viewPanelRef.current?.querySelector<HTMLInputElement>('input:checked, input')?.focus();
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

  // Slepen: zolang de muis ingedrukt is, toont de boom alvast de nieuwe plek.
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<DropTarget | null>(null);
  /** Dichte map die tijdens het slepen zo openklapt (de timer loopt). */
  const [expandPending, setExpandPending] = useState<string | null>(null);
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
    return runMove(id, target.id, dir < 0 ? 'before' : 'after', t('grid:undo.moveRow'));
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

  // ── Hoofdstuk op het hoogste niveau verplaatsen ──────────────────────
  // "Verplaats naar" bij een hoofdstuk op het hoogste niveau: het blijft een
  // hoofdstuk (paragraaf maken is "Maak paragraaf van"), alleen de plek
  // verandert: bovenaan, of direct ná een ander hoofdstuk.
  const topChapters = (): CostItem[] => (fullByParent.get(null) ?? []).filter((c) => c.rowType === 'chapter');
  /** Hoofdstukken waar hoofdstuk `id` ná kan; niet zichzelf en niet het
   *  hoofdstuk direct erboven (daar staat het al). */
  const afterTargets = (id: string): CostItem[] => {
    const item = byId.get(id);
    if (!item || item.rowType !== 'chapter' || levelOf(id) !== 0) return [];
    const top = topChapters();
    const i = top.findIndex((c) => c.id === id);
    return top.filter((c, k) => c.id !== id && (i < 0 || k !== i - 1));
  };
  /** Bovenaan kan als er een ander hoofdstuk vóór staat. */
  const canMoveToTop = (id: string): boolean => {
    const item = byId.get(id);
    const first = topChapters()[0];
    return !!item && item.rowType === 'chapter' && levelOf(id) === 0 && !!first && first.id !== id;
  };
  const moveChapterToTop = (id: string): boolean => {
    if (!canMoveToTop(id)) return false;
    return runMove(id, topChapters()[0].id, 'before', t('grid:undo.moveRow'));
  };
  const moveChapterAfter = (id: string, targetId: string): boolean => {
    if (!afterTargets(id).some((c) => c.id === targetId)) return false;
    return runMove(id, targetId, 'after', t('grid:undo.moveRow'));
  };

  // ── Regel / bewakingspost naar een andere post ───────────────────────
  /** Doelen voor "Verplaats naar" bij een regel (begrotingsposten en
   *  bewakingsposten) of bewakingspost (begrotingsposten), in boomvolgorde
   *  en ingesprongen onder hun hoofdstuk. `target: false` = alleen een kopje
   *  (hoofdstuk, of de huidige post waar wel een bewakingspost onder hangt). */
  const postTargets = (id: string): { item: CostItem; level: number; target: boolean }[] => {
    const item = byId.get(id);
    if (!item || (item.rowType !== 'regel' && item.rowType !== 'bewakingspost')) return [];
    const out: { item: CostItem; level: number; target: boolean }[] = [];
    const seen = new Set<string>();
    const walk = (parentId: string | null, level: number): boolean => {
      let any = false;
      for (const child of fullByParent.get(parentId) ?? []) {
        if (seen.has(child.id) || !CONTAINER_TYPES.has(child.rowType)) continue;
        seen.add(child.id);
        const at = out.length;
        const ok = child.rowType !== 'chapter' && canMoveInto(id, child.id);
        out.push({ item: child, level, target: ok });
        // Dieper kijken: in hoofdstukken, en voor een regel ook in posten (bewakingsposten).
        const deeper = child.rowType === 'chapter' || (item.rowType === 'regel' && child.rowType === 'begrotingspost');
        const below = deeper ? walk(child.id, level + 1) : false;
        if (ok || below) any = true;
        else out.splice(at); // niets te kiezen hier: weglaten
      }
      return any;
    };
    walk(null, 0);
    return out;
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
    const prefix = prefixOf(item, view.number);
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
  const resolveDrop = (dragId: string, targetId: string, half: 'top' | 'bottom', viaContent = true): DropTarget | 'same' | null => {
    const item = byId.get(dragId);
    const target = byId.get(targetId);
    if (!item || !target || dragId === targetId) return null;
    if (descendantsOf(dragId).has(targetId)) return null; // kringetje
    const isSameLevel = (row: CostItem) => row.rowType === item.rowType
      && (item.rowType !== 'chapter' || levelOf(row.id) === levelOf(dragId));
    if (!isSameLevel(target)) {
      // Boven de eigen ouder (regel boven zijn post): daar staat hij al.
      if (targetId === item.parentId) return 'same';
      if (canMoveInto(dragId, targetId)) return { id: targetId, position: 'inside' };
      // Boven de inhoud van een rij van hetzelfde soort (een hoofdstuk boven de
      // posten van een ander hoofdstuk): dat betekent "na die rij". Anders kom
      // je bij omhoog slepen eerst langs een hele reeks verboden rijen voordat
      // je de kop bereikt, en springt het voorbeeld heen en weer.
      // Niet voor hasTargetInside: dan zou elke dichte map openklappen.
      if (viaContent) {
        const seen = new Set<string>();
        for (let up = target.parentId ? byId.get(target.parentId) : undefined; up && !seen.has(up.id); up = up.parentId ? byId.get(up.parentId) : undefined) {
          seen.add(up.id);
          if (up.id === dragId) return null;
          if (isSameLevel(up)) return resolveDrop(dragId, up.id, 'bottom', false);
        }
      }
      return null;
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
      const drop = resolveDrop(dragId, child.id, 'top', false);
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
  // Het label verschijnt pas als er een doel is (en kan tijdens het slepen
  // verdwijnen en terugkomen): elke keer dat het in beeld komt meteen op de
  // muispositie zetten, anders staat het buiten beeld tot de muis weer beweegt.
  const placeDragLabel = useCallback((el: HTMLDivElement | null) => {
    dragLabelRef.current = el;
    if (el) el.style.transform = `translate(${pointerRef.current.x + 14}px, ${pointerRef.current.y + 12}px)`;
  }, []);

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
    /** Wacht de open-klap-timer op de korte tijd (muis boven het pijltje)? */
    let expandFast = false;
    /** Muis staat boven het pijltje van de rij: dan sneller openklappen. */
    let overChevron = false;
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
      // Zelfde map: laten lopen, behalve als de muis nu op het pijltje staat
      // (dan direct de korte tijd).
      if (want === expandFor && !(want && overChevron && !expandFast)) return;
      if (expandTimer) clearTimeout(expandTimer);
      expandTimer = null;
      expandFor = want;
      expandFast = !!want && overChevron;
      // Zichtbaar dat de map zo opengaat (het pijltje draait alvast mee):
      // anders lijkt het willekeurig wanneer een map openklapt.
      setExpandPending(want);
      if (!want) return;
      expandTimer = setTimeout(() => {
        expandTimer = null;
        setExpandPending(null);
        if (latest.current.byId.get(want)?.isCollapsed) {
          useAppStore.getState().toggleCollapse(want);
          openedByDrag.push(want);
          syncGridSelection();
        }
      }, expandFast ? EXPAND_DELAY_FAST : EXPAND_DELAY);
    };

    /** Klapt weer dicht wat deze sleepbeweging opende. Bij een geslaagde zet
     *  gebeurt dit vóór de zet (zie onUp): de undo-stap bewaart dan de
     *  open/dicht-stand van vóór het slepen, en `revealItem` klapt daarna
     *  alleen de mappen boven de nieuwe plek weer open. */
    const restoreOpened = () => {
      if (openedByDrag.length === 0) return;
      const map = new Map(useAppStore.getState().items.map((i) => [i.id, i]));
      for (const openedId of openedByDrag) {
        if (map.get(openedId) && !map.get(openedId)!.isCollapsed) {
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
      let probeY = y < headBottom && y >= headBottom - 40 ? headBottom + 2 : y;
      const under = (document.elementFromPoint?.(x, probeY) ?? null) as HTMLElement | null;
      let rowEl = under?.closest<HTMLElement>('[data-tree-id]') ?? null;
      // In het lege stuk onder de laatste rij (nog boven de boom): dat is
      // "helemaal onderaan", dus de laatste rij (onderste helft). Via de
      // inhoud-regel van resolveDrop wordt dat voor een hoofdstuk "na het
      // laatste hoofdstuk". Anders kun je niets helemaal onderaan neerzetten.
      if (!rowEl && treeRef.current) {
        const all = treeRef.current.querySelectorAll<HTMLElement>('[data-tree-id]');
        const last = all[all.length - 1];
        // Het paneel (dat scrollt), niet alleen de boom: die is soms maar zo hoog als zijn rijen.
        const area = (scrollEl ?? treeRef.current).getBoundingClientRect();
        const lastRect = last?.getBoundingClientRect();
        if (last && lastRect && probeY > lastRect.bottom && probeY <= area.bottom && x >= area.left && x <= area.right) {
          rowEl = last;
          probeY = lastRect.bottom - 1;
        }
      }
      overChevron = !!under?.closest('.grid-collapse-btn');
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

    const finish = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('blur', onCancel);
      window.removeEventListener('keydown', onKey, true);
      if (scrollFrame) cancelFrame(scrollFrame);
      if (expandTimer) clearTimeout(expandTimer);
      dragCleanupRef.current = null;
      restoreOpened();
      // De klik die direct op het loslaten volgt negeren. Komt die niet
      // (losgelaten buiten de boom), dan zet de volgende pointerdown de vlag
      // weer terug (onRowPointerDown), dus een echte klik werkt altijd.
      if (started) suppressClickRef.current = true;
      dropHintRef.current = null;
      setDropHint(null);
      setDropBlocked(false);
      setExpandPending(null);
      setDraggingId(null);
    };
    const onMove = (ev: PointerEvent) => {
      // Knop is al los maar de 'pointerup' kwam nooit aan: niets doen.
      if (started && ev.buttons === 0 && ev.pointerType === 'mouse') { finish(); return; }
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
      // Eerst alles wat het slepen opende weer dicht (ook bij een geweigerde
      // zet), dán de zet: zo komt de open/dicht-stand van vóór het slepen in
      // de undo-stap. De zet (runMove) klapt daarna via revealItem de mappen
      // boven de nieuwe plek weer open en koppelt de rij-index opnieuw.
      finish();
      if (started && hint) latest.current.applyDrop(id, hint);
    };
    const onCancel = () => finish();
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape' || !started) return;
      ev.stopPropagation();
      ev.preventDefault();
      finish();
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
    return `${arrow}  ${label(target, target.rowType === 'chapter' ? t('chapter') : '—', view.number)}`;
  })();

  // ── Rechtermuisknopmenu ───────────────────────────────────────────────
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [showMoveSub, setShowMoveSub] = useState(false);
  const [showParaSub, setShowParaSub] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeMenu = () => { setMenu(null); setShowMoveSub(false); setShowParaSub(false); };
  /** Menu dicht na een keuze (of Escape): focus terug naar de boom, anders
   *  valt hij op de pagina en doen de pijltjestoetsen niets meer. Niet bij
   *  klikken buiten het menu: dan hoort de focus bij wat je aanklikte. */
  const closeMenuToTree = () => { closeMenu(); treeRef.current?.focus({ preventScroll: true }); };

  useEffect(() => {
    if (!menu) return;
    const onMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) closeMenu();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeMenuToTree(); };
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

  // Een open submenu ook helemaal in beeld houden: valt het rechts buiten
  // het venster, dan links van het menu; onderaan eruit, dan omhoog schuiven
  // (maar nooit boven het venster uit).
  useLayoutEffect(() => {
    if (!menu || (!showMoveSub && !showParaSub)) return;
    const sub = menuRef.current?.querySelector<HTMLElement>('.grid-context-submenu');
    if (!sub) return;
    const rect = sub.getBoundingClientRect();
    if (rect.right > window.innerWidth) { sub.style.left = 'auto'; sub.style.right = '100%'; }
    const overflow = rect.bottom - window.innerHeight + 4;
    if (overflow > 0) sub.style.top = `${-Math.max(0, Math.min(overflow, rect.top - 4))}px`;
  }, [menu, showMoveSub, showParaSub]);

  const menuChapters = useMemo(() => {
    if (!menu) return [];
    // Doelhoofdstukken voor een post of paragraaf (regels en bewakingsposten: postTargets).
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
  const menuAfterTargets = useMemo(
    () => (menu ? afterTargets(menu.id) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [menu, fullByParent, items],
  );
  const menuPostTargets = useMemo(
    () => (menu ? postTargets(menu.id) : []),
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
              <div className="schedule-tree-view-heading" id="schedule-tree-number-heading">{t('structureTree.numberHeading')}</div>
              {/* Eén keuze uit drie: Nr (de plek, verandert mee bij verplaatsen),
                  Code (eigen code, verandert nooit) of niets. */}
              <div className="schedule-tree-view-segmented" role="radiogroup" aria-labelledby="schedule-tree-number-heading">
                {TREE_NUMBERS.map((n) => (
                  <label key={n} className={`schedule-tree-view-segment${view.number === n ? ' is-on' : ''}`}>
                    <input type="radio" name="schedule-tree-number" value={n} checked={view.number === n} onChange={() => setView({ number: n })} />
                    {t(n === 'nr' ? 'structureTree.labelNr' : n === 'code' ? 'structureTree.labelCode' : 'structureTree.labelNone')}
                  </label>
                ))}
              </div>
              <div className="schedule-tree-view-sep" />
              <div className="schedule-tree-view-heading">{t('structureTree.show')}</div>
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

      {menu && menuItem && (
        <div ref={menuRef} className="grid-context-menu schedule-tree-menu" role="menu" style={{ left: menu.x, top: menu.y }}>
          <button
            className="grid-context-menu-item"
            role="menuitem"
            disabled={!siblingTarget(menu.id, -1)}
            onClick={() => { moveAmongSiblings(menu.id, -1); closeMenuToTree(); }}
          >
            <span>{t('ribbon:budget.moveUp')}</span>
            <span className="grid-context-menu-shortcut">Alt+↑</span>
          </button>
          <button
            className="grid-context-menu-item"
            role="menuitem"
            disabled={!siblingTarget(menu.id, 1)}
            onClick={() => { moveAmongSiblings(menu.id, 1); closeMenuToTree(); }}
          >
            <span>{t('ribbon:budget.moveDown')}</span>
            <span className="grid-context-menu-shortcut">Alt+↓</span>
          </button>
          {/* Verplaats naar: post/paragraaf → een hoofdstuk; hoofdstuk op het
              hoogste niveau → bovenaan of ná een ander hoofdstuk (blijft
              hoofdstuk); regel/bewakingspost → een (bewakings)post. */}
          {(() => {
            const topChapter = menuItem.rowType === 'chapter' && levelOf(menuItem.id) === 0;
            const toPost = menuItem.rowType === 'regel' || menuItem.rowType === 'bewakingspost';
            const empty = topChapter
              ? menuAfterTargets.length === 0 && !canMoveToTop(menuItem.id)
              : toPost ? !menuPostTargets.some((p) => p.target) : menuChapters.length === 0;
            // Grijs zonder uitleg is raadselachtig: zeg kort waarom het niet kan.
            const why = !empty ? ''
              : topChapter ? t('structureTree.whyNoOtherChapter')
                : toPost ? t('structureTree.whyNoOtherItem')
                  : menuItem.rowType === 'chapter' ? t('structureTree.whyNeedsChapterWithoutItems')
                    : t('structureTree.whyNoChapterWithoutSections');
            return <>
          <div className="grid-context-menu-separator" />
          <div style={{ position: 'relative' }}>
            <button
              className="grid-context-menu-item"
              role="menuitem"
              data-action="move-to"
              aria-haspopup="menu"
              aria-expanded={showMoveSub}
              disabled={empty}
              title={why || undefined}
              onClick={() => { setShowMoveSub((v) => !v); setShowParaSub(false); }}
            >
              <span>{t('grid:contextMenu.moveTo')}</span>
              <span className="grid-context-menu-shortcut">▸</span>
            </button>
            {why && <div className="schedule-tree-menu-hint" data-why="move-to">{why}</div>}
            {showMoveSub && (
              <div className="grid-context-submenu" role="menu" style={{ position: 'absolute', left: '100%', top: 0 }}>
                {topChapter && <>
                  <button
                    className="grid-context-menu-item"
                    role="menuitem"
                    data-move-top=""
                    disabled={!canMoveToTop(menu.id)}
                    onClick={() => { moveChapterToTop(menu.id); closeMenuToTree(); }}
                  >
                    <span>{t('structureTree.moveToTop')}</span>
                  </button>
                  {menuAfterTargets.length > 0 && (
                    <div className="schedule-tree-menu-heading" role="presentation">{t('structureTree.placeAfter')}</div>
                  )}
                  {menuAfterTargets.map((ch) => (
                    <button
                      key={ch.id}
                      className="grid-context-menu-item"
                      role="menuitem"
                      data-move-after={ch.id}
                      style={{ paddingInlineStart: 24 }}
                      onClick={() => { moveChapterAfter(menu.id, ch.id); closeMenuToTree(); }}
                    >
                      <span>{label(ch, t('chapter'), view.number)}</span>
                    </button>
                  ))}
                </>}
                {toPost && menuPostTargets.map(({ item: p, level, target }) => (target ? (
                  <button
                    key={p.id}
                    className="grid-context-menu-item"
                    role="menuitem"
                    data-move-target={p.id}
                    style={{ paddingInlineStart: 12 + level * 12 }}
                    onClick={() => { moveInto(menu.id, p.id); closeMenuToTree(); }}
                  >
                    <span>{label(p, '—', view.number)}</span>
                  </button>
                ) : (
                  // Hoofdstuk (of de huidige post) als kopje: niet te kiezen.
                  <div
                    key={p.id}
                    className="schedule-tree-menu-heading"
                    role="presentation"
                    style={{ paddingInlineStart: 12 + level * 12 }}
                  >
                    {label(p, p.rowType === 'chapter' ? t('chapter') : '—', view.number)}
                  </div>
                )))}
                {!topChapter && !toPost && menuChapters.map(({ item: ch, level }) => (
                  <button
                    key={ch.id}
                    className="grid-context-menu-item"
                    role="menuitem"
                    data-move-target={ch.id}
                    style={{ paddingInlineStart: 12 + level * 12 }}
                    onClick={() => { moveInto(menu.id, ch.id); closeMenuToTree(); }}
                  >
                    <span>{label(ch, t('chapter'), view.number)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
            </>;
          })()}
          {/* Een hoofdstuk op het hoogste niveau ziet "Maak paragraaf van" altijd;
              kan het niet, dan grijs met de reden eronder. */}
          {(() => {
            const topChapter = menuItem.rowType === 'chapter' && levelOf(menuItem.id) === 0;
            const paraWhy = !topChapter || menuParagraphTargets.length > 0 ? ''
              : hasChapters(menuItem.id) ? t('structureTree.whyHasSections')
                : t('structureTree.whyNeedsChapterWithoutItems');
            return (topChapter || canMakeChapter(menuItem.id)) && <>
            <div className="grid-context-menu-separator" />
            {topChapter && (
              <div style={{ position: 'relative' }}>
                <button
                  className="grid-context-menu-item"
                  role="menuitem"
                  data-action="make-paragraph"
                  aria-haspopup="menu"
                  aria-expanded={showParaSub}
                  disabled={!!paraWhy}
                  title={paraWhy || undefined}
                  onClick={() => { setShowParaSub((v) => !v); setShowMoveSub(false); }}
                >
                  <span>{t('structureTree.makeParagraphOf')}</span>
                  <span className="grid-context-menu-shortcut">▸</span>
                </button>
                {paraWhy && <div className="schedule-tree-menu-hint" data-why="make-paragraph">{paraWhy}</div>}
                {showParaSub && (
                  <div className="grid-context-submenu" role="menu" style={{ position: 'absolute', left: '100%', top: 0 }}>
                    {menuParagraphTargets.map((ch) => (
                      <button
                        key={ch.id}
                        className="grid-context-menu-item"
                        role="menuitem"
                        data-paragraph-target={ch.id}
                        onClick={() => { makeParagraph(menu.id, ch.id); closeMenuToTree(); }}
                      >
                        <span>{label(ch, t('chapter'), view.number)}</span>
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
                onClick={() => { makeChapter(menu.id); closeMenuToTree(); }}
              >
                <span>{t('structureTree.makeChapter')}</span>
              </button>
            )}
          </>;
          })()}
          {hasTreeChildren(menuItem.id) && <>
            <div className="grid-context-menu-separator" />
            <button
              className="grid-context-menu-item"
              role="menuitem"
              data-action="expand-below"
              onClick={() => { setCollapsedBelow(menu.id, false); closeMenuToTree(); }}
            >
              <span>{t('structureTree.expandBelow')}</span>
              <span className="grid-context-menu-shortcut">*</span>
            </button>
            <button
              className="grid-context-menu-item"
              role="menuitem"
              data-action="collapse-below"
              onClick={() => { setCollapsedBelow(menu.id, true); closeMenuToTree(); }}
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
