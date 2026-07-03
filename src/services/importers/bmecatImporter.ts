import { parseXml, getText, normalizeUnit } from './xmlHelpers';
import { genId } from './core';
import type { ResourceLibraryItem, ResourceType } from '@/types/costModel';

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
    warnings.push('Geen <ARTICLE>/<PRODUCT> elementen gevonden — is dit een BMEcat/DICO-catalogus?');
    return { resources, warnings, format: 'bmecat' };
  }

  const seen = new Set<string>();
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
    const unit = normalizeUnit(order ? firstChildText(order, 'ORDER_UNIT', 'CONTENT_UNIT') : '');

    // Eerste prijs uit de eerste ARTICLE_PRICE.
    const priceEl = node.getElementsByTagName('PRICE_AMOUNT')[0];
    const priceText = priceEl?.textContent?.trim() ?? '';
    const price = priceText ? parseFloat(priceText.replace(/\./g, '').replace(',', '.')) : NaN;
    // BMEcat is EN-decimaal ("12.50"); alleen NL-normaliseren als er een komma is.
    const priceEn = priceText && priceText.indexOf(',') < 0 ? parseFloat(priceText) : price;

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
      defaultUnitPrice: Number.isFinite(priceEn) ? priceEn : null,
      category: featSys || 'BMEcat',
    });
  }

  if (resources.length === 0) warnings.push('Geen bruikbare artikelen met code of omschrijving gevonden.');

  return { resources, warnings, format: 'bmecat' };
}
