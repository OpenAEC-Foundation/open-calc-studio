/**
 * WpCalc (.calc) importer
 *
 * WpCalc files are Microsoft Access (Jet) databases with these tables:
 * - calculaties: project metadata (1 row)
 * - data: cost items (rectype 8=chapter, 4=subheader, 0=post, 5=textrow, 16=footer)
 * - staart: tail costs (UKK, AK, W&R, BTW)
 * - tarieven: labor rate groups (A, B, C, ...)
 * - uren: hour summaries
 * - uittrekstaten: quantity take-off details
 *
 * Hierarchy: groep → paragraaf → volgnr
 *   groep = chapter number (e.g. 0, 5, 12, 24)
 *   paragraaf = sub-section (0 = direct under chapter, >0 = under subheader rectype=4)
 *   volgnr = sort order within section
 *   tabs = indentation depth
 */
import MDBReader from 'mdb-reader';
import type { CostItem, CostSchedule, CompanyInfo, ResourceType, StagartRow } from '@/types/costModel';
import { ensureBtwLaagItem, makeStaartItem } from '@/services/calculation/staartDefaults';
import { safeCurrency } from '@/utils/formatting';
import { makeCostItem, normalizeUnit, genId, genIfcGuid } from './core';

function num(val: any): number | null {
  if (val === null || val === undefined || val === '') return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

/**
 * Valuta uit `calculaties.valuta`. Een ISO-code ("EUR", "USD") nemen we over;
 * het euroteken of "euro" wordt EUR, guldens (ƒ, fl, hfl) worden NLG.
 * Leeg of onbekend → EUR. Bedragen worden nooit omgerekend (ook `koers` niet).
 */
export function wpcalcCurrency(val: unknown): string {
  const raw = typeof val === 'string' ? val.trim() : '';
  if (!raw) return 'EUR';
  const l = raw.toLowerCase().replace(/\.$/, '');
  if (l === '€' || l === 'euro') return 'EUR';
  if (l === 'ƒ' || l === 'fl' || l === 'hfl' || l === 'gulden') return 'NLG';
  return /^[a-z]{3}$/i.test(raw) ? safeCurrency(raw) : 'EUR';
}

type StaartKind =
  | 'ak_oa' | 'abk' | 'garanties' | 'wvpm' | 'risico' | 'winst' | 'verzekering'
  | 'ukk' | 'ak' | 'wr' | 'btw_laag' | 'btw' | 'afronding';

/**
 * Welke staartregel hoort bij een WpCalc-label? Zowel de klassieke labels
 * ("Uitvoeringskosten:", "Algemene kosten:", "Winst & risico:", zoals onze
 * eigen export ze ook schrijft) als de Bouw 1-labels. Totaalregels
 * ("Totaal kolommen:", "Totaal excl. btw.:") en onbekende labels → null.
 */
export function classifyWpCalcStaartLabel(label: string | null | undefined): StaartKind | null {
  const l = (label ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!l || l.includes('totaal')) return null;
  if (l.includes('btw')) return l.includes('laag') ? 'btw_laag' : 'btw';
  if (l.includes('afronding')) return 'afronding';
  if (l.includes('algemene kosten') && l.includes('onderaanneming')) return 'ak_oa';
  if (l.includes('algemene bedrijfskosten')) return 'abk';
  if (l.includes('algemene kosten') || /^ak\b/.test(l)) return 'ak';
  if (l.includes('uitvoeringskosten') || /^ukk\b/.test(l)) return 'ukk';
  const winst = l.includes('winst');
  const risico = l.includes('risico');
  if ((winst && risico) || /^w ?& ?r\b/.test(l)) return 'wr';
  if (winst) return 'winst';
  if (risico) return 'risico';
  if (l.includes('garantie')) return 'garanties';
  if (l.includes('werkvoorbereiding')) return 'wvpm';
  if (l.includes('verzekering')) return 'verzekering';
  return null;
}

/** Omschrijvingen van de staartregels na import. */
const STAART_LABELS: Record<StaartKind, string> = {
  ak_oa: 'Algemene kosten over onderaanneming:',
  abk: 'Algemene bedrijfskosten:',
  garanties: 'Garanties:',
  wvpm: 'Werkvoorbereiding & projectmanagement',
  risico: 'Risico:',
  winst: 'Winst:',
  verzekering: 'Verzekering:',
  ukk: 'Uitvoeringskosten:',
  ak: 'Algemene kosten:',
  wr: 'Winst & risico:',
  btw_laag: 'Btw laag:',
  btw: 'Btw hoog:',
  afronding: 'Afronding',
};

/** Standaardstaart, alleen voor een bestand zonder staarttabel (zoals een nieuwe begroting). */
const DEFAULT_STAART: [StaartKind, number][] = [
  ['ak_oa', 9], ['abk', 6], ['garanties', 2], ['wvpm', 2], ['risico', 3], ['winst', 5],
  ['verzekering', 0.5], ['btw_laag', 9], ['btw', 21],
];

/** Volgorde van de staartregels in de app (fase 1, fase 2, klassiek, btw); afronding komt als laatste. */
const STAART_ORDER: StaartKind[] = [
  'ak_oa', 'abk', 'garanties', 'wvpm', 'risico', 'winst', 'verzekering',
  'ukk', 'ak', 'wr', 'btw_laag', 'btw',
];

interface WpCalcRow {
  recnr: number;
  docnr: number;
  groep: number;
  paragraaf: number;
  volgnr: number;
  tabs: number;
  rectype: number;
  omschrijving: string | null;
  eenheid: string | null;
  aantal: number | null;
  prijs: number | null;
  kosteneh: number | null;
  minuten: number | null;
  norm: number | null;
  verbruik: number | null;
  tariefgroep: string | null;
  tarief: number | null;
  onderaanneming: boolean;
  materieel: boolean;
  stelpost: boolean;
  vastbedrag: boolean;
  rekenstring: string | null;
  code: string | null;
  artikelnr: string | null;
}

interface WpCalcStaart {
  volgnr: number;
  itemtype: number;
  omschrijving: string | null;
  percentage: number | null;
  bedrag: number | null;
  subtotaal: number | null;
  totaal: number | null;
  loon: number | null;
  materiaal: number | null;
  materieel: number | null;
  stelpost: number | null;
  onderaanneming: number | null;
}

interface WpCalcCalc {
  docnr: number;
  calculatietitel: string;
  offertenr: string;
  calculator: string;
  naam: string;
  woonplaats: string;
  adres: string;
  totaalexclbtw: number;
  totaalinclbtw: number;
  totaalmateriaal: number;
  totaalloon: number;
  totaalmaterieel: number;
  totaalonderaanneming: number;
  totaalstelposten: number;
  totaaluren: number;
  valuta: string;
}

export function importWpCalcFile(buffer: ArrayBuffer): {
  schedule: CostSchedule;
  items: CostItem[];
  companyInfo: CompanyInfo;
} {
  // mdb-reader requires a Buffer with .copy() — use the polyfill
  const B = (globalThis as any).Buffer;
  const buf = B ? B.from(new Uint8Array(buffer)) : new Uint8Array(buffer);
  const reader = new MDBReader(buf as any);
  const tableNames = reader.getTableNames();

  // ── Read calculaties (project metadata) ──
  let calc: WpCalcCalc | null = null;
  if (tableNames.includes('calculaties')) {
    const rows = reader.getTable('calculaties').getData();
    if (rows.length > 0) {
      const r = rows[0];
      calc = {
        docnr: num(r.docnr) || 0,
        calculatietitel: String(r.calculatietitel || ''),
        offertenr: String(r.offertenr || ''),
        calculator: String(r.calculator || ''),
        naam: String(r.naam || ''),
        woonplaats: String(r.woonplaats || ''),
        adres: String(r.adres || ''),
        totaalexclbtw: num(r.totaalexclbtw) || 0,
        totaalinclbtw: num(r.totaalinclbtw) || 0,
        totaalmateriaal: num(r.totaalmateriaal) || 0,
        totaalloon: num(r.totaalloon) || 0,
        totaalmaterieel: num(r.totaalmaterieel) || 0,
        totaalonderaanneming: num(r.totaalonderaanneming) || 0,
        totaalstelposten: num(r.totaalstelposten) || 0,
        totaaluren: num(r.totaaluren) || 0,
        valuta: r.valuta ? String(r.valuta) : '',
      };
    }
  }

  // ── Read tarieven (labor rates) ──
  const tarieven = new Map<string, number>();
  if (tableNames.includes('tarieven')) {
    const rows = reader.getTable('tarieven').getData();
    for (const r of rows) {
      const groep = String(r.tariefgroep || 'A');
      const tarief = num(r.tarief);
      if (tarief !== null) tarieven.set(groep, tarief);
    }
  }

  // ── Read data (cost items) ──
  const dataRows: WpCalcRow[] = [];
  if (tableNames.includes('data')) {
    const rows = reader.getTable('data').getData();
    for (const r of rows) {
      dataRows.push({
        recnr: num(r.recnr) || 0,
        docnr: num(r.docnr) || 0,
        groep: num(r.groep) || 0,
        paragraaf: num(r.paragraaf) || 0,
        volgnr: num(r.volgnr) || 0,
        tabs: num(r.tabs) || 0,
        rectype: num(r.rectype) || 0,
        omschrijving: r.omschrijving ? String(r.omschrijving) : null,
        eenheid: r.eenheid ? String(r.eenheid) : null,
        prijs: num(r.prijs),
        aantal: num(r.aantal),
        kosteneh: num(r.kosteneh),
        minuten: num(r.minuten),
        norm: num(r.norm),
        verbruik: num(r.verbruik),
        tariefgroep: r.tariefgroep ? String(r.tariefgroep) : null,
        tarief: num(r.tarief),
        onderaanneming: !!r.onderaanneming,
        materieel: !!r.materieel,
        stelpost: !!r.stelpost,
        vastbedrag: !!r.vastbedrag,
        rekenstring: r.rekenstring ? String(r.rekenstring) : null,
        code: r.code ? String(r.code) : null,
        artikelnr: r.artikelnr ? String(r.artikelnr) : null,
      });
    }
  }

  // Sort by groep, paragraaf, volgnr, recnr
  dataRows.sort((a, b) =>
    a.groep - b.groep ||
    a.paragraaf - b.paragraaf ||
    a.volgnr - b.volgnr ||
    a.recnr - b.recnr
  );

  // ── Read staart (tail costs) ──
  const staartRows: WpCalcStaart[] = [];
  if (tableNames.includes('staart')) {
    const rows = reader.getTable('staart').getData();
    for (const r of rows) {
      staartRows.push({
        volgnr: num(r.volgnr) || 0,
        itemtype: num(r.itemtype) || 0,
        omschrijving: r.omschrijving ? String(r.omschrijving) : null,
        percentage: num(r.percentage),
        bedrag: num(r.bedrag),
        subtotaal: num(r.subtotaal),
        totaal: num(r.totaal),
        loon: num(r.loon),
        materiaal: num(r.materiaal),
        materieel: num(r.materieel),
        stelpost: num(r.stelpost),
        onderaanneming: num(r.onderaanneming),
      });
    }
    staartRows.sort((a, b) => a.volgnr - b.volgnr);
  }

  // ── Build CostSchedule ──
  const schedule: CostSchedule = {
    id: genId(),
    name: calc?.calculatietitel || 'WpCalc Import',
    description: '',
    status: 'DRAFT',
    predefinedType: 'BUDGET',
    currency: wpcalcCurrency(calc?.valuta),
    projectName: calc?.calculatietitel || '',
    projectNumber: calc?.offertenr || '',
    client: calc?.naam || '',
    author: calc?.calculator || '',
    ifcGuid: genIfcGuid(),
    uitvoeringskosten: 0,
    algemeneKosten: 0,
    winstRisico: 0,
    tarieven: Object.fromEntries(tarieven),
  };

  // Staartregels per soort (knownbug 88). WpCalc slaat percentages als
  // fractie op (0,06 = 6 %); per soort telt de eerste regel in het bestand.
  const pctOf = (s: WpCalcStaart): number | null =>
    s.percentage !== null ? Math.round(s.percentage * 10000) / 100 : null;
  const staartByKind = new Map<StaartKind, WpCalcStaart>();
  for (const s of staartRows) {
    const kind = classifyWpCalcStaartLabel(s.omschrijving);
    if (kind && !staartByKind.has(kind)) staartByKind.set(kind, s);
  }
  const kindPct = (kind: StaartKind): number | null => {
    const s = staartByKind.get(kind);
    return s ? pctOf(s) : null;
  };

  // Extract UKK/AK/W&R percentages from staart
  schedule.uitvoeringskosten = kindPct('ukk') ?? 0;
  schedule.algemeneKosten = kindPct('ak') ?? kindPct('abk') ?? 0;
  schedule.winstRisico = staartByKind.has('wr')
    ? kindPct('wr') ?? 0
    : (kindPct('winst') ?? 0) + (kindPct('risico') ?? 0);

  // ── Build CostItems ──
  const items: CostItem[] = [];
  let sortOrder = 0;

  // Track chapter IDs for parenting
  const chapterIds = new Map<number, string>(); // groep → chapter id
  const subheaderIds = new Map<string, string>(); // "groep-paragraaf" → subheader id

  for (const row of dataRows) {
    // Skip footer rows (rectype 16)
    if (row.rectype === 16) continue;

    // Skip rows without a description, except posts (rectype 0: a priced post
    // without a description still counts; truly empty posts are skipped below)
    // and text rows (rectype 5: handled below).
    const desc = (row.omschrijving || '').trim();
    if (!desc && row.rectype !== 5 && row.rectype !== 0) continue;

    const id = genId();

    if (row.rectype === 8) {
      // ── Chapter (Hoofdstuk) ──
      chapterIds.set(row.groep, id);
      items.push(makeCostItem({
        id,
        parentId: null,
        sortOrder: sortOrder++,
        code: row.code || String(row.groep).padStart(2, '0'),
        description: desc,
        rowType: 'chapter',
        depth: 0,
      }));
    } else if (row.rectype === 4) {
      // ── Subheader (Paragraaf/Bewakingspost) ──
      const parentId = chapterIds.get(row.groep) || null;
      const key = `${row.groep}-${row.paragraaf}`;
      subheaderIds.set(key, id);
      items.push(makeCostItem({
        id,
        parentId,
        sortOrder: sortOrder++,
        code: row.code || '',
        description: desc,
        rowType: 'begrotingspost',
        depth: 1,
      }));
    } else if (row.rectype === 5) {
      // ── Text row ──
      const parentId = findParentId(row, chapterIds, subheaderIds);
      if (desc) {
        items.push(makeCostItem({
          id,
          parentId,
          sortOrder: sortOrder++,
          description: desc,
          rowType: 'tekstregel',
          depth: (row.tabs || 0) + 1,
        }));
      }
    } else if (row.rectype === 0) {
      // ── Regular post (regel) ──
      const parentId = findParentId(row, chapterIds, subheaderIds);
      const hasQuantity = row.aantal !== null && row.aantal !== 0;
      const hasPrice = (row.prijs !== null && row.prijs !== 0) || (row.kosteneh !== null && row.kosteneh !== 0);

      // Empty row without description and amounts → tekstregel separator
      if (!desc && !hasQuantity && !hasPrice) continue;
      if (!hasQuantity && !hasPrice && desc) {
        items.push(makeCostItem({
          id,
          parentId,
          sortOrder: sortOrder++,
          description: desc,
          rowType: 'tekstregel',
          depth: (row.tabs || 0) + 1,
        }));
        continue;
      }

      // Determine resource type from boolean flags
      let resourceType: ResourceType | null = null;
      if (row.onderaanneming) resourceType = 'onderaannemer';
      else if (row.materieel) resourceType = 'materieel';
      else if (row.stelpost) resourceType = 'overig';
      else resourceType = 'materiaal'; // default: materiaal (loon wordt apart berekend)

      // Tarief: resolve from row or tarieven table
      const tariefGroep = row.tariefgroep || 'A';
      const tariefPerUur = row.tarief || tarieven.get(tariefGroep) || 0;

      // WpCalc formule:
      //   loon = norm * tarief_per_uur (norm is in uren)
      //   kosteneh = prijs + loon
      //   bedrag = aantal * kosteneh
      const materialPrice = row.prijs;
      const normUren = row.norm; // productienorm in uren
      const laborPrice = (normUren || 0) * tariefPerUur;

      // kosteneh is the pre-calculated cost per unit from WpCalc
      const unitPrice = row.kosteneh || 0;
      const quantity = row.aantal;
      const total = (quantity || 0) * unitPrice;

      items.push(makeCostItem({
        id,
        parentId,
        sortOrder: sortOrder++,
        code: row.code || row.artikelnr || '',
        description: desc,
        unit: normalizeUnit(row.eenheid),
        quantity,
        materialPrice,
        laborPrice,
        unitPrice,
        total,
        rowType: 'regel',
        depth: (row.tabs || 0) + 1,
        resourceType,
        normQuantity: normUren,
        normUnitPrice: materialPrice,
        tariefGroep: (tariefGroep === 'A' || tariefGroep === 'B' || tariefGroep === 'C') ? tariefGroep : null,
      }));
    }
  }

  // Normalize depth from the actual parent chain. The raw `tabs` column is a
  // visual indent that doesn't always match the hierarchy (regels directly
  // under a chapter carried tabs=1 → depth 2). Wrong depths break subtree
  // detection (move/drag) and grid indentation.
  const itemById = new Map(items.map((i) => [i.id, i] as const));
  for (const it of items) {
    let d = 0;
    const guard = new Set<string>();
    let p = it.parentId ? itemById.get(it.parentId) : undefined;
    while (p && !guard.has(p.id)) {
      guard.add(p.id);
      d++;
      p = p.parentId ? itemById.get(p.parentId) : undefined;
    }
    it.depth = d;
  }

  // ── Store staart rows in schedule for bottom panel ──
  schedule.staartRows = staartRows.map(s => ({
    label: s.omschrijving || '',
    percentage: s.percentage !== null ? Math.round(s.percentage * 10000) / 100 : null,
    loon: s.loon,
    materiaal: s.materiaal,
    materieel: s.materieel,
    stelpost: s.stelpost,
    onderaanneming: s.onderaanneming,
    bedrag: s.bedrag,
    subtotaal: s.subtotaal,
    totaal: s.totaal,
    itemtype: s.itemtype,
  } satisfies StagartRow));

  // ── Also create staart_* CostItems so live calculator can do its job ──
  // Alleen de regels die echt in het bestand staan, met hun percentage
  // (knownbug 88): klassieke UKK/AK/W&R worden staart_ukk/ak/wr, en er komen
  // geen verzonnen standaardregels bij. Alleen een bestand zonder staart
  // krijgt de standaardstaart van een nieuwe begroting.
  let staartSort = sortOrder;
  if (staartRows.length > 0) {
    for (const kind of STAART_ORDER) {
      if (!staartByKind.has(kind)) continue;
      items.push(makeStaartItem(`staart_${kind}` as const, STAART_LABELS[kind], kindPct(kind) ?? 0, staartSort++));
    }
  } else {
    for (const [kind, pct] of DEFAULT_STAART) {
      items.push(makeStaartItem(`staart_${kind}` as const, STAART_LABELS[kind], pct, staartSort++));
    }
  }
  // Afronding draagt niets bij tot er een stap of doelbedrag is ingevuld.
  items.push(makeStaartItem('staart_afronding', STAART_LABELS.afronding, null, staartSort++));

  // ── CompanyInfo ──
  const companyInfo: CompanyInfo = {
    name: '',
    postalAddress: calc?.adres || '',
    postalCity: calc?.woonplaats || '',
    visitAddress: '',
    visitCity: '',
    phone: '',
    fax: '',
    email: '',
    logoLeft: '',
    logoRight: '',
  };

  // Net als bij het openen van een bestand: naast btw hoog een btw-laagregel
  // (zonder grondslag, dus € 0).
  return { schedule, items: ensureBtwLaagItem(items), companyInfo };
}

function findParentId(
  row: WpCalcRow,
  chapterIds: Map<number, string>,
  subheaderIds: Map<string, string>,
): string | null {
  // If row has a paragraaf > 0, try to find its subheader parent
  if (row.paragraaf > 0 && row.paragraaf < 9999) {
    const key = `${row.groep}-${row.paragraaf}`;
    const subId = subheaderIds.get(key);
    if (subId) return subId;
  }
  // Otherwise, parent is the chapter
  return chapterIds.get(row.groep) || null;
}
