import { uiText } from '../../i18n/uiText';
import type { CostItem } from '@/types/costModel';

export type XmlAttrs = Record<string, string | number | undefined>;

export interface XmlNode {
  tag: string;
  attrs?: XmlAttrs;
  children?: (XmlNode | string)[];
}

export interface XmlBuildOptions {
  xmlns?: string;
  /** Schrijf ook attributen met een lege waarde (`mfv=""`); standaard worden die weggelaten. */
  keepEmptyAttrs?: boolean;
}

export function buildXml(root: XmlNode, opts?: XmlBuildOptions): string {
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + renderNode(root, 0, opts);
}

function renderNode(node: XmlNode | string, indent: number, opts?: XmlBuildOptions): string {
  if (typeof node === 'string') return escapeXml(node);
  const pad = '  '.repeat(indent);
  const attrs = renderAttrs(node.attrs, indent === 0 ? opts?.xmlns : undefined, opts?.keepEmptyAttrs);
  const children = node.children ?? [];
  if (children.length === 0) return `${pad}<${node.tag}${attrs}/>`;
  if (children.length === 1 && typeof children[0] === 'string') {
    return `${pad}<${node.tag}${attrs}>${escapeXml(children[0])}</${node.tag}>`;
  }
  const inner = children.map((c) => renderNode(c, indent + 1, opts)).join('\n');
  return `${pad}<${node.tag}${attrs}>\n${inner}\n${pad}</${node.tag}>`;
}

function renderAttrs(attrs?: XmlAttrs, xmlns?: string, keepEmpty = false): string {
  const parts: string[] = [];
  if (xmlns) parts.push(`xmlns="${escapeXml(xmlns)}"`);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || (v === '' && !keepEmpty)) continue;
      parts.push(`${k}="${escapeXml(String(v))}"`);
    }
  }
  return parts.length ? ' ' + parts.join(' ') : '';
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export function formatDutch(n: number, decimals = 2): string {
  return n.toFixed(decimals).replace('.', ',');
}

export function denormalizeUnit(unit: string): string {
  return unit.replace(/³/g, '3').replace(/²/g, '2');
}

/**
 * Posten zonder hoofdstuk (direct onder de wortel) in een eigen hoofdstuk
 * zetten, op de plek van de eerste zo'n post (knownbug 59). CUF, TradXML en
 * RSX hangen elke post onder een hoofdstuk/deelraming; zonder deze stap
 * vielen losse posten stil weg. Opeenvolgende losse posten delen één
 * hoofdstuk; een echt hoofdstuk ertussen begint een nieuw. Het hoofdstuk
 * krijgt geen code en de naam van de begroting — elke lezer (ook een oudere
 * versie van OCS) leest het als gewoon hoofdstuk. Niets wordt herberekend.
 */
export function wrapRootPosts(items: CostItem[], isPost: (it: CostItem) => boolean, description: string): CostItem[] {
  if (!items.some((it) => !it.parentId && isPost(it))) return items;
  const out: CostItem[] = [];
  let group: CostItem | null = null;
  let n = 0;
  for (const it of items) {
    if (!it.parentId && it.rowType === 'chapter') group = null;
    if (!it.parentId && isPost(it)) {
      if (!group) {
        n += 1;
        group = { ...it, id: `ocs-root-posts-${n}`, parentId: null, rowType: 'chapter', code: '', description, notes: '', quantity: null, unit: 'st' };
        out.push(group);
      }
      out.push({ ...it, parentId: group.id, depth: it.depth + 1 });
      continue;
    }
    out.push(it);
  }
  return out;
}

/**
 * Melding voor formaten zonder valutaveld: de ontvanger leest de bedragen als
 * euro's. Alleen als de begroting een andere valuta heeft; er wordt nooit
 * omgerekend. `null` als er niets te melden is.
 */
export function currencyNotInFormatWarning(format: string, currency: string | null | undefined): string | null {
  const code = (currency ?? '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code) || code === 'EUR') return null;
  return uiText('diagnostics.currencyNotInFormat', '{{format}} has no currency field, so the receiver will read these amounts as euros. This estimate is in {{currency}}; the amounts were not converted.', { format, currency: code });
}
