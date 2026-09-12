/**
 * Lichte XML-parser naar een platte boom van gewone objecten.
 *
 * Bedoeld voor grote, machinaal geschreven XML-bestanden (zoals de
 * ÖNORM A 2063-Leistungsbücher van 10 MB) waar `DOMParser` — zeker in jsdom,
 * maar ook in de browser — te veel tijd en geheugen kost aan een volledige
 * DOM met live collections. Deze parser leest de tekst één keer van voor
 * naar achter en bouwt alleen wat een importer nodig heeft: elementnaam
 * (zonder namespace-prefix), attributen en kinderen (elementen en tekst).
 *
 * Ondersteund: XML-declaratie en processing instructions (overgeslagen),
 * commentaar (overgeslagen), CDATA, DOCTYPE zonder interne entiteiten
 * (overgeslagen), de vijf voorgedefinieerde en numerieke entiteiten,
 * attributen met enkele of dubbele aanhalingstekens, self-closing tags.
 * Tekst wordt genormaliseerd zoals een XML-parser dat doet (CRLF → LF;
 * witruimte in attributen → spatie). Niet-welgevormde invoer (ongesloten
 * tag, verkeerde sluittag, onbekende entiteit, tekst buiten het
 * wortelelement) geeft een `XML parse error`.
 */

export interface XElement {
  /** Elementnaam zonder namespace-prefix (`localName`). */
  name: string;
  attrs: Record<string, string>;
  /** Elementen en tekstknopen in documentvolgorde. */
  children: (XElement | string)[];
}

/** Elke `&`: als bekende entiteit (groep 1) of los (dan een fout). */
const ENTITY = /&(#[xX][0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);|&[^;\s<]{0,20};?/g;
const NAMED: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

function fail(message: string, xml: string, at: number): never {
  const line = xml.slice(0, at).split('\n').length;
  throw new Error(`XML parse error: ${message} (regel ${line})`);
}

/** Entiteiten oplossen; een onbekende (`&foo;`) of losse `&` is een fout. */
function decode(text: string, xml: string, at: number): string {
  if (text.indexOf('&') < 0) return text;
  return text.replace(ENTITY, (m: string, e: string | undefined) => {
    if (e === undefined) fail(`onbekende entiteit ${m}`, xml, at);
    if (e[0] === '#') {
      const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) fail(`ongeldige tekenverwijzing &${e};`, xml, at);
      return String.fromCodePoint(cp);
    }
    return NAMED[e];
  });
}

const isNameEnd = (c: number): boolean =>
  c === 32 || c === 9 || c === 10 || c === 13 || c === 47 /* / */ || c === 62 /* > */ || c === 61 /* = */;

const isSpace = (c: number): boolean => c === 32 || c === 9 || c === 10 || c === 13;

const localName = (qname: string): string => {
  const colon = qname.indexOf(':');
  return colon >= 0 ? qname.slice(colon + 1) : qname;
};

/** Parseert een XML-document en geeft het wortelelement terug. */
export function parseLiteXml(input: string): XElement {
  const xml = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const n = xml.length;
  let i = 0;
  let root: XElement | null = null;
  const stack: XElement[] = [];
  const qnames: string[] = [];

  const pushText = (raw: string, at: number): void => {
    if (stack.length === 0) {
      if (raw.trim() !== '') fail('tekst buiten het wortelelement', xml, at);
      return;
    }
    const text = raw.indexOf('\r') >= 0 ? raw.replace(/\r\n?/g, '\n') : raw;
    stack[stack.length - 1].children.push(decode(text, xml, at));
  };

  while (i < n) {
    const lt = xml.indexOf('<', i);
    if (lt < 0) {
      pushText(xml.slice(i), i);
      i = n;
      break;
    }
    if (lt > i) pushText(xml.slice(i, lt), i);
    i = lt + 1;
    const c = xml.charCodeAt(i);

    if (c === 47) {
      // ── Sluittag ──
      const gt = xml.indexOf('>', i);
      if (gt < 0) fail('onafgesloten sluittag', xml, lt);
      const qname = xml.slice(i + 1, gt).trim();
      const expected = qnames.pop();
      const node = stack.pop();
      if (!node || expected !== qname) fail(`sluittag </${qname}> past niet bij <${expected ?? '?'}>`, xml, lt);
      i = gt + 1;
      continue;
    }

    if (c === 63) {
      // ── <?xml …?> / processing instruction ──
      const end = xml.indexOf('?>', i);
      if (end < 0) fail('onafgesloten processing instruction', xml, lt);
      i = end + 2;
      continue;
    }

    if (c === 33) {
      if (xml.startsWith('--', i + 1)) {
        const end = xml.indexOf('-->', i + 3);
        if (end < 0) fail('onafgesloten commentaar', xml, lt);
        i = end + 3;
        continue;
      }
      if (xml.startsWith('[CDATA[', i + 1)) {
        const end = xml.indexOf(']]>', i + 8);
        if (end < 0) fail('onafgesloten CDATA', xml, lt);
        if (stack.length === 0) fail('CDATA buiten het wortelelement', xml, lt);
        stack[stack.length - 1].children.push(xml.slice(i + 8, end).replace(/\r\n?/g, '\n'));
        i = end + 3;
        continue;
      }
      if (xml.startsWith('DOCTYPE', i + 1)) {
        // Overslaan, inclusief een eventuele interne subset tussen [ ].
        let depth = 0;
        let j = i + 8;
        for (; j < n; j++) {
          const ch = xml.charCodeAt(j);
          if (ch === 91 /* [ */) depth++;
          else if (ch === 93 /* ] */) depth--;
          else if (ch === 62 /* > */ && depth <= 0) break;
        }
        if (j >= n) fail('onafgesloten DOCTYPE', xml, lt);
        i = j + 1;
        continue;
      }
      fail('onbekende markup', xml, lt);
    }

    // ── Starttag ──
    let j = i;
    while (j < n && !isNameEnd(xml.charCodeAt(j))) j++;
    if (j === i) fail('elementnaam ontbreekt', xml, lt);
    const qname = xml.slice(i, j);
    const node: XElement = { name: localName(qname), attrs: {}, children: [] };
    i = j;

    // Attributen
    for (;;) {
      while (i < n && isSpace(xml.charCodeAt(i))) i++;
      if (i >= n) fail('onafgesloten starttag', xml, lt);
      const ch = xml.charCodeAt(i);
      if (ch === 47 || ch === 62) break;
      j = i;
      while (j < n && !isNameEnd(xml.charCodeAt(j))) j++;
      const aname = xml.slice(i, j);
      if (!aname) fail('attribuutnaam ontbreekt', xml, lt);
      i = j;
      while (i < n && isSpace(xml.charCodeAt(i))) i++;
      if (xml.charCodeAt(i) !== 61) fail(`attribuut ${aname} zonder waarde`, xml, lt);
      i++;
      while (i < n && isSpace(xml.charCodeAt(i))) i++;
      const q = xml.charCodeAt(i);
      if (q !== 34 && q !== 39) fail(`attribuut ${aname} zonder aanhalingstekens`, xml, lt);
      const end = xml.indexOf(String.fromCharCode(q), i + 1);
      if (end < 0) fail(`attribuut ${aname} niet afgesloten`, xml, lt);
      const raw = xml.slice(i + 1, end);
      node.attrs[localName(aname)] = decode(raw, xml, lt).replace(/[\t\n\r]/g, ' ');
      i = end + 1;
    }

    const selfClosing = xml.charCodeAt(i) === 47;
    if (selfClosing) i++;
    if (xml.charCodeAt(i) !== 62) fail('starttag niet afgesloten met >', xml, lt);
    i++;

    if (stack.length > 0) {
      stack[stack.length - 1].children.push(node);
    } else if (root) {
      fail('meer dan één wortelelement', xml, lt);
    } else {
      root = node;
    }
    if (!selfClosing) {
      stack.push(node);
      qnames.push(qname);
    }
  }

  if (stack.length > 0) fail(`element <${qnames[qnames.length - 1]}> is niet gesloten`, xml, n);
  if (!root) fail('geen wortelelement', xml, 0);
  return root;
}

// ── Hulpfuncties op de boom ─────────────────────────────────────────────────

export const isElement = (node: XElement | string): node is XElement => typeof node !== 'string';

/** Directe kind-elementen met deze naam. */
export function childElements(el: XElement | null | undefined, name: string): XElement[] {
  const out: XElement[] = [];
  if (!el) return out;
  for (const c of el.children) if (typeof c !== 'string' && c.name === name) out.push(c);
  return out;
}

/** Eerste directe kind-element met deze naam. */
export function childElement(el: XElement | null | undefined, name: string): XElement | null {
  if (!el) return null;
  for (const c of el.children) if (typeof c !== 'string' && c.name === name) return c;
  return null;
}

/** Alle tekst onder een element aaneengeregen (zoals `textContent`). */
export function textContent(el: XElement | null | undefined): string {
  if (!el) return '';
  let out = '';
  const walk = (node: XElement): void => {
    for (const c of node.children) {
      if (typeof c === 'string') out += c;
      else walk(c);
    }
  };
  walk(el);
  return out;
}
