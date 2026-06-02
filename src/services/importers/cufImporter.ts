import {
  parseXml,
  getText,
  getNumber,
  getNumberOrDefault,
  children,
  normalizeUnit,
  makeCostItem,
} from './xmlHelpers';
import type { ResourceType } from '@/types/costModel';
import type { ImportResult } from './types';
import type { CostItem } from '@/types/costModel';

/**
 * CUF-XML importer (Calculatie Uitwisselings Formaat 4.003).
 * Used by IBIS, Kraan, ArchiCalc, WpCalc.
 */
export function importCuf(xml: string): ImportResult {
  const doc = parseXml(xml);
  const root = doc.documentElement;
  const warnings: string[] = [];
  const items: CostItem[] = [];

  const name = getText(root, 'Naam') || 'Geïmporteerde begroting';

  children(root, 'Hoofdstuk').forEach((h, idx) => {
    const chapter = makeCostItem({
      parentId: null,
      sortOrder: items.length,
      depth: 0,
      rowType: 'chapter',
      code: h.getAttribute('code') ?? `H${idx + 1}`,
      description: h.getAttribute('omschrijving') ?? '',
    });
    items.push(chapter);

    children(h, 'Post').forEach((p) => {
      const qty = getNumber(p, 'Hoeveelheid');
      const price = getNumber(p, 'Prijs');
      const post = makeCostItem({
        parentId: chapter.id,
        sortOrder: items.length,
        depth: 1,
        rowType: 'begrotingspost',
        code: p.getAttribute('code') ?? '',
        description: p.getAttribute('omschrijving') ?? '',
        quantity: qty,
        unit: normalizeUnit(getText(p, 'Eenheid')),
        unitPrice: price,
        total: qty * price,
      });
      items.push(post);

      // Middel children (arbeid/materiaal/materieel/onderaannemer/overig)
      children(p, 'Middel').forEach((m) => {
        const typeAttr = (m.getAttribute('type') ?? '').toLowerCase();
        const resourceType: ResourceType =
          typeAttr === 'arbeid' ? 'arbeid' :
          typeAttr === 'materiaal' ? 'materiaal' :
          typeAttr === 'materieel' ? 'materieel' :
          (typeAttr === 'onderaanneming' || typeAttr === 'onderaannemer') ? 'onderaannemer' :
          'overig';
        items.push(
          makeCostItem({
            parentId: post.id,
            sortOrder: items.length,
            depth: 2,
            rowType: 'regel',
            code: m.getAttribute('code') ?? '',
            description: m.getAttribute('omschrijving') ?? '',
            quantity: getNumber(m, 'Hoeveelheid'),
            unit: normalizeUnit(getText(m, 'Eenheid')),
            unitPrice: getNumber(m, 'Prijs'),
            normFactor: getNumberOrDefault(m, 'Normfactor', 1),
            normDivisor: getNumberOrDefault(m, 'Normdeler', 1),
            resourceType,
          }),
        );
      });

      // Toeslag: warn, don't import (not mapped in OCS model)
      children(p, 'Toeslag').forEach((t) => {
        const tCode = t.getAttribute('code') ?? '?';
        warnings.push(
          `Toeslag "${tCode}" wordt niet geïmporteerd (niet ondersteund in OCS model)`,
        );
      });
    });
  });

  if (items.length === 0) warnings.push('CUF-bestand bevat geen hoofdstukken of posten.');

  return { schedule: { name }, items, warnings, format: 'cuf' };
}
