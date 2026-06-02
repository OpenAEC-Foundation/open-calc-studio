import { parseXml, getText, getNumber, normalizeUnit, makeCostItem } from './xmlHelpers';
import type { ImportResult } from './types';
import type { CostItem } from '@/types/costModel';

/**
 * RAW RSX importer (CROW) — GWW sector.
 * Structure: RAWBestand → Bestek + Deelraming* → Resultaatsverplichting*.
 */
export function importRsx(xml: string): ImportResult {
  const doc = parseXml(xml);
  const warnings: string[] = [];
  const items: CostItem[] = [];

  const bestek = doc.getElementsByTagNameNS('*', 'Bestek')[0] ?? null;
  const name = getText(bestek, 'Naam') || 'RAW import';

  Array.from(doc.getElementsByTagNameNS('*', 'Deelraming')).forEach((d) => {
    const chapter = makeCostItem({
      parentId: null,
      sortOrder: items.length,
      depth: 0,
      rowType: 'chapter',
      code: d.getAttribute('code') ?? '',
      description: d.getAttribute('omschrijving') ?? '',
    });
    items.push(chapter);

    Array.from(d.getElementsByTagNameNS('*', 'Resultaatsverplichting')).forEach((rv) => {
      const qty = getNumber(rv, 'Hoeveelheid');
      const price = getNumber(rv, 'Prijs');
      items.push(
        makeCostItem({
          parentId: chapter.id,
          sortOrder: items.length,
          depth: 1,
          rowType: 'begrotingspost',
          code: rv.getAttribute('besteksnummer') ?? '',
          description: getText(rv, 'Omschrijving'),
          quantity: qty,
          unit: normalizeUnit(getText(rv, 'Eenheid')),
          unitPrice: price,
          total: qty * price,
        }),
      );
    });
  });

  if (items.length === 0) warnings.push('RSX bevat geen deelramingen.');

  return { schedule: { name }, items, warnings, format: 'rsx' };
}
