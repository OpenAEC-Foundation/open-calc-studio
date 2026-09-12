/**
 * ÖNORM A 2063 importer — het Oostenrijkse uitwisselformaat voor
 * Leistungsbeschreibungen (.onlb) en Leistungsverzeichnisse (.onlv).
 *
 * Beide bestandstypen zijn XML (UTF-8) in de namespace
 * `http://www.oenorm.at/schema/A2063/<versie>`; de versies 2009-06-01,
 * 2015-07-15 en 2021-03-01 verschillen voor onze doeleinden niet in de
 * elementen die hier gelezen worden. Er wordt daarom namespace-onafhankelijk
 * op localName gematcht.
 *
 * Opbouw (onlv.xsd / onlb.xsd, gedeelde typen in ontypdef.xsd):
 *
 *   onlb  metadaten, lbkenndaten, …, svb, lg-liste/lg
 *   onlv  metadaten, header, <lv-art> { kenndaten, gliederung-hg|og|lg|posfrei, lv-summe }
 *
 *   gliederung-hg   hg-liste/hg → og-liste/og → lg-liste/lg → ulg-liste/ulg → positionen
 *   gliederung-og   og-liste/og → lg → ulg → positionen
 *   gliederung-lg   lg → ulg → positionen
 *   gliederung-posfrei  positionen/position[@nr]
 *
 *   positionen/grundtextnr[@nr]  ófwel ungeteilteposition(en) ófwel grundtext + folgeposition[@ftnr]
 *
 * Mapping naar OCS: hg/og/lg/ulg → hoofdstuk (code = nr, omschrijving =
 * ueberschrift, vorbemerkung → notities); positie → begrotingspost (code =
 * volledige Positionsnummer zoals `01.02.03A`, omschrijving = stichwort,
 * grundtext + langtext → notities, hoeveelheid = lvmenge, Lohn/Sonstiges →
 * loon-/materiaalprijs); wählbare Vorbemerkung (positie zonder einheit) →
 * tekstregel. Een Leistungsbuch kent geen hoeveelheden en prijzen: alle
 * posities krijgen hoeveelheid 0, zodat men eruit kan kiezen.
 *
 * De opgemaakte teksten (ontext.xsd, XHTML-achtig: p, br, b, i, u, sup, sub,
 * tt, h1-h3, ul/ol/li, table/tr/td) worden platte tekst; Lücken (al =
 * Ausschreiberlücke, bl/blo = Bieterlücke, rw = Rechenwert) worden `____` of,
 * als ze ingevuld zijn, hun inhoud.
 */
import { parseLiteXml, childElement, childElements, textContent, type XElement } from './liteXml';
import { makeCostItem } from './core';
import type { ImportResult, ImportWarningCode } from './types';
import type { CostItem, CostSchedule, CostUnit } from '@/types/costModel';

// ── Eenheden ────────────────────────────────────────────────────────────────

/**
 * ÖNORM-eenheden (einheit.type) met een 1-op-1-tegenhanger in OCS. De overige
 * uit de norm (cm, cm², cm³, l, g, VE) hebben die niet en blijven ongewijzigd
 * staan; de grid toont een afwijkende eenheid gewoon als extra keuze.
 */
const A2063_TO_OCS: Record<string, CostUnit> = {
  m: 'm', lfm: 'm', km: 'km',
  'm²': 'm²', m2: 'm²', 'm³': 'm³', m3: 'm³',
  kg: 'kg', t: 'ton',
  stk: 'st', st: 'st', stück: 'st',
  pa: 'post', psch: 'post', pausch: 'post',
  h: 'uur', std: 'uur', d: 'dgn', tag: 'dgn', wo: 'week', mo: 'mnd',
};

/** Zet een ÖNORM-eenheid om; geeft ook terug of er een tegenhanger was. */
export function a2063Unit(raw: string): { unit: CostUnit; known: boolean } {
  const s = raw.trim();
  if (!s) return { unit: 'st', known: true };
  const mapped = A2063_TO_OCS[s.toLowerCase()];
  if (mapped) return { unit: mapped, known: true };
  return { unit: s as CostUnit, known: false };
}

// ── Boom-hulpjes (namespace-onafhankelijk, alleen directe kinderen) ────────
//
// Het bestand wordt met `parseLiteXml` gelezen (geen DOM): de standaard-
// Leistungsbücher zijn 10 MB en tellen ruim 230.000 elementen; een volledige
// DOM met live collections kost daar seconden, de platte boom tienden.

const kids = childElements;
const kid = childElement;

const kidText = (el: XElement | null | undefined, name: string): string =>
  textContent(kid(el, name)).replace(/\s+/g, ' ').trim();

/** Eerste kind waarvan de naam op `suffix` eindigt (bv. `-lv`, `-liste`). */
const kidEndingWith = (el: XElement | null | undefined, suffix: string): XElement | null => {
  if (!el) return null;
  for (const c of el.children) if (typeof c !== 'string' && c.name.endsWith(suffix)) return c;
  return null;
};

const num = (s: string): number => {
  const n = parseFloat(s.trim());
  return Number.isFinite(n) ? n : 0;
};

// ── Opgemaakte tekst → platte tekst ─────────────────────────────────────────

const GAP = '____';

/**
 * Regels platte tekst uit een ontext-element (langtext, vorbemerkung,
 * kommentar). Blokelementen worden regels, `br` breekt een regel, `li` krijgt
 * "- ", tabelcellen worden met " | " gescheiden. Witruimte binnen een regel
 * wordt samengevouwen (de XML is ingesprongen); lege regels vervallen.
 */
export function a2063TextLines(el: XElement | null | undefined): string[] {
  if (!el) return [];
  const lines: string[] = [];
  let cur = '';
  const flush = (): void => {
    const t = cur.replace(/\s+/g, ' ').trim();
    if (t && t !== '-') lines.push(t);
    cur = '';
  };
  const visit = (node: XElement): void => {
    for (const child of node.children) {
      if (typeof child === 'string') { cur += child; continue; }
      switch (child.name) {
        case 'br':
          flush();
          break;
        case 'al': case 'bl': case 'blo': case 'rw': {
          const inner = textContent(child).replace(/\s+/g, ' ').trim();
          cur += inner || GAP;
          break;
        }
        case 'p': case 'h1': case 'h2': case 'h3': case 'ul': case 'ol': case 'table':
          flush(); visit(child); flush();
          break;
        case 'li':
          flush(); cur = '- '; visit(child); flush();
          break;
        case 'tr': {
          flush();
          const cells = kids(child, 'td').map((td) => a2063TextLines(td).join(' '));
          cur = cells.join(' | ');
          flush();
          break;
        }
        default:
          visit(child); // b, i, u, tt, sup, sub en onbekende inline-elementen
      }
    }
  };
  visit(el);
  flush();
  return lines;
}

export function a2063Text(el: XElement | null | undefined): string {
  return a2063TextLines(el).join('\n');
}

/** Bevat de tekst Lücken (al/bl/blo)? Rechenwerte (rw) tellen niet mee. */
const hasGaps = (el: XElement | null | undefined): boolean => {
  if (!el) return false;
  for (const c of el.children) {
    if (typeof c === 'string') continue;
    if (c.name === 'al' || c.name === 'bl' || c.name === 'blo' || hasGaps(c)) return true;
  }
  return false;
};

// ── Contactgegevens ─────────────────────────────────────────────────────────

/** Naam uit een kontakt.type (firma/name of person/nachname + vorname). */
function kontaktName(el: XElement | null): string {
  if (!el) return '';
  const firma = kid(el, 'firma');
  if (firma) return kidText(firma, 'name');
  const person = kid(el, 'person');
  if (person) return [kidText(person, 'vorname'), kidText(person, 'nachname')].filter(Boolean).join(' ');
  return '';
}

// ── Import ──────────────────────────────────────────────────────────────────

/** Markering in de notities voor posities die niet in de LV-som tellen. */
export const POSART_MARKERS = {
  eventual: 'Eventualposition (E) – zählt nicht zur LV-Summe',
  wahl: 'Wahlposition (W) – zählt nicht zur LV-Summe',
} as const;

interface Ctx {
  isLb: boolean;
  items: CostItem[];
  sort: number;
  warn: (code: string, text: string, params?: ImportWarningCode['params']) => void;
  unknownUnits: Set<string>;
  gapCount: number;
  optionalCount: number;
  /** Positie-totalen (afgerond op 2 decimalen, zoals pospreis) die meetellen in de LV-som. */
  countedTotal: number;
  posCount: number;
  priced: boolean;
}

export function importOnlv(xml: string): ImportResult {
  const root = parseLiteXml(xml);
  const rootName = root.name;
  if (rootName !== 'onlv' && rootName !== 'onlb') {
    throw new Error(`Geen ÖNORM A 2063-bestand: wortelelement <${rootName}> (verwacht <onlv> of <onlb>)`);
  }

  const warnings: string[] = [];
  const codes: ImportWarningCode[] = [];
  const ctx: Ctx = {
    isLb: rootName === 'onlb',
    items: [],
    sort: 0,
    warn: (code, text, params) => {
      warnings.push(text);
      codes.push(params ? { code, params } : { code });
    },
    unknownUnits: new Set(),
    gapCount: 0,
    optionalCount: 0,
    countedTotal: 0,
    posCount: 0,
    priced: false,
  };

  const add = (partial: Partial<CostItem> & { rowType: CostItem['rowType'] }): CostItem => {
    const item = makeCostItem({ sortOrder: ctx.sort++, ...partial });
    ctx.items.push(item);
    return item;
  };

  /** Hoofdstuk voor hg/og/lg/ulg; `eigenschaften` is het *-eigenschaften-element. */
  const addGroup = (parent: CostItem | null, nr: string, eigenschaften: XElement | null, depth: number): CostItem =>
    add({
      rowType: 'chapter',
      parentId: parent?.id ?? null,
      depth,
      code: nr,
      description: kidText(eigenschaften, 'ueberschrift') || nr,
      notes: a2063Text(kid(eigenschaften, 'vorbemerkung')),
    });

  /**
   * Eén positie of wählbare Vorbemerkung. `grundtextLines` is de tekst van
   * het bijbehorende grundtext (alleen bij folgepositionen).
   */
  const addPosition = (parent: CostItem | null, depth: number, code: string, eig: XElement | null, grundtextLines: string[]): void => {
    const stichwort = kidText(eig, 'stichwort')
      || [kidText(eig, 'stichwort-kurz'), kidText(eig, 'stichwort-luecke') || GAP].filter(Boolean).join(' ');
    const langtext = kid(eig, 'langtext');
    const textLines = a2063TextLines(langtext);
    const description = stichwort || textLines[0] || code;
    if (hasGaps(langtext)) ctx.gapCount++;
    const notesLines = [...grundtextLines, ...textLines];
    const einheit = kid(eig, 'einheit');

    if (!einheit) {
      // Wählbare Vorbemerkung: tekst zonder eenheid, hoeveelheid of prijs.
      add({
        rowType: 'tekstregel',
        parentId: parent?.id ?? null,
        depth,
        code,
        description,
        notes: notesLines.join('\n'),
      });
      return;
    }

    const einheitText = textContent(einheit);
    const { unit, known } = a2063Unit(einheitText);
    if (!known) ctx.unknownUnits.add(einheitText.trim());

    // Positionsart (pzzv): Wahl- en Eventualpositionen tellen in ÖNORM niet
    // mee in de LV-som. OCS kent geen "telt niet mee"-vlag op een post; de
    // hoeveelheid en prijs blijven staan (anders gaat informatie verloren),
    // de post wordt in de verrekenbaar-kolom 'N' en de notities beginnen
    // met de markering. De importmelding zegt erbij dat ons totaal ze wél
    // bevat. De exporter draait dit weer terug (zie onlvExporter).
    const pzzv = kid(eig, 'pzzv');
    const isEventual = !!kid(pzzv, 'eventualposition');
    const isWahl = !!kid(pzzv, 'wahlposition');
    const optional = isEventual || isWahl;
    if (optional) {
      ctx.optionalCount++;
      notesLines.unshift(isEventual ? POSART_MARKERS.eventual : POSART_MARKERS.wahl);
    }
    if (kidText(eig, 'wesentlicheposition') === 'W') notesLines.unshift('Wesentliche Position (W)');

    const quantity = ctx.isLb ? 0 : num(kidText(eig, 'lvmenge'));

    // Prijs/EH: preisanteil1 (Lohn) → loon, preisanteil2 (Sonstiges) →
    // materiaal; zonder preisanteile gaat `gesamt` als prijs/middel op de
    // post. Wijkt gesamt af van pa1 + pa2, dan vangt prijs/middel het
    // verschil op, zodat de eenheidsprijs altijd `gesamt` is.
    let laborPrice: number | null = null;
    let materialPrice: number | null = null;
    let normUnitPrice: number | null = null;
    const preis = kid(eig, 'preis');
    if (preis) {
      const gesamt = num(kidText(preis, 'gesamt'));
      const pa1 = kid(preis, 'preisanteil1');
      const pa2 = kid(preis, 'preisanteil2');
      if (pa1 || pa2) {
        laborPrice = num(textContent(pa1));
        materialPrice = num(textContent(pa2));
        const rest = gesamt - laborPrice - materialPrice;
        if (Math.abs(rest) >= 0.005) normUnitPrice = Math.round(rest * 100) / 100;
      } else {
        normUnitPrice = gesamt;
      }
      if (gesamt !== 0) ctx.priced = true;
      ctx.posCount++;
      if (!optional) ctx.countedTotal += Math.round(quantity * gesamt * 100) / 100;
    }

    add({
      rowType: 'begrotingspost',
      parentId: parent?.id ?? null,
      depth,
      code,
      description,
      unit,
      quantity,
      laborPrice,
      materialPrice,
      normUnitPrice,
      verrekenbaar: optional ? 'N' : null,
      notes: notesLines.join('\n'),
    });
  };

  /** Alle posities van een ulg (of van gliederung-posfrei). */
  const addPositionen = (parent: CostItem | null, depth: number, positionen: XElement | null, prefix: string): void => {
    for (const gt of kids(positionen, 'grundtextnr')) {
      const gtnr = gt.attrs.nr ?? '';
      const base = prefix ? `${prefix}.${gtnr}` : gtnr;
      const grundtext = kid(gt, 'grundtext');
      const grundtextLines = grundtext ? a2063TextLines(kid(grundtext, 'langtext')) : [];
      for (const pos of gt.children) {
        if (typeof pos === 'string') continue;
        if (pos.name === 'ungeteilteposition') {
          addPosition(parent, depth, base + (pos.attrs.mfv ?? ''), kid(pos, 'pos-eigenschaften'), []);
        } else if (pos.name === 'folgeposition') {
          const code = base + (pos.attrs.ftnr ?? '') + (pos.attrs.mfv ?? '');
          addPosition(parent, depth, code, kid(pos, 'pos-eigenschaften'), grundtextLines);
        }
      }
    }
    // LV zonder Gliederung: vrije positienummers.
    for (const pos of kids(positionen, 'position')) {
      addPosition(parent, depth, pos.attrs.nr ?? '', kid(pos, 'pos-eigenschaften'), []);
    }
  };

  const addUlgListe = (parent: CostItem | null, depth: number, ulgListe: XElement | null, prefix: string): void => {
    for (const ulg of kids(ulgListe, 'ulg')) {
      const nr = ulg.attrs.nr ?? '';
      const chapter = addGroup(parent, nr, kid(ulg, 'ulg-eigenschaften'), depth);
      addPositionen(chapter, depth + 1, kid(ulg, 'positionen'), prefix ? `${prefix}.${nr}` : nr);
    }
  };

  const addLgListe = (parent: CostItem | null, depth: number, lgListe: XElement | null, prefix: string): void => {
    for (const lg of kids(lgListe, 'lg')) {
      const nr = lg.attrs.nr ?? '';
      const chapter = addGroup(parent, nr, kid(lg, 'lg-eigenschaften'), depth);
      addUlgListe(chapter, depth + 1, kid(lg, 'ulg-liste'), prefix ? `${prefix}.${nr}` : nr);
    }
  };

  const addOgListe = (parent: CostItem | null, depth: number, ogListe: XElement | null, prefix: string): void => {
    for (const og of kids(ogListe, 'og')) {
      const nr = og.attrs.nr ?? '';
      const chapter = addGroup(parent, nr, kid(og, 'og-eigenschaften'), depth);
      addLgListe(chapter, depth + 1, kid(og, 'lg-liste'), prefix ? `${prefix}.${nr}` : nr);
    }
  };

  const addHgListe = (hgListe: XElement | null): void => {
    for (const hg of kids(hgListe, 'hg')) {
      const nr = hg.attrs.nr ?? '';
      const chapter = addGroup(null, nr, kid(hg, 'hg-eigenschaften'), 0);
      addOgListe(chapter, 1, kid(hg, 'og-liste'), nr);
    }
  };

  const schedule: Partial<CostSchedule> = {};

  if (ctx.isLb) {
    // ── Leistungsbuch ──
    const kenn = kid(root, 'lbkenndaten');
    const bezeichnung = kidText(kenn, 'bezeichnung');
    const kennung = kidText(kenn, 'lbkennung');
    const version = kidText(kenn, 'versionsnummer');
    schedule.name = bezeichnung || 'Leistungsbuch';
    schedule.projectName = bezeichnung || 'Leistungsbuch';
    schedule.projectNumber = [kennung, version].filter(Boolean).join('-');
    schedule.author = kontaktName(kid(kenn, 'herausgeber'));
    schedule.description = a2063Text(kid(kid(root, 'svb'), 'vorbemerkung'));
    addLgListe(null, 0, kid(root, 'lg-liste'), '');
    ctx.warn(
      'leistungsbuch',
      'Dit is een Leistungsbuch (catalogus van standaardteksten) zonder hoeveelheden en prijzen — alle posities zijn met hoeveelheid 0 geïmporteerd.',
    );
  } else {
    // ── Leistungsverzeichnis ──
    const lv = kidEndingWith(root, '-lv');
    if (!lv) throw new Error('ÖNORM A 2063: geen LV-element (entwurfs-lv, ausschreibungs-lv, …) gevonden');
    const kenn = kid(lv, 'kenndaten');
    const bezeichnung = kidText(kenn, 'lvbezeichnung');
    const vorhaben = kidText(kenn, 'vorhaben');
    schedule.name = bezeichnung || vorhaben || 'LV';
    schedule.projectName = vorhaben || bezeichnung || 'LV';
    schedule.projectNumber = kidText(kenn, 'lvcode');
    schedule.client = kontaktName(kid(kenn, 'auftraggeber'));
    schedule.author = kontaktName(kid(kenn, 'lversteller')) || kontaktName(kid(kenn, 'vergebendestelle'));
    schedule.predefinedType = lv.name === 'kostenschaetzungs-lv' ? 'ESTIMATE'
      : lv.name === 'ausschreibungs-lv' ? 'TENDER' : 'BUDGET';
    const wkz = kidText(kenn, 'wkz');
    if (/^[A-Z]{3}$/.test(wkz)) schedule.currency = wkz;

    const hg = kid(lv, 'gliederung-hg');
    const og = kid(lv, 'gliederung-og');
    const lg = kid(lv, 'gliederung-lg');
    const frei = kid(lv, 'gliederung-posfrei');

    // Ständige Vorbemerkung: bij gliederung-lg één voor het hele LV, bij
    // hg/og per og (lv-ogheader) — de eerste gaat als projectomschrijving mee.
    const firstOg = hg ? kid(kid(kid(kid(hg, 'hg-liste'), 'hg'), 'og-liste'), 'og') : kid(kid(og, 'og-liste'), 'og');
    const svb = kid(firstOg ?? lg, 'svb');
    schedule.description = a2063Text(kid(svb, 'vorbemerkung'));
    if (hg) addHgListe(kid(hg, 'hg-liste'));
    else if (og) addOgListe(null, 0, kid(og, 'og-liste'), '');
    else if (lg) addLgListe(null, 0, kid(lg, 'lg-liste'), '');
    else if (frei) addPositionen(null, 0, kid(frei, 'positionen'), '');

    // LV-som volgens het bestand vergelijken met de som van de posities die
    // meetellen (per positie afgerond op 2 decimalen, zoals pospreis).
    const lvSumme = kid(kid(kid(lv, 'lv-summe'), 'summe'), 'gesamt');
    if (lvSumme) {
      const file = num(textContent(lvSumme));
      const calculated = Math.round(ctx.countedTotal * 100) / 100;
      if (Math.abs(file - calculated) > 0.01) {
        const f = file.toFixed(2);
        const c = calculated.toFixed(2);
        ctx.warn(
          'sumMismatch',
          `De LV-som in het bestand (${f}) wijkt af van de berekende som van de posities (${c}).`,
          { file: f, calculated: c },
        );
      }
    }
    if (ctx.posCount === 0 || !ctx.priced) {
      ctx.warn(
        'noPrices',
        'Dit bestand bevat geen prijzen — alleen teksten en hoeveelheden (bv. een Ausschreibungs-LV). Het totaal blijft daarom 0,00.',
      );
    }
  }

  if (ctx.optionalCount > 0) {
    ctx.warn(
      'wahlEventual',
      `${ctx.optionalCount} Wahl-/Eventualposition(s) tellen in ÖNORM niet mee in de LV-som. Ze zijn mét hoeveelheid en prijs geïmporteerd, `
      + 'in de notities gemarkeerd en in de verrekenbaar-kolom op N gezet; het totaal hier bevat ze wél.',
      { count: ctx.optionalCount },
    );
  }
  if (ctx.unknownUnits.size > 0) {
    const examples = Array.from(ctx.unknownUnits).slice(0, 8).join(', ');
    ctx.warn(
      'unknownUnit',
      `${ctx.unknownUnits.size} eenheid/eenheden zonder tegenhanger zijn ongewijzigd overgenomen: ${examples}.`,
      { count: ctx.unknownUnits.size, examples },
    );
  }
  if (ctx.gapCount > 0) {
    ctx.warn(
      'luecken',
      `${ctx.gapCount} positie(s) bevatten in te vullen Lücken (Ausschreiber-/Bieterlücken); die staan als ${GAP} in de notities.`,
      { count: ctx.gapCount },
    );
  }

  return { schedule, items: ctx.items, warnings, warningCodes: codes, format: 'onlv' };
}

/**
 * Bytes → tekst. A 2063 schrijft UTF-8 voor; een BOM (UTF-8 of UTF-16) wordt
 * herkend en overgeslagen, zodat ook bestanden uit Windows-editors laden.
 */
export function decodeA2063(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (bytes.length >= 2 && ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff))) {
    return new TextDecoder(bytes[0] === 0xff ? 'utf-16le' : 'utf-16be').decode(buffer).replace(/^﻿/, '');
  }
  return new TextDecoder('utf-8').decode(buffer).replace(/^﻿/, '');
}

export function importOnlvFile(buffer: ArrayBuffer): ImportResult {
  return importOnlv(decodeA2063(buffer));
}
