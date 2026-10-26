/**
 * GAEB DA XML bill-of-quantities reader. Reads the priced or unpriced BoQ
 * structure in X81/X82/X83/X86; an X84 offer normally contains prices only
 * and must be combined with its original X83, so it is rejected here.
 */
import { BudgetBuilder, normalizeUnit } from './core';
import { childElement, childElements, parseLiteXml, textContent, type XElement } from './liteXml';
import type { ImportResult } from './types';
import type { CostItem, CostUnit } from '@/types/costModel';

const value = (el: XElement | null, name: string): string => textContent(childElement(el, name)).trim();
const number = (raw: string): number | null => {
  if (!raw) return null;
  const n = Number(raw.trim().replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const unit = (raw: string): CostUnit => {
  const u = raw.trim().toLowerCase();
  if (['psch', 'pausch', 'pa', 'ps'].includes(u)) return 'post';
  if (['st', 'stk', 'stck', 'stück', 'pc'].includes(u)) return 'st';
  if (u === 't') return 'ton';
  if (u === 'h' || u === 'std') return 'uur';
  return normalizeUnit(u);
};
const compact = (s: string): string => s.replace(/\s+/g, ' ').trim();
const descriptionOf = (el: XElement): { summary: string; detail: string } => {
  const description = childElement(el, 'Description');
  const complete = childElement(description, 'CompleteText');
  const outline = childElement(complete, 'OutlineText');
  const detail = childElement(complete, 'DetailTxt');
  const summary = compact(textContent(outline)) || compact(textContent(detail)) || compact(textContent(description));
  return { summary, detail: compact(textContent(detail)) };
};

export function importGaeb(xml: string): ImportResult {
  const root = parseLiteXml(xml);
  if (root.name !== 'GAEB') throw new Error('Geen GAEB DA XML-bestand.');
  const award = childElement(root, 'Award');
  const phase = value(award, 'DP');
  if (!award || !['81', '82', '83', '84', '85', '86', '87'].includes(phase)) {
    throw new Error(`GAEB-uitwisselfase ${phase || '?'} wordt niet als bestek ondersteund.`);
  }
  const boq = childElement(award, 'BoQ');
  const body = childElement(boq, 'BoQBody');
  if (!body) throw new Error('GAEB-bestand bevat geen BoQBody.');

  const builder = new BudgetBuilder();
  const warnings: string[] = [];
  let missingDescription = 0;
  let missingQuantity = 0;
  const walk = (part: XElement, parentId: string | null, path: string[], depth: number): void => {
    if (depth > 30) throw new Error('GAEB-bestek heeft meer dan 30 hiërarchieniveaus.');
    for (const child of part.children) {
      if (typeof child === 'string') continue;
      if (child.name === 'BoQCtgy') {
        const label = compact(value(child, 'LblTx')) || 'Categorie';
        const code = (child.attrs.RNoPart || '').trim();
        const chapter = builder.add({
          rowType: 'chapter', parentId, depth, code: [...path, code].filter(Boolean).join('.'),
          description: label, notes: '',
        });
        const nested = childElement(child, 'BoQBody');
        if (nested) walk(nested, chapter.id, [...path, code], depth + 1);
      } else if (child.name === 'Itemlist') {
        for (const item of childElements(child, 'Item')) {
          const code = [...path, item.attrs.RNoPart || ''].filter(Boolean).join('.');
          const { summary, detail } = descriptionOf(item);
          if (!summary) missingDescription++;
          const quantity = number(value(item, 'Qty'));
          if (quantity === null) missingQuantity++;
          const price = number(value(item, 'UP'));
          builder.add({
            rowType: 'begrotingspost', parentId, depth, code,
            description: summary || `GAEB-positie ${code}`,
            notes: detail && detail !== summary ? detail : '',
            quantity, unit: unit(value(item, 'QU')),
            unitPrice: price ?? 0,
            materialPrice: price,
          });
        }
      }
    }
  };
  walk(body, null, [], 0);
  if (!builder.items.some(i => i.rowType === 'begrotingspost')) throw new Error('GAEB-bestand bevat geen begrotingsposten.');
  if (phase === '84' && missingDescription > 0) {
    throw new Error('GAEB X84 bevat alleen aanbiedingsprijzen. Importeer eerst het bijbehorende X83-bestek; X84-samenvoeging is nog niet beschikbaar.');
  }
  if (missingDescription) warnings.push(`${missingDescription} GAEB-posities hadden geen omschrijving; controleer deze na import.`);
  if (missingQuantity) warnings.push(`${missingQuantity} GAEB-posities hadden geen hoeveelheid; controleer deze na import.`);
  warnings.push('GAEB-specifieke bijlagen, alternatieven en vrije tekstvelden zijn niet volledig overgenomen. Bewaar het bronbestand.');
  const project = childElement(root, 'PrjInfo');
  const name = value(project, 'NamePrj') || value(childElement(boq, 'BoQInfo'), 'Name') || 'GAEB-bestek';
  const currency = value(project, 'Cur') || value(childElement(award, 'AwardInfo'), 'Cur') || 'EUR';
  return { schedule: { name, projectName: name, currency }, items: builder.items, warnings, format: 'gaeb' };
}

/** Apply an X84 offer to the already imported X83 BoQ, preserving its texts and quantities. */
export function applyGaebX84(xml: string, items: CostItem[]): { items: CostItem[]; pricedCount: number; warnings: string[] } {
  const root = parseLiteXml(xml);
  const award = childElement(root, 'Award');
  if (root.name !== 'GAEB' || value(award, 'DP') !== '84') throw new Error('Selecteer een GAEB X84-aanbiedingsbestand.');
  const body = childElement(childElement(award, 'BoQ'), 'BoQBody');
  if (!body) throw new Error('GAEB X84 bevat geen BoQBody.');
  const offers = new Map<string, number>();
  let withoutPrice = 0;
  const walk = (part: XElement, path: string[]): void => {
    for (const child of part.children) {
      if (typeof child === 'string') continue;
      if (child.name === 'BoQCtgy') {
        const nested = childElement(child, 'BoQBody');
        if (nested) walk(nested, [...path, child.attrs.RNoPart || '']);
      } else if (child.name === 'Itemlist') {
        for (const item of childElements(child, 'Item')) {
          const code = [...path, item.attrs.RNoPart || ''].filter(Boolean).join('.');
          const price = number(value(item, 'UP'));
          if (price === null) { withoutPrice++; continue; }
          if (price < 0) throw new Error(`GAEB X84 bevat een negatieve prijs bij ${code}.`);
          if (offers.has(code)) throw new Error(`GAEB X84 bevat dubbel positienummer ${code}.`);
          offers.set(code, price);
        }
      }
    }
  };
  walk(body, []);
  if (offers.size === 0) throw new Error('GAEB X84 bevat geen bruikbare eenheidsprijzen.');
  const byCode = new Map<string, CostItem>();
  for (const item of items) {
    if (item.rowType !== 'begrotingspost') continue;
    if (byCode.has(item.code)) throw new Error(`Begroting bevat dubbel positienummer ${item.code}.`);
    byCode.set(item.code, item);
  }
  for (const code of offers.keys()) {
    if (!byCode.has(code)) throw new Error(`GAEB X84-positie ${code} ontbreekt in de huidige begroting. Importeer eerst het bijbehorende X83-bestek.`);
  }
  const childParents = new Set(items.map(i => i.parentId));
  for (const code of offers.keys()) {
    if (childParents.has(byCode.get(code)!.id)) throw new Error(`GAEB X84-positie ${code} heeft rekenregels; zet de aanbiedingsprijs niet over bestaande samenstellingen heen.`);
  }
  const updated = items.map(item => {
    const price = item.rowType === 'begrotingspost' ? offers.get(item.code) : undefined;
    return price === undefined ? item : {
      ...item, materialPrice: price, laborPrice: null, normUnitPrice: null,
      unitPrice: price, total: (item.quantity ?? 0) * price,
    };
  });
  const warnings = withoutPrice ? [`${withoutPrice} X84-posities zonder eenheidsprijs zijn overgeslagen.`] : [];
  return { items: updated, pricedCount: offers.size, warnings };
}
