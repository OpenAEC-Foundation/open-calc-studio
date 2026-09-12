/**
 * ÖNORM A 2063 exporter — schrijft de begroting als Oostenrijks
 * Leistungsverzeichnis (.onlv) in de namespace 2021-03-01, geldig tegen
 * onlv.xsd (zie `scripts/validate-a2063.py`).
 *
 * LV-soort: mét prijzen wordt het een `kostenschaetzungs-lv` — de enige
 * LV-soort vóór de aanbesteding waarin het schema prijzen én groepssommen
 * (ulg-/lg-/lv-summe) toelaat; zonder prijzen een `ausschreibungs-lv` met
 * `nichtangeboten` bij elke positie (zo hoort een bestek eruit te zien dat
 * de inschrijver moet prijzen).
 *
 * Mapping vanuit OCS:
 * - hoofdstukken → lg/ulg (2 niveaus); bij 3 of 4 niveaus komen og resp.
 *   hg/og ervoor; bij 1 niveau of losse posten op het hoogste niveau wordt
 *   een ulg (en zo nodig lg) toegevoegd. Diepere hoofdstukken dan 4 niveaus
 *   worden in de ulg platgeslagen (hun kop wordt een wählbare Vorbemerkung).
 * - begrotings-/bewakingspost → positie: `ungeteilteposition`, of
 *   `grundtext` + `folgeposition` wanneer de code op het ÖNORM-patroon
 *   `..NN` + letter eindigt (bv. `01.02.03A`). Prijs/EH = Lohn (loon) +
 *   Sonstiges (rest); rekenregels onder een post gaan als loon-/restaandeel
 *   in die prijs op (A 2063 kent geen samenstelling per positie).
 * - tekst- en witregels → wählbare Vorbemerkung (positie zonder eenheid).
 * - staartregels worden niet geëxporteerd; de ontvanger rekent zijn eigen
 *   opslagen (net als bij FIEBDC-3).
 *
 * Schema-beperkingen die tekst kunnen inkorten: ueberschrift en stichwort
 * zijn maximaal 60 tekens; een langere omschrijving gaat dan volledig als
 * eerste alinea in de langtext mee. Bedragen en hoeveelheden hebben in het
 * schema 2 decimalen.
 */
import type { CostItem, CostSchedule } from '@/types/costModel';
import { buildXml, type XmlNode } from '@/services/exporters/xmlBuilder';
import type { ExportInput, ExportResult } from '@/services/exporters/types';
import { computeKostprijsBreakdown } from '@/services/calculation/calculator';
import { POSART_MARKERS } from '@/services/importers/onlvImporter';

export const A2063_NAMESPACE = 'http://www.oenorm.at/schema/A2063/2021-03-01';

/** Eenheden van einheit.type (ontypdef.xsd 2021). */
const A2063_UNITS = new Set(['cm', 'm', 'km', 'cm²', 'm²', 'cm³', 'm³', 'l', 'g', 'kg', 't', 'Stk', 'PA', 'h', 'd', 'Wo', 'Mo', 'VE']);

const OCS_TO_A2063: Record<string, string> = {
  st: 'Stk', m: 'm', 'm²': 'm²', 'm³': 'm³', kg: 'kg', ton: 't', uur: 'h', dgn: 'd', km: 'km',
  keer: 'Stk', ls: 'PA', week: 'Wo', mnd: 'Mo', post: 'PA', '%': 'VE', pm: 'PA',
};

/** OCS-eenheid → ÖNORM-eenheid; een al geldige ÖNORM-eenheid blijft staan. */
export function a2063UnitOf(unit: string): { unit: string; known: boolean } {
  const u = (unit ?? '').trim();
  if (A2063_UNITS.has(u)) return { unit: u, known: true };
  const mapped = OCS_TO_A2063[u] ?? OCS_TO_A2063[u.toLowerCase()];
  if (mapped) return { unit: mapped, known: true };
  return { unit: 'Stk', known: false };
}

// ── Formattering ────────────────────────────────────────────────────────────

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
/** betrag.type / lvmenge.type: 2 decimalen, punt als scheidingsteken. */
const money = (n: number): string => {
  const v = round2(Number.isFinite(n) ? n : 0);
  return (Object.is(v, -0) ? 0 : v).toFixed(2);
};

const pad2 = (n: number): string => String(n).padStart(2, '0');
const isoDate = (d: Date): string => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const isoDateTime = (d: Date): string => `${isoDate(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;

/** Eén regel, samengevouwen witruimte. */
const oneLine = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();

/** text60.type: 1–60 tekens; leeg → terugval. */
const t60 = (s: string | null | undefined, fallback: string): string => {
  const line = oneLine(s);
  return (line || fallback).slice(0, 60);
};

const lines = (s: string | null | undefined): string[] =>
  (s ?? '').split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);

const el = (tag: string, children?: (XmlNode | string)[], attrs?: XmlNode['attrs']): XmlNode =>
  ({ tag, ...(attrs ? { attrs } : {}), ...(children && children.length > 0 ? { children } : {}) });

const text = (tag: string, value: string): XmlNode => el(tag, [value]);

/** Opgemaakte tekst: elke regel een alinea. */
const formatted = (tag: string, textLines: string[]): XmlNode | null =>
  textLines.length > 0 ? el(tag, textLines.map((l) => text('p', l))) : null;

const compact = (nodes: (XmlNode | null | undefined)[]): XmlNode[] => nodes.filter((n): n is XmlNode => !!n);

// ── Nummering ───────────────────────────────────────────────────────────────

/** Laatste segment van een code, alleen [A-Z0-9]. */
const lastSegment = (code: string): string => {
  const parts = (code ?? '').toUpperCase().split(/[.\-/\s]+/).filter(Boolean);
  return (parts[parts.length - 1] ?? '').replace(/[^A-Z0-9]/g, '');
};

const CHARS36 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Vrij 2-teken-nummer: 01..99, daarna A0..ZZ. */
function nextFree(used: Set<string>): string {
  for (let i = 1; i <= 99; i++) {
    const c = pad2(i);
    if (!used.has(c)) return c;
  }
  for (const a of CHARS36) for (const b of CHARS36) {
    const c = a + b;
    if (!used.has(c)) return c;
  }
  return '00';
}

/** Groepsnummer (hg/og/lg/ulg) uit een hoofdstukcode, uniek onder de broers. */
function allocGroupNr(used: Set<string>, code: string): string {
  const seg = lastSegment(code);
  let nr = '';
  if (seg.length === 2) nr = seg;
  else if (seg.length === 1) nr = `0${seg}`;
  else if (seg.length > 2 && /^\d+$/.test(seg)) nr = seg.slice(-2);
  if (!nr || used.has(nr)) nr = nextFree(used);
  used.add(nr);
  return nr;
}

interface PosNr { gt: string; ft: string; mfv: string }

/**
 * `03A1` → gt 03, ft A, mfv 1; `03` → gt 03. Het grundtextnummer moet uit
 * twee cijfers bestaan (zoals in de standaard-LB's); letters zouden ook
 * mogen, maar dan leest elke willekeurige code van 2–4 letters als patroon.
 */
function parsePosNr(code: string): PosNr | null {
  const m = /^(\d{2})([A-Z])?([1-9A-Z])?$/.exec(lastSegment(code));
  return m ? { gt: m[1], ft: m[2] ?? '', mfv: m[3] ?? '' } : null;
}

// ── Groepsboom ──────────────────────────────────────────────────────────────

interface Group {
  nr: string;
  title: string;
  notes: string;
  groups: Group[];
  /** Posities (posten, tekstregels) én platgeslagen hoofdstukkoppen. */
  positions: Position[];
}

interface Position {
  item: CostItem;
  /** Alleen de kop van een te diep genest hoofdstuk (wordt WVB). */
  heading?: string;
}

const isPositionRow = (it: CostItem): boolean =>
  it.rowType === 'begrotingspost' || it.rowType === 'bewakingspost' || it.rowType === 'tekstregel' || it.rowType === 'witregel';

export interface OnlvBuildOptions {
  /** Tijdstip voor `erstelltam` (standaard nu). */
  now?: Date;
  /** Bestandsnaam voor `metadaten/dateiname`. */
  fileName?: string;
  /** Programmaversie voor `metadaten/programmversion`. */
  version?: string;
}

export interface OnlvBuildResult {
  xml: string;
  warnings: string[];
  /** Gekozen LV-soort. */
  lvType: 'kostenschaetzungs-lv' | 'ausschreibungs-lv';
}

export function buildOnlv(schedule: CostSchedule, items: CostItem[], opts: OnlvBuildOptions = {}): OnlvBuildResult {
  const warnings: string[] = [];
  const now = opts.now ?? new Date();

  const byParent = new Map<string | null, CostItem[]>();
  let staartCount = 0;
  for (const it of items) {
    if (it.rowType.startsWith('staart_')) { staartCount++; continue; }
    const list = byParent.get(it.parentId) ?? [];
    list.push(it);
    byParent.set(it.parentId, list);
  }
  if (staartCount > 0) warnings.push(`${staartCount} staartregel(s) niet geëxporteerd — ÖNORM A 2063 kent geen opslagen per LV; de ontvanger rekent zijn eigen indirecte kosten.`);

  // ── Aantal niveaus: 2 (lg/ulg) t/m 4 (hg/og/lg/ulg) ──
  const chapterDepth = (parentId: string | null): number => {
    let deepest = 0;
    for (const c of byParent.get(parentId) ?? []) {
      if (c.rowType === 'chapter') deepest = Math.max(deepest, 1 + chapterDepth(c.id));
    }
    return deepest;
  };
  const L = Math.min(4, Math.max(2, chapterDepth(null)));

  let flattened = 0;
  let foldedRegels = 0;

  /** Alle rekenregels onder een post (ook via geneste bewakingsposten). */
  const regelsUnder = (id: string, out: CostItem[] = []): CostItem[] => {
    for (const c of byParent.get(id) ?? []) {
      if (c.rowType === 'regel') out.push(c);
      else if (c.rowType === 'begrotingspost' || c.rowType === 'bewakingspost') regelsUnder(c.id, out);
    }
    return out;
  };

  /** Posities van een te diep hoofdstuk, met de kop ervoor als WVB. */
  const flattenChapter = (chapter: CostItem, out: Position[]): void => {
    flattened++;
    out.push({ item: chapter, heading: chapter.description || chapter.code });
    for (const c of byParent.get(chapter.id) ?? []) {
      if (c.rowType === 'chapter') flattenChapter(c, out);
      else if (isPositionRow(c)) out.push({ item: c });
    }
  };

  /** Ketting van synthetische subgroepen tot niveau L, met de posities onderin. */
  const chain = (level: number, title: string, positions: Position[]): Group => {
    const g: Group = { nr: '01', title, notes: '', groups: [], positions: [] };
    if (level >= L) g.positions = positions;
    else g.groups.push(chain(level + 1, title, positions));
    return g;
  };

  const buildGroup = (chapter: CostItem, level: number): Group => {
    const g: Group = { nr: '', title: chapter.description || chapter.code, notes: chapter.notes ?? '', groups: [], positions: [] };
    const own: Position[] = [];
    const used = new Set<string>();
    for (const c of byParent.get(chapter.id) ?? []) {
      if (c.rowType === 'chapter') {
        if (level < L) {
          const sub = buildGroup(c, level + 1);
          sub.nr = allocGroupNr(used, c.code);
          g.groups.push(sub);
        } else {
          flattenChapter(c, own);
        }
      } else if (isPositionRow(c)) {
        own.push({ item: c });
      }
    }
    if (level >= L) {
      g.positions = own;
    } else if (own.length > 0) {
      // Posten direct onder een hoofdstuk dat nog geen ulg is: een eigen
      // (synthetische) subgroep met dezelfde kop, vóór de subhoofdstukken.
      const synthetic = chain(level + 1, g.title, own);
      synthetic.nr = allocGroupNr(used, '');
      g.groups.unshift(synthetic);
    }
    return g;
  };

  const roots: Group[] = [];
  {
    const used = new Set<string>();
    const loose: Position[] = [];
    for (const c of byParent.get(null) ?? []) {
      if (c.rowType === 'chapter') {
        const g = buildGroup(c, 1);
        g.nr = allocGroupNr(used, c.code);
        roots.push(g);
      } else if (isPositionRow(c)) {
        loose.push({ item: c });
      }
    }
    if (loose.length > 0) {
      const g = chain(1, t60(schedule.projectName || schedule.name, 'Positionen'), loose);
      g.nr = allocGroupNr(used, '');
      roots.unshift(g);
    }
    if (roots.length === 0) {
      const g = chain(1, 'Positionen', []);
      g.nr = '01';
      roots.push(g);
    }
  }
  if (flattened > 0) warnings.push(`${flattened} hoofdstuk(ken) dieper dan ${L} niveaus zijn in hun Unterleistungsgruppe platgeslagen; de kop staat er als wählbare Vorbemerkung.`);

  // ── Prijzen ──

  interface Price { pa1: number; pa2: number; gesamt: number }

  /** Prijs/EH als Lohn (pa1) + Sonstiges (pa2), afgerond op 2 decimalen. */
  const priceOf = (it: CostItem): Price => {
    const qty = it.quantity ?? 0;
    const regels = regelsUnder(it.id);
    const hasChildren = (byParent.get(it.id) ?? []).length > 0;
    let pa1: number;
    let unit: number;
    if (hasChildren) {
      foldedRegels += regels.length;
      unit = qty !== 0 ? it.total / qty : it.unitPrice;
      const loon = computeKostprijsBreakdown(regels).loon;
      pa1 = qty !== 0 ? loon / qty : 0;
    } else {
      pa1 = it.laborPrice ?? 0;
      unit = (it.normUnitPrice ?? 0) + (it.materialPrice ?? 0) + pa1;
    }
    const gesamt = round2(unit);
    const pa1r = round2(pa1);
    return { pa1: pa1r, pa2: round2(gesamt - pa1r), gesamt };
  };

  const priceCache = new Map<string, Price>();
  const price = (it: CostItem): Price => {
    let p = priceCache.get(it.id);
    if (!p) { p = priceOf(it); priceCache.set(it.id, p); }
    return p;
  };

  const allPositions: CostItem[] = [];
  const collect = (g: Group): void => {
    for (const p of g.positions) if (!p.heading && p.item.rowType !== 'tekstregel' && p.item.rowType !== 'witregel') allPositions.push(p.item);
    g.groups.forEach(collect);
  };
  roots.forEach(collect);
  const priced = allPositions.some((it) => price(it).gesamt !== 0);
  const lvType: OnlvBuildResult['lvType'] = priced ? 'kostenschaetzungs-lv' : 'ausschreibungs-lv';

  // ── Posities ──

  interface Sum { pa1: number; gesamt: number }
  const addSum = (a: Sum, b: Sum): Sum => ({ pa1: round2(a.pa1 + b.pa1), gesamt: round2(a.gesamt + b.gesamt) });
  const ZERO: Sum = { pa1: 0, gesamt: 0 };

  let truncated = 0;
  let unknownUnits = 0;

  const betrag = (tag: string, s: Sum): XmlNode =>
    el(tag, [text('preisanteil1', money(s.pa1)), text('preisanteil2', money(s.gesamt - s.pa1)), text('gesamt', money(s.gesamt))]);

  const gruppensumme = (tag: string, s: Sum): XmlNode => el(tag, [betrag('summe', s), betrag('summe-inkl-na', s)]);

  /** Markering uit de notities halen die de importer erin zet. */
  const stripMarkers = (notes: string): { lines: string[]; optional: boolean } => {
    const ls = lines(notes);
    let optional = false;
    while (ls.length > 0 && (ls[0] === POSART_MARKERS.eventual || ls[0] === POSART_MARKERS.wahl)) {
      optional = true;
      ls.shift();
    }
    return { lines: ls, optional };
  };

  /** pos-eigenschaften van een positie; geeft ook de som terug. */
  const posEigenschaften = (p: Position): { node: XmlNode; sum: Sum } => {
    const it = p.item;
    const isText = !!p.heading || it.rowType === 'tekstregel' || it.rowType === 'witregel';
    const descLines = lines(it.description);
    const description = p.heading ?? (descLines[0] ?? '');
    const stichwort = t60(description, it.code || 'Position');
    if (oneLine(description).length > 60) truncated++;

    const { lines: noteLines, optional } = stripMarkers(it.notes ?? '');
    const textLines: string[] = [];
    if (oneLine(description).length > 60) textLines.push(oneLine(description));
    if (!p.heading && descLines.length > 1) textLines.push(...descLines.slice(1));
    textLines.push(...noteLines);

    const children: XmlNode[] = compact([
      text('stichwort', stichwort),
      formatted('langtext', textLines),
      text('herkunftskennzeichen', 'Z'),
    ]);
    if (isText) return { node: el('pos-eigenschaften', children), sum: ZERO };

    const u = a2063UnitOf(it.unit);
    if (!u.known) unknownUnits++;
    const qty = it.quantity ?? 0;
    const pr = price(it);
    // Verrekenbaar 'N' (of de markering van de importer) → Eventualposition:
    // telt in ÖNORM niet mee in de LV-som.
    const eventual = optional || it.verrekenbaar === 'N';
    const pospreis = round2(qty * pr.gesamt);
    children.push(
      text('einheit', u.unit),
      el('pzzv', [el(eventual ? 'eventualposition' : 'normalposition')]),
      text('leistungsteil', '1'),
      text('lvmenge', money(qty)),
    );
    if (priced) {
      children.push(
        el('preis', [text('preisanteil1', money(pr.pa1)), text('preisanteil2', money(pr.pa2)), text('gesamt', money(pr.gesamt))]),
        text('pospreis', money(pospreis)),
      );
    } else {
      children.push(el('nichtangeboten'));
    }
    const sum: Sum = eventual ? ZERO : { pa1: round2(qty * pr.pa1), gesamt: pospreis };
    return { node: el('pos-eigenschaften', children), sum };
  };

  /** positionen-element van een ulg: grundtextnr-groepen met (folge)posities. */
  const positionen = (positions: Position[]): { node: XmlNode; sum: Sum } => {
    interface Entry { nr: string; kind: 'ungeteilt' | 'folge'; members: { p: Position; ft: string; mfv: string }[] }
    const entries: Entry[] = [];
    const usedGt = new Set<string>();
    const last = (): Entry | undefined => entries[entries.length - 1];
    const fresh = (kind: Entry['kind'], wanted: string): Entry => {
      const nr = wanted && !usedGt.has(wanted) ? wanted : nextFree(usedGt);
      usedGt.add(nr);
      const e: Entry = { nr, kind, members: [] };
      entries.push(e);
      return e;
    };
    for (const p of positions) {
      const parsed = p.heading ? null : parsePosNr(p.item.code);
      if (parsed && parsed.ft) {
        const tail = last();
        const fits = tail && tail.kind === 'folge' && tail.nr === parsed.gt
          && !tail.members.some((m) => m.ft === parsed.ft && m.mfv === parsed.mfv);
        (fits ? tail! : fresh('folge', parsed.gt)).members.push({ p, ft: parsed.ft, mfv: parsed.mfv });
      } else if (parsed) {
        const tail = last();
        const fits = tail && tail.kind === 'ungeteilt' && tail.nr === parsed.gt && parsed.mfv !== ''
          && !tail.members.some((m) => m.mfv === parsed.mfv);
        (fits ? tail! : fresh('ungeteilt', parsed.gt)).members.push({ p, ft: '', mfv: parsed.mfv });
      } else {
        fresh('ungeteilt', '').members.push({ p, ft: '', mfv: '' });
      }
    }
    let sum = ZERO;
    const nodes: XmlNode[] = [];
    for (const e of entries) {
      const members: XmlNode[] = [];
      if (e.kind === 'folge') members.push(el('grundtext', [text('herkunftskennzeichen', 'Z')]));
      for (const m of e.members) {
        const { node, sum: s } = posEigenschaften(m.p);
        sum = addSum(sum, s);
        members.push(e.kind === 'folge'
          ? el('folgeposition', [node], { ftnr: m.ft, mfv: m.mfv })
          : el('ungeteilteposition', [node], { mfv: m.mfv }));
      }
      nodes.push(el('grundtextnr', members, { nr: e.nr }));
    }
    // Een ulg zonder posities is in het schema niet toegestaan.
    if (nodes.length === 0) {
      nodes.push(el('grundtextnr', [el('ungeteilteposition', [el('pos-eigenschaften', [text('stichwort', 'Keine Positionen'), text('herkunftskennzeichen', 'Z')])], { mfv: '' })], { nr: '01' }));
    }
    return { node: el('positionen', nodes), sum };
  };

  // ── Groepen ──

  const eigenschaften = (tag: string, g: Group): XmlNode =>
    el(tag, compact([text('ueberschrift', t60(g.title, g.nr)), formatted('vorbemerkung', lines(g.notes)), text('herkunftskennzeichen', 'Z')]));

  const ulgNode = (g: Group): { node: XmlNode; sum: Sum } => {
    const { node, sum } = positionen(g.positions);
    const children = [eigenschaften('ulg-eigenschaften', g), node];
    if (priced) children.push(gruppensumme('ulg-summe', sum));
    return { node: el('ulg', children, { nr: g.nr }), sum };
  };

  const lgNode = (g: Group): { node: XmlNode; sum: Sum } => {
    let sum = ZERO;
    const ulgs = g.groups.map((u) => { const r = ulgNode(u); sum = addSum(sum, r.sum); return r.node; });
    const children = [eigenschaften('lg-eigenschaften', g), el('ulg-liste', ulgs)];
    if (priced) children.push(gruppensumme('lg-summe', sum));
    return { node: el('lg', children, { nr: g.nr }), sum };
  };

  const dateStr = isoDate(now);
  const lbNode = (): XmlNode => el('lb', [
    text('bezeichnung', 'Frei formulierte Positionen'),
    el('herausgeber', [el('firma', [text('name', 'Open Calc Studio')])]),
    text('lbkennung', 'OCS'),
    text('versionsnummer', '1'),
    text('versionsdatum', dateStr),
    text('status', 'freigegeben'),
  ]);

  const svbNode = (vorbemerkung: string): XmlNode => {
    const vb = formatted('vorbemerkung', lines(vorbemerkung));
    return vb ? el('svb', [vb, text('herkunftskennzeichen', 'Z')]) : el('svb');
  };

  /** lv-ogheader.group + lg-liste (inhoud van gliederung-lg en van een og). */
  const lgListe = (groups: Group[], vorbemerkung: string): { nodes: XmlNode[]; sum: Sum } => {
    let sum = ZERO;
    const lgs = groups.map((g) => { const r = lgNode(g); sum = addSum(sum, r.sum); return r.node; });
    return {
      nodes: [text('preiserstellungsverfahren', 'Preisangebotsverfahren'), lbNode(), svbNode(vorbemerkung), el('lg-liste', lgs)],
      sum,
    };
  };

  const ogNode = (g: Group, lvVorbemerkung: string): { node: XmlNode; sum: Sum } => {
    // De og-notities gaan als Ständige Vorbemerkung van die og mee (og-eigenschaften kent alleen een kop).
    const { nodes, sum } = lgListe(g.groups, g.notes || lvVorbemerkung);
    const children = [el('og-eigenschaften', [text('ueberschrift', t60(g.title, g.nr))]), ...nodes];
    if (priced) children.push(gruppensumme('og-summe', sum));
    return { node: el('og', children, { nr: g.nr }), sum };
  };

  const ogListe = (groups: Group[], lvVorbemerkung: string): { node: XmlNode; sum: Sum } => {
    let sum = ZERO;
    const ogs = groups.map((g) => { const r = ogNode(g, lvVorbemerkung); sum = addSum(sum, r.sum); return r.node; });
    return { node: el('og-liste', ogs), sum };
  };

  const hgNode = (g: Group, lvVorbemerkung: string): { node: XmlNode; sum: Sum } => {
    if (g.notes) warnings.push(`Notities van hoofdgroep '${g.title}' niet geëxporteerd — een hg kent in A 2063 alleen een kop.`);
    const { node, sum } = ogListe(g.groups, lvVorbemerkung);
    const children = [el('hg-eigenschaften', [text('ueberschrift', t60(g.title, g.nr))]), node];
    if (priced) children.push(gruppensumme('hg-summe', sum));
    return { node: el('hg', children, { nr: g.nr }), sum };
  };

  const description = schedule.description ?? '';
  let gliederung: XmlNode;
  let lvSum: Sum;
  if (L === 2) {
    const { nodes, sum } = lgListe(roots, description);
    gliederung = el('gliederung-lg', nodes);
    lvSum = sum;
  } else if (L === 3) {
    const { node, sum } = ogListe(roots, description);
    gliederung = el('gliederung-og', [node]);
    lvSum = sum;
  } else {
    let sum = ZERO;
    const hgs = roots.map((g) => { const r = hgNode(g, description); sum = addSum(sum, r.sum); return r.node; });
    gliederung = el('gliederung-hg', [el('hg-liste', hgs)]);
    lvSum = sum;
  }

  if (foldedRegels > 0) warnings.push(`${foldedRegels} rekenregel(s) zijn in de eenheidsprijs van hun post opgegaan — A 2063 kent geen samenstelling per positie.`);
  if (truncated > 0) warnings.push(`${truncated} omschrijving(en) langer dan 60 tekens zijn in het stichwort ingekort; de volledige tekst staat in de langtext.`);
  if (unknownUnits > 0) warnings.push(`${unknownUnits} positie(s) met een eenheid die A 2063 niet kent zijn als Stk geëxporteerd.`);

  // ── Kop en kenndaten ──

  const validDate = (s: string | undefined): string | null => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
  const preisbasis = validDate(schedule.reportDate) ?? dateStr;
  const currency = /^[A-Z]{3}$/.test(schedule.currency ?? '') ? schedule.currency : 'EUR';
  const kenndaten = el('kenndaten', compact([
    text('lvcode', t60(schedule.projectNumber, 'OCS')),
    text('vorhaben', t60(schedule.projectName || schedule.name, 'Begroting')),
    text('lvbezeichnung', t60(schedule.name || schedule.projectName, 'Begroting')),
    el('auftraggeber', [el('firma', [text('name', t60(schedule.client, 'Unbekannt'))])]),
    schedule.author ? el('lversteller', [el('person', [text('nachname', t60(schedule.author, 'Unbekannt'))])]) : null,
    // Prijzen altijd als Lohn/Sonstiges (de standaardbenamingen, zonder preisanteilbez).
    el('preisanteilmodell', [el('preisanteile')]),
    text('wkz', currency),
    text('preisbasis', preisbasis),
  ]));

  const body: XmlNode[] = [kenndaten, gliederung];
  if (priced) {
    body.push(gruppensumme('lv-summe', lvSum));
    // Angebotspreis incl. USt: het btw-percentage van de staart, anders het Oostenrijkse normaaltarief.
    const btw = items.find((i) => i.rowType === 'staart_btw');
    const ustsatz = btw?.staartPercentage != null && btw.staartPercentage > 0 && btw.staartPercentage < 100 ? btw.staartPercentage : 20;
    const ustbetrag = round2(lvSum.gesamt * ustsatz / 100);
    body.push(el('summenormalausfuehrung', [
      text('summe-des-lv', money(lvSum.gesamt)),
      text('summe-nachlaesse', money(0)),
      text('gesamtpreis', money(lvSum.gesamt)),
      el('ust', [text('ustsatz', money(ustsatz)), text('ustbetrag', money(ustbetrag))]),
      text('angebotspreis', money(lvSum.gesamt + ustbetrag)),
    ]));
  }

  const baseName = oneLine(schedule.projectName || schedule.name) || 'begroting';
  const version = opts.version ?? (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0');
  const root: XmlNode = el('onlv', [
    el('metadaten', [
      text('erstelltam', isoDateTime(now)),
      text('dateiname', t60(opts.fileName ?? `${baseName}.onlv`, 'begroting.onlv')),
      text('programmsystem', 'Open Calc Studio'),
      text('programmversion', t60(version, '0')),
    ]),
    el('leistungsteiltabelle', [el('leistungsteil', [
      text('bezeichnung', 'Gesamte Leistung'),
      el('definition-preisanteil1', [el('festpreise')]),
      el('definition-preisanteil2', [el('festpreise')]),
    ], { nr: 1 })]),
    el('zugelassenenachlaesse', [el('aufsummen'), el('hierarchiestufen')]),
    el(lvType, body),
  ]);

  return { xml: buildXml(root, { xmlns: A2063_NAMESPACE, keepEmptyAttrs: true }), warnings, lvType };
}

/** Aansluiting op het gedeelde exporter-contract (Backstage). */
export function exportOnlv(input: ExportInput): ExportResult {
  const { xml, warnings } = buildOnlv(input.schedule, input.items);
  return { xml, format: 'onlv', warnings };
}
