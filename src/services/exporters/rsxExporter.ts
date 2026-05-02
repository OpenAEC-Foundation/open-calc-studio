import type { ExportInput, ExportResult } from './types';
import type { CostItem } from '@/types/costModel';
import { buildXml, formatDutch, denormalizeUnit, type XmlNode } from './xmlBuilder';

const RSX_NS = 'http://www.crow.nl/schema/raw/rsx';

export function exportRsx(input: ExportInput): ExportResult {
  const warnings: string[] = [];
  const { schedule, items } = input;
  const chapters = items.filter((it) => it.rowType === 'chapter' && !it.parentId);

  const root: XmlNode = {
    tag: 'RAWBestand',
    children: [
      { tag: 'Bestek', children: [{ tag: 'Naam', children: [schedule.name ?? ''] }] },
      ...chapters.map((c) => renderDeelraming(c, items, warnings)),
    ],
  };

  return { xml: buildXml(root, { xmlns: RSX_NS }), format: 'rsx', warnings };
}

function renderDeelraming(ch: CostItem, all: CostItem[], warnings: string[]): XmlNode {
  const kids = all.filter((it) => it.parentId === ch.id);
  const resBs = kids.filter((it) => it.rowType === 'begrotingspost' || it.rowType === 'bewakingspost');
  const subs = kids.filter((it) => it.rowType === 'chapter');

  if (subs.length > 0) {
    warnings.push(`RSX: geneste chapters onder "${ch.description ?? ch.code}" worden afgevlakt (CROW RSX ondersteunt 1 niveau Deelraming)`);
  }

  return {
    tag: 'Deelraming',
    attrs: { code: ch.code, omschrijving: ch.description },
    children: resBs.map(renderResultaat),
  };
}

function renderResultaat(r: CostItem): XmlNode {
  return {
    tag: 'Resultaatsverplichting',
    attrs: { besteksnummer: r.code },
    children: [
      { tag: 'Omschrijving', children: [r.description ?? ''] },
      { tag: 'Hoeveelheid',  children: [formatDutch(r.quantity ?? 0, 2)] },
      { tag: 'Eenheid',      children: [denormalizeUnit(r.unit ?? 'st')] },
      { tag: 'Prijs',        children: [formatDutch(r.unitPrice ?? 0, 2)] },
    ],
  };
}
