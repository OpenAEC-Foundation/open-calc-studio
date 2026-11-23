import type { CostItem } from '@/types/costModel';

const isPost = (item: CostItem) => item.rowType === 'begrotingspost' || item.rowType === 'bewakingspost';

/**
 * Where the library dialog adds a resource: the budget post of the selected
 * row (a row walks up to its post, a chapter uses its last post), or with
 * nothing selected the last post of the estimate. `chapterId` is set when a
 * chapter without posts is selected: a post is made in it on adding. Both
 * empty: a new chapter with a post is made.
 */
export function resourceTarget(items: CostItem[], selectedId: string | null): { post?: CostItem; chapterId?: string } {
  const byId = new Map(items.map(item => [item.id, item]));
  let item = selectedId ? byId.get(selectedId) : undefined;
  if (item?.rowType === 'chapter') {
    const post = items.filter(i => i.parentId === item!.id && isPost(i)).pop();
    return post ? { post } : { chapterId: item.id };
  }
  const seen = new Set<string>();
  while (item && !isPost(item) && !seen.has(item.id)) {
    seen.add(item.id);
    item = item.parentId ? byId.get(item.parentId) : undefined;
  }
  if (item && isPost(item)) return { post: item };
  const last = items.filter(isPost).pop();
  return last ? { post: last } : {};
}
