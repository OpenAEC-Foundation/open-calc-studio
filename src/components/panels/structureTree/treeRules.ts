import type { CostItem } from '@/types/costModel';
import { CONTAINER_TYPES, type DropPos, type DropTarget } from './treeModel';

/**
 * Structuurboom, de verplaatsregels: welke rij waar onder mag hangen, met
 * welke zuster hij mag wisselen, en waar een gesleepte rij landt. Puur: de
 * regels kijken alleen naar de meegegeven kaarten (de volledige structuur,
 * nooit naar wat er toevallig in beeld is) en veranderen niets. De acties
 * die echt verplaatsen staan in treeActions.ts.
 */

export interface TreeRuleInput {
  byId: Map<string, CostItem>;
  /** Volledige structuur (alle boomtypes), niet afhankelijk van de diepte. */
  fullByParent: Map<string | null, CostItem[]>;
  /** Nakomelingen van één rij (mag onthouden worden; zie SchedulePanel). */
  descendantsOf: (id: string) => Set<string>;
  /** Laatste rij die de boom nu ónder `id` laat zien (open en binnen de
   *  gekozen diepte), zonder `exclude`; undefined als er niets te zien is. */
  lastShownChild?: (id: string, exclude: string) => CostItem | undefined;
}

export type TreeRules = ReturnType<typeof createTreeRules>;

export function createTreeRules({ byId, fullByParent, descendantsOf, lastShownChild }: TreeRuleInput) {
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

  const canMoveInto = (id: string, containerId: string): boolean => {
    const item = byId.get(id);
    const container = byId.get(containerId);
    if (!item || !container || !CONTAINER_TYPES.has(container.rowType)) return false;
    if (containerId === id || containerId === item.parentId) return false;
    if (!allowedParent(item, container)) return false;
    return !descendantsOf(id).has(containerId); // geen kringetje
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
  /** Een paragraaf (hoofdstuk één niveau diep) kan weer hoofdstuk worden. */
  const canMakeChapter = (id: string): boolean => byId.get(id)?.rowType === 'chapter' && levelOf(id) === 1;

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

  // ── Slepen ───────────────────────────────────────────────────────────
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
      if (canMoveInto(dragId, targetId)) {
        // "Erin" = achteraan. Staat de map open, dan is dat precies "onder de
        // laatste rij die je ziet": meld het dan ook zo (zelfde label, geen
        // tint), anders geeft dezelfde plek twee verschillende meldingen.
        // Een dichte of lege map houdt "erin" (er is geen rij om te noemen).
        const last = lastShownChild?.(targetId, dragId);
        if (last && isSameLevel(last)) {
          const after = resolveDrop(dragId, last.id, 'bottom', false);
          if (after) return after;
        }
        return { id: targetId, position: 'inside' };
      }
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

  return {
    hasPosts,
    hasChapters,
    levelOf,
    allowedParent,
    siblingTarget,
    canMoveInto,
    paragraphTargets,
    canMakeChapter,
    topChapters,
    afterTargets,
    canMoveToTop,
    postTargets,
    resolveDrop,
    hasTargetInside,
  };
}
