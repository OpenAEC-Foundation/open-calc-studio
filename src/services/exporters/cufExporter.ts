import type { ExportInput, ExportResult } from './types';
import type { CostItem } from '@/types/costModel';
import { buildXml, formatDutch, denormalizeUnit, type XmlNode } from './xmlBuilder';

export function exportCuf(input: ExportInput): ExportResult {
  const warnings: string[] = [];
  const { schedule, items } = input;
  const chapters = items.filter((it) => it.rowType === 'chapter' && !it.parentId);

  const children: (XmlNode | string)[] = [
    { tag: 'Naam', children: [schedule.name ?? ''] },
    ...chapters.map((ch) => renderChapter(ch, items, warnings)),
  ];

  // Staart: in this codebase staart items are regular items with rowType='staart_*'
  const staartItems = items.filter((it) => it.rowType?.startsWith('staart_'));
  if (staartItems.length > 0) {
    children.push({
      tag: 'Staart',
      children: staartItems.map((s) => ({
        tag: 'Opslag',
        attrs: { type: s.rowType?.replace(/^staart_/, ''), code: s.code },
        children: [
          { tag: 'Omschrijving', children: [s.description ?? ''] },
          { tag: 'Percentage', children: [formatDutch((s as any).staartPercentage ?? s.quantity ?? 0)] },
        ] as (XmlNode | string)[],
      })),
    });
  }

  return { xml: buildXml({ tag: 'Calculatie', attrs: { version: '4.003' }, children }), format: 'cuf', warnings };
}

function renderChapter(chapter: CostItem, all: CostItem[], warnings: string[]): XmlNode {
  const kids = all.filter((it) => it.parentId === chapter.id);
  const posts = kids.filter((it) => it.rowType === 'begrotingspost' || it.rowType === 'bewakingspost');
  const subs  = kids.filter((it) => it.rowType === 'chapter');

  return {
    tag: 'Hoofdstuk',
    attrs: { code: chapter.code, omschrijving: chapter.description },
    children: [
      ...subs.map((c) => renderChapter(c, all, warnings)),
      ...posts.map((p) => renderPost(p, all, warnings)),
    ],
  };
}

function renderPost(post: CostItem, all: CostItem[], _warnings: string[]): XmlNode {
  const regels = all.filter((it) => it.parentId === post.id && it.rowType === 'regel');
  const children: (XmlNode | string)[] = [
    { tag: 'Hoeveelheid', children: [formatDutch(post.quantity ?? 0, 2)] },
    { tag: 'Eenheid',     children: [denormalizeUnit(post.unit ?? 'st')] },
    { tag: 'Prijs',       children: [formatDutch(post.unitPrice ?? 0, 2)] },
    ...regels.map((r) => renderRegel(r)),
  ];
  return { tag: 'Post', attrs: { code: post.code, omschrijving: post.description }, children };
}

function renderRegel(regel: CostItem): XmlNode {
  return {
    tag: 'Regel',
    attrs: { code: regel.code, omschrijving: regel.description },
    children: [
      { tag: 'Hoeveelheid', children: [formatDutch(regel.quantity ?? 0, 2)] },
      { tag: 'Eenheid',     children: [denormalizeUnit(regel.unit ?? 'st')] },
      { tag: 'Prijs',       children: [formatDutch(regel.unitPrice ?? 0, 2)] },
    ],
  };
}
