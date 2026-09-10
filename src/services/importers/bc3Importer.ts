/**
 * FIEBDC-3 (.bc3) importer — het Spaanse uitwisselformaat voor
 * bouwbegrotingen en prijzenboeken (fiebdc.es).
 *
 * Tekstformaat: records beginnen met `~X|` (X = recordtype), velden worden
 * gescheiden door `|`, subvelden door `\`. Relevante records:
 *
 *   ~V  bestandskop (o.a. tekenset: ANSI / 850 / 437 / UTF-8)
 *   ~C  concept: code(s) | eenheid | omschrijving | prijs(zen) | datum | type
 *   ~D  decompositie: ouder | kind\factor\rendement\kind\factor\rendement…
 *   ~Y  idem, aanvullend (wordt samengevoegd met ~D)
 *   ~M  meting: pad-naar-kind | positie | totaal | detailregels | etiket
 *   ~N  idem, aanvullend
 *   ~T  omschrijvende tekst bij een concept
 *
 * Hiërarchie via code-suffix: `##` = wortel (project), `#` = hoofdstuk.
 * Mapping naar OCS: hoofdstuk → chapter, partida → begrotingspost (aantal uit
 * ~M), basisconcepten in de decompositie → rekenregels met
 * aantal = partida-meting, norm = factor × rendement en prijs/middel = de
 * conceptprijs. Type 1 → arbeid, 2 → materieel, 3 → materiaal.
 *
 * De praktijk wijkt op een aantal punten af van de specificatie; zie de
 * opmerkingen bij `keyOf`, `isContainer`, `decodeBc3` en de variantafhandeling.
 */
import { makeCostItem, parseNumber, normalizeUnit, genId } from './core';
import { decodeCp850 } from './dncImporter';
import type { ImportResult } from './types';
import type { CostItem, CostUnit, ResourceType } from '@/types/costModel';

// ── Recordmodel ─────────────────────────────────────────────────────────────

interface Bc3Child {
  key: string;
  factor: number;
  yield_: number;
}

interface Bc3Concept {
  code: string;          // canonieke code (eerste uit ~C, incl. eventuele #'s)
  key: string;           // lookup-key: zonder #-suffix, uppercase
  unit: string;
  summary: string;
  price: number;
  type: string;          // '0'..'5', '%' of leeg
  isRoot: boolean;
  isChapter: boolean;
  isPercentage: boolean;       // code bevat % (mogelijk een opslag)
  explicitPercentage: boolean; // TIPO = % of UNIDAD = % — dan staat het vast
  text?: string;         // ~T
  children: Bc3Child[];  // ~D + ~Y
  stub: boolean;         // aangemaakt door een vooruitverwijzing uit ~D/~Y/~T
}

interface Bc3Data {
  /**
   * Per code alle concepten met die code, in declaratievolgorde. Meestal één,
   * maar sommige exporteurs (o.a. oudere FIEBDC-3/95-schrijvers) hergebruiken
   * een hoofdstukcode voor twee verschillende hoofdstukken en onderscheiden ze
   * uitsluitend op volgorde binnen de decompositie van de ouder.
   */
  variants: Map<string, Bc3Concept[]>;
  order: Bc3Concept[];                 // alle concepten in declaratievolgorde
  measurements: Map<string, number>;   // "ouder::kind" of "kind" → totaal
  warnings: string[];
}

/**
 * Lookup-key voor een concept-code. Let op de volgorde: eerst witruimte weg,
 * dán de #-suffix. Presto/Arquímedes breken lange records af met CRLF vlak
 * vóór een scheidingsteken (`~D|WORTEL##\r\n|KIND#\1\1\|`), waardoor de code
 * met een newline eindigt en `#+$` anders niet zou aanslaan.
 */
const keyOf = (code: string): string => code.trim().replace(/#+$/, '').trim().toUpperCase();

/** Spaanse eenheden die normalizeUnit niet kent. */
const BC3_UNITS: Record<string, CostUnit> = {
  ud: 'st', u: 'st', un: 'st', ml: 'm', pa: 'post', mes: 'mnd', h: 'uur',
};
function bc3Unit(raw: string): CostUnit {
  const s = raw.trim().toLowerCase();
  return BC3_UNITS[s] ?? normalizeUnit(raw);
}

const RESOURCE_BY_TYPE: Record<string, ResourceType> = {
  '1': 'arbeid',       // mano de obra
  '2': 'materieel',    // maquinaria y medios auxiliares
  '3': 'materiaal',    // materiales
};

// ── Parser ──────────────────────────────────────────────────────────────────

function parseBc3(text: string): Bc3Data {
  const data: Bc3Data = {
    variants: new Map(),
    order: [],
    measurements: new Map(),
    warnings: [],
  };

  const variantsOf = (key: string): Bc3Concept[] => {
    const list = data.variants.get(key);
    if (list) return list;
    const fresh: Bc3Concept[] = [];
    data.variants.set(key, fresh);
    return fresh;
  };

  /**
   * Het concept waar een ~D/~Y/~T-record bij hoort: de laatst gedeclareerde
   * variant van die code. Zo blijven de twee decomposities van een dubbel
   * gebruikte hoofdstukcode netjes bij hun eigen ~C-record.
   */
  const targetFor = (key: string): Bc3Concept => {
    const list = variantsOf(key);
    const last = list[list.length - 1];
    if (last) return last;
    const stub: Bc3Concept = {
      code: key, key, unit: '', summary: '', price: 0, type: '',
      isRoot: false, isChapter: false, isPercentage: false, explicitPercentage: false,
      children: [], stub: true,
    };
    list.push(stub);
    data.order.push(stub);
    return stub;
  };

  // Records: alles tussen twee tildes. `~` is verboden binnen velden, dus een
  // platte split is veilig; regeleinden binnen een record horen bij de inhoud.
  const chunks = text.replace(/^﻿/, '').split('~');
  for (const chunk of chunks) {
    const type = chunk.charAt(0);
    if (!type || chunk.charAt(1) !== '|') continue;
    const fields = chunk.slice(2).split('|');

    switch (type) {
      case 'C': {
        const codes = (fields[0] ?? '').split('\\').map((c) => c.trim()).filter(Boolean);
        if (codes.length === 0) break;
        const code = codes[0];
        const key = keyOf(code);
        const priceRaw = (fields[3] ?? '').split('\\')[0] ?? '';
        const conceptType = (fields[5] ?? '').trim();
        const values = {
          code,
          key,
          unit: (fields[1] ?? '').trim(),
          summary: (fields[2] ?? '').trim(),
          price: parseNumber(priceRaw),
          type: conceptType,
          isRoot: /##\s*$/.test(code),
          isChapter: /(^|[^#])#\s*$/.test(code),
          isPercentage: code.includes('%') || conceptType === '%' || (fields[1] ?? '').trim() === '%',
          explicitPercentage: conceptType === '%' || (fields[1] ?? '').trim() === '%',
          stub: false,
        };
        const list = variantsOf(key);
        const pending = list.length === 1 && list[0].stub ? list[0] : undefined;
        let concept: Bc3Concept;
        if (pending) {
          // Vooruitverwijzing: de al verzamelde kinderen/tekst blijven staan.
          Object.assign(pending, values);
          concept = pending;
        } else {
          concept = { ...values, children: [] };
          list.push(concept);
          data.order.push(concept);
        }
        // Alle codes (aliassen) verwijzen naar hetzelfde concept.
        for (const alias of codes.slice(1)) {
          const aliasKey = keyOf(alias);
          if (variantsOf(aliasKey).length === 0) variantsOf(aliasKey).push(concept);
        }
        break;
      }
      case 'D':
      case 'Y': {
        const parentKey = keyOf(fields[0] ?? '');
        if (!parentKey) break;
        const parts = (fields[1] ?? '').split('\\');
        const parent = targetFor(parentKey);
        for (let i = 0; i < parts.length; i += 3) {
          const code = (parts[i] ?? '').trim();
          if (!code) continue;
          const factorRaw = (parts[i + 1] ?? '').trim();
          const yieldRaw = (parts[i + 2] ?? '').trim();
          parent.children.push({
            key: keyOf(code),
            factor: factorRaw ? parseNumber(factorRaw) : 1,
            yield_: yieldRaw ? parseNumber(yieldRaw) : 1,
          });
        }
        break;
      }
      case 'M':
      case 'N': {
        // Veld 1 is het volledige pad vanaf de wortel; alleen de laatste twee
        // schakels (ouder en kind) doen ertoe. Veld 2 is de positie in de
        // begroting: de laatste schakel daarvan is de 1-gebaseerde plek van
        // dit kind in de decompositie van de ouder. Dat onderscheid is nodig,
        // want dezelfde partida mag twee keer in hetzelfde hoofdstuk staan,
        // elke keer met een eigen meting.
        const ref = (fields[0] ?? '').split('\\').map((c) => keyOf(c)).filter(Boolean);
        const childKey = ref[ref.length - 1];
        if (!childKey) break;
        const total = parseNumber(fields[2] ?? '');
        const parentKey = ref.length > 1 ? ref[ref.length - 2] : '';
        const pos = (fields[1] ?? '').split('\\').map((p) => p.trim()).filter(Boolean);
        const index = pos.length > 0 ? Number.parseInt(pos[pos.length - 1], 10) : Number.NaN;
        const bump = (k: string): void => {
          data.measurements.set(k, (data.measurements.get(k) ?? 0) + total);
        };
        if (!parentKey) {
          bump(childKey);
          break;
        }
        if (pos.length > 0) bump(`#${pos.join('.')}`);
        if (Number.isFinite(index)) bump(`${parentKey}::${childKey}::${index}`);
        bump(`${parentKey}::${childKey}`);
        // Fallback zonder ouder — alleen zetten als er nog niets staat.
        if (!data.measurements.has(childKey)) data.measurements.set(childKey, total);
        break;
      }
      case 'T': {
        const key = keyOf(fields[0] ?? '');
        if (!key) break;
        const list = data.variants.get(key);
        const concept = list?.[list.length - 1];
        if (concept) {
          const txt = (fields[1] ?? '').trim();
          concept.text = concept.text ? `${concept.text}\n${txt}` : txt;
        }
        break;
      }
      default:
        break; // ~V/~K/~P/~X en overige records hebben geen mapping nodig
    }
  }
  return data;
}

// ── Mapping naar het OCS-kostenmodel ────────────────────────────────────────

export function importBc3(text: string): ImportResult {
  const data = parseBc3(text);
  const { variants, order, measurements, warnings } = data;
  const items: CostItem[] = [];
  let sort = 0;

  const add = (partial: Partial<CostItem> & { rowType: CostItem['rowType'] }): CostItem => {
    const item = makeCostItem({ sortOrder: sort++, ...partial });
    items.push(item);
    return item;
  };

  /**
   * Zoek het concept achter een verwijzing. Bij dubbel gebruikte codes worden
   * de varianten in volgorde van verschijnen uitgedeeld; bij unieke codes
   * (verreweg het meest) telt de teller niet mee.
   */
  const used = new Map<string, number>();
  const resolve = (key: string): Bc3Concept | undefined => {
    const list = variants.get(key);
    if (!list || list.length === 0) return undefined;
    if (list.length === 1) return list[0];
    const n = used.get(key) ?? 0;
    used.set(key, n + 1);
    return list[Math.min(n, list.length - 1)];
  };

  const childKeys = new Set<string>();
  for (const c of order) for (const ch of c.children) childKeys.add(ch.key);

  const firstOf = (key: string): Bc3Concept | undefined => variants.get(key)?.[0];

  /**
   * Concepten met een code die met `%` begint zijn meestal opslagen: hun
   * rendement is een percentage over de som van de voorgaande regels. Maar
   * niet altijd — sommige exporteurs gebruiken `%…` gewoon als codeprefix en
   * rekenen rendement × prijs. Alleen `TIPO = %` of `UNIDAD = %` is een harde
   * markering; in de overige gevallen wordt per concept uitgeprobeerd welke
   * lezing de prijzen op de ~C-records van de gebruikende partida's het beste
   * reproduceert.
   */
  const percentageKeys = new Set<string>();
  {
    const votes = new Map<string, { pct: number; flat: number }>();
    for (const parent of order) {
      if (parent.children.length === 0) continue;
      const marked = parent.children.filter((ch) => firstOf(ch.key)?.isPercentage);
      if (marked.length !== 1) continue;
      const only = marked[0];
      const c = firstOf(only.key);
      if (!c || c.explicitPercentage) continue;
      if (!Number.isFinite(parent.price) || Math.abs(parent.price) < 0.005) continue;
      let base = 0;
      for (const ch of parent.children) {
        if (ch === only) continue;
        const sub = firstOf(ch.key);
        if (!sub || sub.isPercentage) { base = NaN; break; }
        base += ch.factor * ch.yield_ * sub.price;
      }
      if (!Number.isFinite(base) || base === 0) continue;
      const rend = only.factor * only.yield_;
      const asPct = Math.abs(base * (1 + (Math.abs(rend) >= 1 ? rend / 100 : rend)) - parent.price);
      const asFlat = Math.abs(base + rend * c.price - parent.price);
      const v = votes.get(only.key) ?? { pct: 0, flat: 0 };
      if (asPct < asFlat) v.pct++;
      else if (asFlat < asPct) v.flat++;
      votes.set(only.key, v);
    }
    for (const c of order) {
      if (!c.isPercentage) continue;
      if (c.explicitPercentage) { percentageKeys.add(c.key); continue; }
      const v = votes.get(c.key);
      const prefixed = c.code.startsWith('%');
      if (v ? v.pct > v.flat || (v.pct === v.flat && prefixed) : prefixed) percentageKeys.add(c.key);
    }
  }
  const isPercentageRow = (c: Bc3Concept): boolean => c.isPercentage && percentageKeys.has(c.key);

  /**
   * Is dit concept een (sub)hoofdstuk? De #-suffix is de officiële markering,
   * maar oudere exporteurs laten hem op subhoofdstukken weg. Een hoofdstuk
   * heeft dan geen eenheid en wél een decompositie; een partida of
   * basisconcept heeft altijd een eenheid.
   */
  const isContainer = (c: Bc3Concept): boolean => {
    if (c.isChapter) return true;
    if (c.unit || c.isPercentage || RESOURCE_BY_TYPE[c.type]) return false;
    return c.children.length > 0;
  };

  const measurementFor = (path: number[], parentKey: string, childKey: string, index: number, fallback: number): number =>
    measurements.get(`#${path.join('.')}`)
    ?? measurements.get(`${parentKey}::${childKey}::${index}`)
    ?? measurements.get(`${parentKey}::${childKey}`)
    ?? measurements.get(childKey)
    ?? fallback;

  /**
   * Rekenregels onder een begrotingspost. Geeft de kostprijs per eenheid van
   * de partida terug, zodat de aanroeper die kan vergelijken met de prijs op
   * het ~C-record.
   */
  const addRegels = (post: CostItem, parent: Bc3Concept, postQty: number, depth: number): number => {
    let unitCost = 0;
    for (const ch of parent.children) {
      const c = resolve(ch.key);
      if (!c) {
        warnings.push(`Onbekend concept '${ch.key}' in decompositie van '${parent.code}' — overgeslagen.`);
        continue;
      }
      if (isPercentageRow(c)) {
        // Percentageregel: het rendement is een percentage over de som van de
        // voorgaande regels, niet een hoeveelheid maal een prijs. Sommige
        // schrijvers noteren 3 in plaats van 0,03.
        const raw = ch.factor * ch.yield_;
        const pct = Math.abs(raw) >= 1 ? raw / 100 : raw;
        add({
          rowType: 'regel',
          parentId: post.id,
          depth,
          code: c.code,
          description: c.summary || c.code,
          unit: 'post',
          quantity: postQty,
          normQuantity: pct,
          normFactor: 1,
          normUnitPrice: unitCost,
          resourceType: 'overig',
          notes: c.text ?? '',
        });
        unitCost += unitCost * pct;
        continue;
      }
      const norm = ch.factor * ch.yield_;
      unitCost += norm * c.price;
      add({
        rowType: 'regel',
        parentId: post.id,
        depth,
        code: c.code,
        description: c.summary || c.code,
        unit: bc3Unit(c.unit),
        quantity: postQty,
        normQuantity: norm,
        normFactor: 1,
        normUnitPrice: c.price,
        resourceType: RESOURCE_BY_TYPE[c.type] ?? 'materiaal',
        notes: c.text ?? '',
      });
    }
    return unitCost;
  };

  /** Partida's waarvan de samenstelling niet op de eigen eenheidsprijs uitkomt. */
  const mismatched: string[] = [];

  /** Eén knoop: hoofdstuk (recursief) of begrotingspost met rekenregels. */
  const emit = (parentItem: CostItem | null, parentKey: string, c: Bc3Concept, ch: Bc3Child | null, path: number[], depth: number): void => {
    if (isContainer(c)) {
      const chapter = add({
        rowType: 'chapter',
        parentId: parentItem?.id ?? null,
        depth,
        code: c.code.replace(/#+$/, ''),
        description: c.summary || c.code,
        notes: c.text ?? '',
      });
      addBranch(chapter, c, path, depth + 1);
      return;
    }
    // Partida (begrotingspost): aantal uit ~M, anders het rendement.
    const fallbackQty = ch ? ch.factor * ch.yield_ || 1 : 1;
    const qty = measurementFor(path, parentKey, c.key, path[path.length - 1] ?? 1, fallbackQty);
    const post = add({
      rowType: 'begrotingspost',
      parentId: parentItem?.id ?? null,
      depth,
      code: c.code,
      description: c.summary || c.code,
      unit: bc3Unit(c.unit),
      quantity: qty,
      normUnitPrice: c.children.length > 0 ? null : c.price,
      notes: c.text ?? '',
    });
    if (c.children.length === 0) return;

    const first = items.length;
    const unitCost = addRegels(post, c, qty, depth + 1);
    // Sommige exporteurs schrijven wel de samenstelling maar laten alle
    // rendementen op 0 staan. Dan is de prijs op het ~C-record de enige
    // bruikbare bron en gaat de lege decompositie eruit.
    if (Math.abs(unitCost) < 0.005 && Math.abs(c.price) >= 0.005) {
      items.length = first;
      post.normUnitPrice = c.price;
      warnings.push('Eén of meer partida\'s hebben een samenstelling zonder rendementen — daar is de eenheidsprijs van het ~C-record aangehouden.');
      return;
    }
    // Prijs op het ~C-record en de som van de samenstelling horen gelijk te
    // zijn. Staat er iets anders, dan is het bestand intern inconsistent
    // (verouderde prijzen); wij rekenen bottom-up en melden het.
    if (Math.abs(c.price) >= 0.005 && Math.abs(unitCost - c.price) / Math.abs(c.price) > 0.02) {
      mismatched.push(c.code);
    }
  };

  function addBranch(parentItem: CostItem | null, parent: Bc3Concept, path: number[], depth: number): void {
    parent.children.forEach((ch, i) => {
      const c = resolve(ch.key);
      if (!c) {
        warnings.push(`Onbekend concept '${ch.key}' onder '${parent.code}' — overgeslagen.`);
        return;
      }
      emit(parentItem, parent.key, c, ch, [...path, i + 1], depth);
    });
  }

  // Wortel: concept met ##-suffix, mits het een decompositie heeft.
  const all = order;
  const root = all.find((c) => c.isRoot && c.children.length > 0)
    ?? all.find((c) => !childKeys.has(c.key) && c.children.length > 0 && isContainer(c));
  const titleConcept = all.find((c) => c.isRoot) ?? root;

  if (root) {
    addBranch(null, root, [], 0);
  } else {
    // Losse takken: geen wortel, maar wel concepten met een samenstelling die
    // nergens als kind voorkomen. Anders: een prijzenboek zonder structuur.
    const tops = all.filter((c) => !childKeys.has(c.key) && c.children.length > 0 && !c.isRoot);
    if (tops.length > 0) {
      warnings.push('Geen wortelstructuur (##) met samenstelling gevonden — losse takken op het hoogste niveau geïmporteerd.');
      tops.forEach((c, i) => emit(null, '', c, null, [i + 1], 0));
    } else {
      warnings.push('Geen projectstructuur (##/#) gevonden — concepten als prijzenboek onder één hoofdstuk geïmporteerd.');
      const chapter = add({ rowType: 'chapter', parentId: null, depth: 0, code: '01', description: 'Prijzenboek', id: genId() });
      for (const c of all) {
        if (c.isRoot) continue;
        add({
          rowType: 'begrotingspost',
          parentId: chapter.id,
          depth: 1,
          code: c.code,
          description: c.summary || c.code,
          unit: bc3Unit(c.unit),
          quantity: 1,
          normUnitPrice: c.price,
          notes: c.text ?? '',
        });
      }
    }
  }

  if (mismatched.length > 0) {
    warnings.push(
      `Bij ${mismatched.length} partida('s) wijkt de som van de samenstelling meer dan 2% af van de eenheidsprijs op het ~C-record `
      + `(o.a. ${mismatched.slice(0, 5).join(', ')}). De samenstelling is aangehouden.`,
    );
  }

  // Een prijsloze import (bv. een "biblioteca de mediciones": posten mét
  // hoeveelheden maar zónder prijzen) levert anders zwijgend € 0 op. Zeg dat
  // erbij, anders lijkt de import mislukt.
  if (items.length > 0 && items.every((i) => (i.normUnitPrice ?? 0) === 0 && (i.unitPrice ?? 0) === 0)) {
    warnings.push(
      'Dit bestand bevat geen prijzen — alleen omschrijvingen en hoeveelheden '
      + '(zoals een mediciones-bibliotheek). Het totaal blijft daarom € 0,00.',
    );
  }

  // Waarschuwingen ontdubbelen: één regel per soort probleem is genoeg.
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const w of warnings) {
    if (seen.has(w)) continue;
    seen.add(w);
    unique.push(w);
  }
  const capped = unique.length > 50
    ? [...unique.slice(0, 50), `… en nog ${unique.length - 50} vergelijkbare meldingen.`]
    : unique;

  return {
    schedule: {
      name: titleConcept?.summary || 'BC3-import',
      projectName: titleConcept?.summary || 'BC3-import',
      description: titleConcept?.text ?? '',
    },
    items,
    warnings: capped,
    format: 'bc3',
  };
}

// ── Bestandsdecodering (tekenset uit ~V) ────────────────────────────────────

/**
 * Is dit een geldige UTF-8-stroom met minstens één multibyte-teken?
 * Zo ja, dan is de kans op toeval verwaarloosbaar en is het bestand UTF-8 —
 * ook als het ~V-record iets anders beweert (Presto 22 schrijft UTF-8 maar
 * zet er "ANSI" boven).
 */
function looksLikeUtf8(bytes: Uint8Array): boolean {
  let multibyte = false;
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i];
    if (b < 0x80) { i++; continue; }
    let n: number;
    if (b >= 0xc2 && b <= 0xdf) n = 1;
    else if (b >= 0xe0 && b <= 0xef) n = 2;
    else if (b >= 0xf0 && b <= 0xf4) n = 3;
    else return false;
    if (i + n > bytes.length - 1) return false;
    for (let k = 1; k <= n; k++) {
      const c = bytes[i + k];
      if (c < 0x80 || c > 0xbf) return false;
    }
    multibyte = true;
    i += n + 1;
  }
  return multibyte;
}

/**
 * Decodeer een .bc3-bestand met de tekenset uit het ~V-record:
 * "ANSI" → Windows-1252 (default), "850"/"437"/"OEM"/"DOS" → DOS-codepagina,
 * "UTF-8" → UTF-8. Een BOM of een sluitende UTF-8-analyse wint van de
 * declaratie, want die klopt in de praktijk lang niet altijd.
 */
export function decodeBc3(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }
  const ansi = new TextDecoder('windows-1252').decode(bytes);
  // Tekenset staat in ~V veld 5 (1-based na het recordtype).
  const v = /~V\|([^~]*)/.exec(ansi);
  const charset = v ? (v[1].split('|')[4] ?? '').trim().toUpperCase().replace(/[\s-]/g, '') : '';
  if (charset === 'UTF8') return new TextDecoder('utf-8').decode(bytes);
  if (looksLikeUtf8(bytes)) return new TextDecoder('utf-8').decode(bytes);
  if (charset === '850' || charset === '437' || charset === 'OEM' || charset === 'DOS') {
    return decodeCp850(bytes, 0, bytes.length);
  }
  // FIEBDC-3/95 en /98 kennen het tekensetveld nog niet en zijn in de praktijk
  // DOS-gecodeerd. Zonder declaratie: tellen welke codepagina Spaanse
  // klinkers oplevert. In CP850 zitten á í ó ú ñ é op 0x80-0xA5, in
  // Windows-1252 op 0xC0-0xFF; die bereiken sluiten elkaar praktisch uit.
  if (!charset) {
    let dos = 0;
    let win = 0;
    for (const b of bytes) {
      if (b >= 0x80 && b <= 0xa5) dos++;
      else if (b >= 0xc0) win++;
    }
    if (dos > win) return decodeCp850(bytes, 0, bytes.length);
  }
  return ansi;
}

export function importBc3File(buffer: ArrayBuffer): ImportResult {
  return importBc3(decodeBc3(buffer));
}
