import { uiText } from '../../i18n/uiText';
import { parseXml, getText } from './xmlHelpers';
import { genId, matchUnit, unknownUnitsWarning } from './core';
import type { CostUnit, ResourceLibraryItem, ResourceType } from '@/types/costModel';

/**
 * BMEcat 2005 / DICO (Ketenstandaard Bouw en Techniek) prijzencatalogus →
 * resourcebibliotheek (middelen). Dit zijn groothandels-/leveranciers-
 * prijslijsten (ETIM-geclassificeerd); ze vullen de middelenbibliotheek, niet
 * een begroting. Spiegelt de ZSX-import (zie [[zsxImporter]]).
 *
 * Ondersteunt zowel `<ARTICLE>` (BMEcat 1.2/2005) als `<PRODUCT>` (2005.2) en
 * valt terug op alternatieve tagnamen waar de standaard varieert.
 */
export interface PriceImportResult {
  resources: ResourceLibraryItem[];
  warnings: string[];
  format: string;
}

/** BMEcat = productcatalogus, dus default materiaal; hint op tekst/keywords. */
function guessType(text: string): ResourceType {
  const t = text.toLowerCase();
  if (/\b(arbeid|loon|montage|manuur|mankracht)\b/.test(t)) return 'arbeid';
  if (/\b(huur|verhuur|machine|materieel|kraan|steiger)\b/.test(t)) return 'materieel';
  if (/\b(onderaannem|uitbested)/.test(t)) return 'onderaannemer';
  return 'materiaal';
}

/**
 * BMEcat schrijft eenheden als UN/ECE Rec 20-code (MTR, MTK, C62 …). Zonder
 * deze tabel werden ze allemaal "st" (knownbug 71).
 */
const REC20_UNITS: Record<string, CostUnit> = {
  MTR: 'm', MTK: 'm²', MTQ: 'm³', KMT: 'km',
  KGM: 'kg', TNE: 'ton',
  C62: 'st', PCE: 'st', H87: 'st', EA: 'st',
  HUR: 'uur', DAY: 'dgn', WEE: 'week', MON: 'mnd',
  LS: 'ls',
};

/** Rec 20-code of vrije tekst → eenheid; `known` = er is een tegenhanger. */
function bmecatUnit(raw: string): { unit: CostUnit; known: boolean } {
  const s = raw.trim();
  if (!s) return { unit: 'st', known: true };
  const mapped = REC20_UNITS[s.toUpperCase()] ?? matchUnit(s);
  if (mapped) return { unit: mapped, known: true };
  // Onbekend: ongewijzigd overnemen (zoals de ÖNORM-import), niet stil "st".
  return { unit: s as CostUnit, known: false };
}

function firstChildText(node: Element, ...tags: string[]): string {
  for (const tag of tags) {
    const t = getText(node, tag);
    if (t) return t;
  }
  return '';
}

export function importBmecat(xml: string): PriceImportResult {
  const doc = parseXml(xml);
  const warnings: string[] = [];
  const resources: ResourceLibraryItem[] = [];

  const nodes: Element[] = [
    ...Array.from(doc.getElementsByTagName('ARTICLE')),
    ...Array.from(doc.getElementsByTagName('PRODUCT')),
  ];
  if (nodes.length === 0) {
    warnings.push(uiText("diagnostics.bmecatImporter.noARTICLEPRODUCTElementsFoundIsThis", "No <ARTICLE>/<PRODUCT> elements found. Is this a BMEcat/DICO catalogue?"));
    return { resources, warnings, format: 'bmecat' };
  }

  const seen = new Set<string>();
  const unknownUnits = new Set<string>();
  for (const node of nodes) {
    // Sla de mime/feature-subknopen over die per ongeluk ARTICLE kunnen heten.
    const code =
      firstChildText(node, 'SUPPLIER_AID', 'SUPPLIER_PID', 'INTERNATIONAL_PID') ||
      node.getAttribute('id') ||
      '';

    const details =
      (node.getElementsByTagName('ARTICLE_DETAILS')[0] as Element | undefined) ??
      (node.getElementsByTagName('PRODUCT_DETAILS')[0] as Element | undefined) ??
      node;
    const description =
      firstChildText(details, 'DESCRIPTION_SHORT', 'DESCRIPTION_LONG') || '';

    if (!code && !description) continue;
    // Ontdubbel op code (catalogi herhalen artikelen soms per prijslijst).
    const key = code || description;
    if (seen.has(key)) continue;
    seen.add(key);

    const order =
      (node.getElementsByTagName('ARTICLE_ORDER_DETAILS')[0] as Element | undefined) ??
      (node.getElementsByTagName('PRODUCT_ORDER_DETAILS')[0] as Element | undefined);
    const { unit, known } = bmecatUnit(order ? firstChildText(order, 'ORDER_UNIT', 'CONTENT_UNIT') : '');
    if (!known) unknownUnits.add(unit);

    // Eerste prijs uit de eerste ARTICLE_PRICE.
    const priceEl = node.getElementsByTagName('PRICE_AMOUNT')[0];
    const priceText = priceEl?.textContent?.trim() ?? '';
    const price = priceText ? parseFloat(priceText.replace(/\./g, '').replace(',', '.')) : NaN;
    // BMEcat is EN-decimaal ("12.50"); alleen NL-normaliseren als er een komma is.
    const priceEn = priceText && priceText.indexOf(',') < 0 ? parseFloat(priceText) : price;
    // PRICE_AMOUNT geldt voor PRICE_QUANTITY bestel-eenheden (€ 145 per 100 m);
    // de middelenbibliotheek wil de prijs per eenheid (knownbug 72).
    const priceQuantity = order ? parseFloat(getText(order, 'PRICE_QUANTITY').replace(',', '.')) : NaN;
    const unitPrice = Number.isFinite(priceQuantity) && priceQuantity > 0 ? priceEn / priceQuantity : priceEn;

    const featSys = getText(node, 'REFERENCE_FEATURE_SYSTEM_NAME');
    const keywords = Array.from(node.getElementsByTagName('KEYWORD'))
      .map((k) => k.textContent ?? '')
      .join(' ');

    resources.push({
      id: genId(),
      code,
      description,
      unit,
      resourceType: guessType(`${description} ${keywords}`),
      defaultUnitPrice: Number.isFinite(unitPrice) ? unitPrice : null,
      category: featSys || 'BMEcat',
    });
  }

  const unitWarning = unknownUnitsWarning(unknownUnits);
  if (unitWarning) warnings.push(unitWarning);
  if (resources.length === 0) warnings.push(uiText("diagnostics.bmecatImporter.noUsableArticlesWithACodeOr", "No usable articles with a code or description found."));

  return { resources, warnings, format: 'bmecat' };
}
