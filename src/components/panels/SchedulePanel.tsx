import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/state/appStore';
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
  post: new Set<RowType>(['chapter', 'begrotingspost']),
  all: TREE_TYPES,
};
const DEPTH_KEY = 'ocs.structureTree.depth';
function loadDepth(): TreeDepth {
  try {
    const v = localStorage.getItem(DEPTH_KEY);
    if (v === 'chapter' || v === 'post' || v === 'all') return v;
  } catch { /* geen opslag beschikbaar */ }
  return 'post';
}
function saveDepth(depth: TreeDepth): void {
  try { localStorage.setItem(DEPTH_KEY, depth); } catch { /* geen opslag beschikbaar */ }
}

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

/** Zichtbare boomknopen: kinderen alleen onder een opengeklapte ouder. */
function flattenTree(byParent: Map<string | null, CostItem[]>): TreeNode[] {
  const out: TreeNode[] = [];
  const seen = new Set<string>();
  const walk = (parentId: string | null, level: number) => {
    for (const item of byParent.get(parentId) ?? []) {
      if (seen.has(item.id)) continue; // kapotte/cyclische ouderketen
      seen.add(item.id);
      // Pijltje alleen bij hoofdstukken en (bewakings)posten met inhoud.
      const hasChildren = CONTAINER_TYPES.has(item.rowType) && (byParent.get(item.id)?.length ?? 0) > 0;
      out.push({ item, level, parentId, hasChildren });
      if (hasChildren && !item.isCollapsed) walk(item.id, level + 1);
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
  const items = useAppStore((s) => s.items);
  const scheduleName = useAppStore((s) => s.schedule.name);
  const activeItemId = useAppStore((s) => s.activeItemId);
  const activeRow = useAppStore((s) => s.activeRow);
  const toggleCollapse = useAppStore((s) => s.toggleCollapse);
  const revealItem = useAppStore((s) => s.revealItem);
  const moveItems = useAppStore((s) => s.moveItems);
  const pushHistory = useAppStore((s) => s.pushHistory);

  const [depth, setDepthState] = useState<TreeDepth>(loadDepth);
  const setDepth = (d: TreeDepth) => { setDepthState(d); saveDepth(d); };
  // Wat de boom toont (tot de gekozen diepte)…
  const byParent = useMemo(() => buildChildren(items, DEPTH_TYPES[depth]), [items, depth]);
  // …en de volledige structuur voor de verplaatsregels: die mogen niet
  // afhangen van wat er toevallig in beeld is.
  const fullByParent = useMemo(() => buildChildren(items), [items]);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  // Slepen: zolang de muis ingedrukt is, toont de boom alvast de nieuwe plek.
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<DropTarget | null>(null);
  const dropHintRef = useRef<DropTarget | null>(null); // altijd gelijk aan dropHint, maar direct bijgewerkt

  const shownByParent = useMemo(() => {
    const dragged = draggingId ? byId.get(draggingId) : undefined;
    const target = dropHint ? byId.get(dropHint.id) : undefined;
    if (!dragged || !target || !dropHint) return byParent;
    // In een dichtgeklapt hoofdstuk kun je niets laten zien: alleen de omlijning.
    if (dropHint.position === 'inside' && target.isCollapsed) return byParent;
    return previewChildren(byParent, dragged, target, dropHint.position);
  }, [byParent, byId, draggingId, dropHint]);

  const nodes = useMemo(() => flattenTree(shownByParent), [shownByParent]);
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
    return !descendantIds(items, id).has(containerId); // geen kringetje
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
    if (last) runMove(id, last.id, 'after', undoLabel);
    else runMove(id, containerId, 'inside', undoLabel);
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
   *  null = verboden doel (geen voorbeeld, niets bij loslaten). */
  const resolveDrop = (dragId: string, targetId: string, half: 'top' | 'bottom'): DropTarget | null => {
    const item = byId.get(dragId);
    const target = byId.get(targetId);
    if (!item || !target || dragId === targetId) return null;
    if (descendantIds(items, dragId).has(targetId)) return null; // kringetje
    const sameLevel = target.rowType === item.rowType
      && (item.rowType !== 'chapter' || levelOf(targetId) === levelOf(dragId));
    if (!sameLevel) {
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
    if (position === 'before' && siblingTarget(dragId, 1)?.id === targetId) return null;
    if (position === 'after' && siblingTarget(dragId, -1)?.id === targetId) return null;
    return { id: targetId, position };
  };

  const applyDrop = (dragId: string, d: DropTarget) => {
    if (d.position === 'inside') moveInto(dragId, d.id);
    else runMove(dragId, d.id, d.position, t('grid:undo.moveRow'));
  };

  // De window-listeners van een sleepbeweging leven langer dan één render.
  // Ze roepen daarom altijd de functies van de laatste render aan (verse
  // items, regels en open/dicht-stand), nooit die van het moment van indrukken.
  const latest = useRef({ resolveDrop, applyDrop, byId, items });
  latest.current = { resolveDrop, applyDrop, byId, items };

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
    const scrollEl = treeRef.current?.closest<HTMLElement>('.left-panel-body') ?? treeRef.current;

    const setHint = (next: DropTarget | null, blocked: boolean) => {
      const prev = dropHintRef.current;
      if (prev?.id !== next?.id || prev?.position !== next?.position) {
        dropHintRef.current = next; // direct, zodat loslaten nooit een oude stand leest
        setDropHint(next);
      }
      setDropBlocked(blocked);
    };

    /** Na 0,6 s zweven boven een dichtgeklapt hoofdstuk/post: openklappen. */
    const scheduleExpand = (hint: DropTarget | null) => {
      const target = hint?.position === 'inside' ? latest.current.byId.get(hint.id) : undefined;
      const want = target?.isCollapsed ? target.id : null;
      if (want === expandFor) return;
      if (expandTimer) clearTimeout(expandTimer);
      expandTimer = null;
      expandFor = want;
      if (!want) return;
      expandTimer = setTimeout(() => {
        expandTimer = null;
        if (latest.current.byId.get(want)?.isCollapsed) useAppStore.getState().toggleCollapse(want);
      }, 600);
    };

    /** Bepaal het doel onder (x, y). */
    const hitTest = (x: number, y: number) => {
      const under = (document.elementFromPoint?.(x, y) ?? null) as HTMLElement | null;
      const rowEl = under?.closest<HTMLElement>('[data-tree-id]') ?? null;
      const targetId = rowEl?.dataset.treeId;
      if (!rowEl || !targetId || !treeRef.current?.contains(rowEl)) { setHint(null, true); scheduleExpand(null); return; }
      // Boven het gesleepte item zelf (dat in het voorbeeld al op zijn nieuwe
      // plek staat, onder de muis): voorbeeld laten staan, anders springt het.
      if (targetId === id || descendantIds(latest.current.items, id).has(targetId)) return;
      const rect = rowEl.getBoundingClientRect();
      const rel = y - rect.top, h = rect.height || 1;
      const prev = dropHintRef.current;
      // Dode zone rond het midden: pas wisselen tussen ervoor/erna als je
      // duidelijk boven of onder het midden bent.
      if (prev?.id === targetId && prev.position !== 'inside' && Math.abs(rel - h / 2) < h * 0.2) return;
      const next = latest.current.resolveDrop(id, targetId, rel < h / 2 ? 'top' : 'bottom');
      setHint(next, next === null);
      scheduleExpand(next);
    };

    /** Automatisch scrollen bij de rand, ook als de muis stilstaat. */
    const scrollLoop = () => {
      scrollFrame = 0;
      if (!started || !scrollEl) return;
      const r = scrollEl.getBoundingClientRect();
      const EDGE = 32;
      const top = lastY - r.top, bottom = r.bottom - lastY;
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
      if (started) suppressClickRef.current = true;
      dropHintRef.current = null;
      setDropHint(null);
      setDropBlocked(false);
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
      const doMove = started && hint;
      finish();
      if (doMove) latest.current.applyDrop(id, hint);
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
    return `${arrow}  ${label(target, target.rowType === 'chapter' ? t('chapter') : '—')}`;
  })();

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
    // Alleen hoofdstukken en posten gaan via dit menu; regels sleep je.
    const rowType = byId.get(menu.id)?.rowType;
    if (rowType !== 'chapter' && rowType !== 'begrotingspost') return [];
    return allChapters(fullByParent).filter(({ item }) => canMoveInto(menu.id, item.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu, fullByParent, items]);

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
      <div className="schedule-tree-head">
        <div className="schedule-tree-title" title={scheduleName}>{scheduleName}</div>
        <select
          className="schedule-tree-depth"
          aria-label={t('display')}
          title={t('display')}
          value={depth}
          onChange={(e) => setDepth(e.target.value as TreeDepth)}
        >
          <option value="chapter">{t('ribbon:home.collapseChapters')}</option>
          <option value="post">{t('ribbon:home.collapseBudgetPosts')}</option>
          <option value="all">{t('rows')}</option>
        </select>
      </div>
      <div
        ref={treeRef}
        className={`schedule-tree${draggingId ? ' is-dragging' : ''}${draggingId && dropBlocked ? ' is-blocked' : ''}`}
        role="tree"
        aria-label={t('explorer')}
        tabIndex={0}
        onKeyDown={onKeyDown}
      >
        {nodes.map(({ item, level, hasChildren }) => {
          const text = label(item, item.rowType === 'chapter' ? t('chapter') : '—');
          return (
            <div
              key={item.id}
              data-tree-id={item.id}
              role="treeitem"
              aria-level={level}
              aria-selected={item.id === highlightId}
              aria-expanded={hasChildren ? !item.isCollapsed : undefined}
              // Tijdens slepen alleen de gesleepte rij markeren, niet ook nog de selectie.
              className={`schedule-item${item.id === highlightId && !draggingId ? ' active' : ''}${item.id === draggingId ? ' dragging' : ''}${dropHint?.position === 'inside' && dropHint.id === item.id ? ' drop-inside' : ''}`}
              style={{ paddingLeft: (level - 1) * 12 + 4 }}
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
              <RowIcon rowType={item.rowType} />
              <span className="schedule-item-label">
                {item.code?.trim() && item.description?.trim()
                  ? <><span className="schedule-item-code">{item.code.trim()}</span>{item.description.trim()}</>
                  : text}
              </span>
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
          {(menuItem.rowType === 'chapter' || menuItem.rowType === 'begrotingspost') && <>
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
                    onClick={() => { moveInto(menu.id, ch.id); closeMenu(); }}
                  >
                    <span>{label(ch, t('chapter'))}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          </>}
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
