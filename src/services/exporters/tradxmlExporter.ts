import type { ExportInput, ExportResult } from './types';
import type { CostItem } from '@/types/costModel';
import { buildXml, formatDutch, denormalizeUnit, wrapRootPosts, currencyNotInFormatWarning, type XmlNode } from './xmlBuilder';

export function exportTradxml(input: ExportInput): ExportResult {
  const _warnings: string[] = [];
  const { schedule } = input;
  // Activiteiten zonder hoofdstuk komen in een eigen hoofdstuk (knownbug 59).
  const items = wrapRootPosts(input.items, isActivity, schedule.name ?? '');
  const topChapters = items.filter((it) => it.rowType === 'chapter' && !it.parentId);
  const currencyWarning = currencyNotInFormatWarning('TRADXML', schedule.currency);
  if (currencyWarning) _warnings.push(currencyWarning);

  const root: XmlNode = {
    tag: 'Begroting',
    attrs: { version: '7.10' },
    children: [
      { tag: 'Kop', children: [{ tag: 'Projectnaam', children: [schedule.name ?? ''] }] },
      ...topChapters.map((c) => renderChapter(c, items, 0, _warnings)),
    ],
  };
  return { xml: buildXml(root), format: 'tradxml', warnings: _warnings };
}

function renderChapter(ch: CostItem, all: CostItem[], depth: number, _warnings: string[]): XmlNode {
  const kids = all.filter((it) => it.parentId === ch.id);
  const subs = kids.filter((it) => it.rowType === 'chapter');
  const acts = kids.filter(isActivity);

  // Top = Hoofdstuk, nested = Element
  const tag = depth === 0 ? 'Hoofdstuk' : 'Element';

  return {
    tag,
    attrs: { code: ch.code, omschrijving: ch.description },
    children: [
      ...subs.map((c) => renderChapter(c, all, depth + 1, _warnings)),
      ...acts.map(renderActivity),
    ],
  };
}

function isActivity(it: CostItem): boolean {
  return it.rowType === 'begrotingspost' || it.rowType === 'bewakingspost' || it.rowType === 'regel';
}

function renderActivity(a: CostItem): XmlNode {
  return {
    tag: 'Activiteit',
    attrs: { code: a.code, omschrijving: a.description },
    children: [
      { tag: 'Hoeveelheid', children: [formatDutch(a.quantity ?? 0, 2)] },
      { tag: 'Eenheid', children: [denormalizeUnit(a.unit ?? 'st')] },
      { tag: 'Eenheidsprijs', children: [formatDutch(a.unitPrice ?? 0, 2)] },
    ],
  };
}
