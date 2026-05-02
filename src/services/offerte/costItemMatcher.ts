import type { CostItem } from '@/types/costModel';

export interface MatchSuggestion {
  costItemId: string;
  code: string;
  description: string;
  score: number;
}

function tokenize(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9àáâãäåèéêëìíîïòóôõöùúûüý\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2)
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function findMatchingCostItems(
  offerteOnderdeel: string,
  offerteOmschrijving: string,
  items: CostItem[],
  linkedChapterId: string | null,
  topN = 5,
): MatchSuggestion[] {
  const queryTokens = tokenize(`${offerteOnderdeel} ${offerteOmschrijving}`);

  const candidates = items.filter(
    i => !i.rowType.startsWith('staart_') && i.description.trim().length > 0
  );

  const scored: MatchSuggestion[] = candidates.map(item => {
    let score = 0;

    if (item.code && offerteOnderdeel && item.code.toLowerCase() === offerteOnderdeel.toLowerCase()) {
      score += 3;
    }

    if (linkedChapterId && isDescendantOf(item, linkedChapterId, items)) {
      score += 2;
    }

    const itemTokens = tokenize(item.description);
    score += jaccard(queryTokens, itemTokens);

    return { costItemId: item.id, code: item.code, description: item.description, score };
  });

  const maxScore = Math.max(...scored.map(s => s.score), 1);
  for (const s of scored) {
    s.score = s.score / maxScore;
  }

  return scored
    .filter(s => s.score > 0.05)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}

function isDescendantOf(item: CostItem, ancestorId: string, items: CostItem[]): boolean {
  let current: CostItem | undefined = item;
  const visited = new Set<string>();
  while (current) {
    if (current.id === ancestorId) return true;
    if (!current.parentId || visited.has(current.parentId)) return false;
    visited.add(current.id);
    current = items.find(i => i.id === current!.parentId);
  }
  return false;
}
