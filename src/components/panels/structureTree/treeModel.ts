import { localStore } from '@/utils/browserStorage';
import { decimalSeparator, formatDecimals } from '@/utils/formatting';
import type { CostItem, RowType } from '@/types/costModel';

/**
 * Structuurboom, het model: welke rijen de boom toont, hoe ze geordend en
 * platgeslagen worden, de weergave-instellingen (onthouden per gebruiker)
 * en de opmaak van namen, bedragen en percentages. Alles hier is puur
 * (geen React, geen store), op het lezen/schrijven van localStore na.
 */

export const TREE_TYPES: ReadonlySet<RowType> = new Set<RowType>(['chapter', 'begrotingspost', 'bewakingspost', 'regel']);
export const CONTAINER_TYPES: ReadonlySet<RowType> = new Set<RowType>(['chapter', 'begrotingspost', 'bewakingspost']);

/**
 * Hoe diep de boom kijkt. Alleen een weergavekeuze van de boom: de
 * open/dicht-stand (gedeeld met het raster) verandert er niet door, dus de
 * begroting houdt altijd al zijn regels. Per gebruiker onthouden.
 */
export type TreeDepth = 'chapter' | 'post' | 'all';
export const DEPTH_TYPES: Record<TreeDepth, ReadonlySet<RowType>> = {
  chapter: new Set<RowType>(['chapter']),
  // Een bewakingspost is een onderverdeling van een begrotingspost: hoort bij dit niveau.
  post: new Set<RowType>(['chapter', 'begrotingspost', 'bewakingspost']),
  all: TREE_TYPES,
};
const DEPTH_KEY = 'ocs.structureTree.depth';
// Via localStore: in een afgeschermd frame (SuperCloud-werkplek) is
// localStorage er niet en valt dit terug op het geheugen.
export function loadDepth(): TreeDepth {
  const v = localStore.getItem(DEPTH_KEY);
  return v === 'chapter' || v === 'post' || v === 'all' ? v : 'post';
}
export function saveDepth(depth: TreeDepth): void {
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
export const TREE_NUMBERS: readonly TreeNumber[] = ['nr', 'code', 'none'];
export interface TreeView { number: TreeNumber; amounts: boolean; percent: boolean }
const VIEW_KEY = 'ocs.structureTree.view';
const DEFAULT_VIEW: TreeView = { number: 'nr', amounts: true, percent: false };
export function loadView(): TreeView {
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
export function saveView(view: TreeView): void {
  localStore.setItem(VIEW_KEY, JSON.stringify(view));
}

/** Wat er vóór de omschrijving staat, zoals ingesteld: het Nr (hetzelfde als
 *  de kolom Nr in het raster), de eigen code, of niets. */
export function prefixOf(item: CostItem, number: TreeNumber): string {
  if (number === 'nr') return item.nr?.trim() || '';
  if (number === 'code') return item.code?.trim() || '';
  return '';
}

// Zelfde notatie als het raster (de app-taal, issue #65), maar zonder centen
// en zonder valutateken: zo blijft de boom rustig, net als de cellen.
/** Bedrag in de boom: hele bedragen; onder 1 met centen (anders staat er "0"
 *  terwijl de rij wel geld kost). 0 = niets tonen. */
export function formatTreeAmount(total: number | null | undefined): string {
  if (!total) return '';
  return Math.abs(total) < 1 ? formatDecimals(total, 2) : formatDecimals(total, 0, 0);
}
/** DOM-id van een boomrij (voor aria-activedescendant). */
export const treeRowDomId = (id: string) => `schedule-tree-row-${id}`;

/** Percentage met één decimaal in de app-taal ("12,5" of "12.5"); 0 als "0,0". */
export function formatTreePercent(pct: number): string {
  return pct === 0 ? `0${decimalSeparator()}0` : formatDecimals(pct, 1, 1);
}

export interface TreeNode {
  item: CostItem;
  level: number;
  parentId: string | null;
  hasChildren: boolean;
  /** Pijltje tonen: er hangt iets onder in de begroting, ook als de boom dat
   *  bij deze diepte niet laat zien (dan klapt alleen het raster open/dicht). */
  foldable: boolean;
}

export type DropPos = 'before' | 'after' | 'inside';
export interface DropTarget { id: string; position: DropPos }

export function sortSiblings(list: CostItem[], indexOf: Map<string, number>): void {
  list.sort((a, b) => {
    const so = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    return so !== 0 ? so : (indexOf.get(a.id) ?? 0) - (indexOf.get(b.id) ?? 0);
  });
}

/** Kinderen per ouder (alleen de gegeven types), gesorteerd zoals het raster. */
export function buildChildren(items: CostItem[], types: ReadonlySet<RowType> = TREE_TYPES): Map<string | null, CostItem[]> {
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
export function flattenTree(
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
export function previewChildren(
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
export function allChapters(byParent: Map<string | null, CostItem[]>): { item: CostItem; level: number }[] {
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

/** Ids van alle nakomelingen van een item (via parentId), ook tekst-/witregels
 *  en staartrijen: bijv. om te tellen wat er bij verwijderen meegaat. */
export function descendantIds(items: CostItem[], rootId: string): Set<string> {
  const byParent = new Map<string | null, CostItem[]>();
  for (const it of items) {
    const list = byParent.get(it.parentId ?? null);
    if (list) list.push(it); else byParent.set(it.parentId ?? null, [it]);
  }
  return descendantsIn(byParent, rootId);
}

/** Ids van alle nakomelingen van een item in een al opgebouwde kinderenlijst
 *  (bijv. `buildChildren(items)`, dan alleen de boomtypes): geen nieuwe
 *  ouderkaart per vraag. */
export function descendantsIn(byParent: Map<string | null, CostItem[]>, rootId: string): Set<string> {
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
export function label(item: CostItem, fallback: string, number: TreeNumber): string {
  const nr = prefixOf(item, number);
  const description = item.description?.trim();
  if (nr && description) return `${nr} ${description}`;
  return nr || description || fallback;
}
