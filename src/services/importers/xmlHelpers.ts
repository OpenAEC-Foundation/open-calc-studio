/**
 * DOM-helpers voor de XML-importers. De CostItem-fabriek, eenheid- en
 * getalnormalisatie staan in `core.ts` (gedeeld met de binaire importers);
 * ze worden hier her-geëxporteerd zodat de XML-importers één bron hebben.
 */
import { parseNumber } from './core';

export { makeCostItem, normalizeUnit, parseNumber, genId, genIfcGuid, BudgetBuilder } from './core';

export function parseXml(text: string): Document {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const err = doc.getElementsByTagName('parsererror')[0];
  if (err) throw new Error(`XML parse error: ${err.textContent?.trim() ?? 'unknown'}`);
  return doc;
}

export function getText(el: Element | null | undefined, tag: string): string {
  if (!el) return '';
  const direct = Array.from(el.children).find((c) => c.tagName === tag || c.localName === tag);
  const found =
    direct ??
    el.getElementsByTagName(tag)[0] ??
    el.getElementsByTagNameNS('*', tag)[0];
  return found?.textContent?.trim() ?? '';
}

export function getNumber(el: Element | null | undefined, tag: string): number {
  return parseNumber(getText(el, tag));
}

/** Like getNumber but returns a fallback when the tag is missing or unparseable. */
export function getNumberOrDefault(
  el: Element | null | undefined,
  tag: string,
  def: number,
): number {
  const raw = getText(el, tag);
  if (!raw) return def;
  const t = raw.indexOf(',') >= 0 ? raw.replace(/\./g, '').replace(',', '.') : raw;
  const n = parseFloat(t.replace(/\s/g, ''));
  return Number.isFinite(n) ? n : def;
}

export function children(el: Element, tag: string): Element[] {
  return Array.from(el.children).filter(
    (c) => c.tagName === tag || c.localName === tag,
  ) as Element[];
}

export function descendants(el: Element | Document, tag: string): Element[] {
  return Array.from(el.getElementsByTagNameNS('*', tag)) as Element[];
}
