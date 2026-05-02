import { parseXml, getText, getNumber, children, normalizeUnit, makeCostItem } from './xmlHelpers';
import type { ImportResult } from './types';
import type { CostItem } from '@/types/costModel';

/**
 * TRADXML importer — IBIS-TRAD proprietary format.
 * Structure: Begroting → Hoofdstuk → [Element →] Activiteit.
 */
export function importTradxml(xml: string): ImportResult {
  const doc = parseXml(xml);
  const root = doc.documentElement;
  const warnings: string[] = [];
  const items: CostItem[] = [];

  const kop = Array.from(root.children).find((c) => c.tagName === 'Kop') as Element | undefined;
  const name = getText(kop, 'Projectnaam') || 'IBIS import';

  const addChapter = (el: Element, parentId: string | null, depth: number): string => {
    const item = makeCostItem({
      parentId,
      sortOrder: items.length,
      depth,
      rowType: 'chapter',
      code: el.getAttribute('code') ?? '',
      description: el.getAttribute('omschrijving') ?? '',
    });
    items.push(item);
    return item.id;
  };

  const addActivity = (el: Element, parentId: string, depth: number) => {
    const qty = getNumber(el, 'Hoeveelheid');
    const price = getNumber(el, 'Eenheidsprijs');
    items.push(
      makeCostItem({
        parentId,
        sortOrder: items.length,
        depth,
        rowType: 'begrotingspost',
        code: el.getAttribute('code') ?? '',
        description: el.getAttribute('omschrijving') ?? '',
        quantity: qty,
        unit: normalizeUnit(getText(el, 'Eenheid')),
        unitPrice: price,
        total: qty * price,
      }),
    );
  };

  children(root, 'Hoofdstuk').forEach((h) => {
    const hId = addChapter(h, null, 0);
    children(h, 'Element').forEach((e) => {
      const eId = addChapter(e, hId, 1);
      children(e, 'Activiteit').forEach((a) => addActivity(a, eId, 2));
    });
    children(h, 'Activiteit').forEach((a) => addActivity(a, hId, 1));
  });

  if (items.length === 0) warnings.push('TRADXML bevat geen hoofdstukken.');

  return { schedule: { name }, items, warnings, format: 'tradxml' };
}
