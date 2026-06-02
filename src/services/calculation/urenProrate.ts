import type { CostItem } from '@/types/costModel';

/**
 * Compute the total "uren" (hours) for all `regel` items in a given tariefgroep.
 *
 * Uren per regel = quantity × normQuantity / (normFactor || 1)
 *
 * If `tariefGroep` is `null`, returns total of all regels that have no tariefGroep set.
 */
export function totalUrenForTariefGroep(
  items: CostItem[],
  tariefGroep: 'A' | 'B' | 'C' | null,
): number {
  let total = 0;
  for (const it of items) {
    if (it.rowType !== 'regel') continue;
    if ((it.tariefGroep ?? null) !== tariefGroep) continue;
    const qty = it.quantity ?? 0;
    const norm = it.normQuantity ?? 0;
    const cap = it.normFactor ?? 1;
    total += (qty * norm) / (cap || 1);
  }
  return total;
}

/**
 * Proportionally rescale the `normQuantity` of every `regel` belonging to the
 * given tariefGroep so that the resulting total uren equals `newTotal`.
 *
 * Interpretation chosen (most likely user intent):
 *   "In de groep uren het totaal naar rato terug-rekenen" — when a user enters a
 *   total number of hours for a tariefgroep, the individual regel-norms are
 *   scaled by `newTotal / currentTotal`. This keeps each regel's relative share
 *   of the work intact while making the group totals add up to the new value.
 *
 * Why `normQuantity` (not `quantity`)?
 *   In OCS, a regel's uren = aantal × productienorm / productiecapaciteit. The
 *   `quantity` (aantal) usually represents an external dimension (e.g. number
 *   of houses, m² wall surface). The `normQuantity` (productienorm = uren per
 *   eenheid) is the planning variable that estimators adjust to tune total
 *   labour. Scaling `normQuantity` keeps the relationship between regel and
 *   the underlying physical quantity correct.
 *
 * Edge cases:
 * - No matching regels  → returns items untouched.
 * - currentTotal == 0   → distribute newTotal evenly over the matching regels
 *                         by giving each a normQuantity such that its uren
 *                         contribution = newTotal / n. We achieve this by
 *                         setting normQuantity = (newTotal / n) × cap / qty
 *                         when qty > 0; regels with qty=0 are skipped so the
 *                         remaining ones absorb the share — if no regel has
 *                         qty > 0 we return items untouched.
 * - newTotal == 0       → all matching normQuantity become 0.
 * - newTotal < 0        → treated as 0 (uren cannot be negative).
 */
/**
 * Total uren across ALL `regel` items, regardless of tariefgroep.
 */
export function totalUrenAll(items: CostItem[]): number {
  let total = 0;
  for (const it of items) {
    if (it.rowType !== 'regel') continue;
    const qty = it.quantity ?? 0;
    const norm = it.normQuantity ?? 0;
    const cap = it.normFactor ?? 1;
    total += (qty * norm) / (cap || 1);
  }
  return total;
}

/**
 * Proportionally rescale `normQuantity` of EVERY `regel` (all tariefgroepen
 * together) so the grand total uren equals `newTotal`.
 *
 * Used by the "totaal aantal uren" row in the hours overview: editing the grand
 * total scales every regel by the same factor, preserving each group's relative
 * share. Mirrors `prorateUrenForTariefGroep` but across the whole budget.
 *
 * Edge cases identical to the per-group variant:
 * - no regels → untouched
 * - currentTotal 0 → distribute evenly over regels with qty>0
 * - target 0 → zero all norms
 * - negative → treated as 0
 */
export function prorateUrenAll(items: CostItem[], newTotal: number): CostItem[] {
  const target = Math.max(0, newTotal);

  const matchingIds = new Set<string>();
  for (const it of items) {
    if (it.rowType === 'regel') matchingIds.add(it.id);
  }
  if (matchingIds.size === 0) return items;

  const currentTotal = totalUrenAll(items);

  if (target === 0) {
    return items.map((it) =>
      matchingIds.has(it.id) ? { ...it, normQuantity: 0 } : it,
    );
  }

  if (currentTotal > 0) {
    const factor = target / currentTotal;
    return items.map((it) => {
      if (!matchingIds.has(it.id)) return it;
      const oldNorm = it.normQuantity ?? 0;
      return { ...it, normQuantity: oldNorm * factor };
    });
  }

  // currentTotal == 0 → distribute evenly over regels with qty>0
  const usable = items.filter(
    (it) => matchingIds.has(it.id) && (it.quantity ?? 0) > 0,
  );
  if (usable.length === 0) return items;
  const perRegel = target / usable.length;
  const usableIds = new Set(usable.map((it) => it.id));
  return items.map((it) => {
    if (!usableIds.has(it.id)) return it;
    const qty = it.quantity ?? 0;
    const cap = it.normFactor ?? 1;
    const newNorm = (perRegel * (cap || 1)) / qty;
    return { ...it, normQuantity: newNorm };
  });
}

/** Collect ids of all descendant items under a parent (flat array with parentId). */
function descendantIds(items: CostItem[], parentId: string): Set<string> {
  const childrenByParent = new Map<string, CostItem[]>();
  for (const it of items) {
    if (!it.parentId) continue;
    const list = childrenByParent.get(it.parentId) ?? [];
    list.push(it);
    childrenByParent.set(it.parentId, list);
  }
  const out = new Set<string>();
  const stack = [parentId];
  while (stack.length) {
    const pid = stack.pop()!;
    for (const child of childrenByParent.get(pid) ?? []) {
      out.add(child.id);
      stack.push(child.id);
    }
  }
  return out;
}

/** Total uren of all `regel` descendants within a chapter (or any parent). */
export function totalUrenForChapter(items: CostItem[], chapterId: string): number {
  const desc = descendantIds(items, chapterId);
  let total = 0;
  for (const it of items) {
    if (it.rowType !== 'regel' || !desc.has(it.id)) continue;
    const qty = it.quantity ?? 0;
    const norm = it.normQuantity ?? 0;
    const cap = it.normFactor ?? 1;
    total += (qty * norm) / (cap || 1);
  }
  return total;
}

/**
 * Proportionally rescale `normQuantity` of every `regel` descendant within a
 * chapter so the chapter's total uren equals `newTotal`.
 *
 * Used by the WPCalc grid: editing the "Uren" cell on a hoofdstuk-rij
 * herrekent alle onderliggende regel-normen naar rato.
 *
 * Same edge-case handling as the group/grand-total variants.
 */
export function prorateUrenForChapter(
  items: CostItem[],
  chapterId: string,
  newTotal: number,
): CostItem[] {
  const target = Math.max(0, newTotal);
  const desc = descendantIds(items, chapterId);
  const matchingIds = new Set<string>();
  for (const it of items) {
    if (it.rowType === 'regel' && desc.has(it.id)) matchingIds.add(it.id);
  }
  if (matchingIds.size === 0) return items;

  const currentTotal = totalUrenForChapter(items, chapterId);

  if (target === 0) {
    return items.map((it) =>
      matchingIds.has(it.id) ? { ...it, normQuantity: 0 } : it,
    );
  }

  if (currentTotal > 0) {
    const factor = target / currentTotal;
    return items.map((it) => {
      if (!matchingIds.has(it.id)) return it;
      const oldNorm = it.normQuantity ?? 0;
      return { ...it, normQuantity: oldNorm * factor };
    });
  }

  // currentTotal == 0 → distribute evenly over regels with qty>0
  const usable = items.filter(
    (it) => matchingIds.has(it.id) && (it.quantity ?? 0) > 0,
  );
  if (usable.length === 0) return items;
  const perRegel = target / usable.length;
  const usableIds = new Set(usable.map((it) => it.id));
  return items.map((it) => {
    if (!usableIds.has(it.id)) return it;
    const qty = it.quantity ?? 0;
    const cap = it.normFactor ?? 1;
    const newNorm = (perRegel * (cap || 1)) / qty;
    return { ...it, normQuantity: newNorm };
  });
}

export function prorateUrenForTariefGroep(
  items: CostItem[],
  tariefGroep: 'A' | 'B' | 'C' | null,
  newTotal: number,
): CostItem[] {
  const target = Math.max(0, newTotal);

  const matchingIds = new Set<string>();
  for (const it of items) {
    if (it.rowType !== 'regel') continue;
    if ((it.tariefGroep ?? null) !== tariefGroep) continue;
    matchingIds.add(it.id);
  }

  if (matchingIds.size === 0) return items;

  const currentTotal = totalUrenForTariefGroep(items, tariefGroep);

  // Special case: target == 0 → zero out all matching normQuantities
  if (target === 0) {
    return items.map((it) =>
      matchingIds.has(it.id) ? { ...it, normQuantity: 0 } : it,
    );
  }

  // Normal proportional scaling
  if (currentTotal > 0) {
    const factor = target / currentTotal;
    return items.map((it) => {
      if (!matchingIds.has(it.id)) return it;
      const oldNorm = it.normQuantity ?? 0;
      return { ...it, normQuantity: oldNorm * factor };
    });
  }

  // currentTotal == 0 → distribute evenly. Each regel should contribute
  // target/n hours. uren = qty × norm / cap  ⇒  norm = (target/n) × cap / qty.
  // Skip regels with qty == 0 since we cannot produce hours from them via norm.
  const usable = items.filter(
    (it) => matchingIds.has(it.id) && (it.quantity ?? 0) > 0,
  );
  if (usable.length === 0) return items; // nothing we can scale meaningfully

  const perRegel = target / usable.length;
  const usableIds = new Set(usable.map((it) => it.id));
  return items.map((it) => {
    if (!usableIds.has(it.id)) return it;
    const qty = it.quantity ?? 0;
    const cap = it.normFactor ?? 1;
    const newNorm = (perRegel * (cap || 1)) / qty;
    return { ...it, normQuantity: newNorm };
  });
}
