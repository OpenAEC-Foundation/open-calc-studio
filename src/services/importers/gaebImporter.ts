import { uiText } from '../../i18n/uiText';
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
  if (root.name !== 'GAEB') throw new Error(uiText("diagnostics.gaebImporter.notAGAEBDAXMLFile", "Not a GAEB DA XML file."));
  const award = childElement(root, 'Award');
  const phase = value(award, 'DP');
  if (!award || !['81', '82', '83', '84', '85', '86', '87'].includes(phase)) {
    throw new Error(uiText("diagnostics.gaebImporter.gaebExchangePhaseIsNotSupportedAs", "GAEB exchange phase {{p0}} is not supported as a bill of quantities.", { p0: phase || '?' }));
  }
  const boq = childElement(award, 'BoQ');
  const body = childElement(boq, 'BoQBody');
  if (!body) throw new Error(uiText("diagnostics.gaebImporter.theGAEBFileHasNoBoQBody", "The GAEB file has no BoQBody."));

  const builder = new BudgetBuilder();
  const warnings: string[] = [];
  let missingDescription = 0;
  let missingQuantity = 0;
  const walk = (part: XElement, parentId: string | null, path: string[], depth: number): void => {
    if (depth > 30) throw new Error(uiText("diagnostics.gaebImporter.theGAEBBillOfQuantitiesHasMore", "The GAEB bill of quantities has more than 30 hierarchy levels."));
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
  if (!builder.items.some(i => i.rowType === 'begrotingspost')) throw new Error(uiText("diagnostics.gaebImporter.theGAEBFileContainsNoEstimateItems", "The GAEB file contains no estimate items."));
  if (phase === '84' && missingDescription > 0) {
    throw new Error(uiText("diagnostics.gaebImporter.gaebX84ContainsBidPricesOnlyImport", "GAEB X84 contains bid prices only. Import the matching X83 file first; X84 merging is not available here."));
  }
  if (missingDescription) warnings.push(uiText("diagnostics.gaebImporter.gaebItemsHadNoDescriptionCheckThem", "{{p0}} GAEB items had no description; check them after import.", { p0: missingDescription }));
  if (missingQuantity) warnings.push(uiText("diagnostics.gaebImporter.gaebItemsHadNoQuantityCheckThem", "{{p0}} GAEB items had no quantity; check them after import.", { p0: missingQuantity }));
  warnings.push(uiText("diagnostics.gaebImporter.gaebSpecificAttachmentsAlternativesAndFreeText", "GAEB-specific attachments, alternatives and free-text fields were not fully preserved. Keep the source file."));
  const project = childElement(root, 'PrjInfo');
  const name = value(project, 'NamePrj') || value(childElement(boq, 'BoQInfo'), 'Name') || 'GAEB-bestek';
  const currency = value(project, 'Cur') || value(childElement(award, 'AwardInfo'), 'Cur') || 'EUR';
  return { schedule: { name, projectName: name, currency }, items: builder.items, warnings, format: 'gaeb' };
}

/** Apply an X84 offer to the already imported X83 BoQ, preserving its texts and quantities. */
export function applyGaebX84(xml: string, items: CostItem[]): { items: CostItem[]; pricedCount: number; warnings: string[] } {
  const root = parseLiteXml(xml);
  const award = childElement(root, 'Award');
  if (root.name !== 'GAEB' || value(award, 'DP') !== '84') throw new Error(uiText("diagnostics.gaebImporter.selectAGAEBX84BidFile", "Select a GAEB X84 bid file."));
  const body = childElement(childElement(award, 'BoQ'), 'BoQBody');
  if (!body) throw new Error(uiText("diagnostics.gaebImporter.gaebX84HasNoBoQBody", "GAEB X84 has no BoQBody."));
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
          if (price < 0) throw new Error(uiText("diagnostics.gaebImporter.gaebX84ContainsANegativePriceAt", "GAEB X84 contains a negative price at {{p0}}.", { p0: code }));
          if (offers.has(code)) throw new Error(uiText("diagnostics.gaebImporter.gaebX84ContainsDuplicateItemNumber", "GAEB X84 contains duplicate item number {{p0}}.", { p0: code }));
          offers.set(code, price);
        }
      }
    }
  };
  walk(body, []);
  if (offers.size === 0) throw new Error(uiText("diagnostics.gaebImporter.gaebX84ContainsNoUsableUnitPrices", "GAEB X84 contains no usable unit prices."));
  const byCode = new Map<string, CostItem>();
  for (const item of items) {
    if (item.rowType !== 'begrotingspost') continue;
    if (byCode.has(item.code)) throw new Error(uiText("diagnostics.gaebImporter.theEstimateContainsDuplicateItemNumber", "The estimate contains duplicate item number {{p0}}.", { p0: item.code }));
    byCode.set(item.code, item);
  }
  for (const code of offers.keys()) {
    if (!byCode.has(code)) throw new Error(uiText("diagnostics.gaebImporter.gaebX84ItemIsMissingFromThe", "GAEB X84 item {{p0}} is missing from the current estimate. Import the matching X83 file first.", { p0: code }));
  }
  const childParents = new Set(items.map(i => i.parentId));
  for (const code of offers.keys()) {
    if (childParents.has(byCode.get(code)!.id)) throw new Error(uiText("diagnostics.gaebImporter.gaebX84ItemHasCalculationLinesDo", "GAEB X84 item {{p0}} has calculation lines; do not overwrite an existing composition with a bid price.", { p0: code }));
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
