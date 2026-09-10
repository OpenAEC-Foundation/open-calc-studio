/**
 * FIEBDC-3 (.bc3) importer — het Spaanse uitwisselformaat voor
 * bouwbegrotingen en prijzenboeken (fiebdc.es).
 *
 * Tekstformaat: records beginnen met `~X|` (X = recordtype), velden worden
 * gescheiden door `|`, subvelden door `\`. Relevante records:
 *
 *   ~V  bestandskop (o.a. tekenset: ANSI / 850 / 437)
 *   ~C  concept: code(s) | eenheid | omschrijving | prijs(zen) | datum | type
 *   ~D  decompositie: ouder | kind\factor\rendement\kind\factor\rendement…
 *   ~Y  idem, aanvullend (wordt samengevoegd met ~D)
 *   ~M  meting: [ouder\]kind | positie | totaal | detailregels | etiket
 *   ~N  idem, aanvullend
 *   ~T  omschrijvende tekst bij een concept
 *
 * Hiërarchie via code-suffix: `##` = wortel (project), `#` = hoofdstuk.
 * Mapping naar OCS: hoofdstuk → chapter, partida → begrotingspost (aantal uit
 * ~M), basisconcepten in de decompositie → rekenregels met
 * aantal = partida-meting, norm = factor × rendement en prijs/middel = de
 * conceptprijs. Type 1 → arbeid, 2 → materieel, 3 → materiaal.
 */
import { makeCostItem, parseNumber, normalizeUnit, genId } from './core';
import { decodeCp850 } from './dncImporter';
import type { ImportResult } from './types';
import type { CostItem, CostUnit, ResourceType } from '@/types/costModel';

// ── Recordmodel ─────────────────────────────────────────────────────────────

interface Bc3Concept {
  code: string;          // canonieke code (eerste uit ~C, incl. eventuele #'s)
  key: string;           // lookup-key: zonder #-suffix, uppercase
  unit: string;
  summary: string;
  price: number;
  type: string;          // '0'..'5' of leeg
  isRoot: boolean;
  isChapter: boolean;
  text?: string;         // ~T
}

interface Bc3Child {
  key: string;
  factor: number;
  yield_: number;
}

interface Bc3Data {
  concepts: Map<string, Bc3Concept>;
  children: Map<string, Bc3Child[]>;       // ouder-key → kinderen
  measurements: Map<string, number>;       // "ouder::kind" of "kind" → totaal
  warnings: string[];
}

const keyOf = (code: string): string => code.replace(/#+$/, '').trim().toUpperCase();

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
    concepts: new Map(),
    children: new Map(),
    measurements: new Map(),
    warnings: [],
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
        const priceRaw = (fields[3] ?? '').split('\\')[0] ?? '';
        const concept: Bc3Concept = {
          code,
          key: keyOf(code),
          unit: (fields[1] ?? '').trim(),
          summary: (fields[2] ?? '').trim(),
          price: parseNumber(priceRaw),
          type: (fields[5] ?? '').trim(),
          isRoot: /##\s*$/.test(code),
          isChapter: /(^|[^#])#\s*$/.test(code),
        };
        // Alle codes (aliassen) verwijzen naar hetzelfde concept.
        for (const c of codes) {
          if (!data.concepts.has(keyOf(c))) data.concepts.set(keyOf(c), concept);
        }
        break;
      }
      case 'D':
      case 'Y': {
        const parent = keyOf(fields[0] ?? '');
        if (!parent) break;
        const parts = (fields[1] ?? '').split('\\');
        const list = data.children.get(parent) ?? [];
        for (let i = 0; i + 0 < parts.length; i += 3) {
          const code = (parts[i] ?? '').trim();
          if (!code) continue;
          const factorRaw = (parts[i + 1] ?? '').trim();
          const yieldRaw = (parts[i + 2] ?? '').trim();
          list.push({
            key: keyOf(code),
            factor: factorRaw ? parseNumber(factorRaw) : 1,
            yield_: yieldRaw ? parseNumber(yieldRaw) : 1,
          });
        }
        data.children.set(parent, list);
        break;
      }
      case 'M':
      case 'N': {
        const ref = (fields[0] ?? '').split('\\').map((c) => keyOf(c));
        const total = parseNumber(fields[2] ?? '');
        const childKey = ref[ref.length - 1];
        if (!childKey) break;
        const mapKey = ref.length > 1 ? `${ref[0]}::${childKey}` : childKey;
        data.measurements.set(mapKey, (data.measurements.get(mapKey) ?? 0) + total);
        // Fallback zonder ouder — alleen zetten als er nog niets staat.
        if (ref.length > 1 && !data.measurements.has(childKey)) {
          data.measurements.set(childKey, total);
        }
        break;
      }
      case 'T': {
        const key = keyOf(fields[0] ?? '');
        const concept = data.concepts.get(key);
        if (concept) {
          const txt = (fields[1] ?? '').trim();
          concept.text = concept.text ? `${concept.text}\n${txt}` : txt;
        }
        break;
      }
      default:
        break; // ~V/~K en overige records hebben geen mapping nodig
    }
  }
  return data;
}

// ── Mapping naar het OCS-kostenmodel ────────────────────────────────────────

export function importBc3(text: string): ImportResult {
  const data = parseBc3(text);
  const { concepts, children, measurements, warnings } = data;
  const items: CostItem[] = [];
  let sort = 0;

  const add = (partial: Partial<CostItem> & { rowType: CostItem['rowType'] }): CostItem => {
    const item = makeCostItem({ sortOrder: sort++, ...partial });
    items.push(item);
    return item;
  };

  // Wortel: concept met ##-suffix; anders een concept dat nergens kind is.
  let root: Bc3Concept | undefined =
    [...new Set(concepts.values())].find((c) => c.isRoot);
  if (!root) {
    const allChildKeys = new Set<string>();
    for (const list of children.values()) for (const ch of list) allChildKeys.add(ch.key);
    root = [...new Set(concepts.values())].find(
      (c) => !allChildKeys.has(c.key) && (children.get(c.key)?.length ?? 0) > 0,
    );
  }

  const measurementFor = (parentKey: string, childKey: string, fallback: number): number => {
    return measurements.get(`${parentKey}::${childKey}`)
      ?? measurements.get(childKey)
      ?? fallback;
  };

  /** Regels (basisconcepten) onder een begrotingspost. */
  const addRegels = (post: CostItem, postKey: string, postQty: number, depth: number): void => {
    for (const ch of children.get(postKey) ?? []) {
      const c = concepts.get(ch.key);
      const norm = ch.factor * ch.yield_;
      if (!c) {
        warnings.push(`Onbekend concept '${ch.key}' in decompositie van '${postKey}' — overgeslagen.`);
        continue;
      }
      if (c.code.includes('%')) {
        warnings.push(`%-kostenregel '${c.code}' (${c.summary}) geïmporteerd met vaste prijs — controleer het bedrag.`);
      }
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
  };

  /** Hoofdstukken en partida's, recursief. */
  const addBranch = (parentItem: CostItem | null, parentKey: string, depth: number): void => {
    for (const ch of children.get(parentKey) ?? []) {
      const c = concepts.get(ch.key);
      if (!c) {
        warnings.push(`Onbekend concept '${ch.key}' onder '${parentKey}' — overgeslagen.`);
        continue;
      }
      if (c.isChapter) {
        const chapter = add({
          rowType: 'chapter',
          parentId: parentItem?.id ?? null,
          depth,
          code: c.code.replace(/#+$/, ''),
          description: c.summary || c.code,
          notes: c.text ?? '',
        });
        addBranch(chapter, c.key, depth + 1);
      } else {
        // Partida (begrotingspost): aantal uit ~M, anders het rendement.
        const qty = measurementFor(parentKey, c.key, ch.factor * ch.yield_ || 1);
        const hasDecomp = (children.get(c.key)?.length ?? 0) > 0;
        const post = add({
          rowType: 'begrotingspost',
          parentId: parentItem?.id ?? null,
          depth,
          code: c.code,
          description: c.summary || c.code,
          unit: bc3Unit(c.unit),
          quantity: qty,
          // Kale partida zonder decompositie: eigen prijs telt (qty × prijs).
          normUnitPrice: hasDecomp ? null : c.price,
          notes: c.text ?? '',
        });
        if (hasDecomp) addRegels(post, c.key, qty, depth + 1);
      }
    }
  };

  if (root) {
    addBranch(null, root.key, 0);
  } else {
    // Prijzenboek zonder structuur: alles onder één verzamelhoofdstuk.
    warnings.push('Geen projectstructuur (##/#) gevonden — concepten als prijzenboek onder één hoofdstuk geïmporteerd.');
    const chapter = add({ rowType: 'chapter', parentId: null, depth: 0, code: '01', description: 'Prijzenboek', id: genId() });
    for (const c of new Set(concepts.values())) {
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

  return {
    schedule: {
      name: root?.summary || 'BC3-import',
      projectName: root?.summary || 'BC3-import',
      description: root?.text ?? '',
    },
    items,
    warnings,
    format: 'bc3',
  };
}

// ── Bestandsdecodering (tekenset uit ~V) ────────────────────────────────────

/**
 * Decodeer een .bc3-bestand met de tekenset uit het ~V-record:
 * "ANSI" → Windows-1252 (default), "850"/"437" → DOS-codepagina.
 */
export function decodeBc3(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const ansi = new TextDecoder('windows-1252').decode(bytes);
  // Tekenset staat in ~V veld 5 (1-based na het recordtype).
  const v = /~V\|([^~]*)/.exec(ansi);
  const charset = v ? (v[1].split('|')[4] ?? '').trim() : '';
  if (charset === '850' || charset === '437') {
    return decodeCp850(bytes, 0, bytes.length);
  }
  return ansi;
}

export function importBc3File(buffer: ArrayBuffer): ImportResult {
  return importBc3(decodeBc3(buffer));
}
