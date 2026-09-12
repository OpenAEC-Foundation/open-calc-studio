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
import { decodeWindows1252 } from './windows1252';
import type { ImportResult, ImportWarningCode } from './types';
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
  measurements: Map<string, number>;   // "#pad", "ouder::kind::positie", "ouder::kind" of "*::kind" → totaal
  measured: Set<string>;               // kind-keys waarvoor een ~M/~N bestaat
}

/**
 * Lookup-key voor een concept-code. Let op de volgorde: eerst witruimte weg,
 * dán de #-suffix. Sommige exporteurs breken lange records af met CRLF vlak
 * vóór een scheidingsteken (`~D|WORTEL##\r\n|KIND#\1\1\|`), waardoor de code
 * met een newline eindigt en `#+$` anders niet zou aanslaan.
 */
const keyOf = (code: string): string => code.trim().replace(/#+$/, '').trim().toUpperCase();

/**
 * Code zoals hij in de begroting komt: zonder de #-markering. Die is in BC3
 * een structuurteken (## wortel, # hoofdstuk), geen deel van de code — en
 * sommige prijzenbanken zetten hem ook op een partida of middel (BCCA
 * `18CPI000301#`, eenheid `u`).
 */
const plainCode = (code: string): string => code.trim().replace(/#+$/, '').trim();

/** Lengte waarop een uit ~T afgeleide omschrijving wordt afgekapt (zie `summaryOf`). */
const SUMMARY_MAX = 120;

/** Spaanse eenheden die normalizeUnit niet kent (na verwijdering van een slotpunt). */
const BC3_UNITS: Record<string, CostUnit> = {
  ud: 'st', u: 'st', un: 'st', ut: 'st', ml: 'm', pa: 'post', mes: 'mnd',
  h: 'uur', hr: 'uur', t: 'ton', tn: 'ton', tm: 'ton', d: 'dgn',
};
function bc3Unit(raw: string): CostUnit {
  const s = raw.trim().toLowerCase().replace(/\.+$/, '');
  return BC3_UNITS[s] ?? normalizeUnit(s);
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
    measured: new Set(),
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
          // Sommige schrijvers laten een regeleinde in de korte omschrijving
          // staan; de omschrijving is bij ons één regel.
          summary: (fields[2] ?? '').replace(/\s*\r?\n\s*/g, ' ').trim(),
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
        data.measured.add(childKey);
        if (!parentKey) {
          // Meting zonder pad: hoort bij elk voorkomen van dit concept.
          bump(`*::${childKey}`);
          break;
        }
        if (pos.length > 0) bump(`#${pos.join('.')}`);
        if (Number.isFinite(index)) bump(`${parentKey}::${childKey}::${index}`);
        bump(`${parentKey}::${childKey}`);
        // Géén terugval op alleen de kindcode: een partida die in twee
        // hoofdstukken staat en maar in één daarvan een ~M heeft, zou anders
        // in het andere hoofdstuk de meting van het eerste krijgen, terwijl
        // het bestand daar het rendement in de ~D als hoeveelheid bedoelt
        // (Arquímedes schrijft alleen ~M voor posten met meetregels).
        break;
      }
      case 'T': {
        const key = keyOf(fields[0] ?? '');
        if (!key) break;
        const list = data.variants.get(key);
        const concept = list?.[list.length - 1];
        if (concept) {
          // Regeleinden in de tekst blijven staan, maar als LF: zo komt het
          // in de notities zoals de rest van de app ze schrijft.
          const txt = (fields[1] ?? '').replace(/\r\n?/g, '\n').trim();
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
  const { variants, order, measurements, measured } = data;
  const items: CostItem[] = [];

  /**
   * Meldingen komen in twee vormen: de Nederlandse tekst in `warnings` (die
   * blijft de terugval en wordt door bestaande tests gecontroleerd) en een
   * code met parameters in `codes`, zodat de UI hem in de taal van de
   * gebruiker kan tonen (`dialogs:importWarnings.bc3.<code>`). Beide lijsten
   * lopen index-voor-index gelijk.
   */
  const warnings: string[] = [];
  const codes: ImportWarningCode[] = [];
  const warn = (code: string, text: string, params?: ImportWarningCode['params']): void => {
    warnings.push(text);
    codes.push(params ? { code, params } : { code });
  };
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
   * Omschrijving van een concept. Sommige schrijvers (Presto 11, ARPO) laten
   * de korte omschrijving in ~C leeg en zetten alles in ~T; in het raster zou
   * dan de code als omschrijving verschijnen. Dan is de eerste regel van die
   * tekst de omschrijving — afgekapt op een woordgrens rond SUMMARY_MAX
   * tekens — en blijft de volledige tekst in de notities. Zonder tekst: de
   * code. Een export schrijft die afgeleide omschrijving in ~C, zodat een
   * herimport dezelfde omschrijving oplevert.
   */
  const summaryOf = (c: Bc3Concept): string => {
    if (c.summary) return c.summary;
    const line = (c.text ?? '').split('\n').map((s) => s.trim()).find(Boolean) ?? '';
    if (!line) return c.code;
    if (line.length <= SUMMARY_MAX) return line;
    const cut = line.slice(0, SUMMARY_MAX);
    const space = cut.lastIndexOf(' ');
    return `${(space > SUMMARY_MAX / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
  };

  /**
   * Percentage als fractie: sommige schrijvers noteren 3 in plaats van 0,03.
   */
  const asFraction = (rend: number): number => (Math.abs(rend) >= 1 ? rend / 100 : rend);

  /**
   * TCQ/BEDEC-conventie: een `A%…`-concept "despeses auxiliars" is een opslag
   * over de arbeid in de samenstelling, niet over alle voorgaande regels.
   * De ~C-prijzen van de partida's in zulke bestanden reproduceren alleen
   * met die lezing (op de indirecte kosten na, die TCQ buiten het bestand
   * houdt).
   */
  const labourOnly = (c: Bc3Concept): boolean => /^A%/i.test(c.code.trim()) && /auxiliar/i.test(c.summary);

  /**
   * Concepten met een code die met `%` begint zijn meestal opslagen: hun
   * rendement is een percentage over de som van de voorgaande regels. Maar
   * niet altijd — sommige exporteurs gebruiken `%…` gewoon als codeprefix en
   * rekenen rendement × prijs. `TIPO = %` is een harde markering, net als
   * `UNIDAD = %` zonder prijs; een concept met `UNIDAD = %` én een prijs
   * (Presto 7: `03.284|%|Pruebas|2.5` met rendement 0,025) rekende het
   * bronprogramma soms tóch als prijs × rendement. Daarom wordt per concept
   * uitgeprobeerd welke lezing de prijzen op de ~C-records van de gebruikende
   * partida's het beste reproduceert; andere opslagregels in dezelfde
   * samenstelling houden daarbij hun voor de hand liggende lezing.
   */
  const percentageKeys = new Set<string>();
  {
    const hard = (c: Bc3Concept): boolean => c.type === '%' || (c.explicitPercentage && Math.abs(c.price) < 0.005);
    const assumed = (c: Bc3Concept): boolean => hard(c) || c.explicitPercentage || c.code.startsWith('%');
    /** Prijs van een samenstelling waarin `subject` als percentage (of niet) wordt gelezen. */
    const priceWith = (parent: Bc3Concept, subject: Bc3Child, subjectAsPct: boolean): number => {
      let cumul = 0;
      let labour = 0;
      for (const ch of parent.children) {
        const sub = firstOf(ch.key);
        if (!sub) return NaN;
        const rend = ch.factor * ch.yield_;
        const pct = sub.isPercentage && (ch === subject ? subjectAsPct : assumed(sub));
        if (pct) {
          cumul += (labourOnly(sub) ? labour : cumul) * asFraction(rend);
        } else {
          const amount = rend * sub.price;
          cumul += amount;
          if (sub.type === '1') labour += amount;
        }
      }
      return cumul;
    };
    const votes = new Map<string, { pct: number; flat: number }>();
    for (const parent of order) {
      if (parent.children.length === 0) continue;
      if (!Number.isFinite(parent.price) || Math.abs(parent.price) < 0.005) continue;
      for (const ch of parent.children) {
        const c = firstOf(ch.key);
        if (!c || !c.isPercentage || hard(c)) continue;
        const pctPrice = priceWith(parent, ch, true);
        // Zonder grondslag (alle rendementen 0, zie zeroYieldDecomposition)
        // zegt de vergelijking niets.
        if (!Number.isFinite(pctPrice) || Math.abs(pctPrice) < 0.005) continue;
        const asPct = Math.abs(pctPrice - parent.price);
        const asFlat = Math.abs(priceWith(parent, ch, false) - parent.price);
        if (!Number.isFinite(asFlat)) continue;
        const v = votes.get(ch.key) ?? { pct: 0, flat: 0 };
        if (asPct < asFlat) v.pct++;
        else if (asFlat < asPct) v.flat++;
        votes.set(ch.key, v);
      }
    }
    for (const c of order) {
      if (!c.isPercentage) continue;
      if (hard(c)) { percentageKeys.add(c.key); continue; }
      const v = votes.get(c.key);
      const dflt = assumed(c);
      if (v ? v.pct > v.flat || (v.pct === v.flat && dflt) : dflt) percentageKeys.add(c.key);
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
    if (c.children.length === 0) return false;
    // Een concept met een meting (~M) is een partida, ook zonder eenheid
    // (Presto 8: partida zonder eenheid met een samenstelling waarin alle
    // rendementen 0 zijn); hoofdstukken worden nooit gemeten. Rendement 0
    // alleen is geen kenmerk: prijzenbanken zetten ook onder subhoofdstukken
    // zonder #-suffix rendement 0 (BCCA `18ISS`).
    return !measured.has(c.key);
  };

  const measurementFor = (path: number[], parentKey: string, childKey: string, index: number, fallback: number): number =>
    measurements.get(`#${path.join('.')}`)
    ?? measurements.get(`${parentKey}::${childKey}::${index}`)
    ?? measurements.get(`${parentKey}::${childKey}`)
    ?? measurements.get(`*::${childKey}`)
    ?? fallback;

  /**
   * Rekenregels onder een begrotingspost. Geeft de kostprijs per eenheid van
   * de partida terug, zodat de aanroeper die kan vergelijken met de prijs op
   * het ~C-record.
   */
  const addRegels = (post: CostItem, parent: Bc3Concept, postQty: number, depth: number): number => {
    let unitCost = 0;
    let labourCost = 0;
    for (const ch of parent.children) {
      const c = resolve(ch.key);
      if (!c) {
        warn(
          'unknownConceptInDecomposition',
          `Onbekend concept '${ch.key}' in decompositie van '${parent.code}' — overgeslagen.`,
          { concept: ch.key, parent: parent.code },
        );
        continue;
      }
      if (isPercentageRow(c)) {
        // Percentageregel: het rendement is een percentage over de som van de
        // voorgaande regels, niet een hoeveelheid maal een prijs. Sommige
        // schrijvers noteren 3 in plaats van 0,03.
        const pct = asFraction(ch.factor * ch.yield_);
        // Grondslag: de som van de voorgaande regels, of (TCQ) alleen de
        // arbeid daarin. Eenheid '%' is de markering die BC3 zelf gebruikt
        // (UNIDAD = %); zo blijft de regel ook na een export herkenbaar.
        const base = labourOnly(c) ? labourCost : unitCost;
        add({
          rowType: 'regel',
          parentId: post.id,
          depth,
          code: c.code,
          description: summaryOf(c),
          unit: '%',
          quantity: pct === 0 ? 0 : postQty, // 0 % telt niet mee (zie hieronder)
          normQuantity: pct,
          normFactor: 1,
          normUnitPrice: base,
          resourceType: 'overig',
          notes: c.text ?? '',
        });
        unitCost += base * pct;
        continue;
      }
      const norm = ch.factor * ch.yield_;
      unitCost += norm * c.price;
      if (c.type === '1') labourCost += norm * c.price;
      // Rendement 0 betekent in het bestand: dit middel telt niet mee. De
      // calculator leest norm 0 echter als "directe prijs" (aantal × prijs),
      // wat geld zou toevoegen dat er niet is. Aantal 0 houdt de regel
      // zichtbaar en het bedrag op nul.
      add({
        rowType: 'regel',
        parentId: post.id,
        depth,
        code: plainCode(c.code),
        description: summaryOf(c),
        unit: bc3Unit(c.unit),
        quantity: norm === 0 ? 0 : postQty,
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
        code: plainCode(c.code),
        description: summaryOf(c),
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
      code: plainCode(c.code),
      description: summaryOf(c),
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
      warn(
        'zeroYieldDecomposition',
        'Eén of meer partida\'s hebben een samenstelling zonder rendementen — daar is de eenheidsprijs van het ~C-record aangehouden.',
      );
      return;
    }
    // Prijs op het ~C-record en de som van de samenstelling horen gelijk te
    // zijn. Staat er iets anders, dan is het bestand intern inconsistent
    // (verouderde prijzen); wij rekenen bottom-up en melden het.
    if (Math.abs(c.price) >= 0.005 && Math.abs(unitCost - c.price) / Math.abs(c.price) > 0.02) {
      // Beide bedragen erbij: de gebruiker kan dan zelf zien welk getal het
      // bronprogramma toonde (~C) en wat de samenstelling oplevert (~D). Twee
      // decimalen, of meer als het verschil anders niet zichtbaar is
      // (BCCA `15JWW90004`: 0,13 tegenover 0,1274).
      const [a, b] = [2, 4, 6].map((d) => [c.price.toFixed(d), unitCost.toFixed(d)]).find(([x, y]) => x !== y)
        ?? [c.price.toFixed(6), unitCost.toFixed(6)];
      mismatched.push(`${c.code} (~C ${a}, ~D ${b})`);
    }
  };

  function addBranch(parentItem: CostItem | null, parent: Bc3Concept, path: number[], depth: number): void {
    parent.children.forEach((ch, i) => {
      const c = resolve(ch.key);
      if (!c) {
        warn(
          'unknownConceptUnder',
          `Onbekend concept '${ch.key}' onder '${parent.code}' — overgeslagen.`,
          { concept: ch.key, parent: parent.code },
        );
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
      warn(
        'noRootStructure',
        'Geen wortelstructuur (##) met samenstelling gevonden — losse takken op het hoogste niveau geïmporteerd.',
      );
      tops.forEach((c, i) => emit(null, '', c, null, [i + 1], 0));
    } else {
      warn(
        'noProjectStructure',
        'Geen projectstructuur (##/#) gevonden — concepten als prijzenboek onder één hoofdstuk geïmporteerd.',
      );
      const chapter = add({ rowType: 'chapter', parentId: null, depth: 0, code: '01', description: 'Prijzenboek', id: genId() });
      for (const c of all) {
        if (c.isRoot) continue;
        add({
          rowType: 'begrotingspost',
          parentId: chapter.id,
          depth: 1,
          code: c.code,
          description: summaryOf(c),
          unit: bc3Unit(c.unit),
          quantity: 1,
          normUnitPrice: c.price,
          notes: c.text ?? '',
        });
      }
    }
  }

  if (mismatched.length > 0) {
    const examples = mismatched.slice(0, 5).join(', ');
    warn(
      'priceMismatch',
      `Bij ${mismatched.length} partida('s) wijkt de som van de samenstelling meer dan 2% af van de eenheidsprijs op het ~C-record `
      + `(o.a. ${examples}). De samenstelling is aangehouden.`,
      { count: mismatched.length, examples },
    );
  }

  // Een prijsloze import (bv. een "biblioteca de mediciones": posten mét
  // hoeveelheden maar zónder prijzen) levert anders zwijgend € 0 op. Zeg dat
  // erbij, anders lijkt de import mislukt.
  if (items.length > 0 && items.every((i) => (i.normUnitPrice ?? 0) === 0 && (i.unitPrice ?? 0) === 0)) {
    warn(
      'noPrices',
      'Dit bestand bevat geen prijzen — alleen omschrijvingen en hoeveelheden '
      + '(zoals een mediciones-bibliotheek). Het totaal blijft daarom € 0,00.',
    );
  }

  // Waarschuwingen ontdubbelen: één regel per soort probleem is genoeg. De
  // codes gaan index-voor-index mee, zodat beide lijsten gelijk blijven lopen.
  const seen = new Set<string>();
  const unique: string[] = [];
  const uniqueCodes: ImportWarningCode[] = [];
  warnings.forEach((w, i) => {
    if (seen.has(w)) return;
    seen.add(w);
    unique.push(w);
    uniqueCodes.push(codes[i]);
  });
  const MAX_WARNINGS = 50;
  const rest = unique.length - MAX_WARNINGS;
  const capped = rest > 0
    ? [...unique.slice(0, MAX_WARNINGS), `… en nog ${rest} vergelijkbare meldingen.`]
    : unique;
  const cappedCodes: ImportWarningCode[] = rest > 0
    ? [...uniqueCodes.slice(0, MAX_WARNINGS), { code: 'moreWarnings', params: { count: rest } }]
    : uniqueCodes;

  return {
    schedule: {
      name: titleConcept?.summary || 'BC3-import',
      projectName: titleConcept?.summary || 'BC3-import',
      description: titleConcept?.text ?? '',
    },
    items,
    warnings: capped,
    warningCodes: cappedCodes,
    format: 'bc3',
  };
}

// ── Bestandsdecodering (tekenset uit ~V) ────────────────────────────────────

/**
 * Is dit een geldige UTF-8-stroom met minstens één multibyte-teken?
 * Zo ja, dan is de kans op toeval verwaarloosbaar en is het bestand UTF-8 —
 * ook als het ~V-record iets anders beweert (sommige exporteurs schrijven UTF-8 maar
 * zetten er "ANSI" boven).
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
  /**
   * UTF-8, met herstel van "dubbel gecodeerde" tekst: bestanden die eerst als
   * ISO-8859-1 zijn gelezen en daarna als UTF-8 weggeschreven bevatten de
   * stuurtekens U+0080–U+009F waar Windows-1252 “ ” – … bedoelde. Die
   * stuurtekens komen in echte tekst nooit voor, dus terugvertalen is veilig.
   */
  const utf8 = (b: Uint8Array): string => new TextDecoder('utf-8').decode(b)
    .replace(/[\u0080-\u009f]/g, (c) => decodeWindows1252(Uint8Array.of(c.charCodeAt(0))));
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return utf8(bytes.subarray(3));
  }
  const ansi = decodeWindows1252(bytes);
  // Tekenset staat in ~V veld 5 (1-based na het recordtype).
  const v = /~V\|([^~]*)/.exec(ansi);
  const charset = v ? (v[1].split('|')[4] ?? '').trim().toUpperCase().replace(/[\s-]/g, '') : '';
  if (charset === 'UTF8') return utf8(bytes);
  if (looksLikeUtf8(bytes)) return utf8(bytes);
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
