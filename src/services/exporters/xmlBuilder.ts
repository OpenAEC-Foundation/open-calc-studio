export type XmlAttrs = Record<string, string | number | undefined>;

export interface XmlNode {
  tag: string;
  attrs?: XmlAttrs;
  children?: (XmlNode | string)[];
}

export function buildXml(root: XmlNode, opts?: { xmlns?: string }): string {
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + renderNode(root, 0, opts);
}

function renderNode(node: XmlNode | string, indent: number, opts?: { xmlns?: string }): string {
  if (typeof node === 'string') return escapeXml(node);
  const pad = '  '.repeat(indent);
  const attrs = renderAttrs(node.attrs, indent === 0 ? opts?.xmlns : undefined);
  const children = node.children ?? [];
  if (children.length === 0) return `${pad}<${node.tag}${attrs}/>`;
  if (children.length === 1 && typeof children[0] === 'string') {
    return `${pad}<${node.tag}${attrs}>${escapeXml(children[0])}</${node.tag}>`;
  }
  const inner = children.map((c) => renderNode(c, indent + 1, opts)).join('\n');
  return `${pad}<${node.tag}${attrs}>\n${inner}\n${pad}</${node.tag}>`;
}

function renderAttrs(attrs?: XmlAttrs, xmlns?: string): string {
  const parts: string[] = [];
  if (xmlns) parts.push(`xmlns="${escapeXml(xmlns)}"`);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === '') continue;
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
