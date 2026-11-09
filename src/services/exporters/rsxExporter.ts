import { uiText } from '../../i18n/uiText';
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
  // CROW RSX knows one sub-estimate level: collect the items of all nested
  // chapters (depth-first, in document order) into this top-level Deelraming.
  const resBs: CostItem[] = [];
  let hasSubs = false;
  const collect = (parentId: string) => {
    for (const it of all) {
      if (it.parentId !== parentId) continue;
      if (it.rowType === 'begrotingspost' || it.rowType === 'bewakingspost') resBs.push(it);
      else if (it.rowType === 'chapter') { hasSubs = true; collect(it.id); }
    }
  };
  collect(ch.id);

  if (hasSubs) {
    warnings.push(uiText('diagnostics.rsxFlattened', "RSX: nested chapters under \"{{name}}\" were flattened; CROW RSX supports one sub-estimate level.", { name: ch.description ?? ch.code }));
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
