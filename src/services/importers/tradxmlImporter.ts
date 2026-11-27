import { uiText } from '../../i18n/uiText';
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
        normUnitPrice: price,
        unitPrice: price,
        total: qty * price,
      }),
    );
  };

  // Elementen kunnen genest zijn (de exporter schrijft elk subhoofdstuk als
  // Element); voorheen werd alleen het eerste niveau gelezen (knownbug 274).
  const addChildren = (el: Element, parentId: string, depth: number): void => {
    children(el, 'Element').forEach((e) => addChildren(e, addChapter(e, parentId, depth), depth + 1));
    children(el, 'Activiteit').forEach((a) => addActivity(a, parentId, depth));
  };
  children(root, 'Hoofdstuk').forEach((h) => addChildren(h, addChapter(h, null, 0), 1));

  if (items.length === 0) warnings.push(uiText("diagnostics.tradxmlImporter.tradxmlContainsNoChapters", "TRADXML contains no chapters."));

  return { schedule: { name }, items, warnings, format: 'tradxml' };
}
