import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '@/state/appStore';
import type { CostItem } from '@/types/costModel';
import type { DropTarget } from './treeModel';
import { syncGridSelection } from './treeActions';
import type { TreeRules } from './treeRules';

/**
 * Structuurboom, slepen met de muis: de sleepdrempel, het doel onder de muis
 * (hitTest), het voorbeeld (dropHint), dichte mappen die openklappen als je
 * erboven blijft hangen, automatisch scrollen bij de rand, het meelopende
 * label en het opruimen na afloop. Wat er bij loslaten gebeurt, bepalen de
 * regels (resolveDrop) en de acties (applyDrop) die het paneel meegeeft.
 */

// ── Slepen ───────────────────────────────────────────────────────────
// Pointer-gebaseerd, net als het raster: HTML5 drag&drop werkt niet in de
// Tauri-webview zolang de native bestand-drop aanstaat.

/** Hoe lang je met slepen boven een dichte map hangt voordat die openklapt;
 *  boven het pijltje korter (dat is duidelijk "maak open"). */
const EXPAND_DELAY = 500;
const EXPAND_DELAY_FAST = 150;

/** requestAnimationFrame met terugval (sommige testomgevingen hebben het niet). */
const nextFrame = (cb: () => void): number =>
  typeof requestAnimationFrame === 'function' ? requestAnimationFrame(cb) : (setTimeout(cb, 16) as unknown as number);
const cancelFrame = (id: number): void => {
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id); else clearTimeout(id);
};

export interface TreeDragInput {
  treeRef: React.RefObject<HTMLDivElement | null>;
  headRef: React.RefObject<HTMLDivElement | null>;
  resolveDrop: TreeRules['resolveDrop'];
  hasTargetInside: TreeRules['hasTargetInside'];
  /** true als er echt iets verplaatst is. */
  applyDrop: (dragId: string, d: DropTarget) => boolean;
  isFolded: (item: CostItem) => boolean;
  byId: Map<string, CostItem>;
  /** Nakomelingen van een rij (dezelfde onthouden functie als de regels). */
  descendantsOf: (id: string) => Set<string>;
}

export function useTreeDrag({ treeRef, headRef, resolveDrop, applyDrop, hasTargetInside, isFolded, byId, descendantsOf }: TreeDragInput) {
  // Slepen: zolang de muis ingedrukt is, toont de boom alvast de nieuwe plek.
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<DropTarget | null>(null);
  /** Dichte map die tijdens het slepen zo openklapt (de timer loopt). */
  const [expandPending, setExpandPending] = useState<string | null>(null);
  const dropHintRef = useRef<DropTarget | null>(null); // altijd gelijk aan dropHint, maar direct bijgewerkt

  // De window-listeners van een sleepbeweging leven langer dan één render.
  // Ze roepen daarom altijd de functies van de laatste render aan (verse
  // items, regels en open/dicht-stand), nooit die van het moment van indrukken.
  const latest = useRef({ resolveDrop, applyDrop, hasTargetInside, isFolded, byId, descendantsOf });
  latest.current = { resolveDrop, applyDrop, hasTargetInside, isFolded, byId, descendantsOf };

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
    const draggedDescendants = latest.current.descendantsOf(id);
    const scrollEl = treeRef.current?.closest<HTMLElement>('.left-panel-body') ?? treeRef.current;

    /** Waar het voorbeeld vandaan komt (rij onder de muis en welke helft):
     *  bij loslaten opnieuw nagerekend, want de begroting kan intussen
     *  veranderd zijn (Ctrl+Z tijdens het slepen). */
    let hintFrom: { targetId: string; half: 'top' | 'bottom' } | null = null;
    const setHint = (next: DropTarget | null, blocked: boolean, from: typeof hintFrom = null) => {
      hintFrom = next ? from : null;
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
      // Wel door als de muis nu op het pijltje staat terwijl de gewone timer
      // loopt: dan opnieuw starten met de korte tijd (zie onder).
      if (folded && target.id === expandFor && !(overChevron && !expandFast)) return;
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
      const half = rel < h / 2 ? 'top' : 'bottom';
      const resolved = latest.current.resolveDrop(id, targetId, half);
      const next = resolved === 'same' ? null : resolved;
      if (prev?.id !== next?.id || prev?.position !== next?.position) lockY = contentY;
      if (resolved === 'same') {
        // Staat er al: geen voorbeeld, geen ⦸, loslaten doet niets.
        setHint(null, false);
        scheduleExpand(targetId, null);
        return;
      }
      setHint(next, next === null, { targetId, half });
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
      // Het voorbeeld kan verouderd zijn: is de begroting tijdens het slepen
      // veranderd (Ctrl+Z, of iets anders in de store), dan opnieuw nagaan
      // op de verse gegevens, vóór het dichtklappen hieronder (zelfde beeld
      // als het voorbeeld). Alleen loslaten als het nog precies hetzelfde doel
      // is; anders niets doen, net als bij een verboden doel. "Erin" telt ook
      // als de map intussen openklapte en de melding nu "onder de laatste rij"
      // zou zijn: dat is dezelfde plek (asShown: false).
      const same = (d: DropTarget | 'same' | null) => !!d && d !== 'same' && d.id === hint?.id && d.position === hint.position;
      const from = hintFrom;
      const drop = started && hint && from
        && (same(latest.current.resolveDrop(id, from.targetId, from.half))
          || same(latest.current.resolveDrop(id, from.targetId, from.half, true, false)))
        ? hint : null;
      // Eerst alles wat het slepen opende weer dicht (ook bij een geweigerde
      // zet), dán de zet: zo komt de open/dicht-stand van vóór het slepen in
      // de undo-stap. De zet (runMove) klapt daarna via revealItem de mappen
      // boven de nieuwe plek weer open en koppelt de rij-index opnieuw.
      finish();
      if (drop) latest.current.applyDrop(id, drop);
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

  return { draggingId, dropHint, dropBlocked, expandPending, suppressClickRef, placeDragLabel, onRowPointerDown };
}
