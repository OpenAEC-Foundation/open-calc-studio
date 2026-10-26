import { recalculateItems } from '../calculation/calculator';
import type { CostItem, CostSchedule, CostUnit } from '../../types/costModel';
import { BudgetBuilder } from '../importers/core';
import { parseLiteXml, childElement, textContent, type XElement } from '../importers/liteXml';
import type { ImportResult } from '../importers/types';
import type { ExchangeFormat } from './types';

const children = (n: XElement) => n.children.filter((c): c is XElement => typeof c !== 'string');
function all(n: XElement, name: string): XElement[] {
  return [...(n.name === name ? [n] : []), ...children(n).flatMap(c => all(c, name))];
}
const value = (n: XElement | null | undefined, name: string) => n ? textContent(childElement(n, name)).trim() : '';
const field = (name: string, v: string | number | null): XElement => ({ name, attrs: {}, children: [v === null ? '' : String(v)] });
const node = (name: string, children: XElement[], attrs: Record<string, string> = {}): XElement => ({ name, attrs, children });
function set(n: XElement, name: string, v: string | number | null) {
  const c = childElement(n, name);
  if (c) c.children = [v === null ? '' : String(v)]; else n.children.push(field(name, v));
}
const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
function xml(n: XElement): string {
  return `<${n.name}${Object.entries(n.attrs).map(([k, v]) => ` ${k}="${escape(v)}"`).join('')}>${n.children.map(c => typeof c === 'string' ? escape(c) : xml(c)).join('')}</${n.name}>`;
}
function number(s: string, context: string): number | null {
  if (!s.trim()) return null;
  const normal = s.trim().replace(',', '.');
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(normal) || !Number.isFinite(Number(normal))) {
    throw new Error(`Invalid number in ${context}: ${s}`);
  }
  return Number(normal);
}
const units: Record<string, CostUnit> = { st:'st', cadauno:'st', 'a corpo':'ls', cad:'st', pz:'st', kus:'st', ks:'st', m:'m', ml:'m', m2:'m²', mq:'m²', 'm²':'m²', m3:'m³', mc:'m³', 'm³':'m³', kg:'kg', t:'ton', ton:'ton', h:'uur', ora:'uur', uur:'uur', kpl:'ls', corpo:'ls', ls:'ls', km:'km', '%':'%', dgn:'dgn', week:'week', mnd:'mnd', keer:'keer', post:'post', pm:'pm' };
function unit(s: string, warnings: Set<string>): CostUnit {
  const mapped = units[s.toLowerCase()];
  if (mapped) return mapped;
  warnings.add(`Unknown unit "${s}" shown as "post"; original retained for return export.`);
  return 'post';
}
function assertUnique(nodes: XElement[], key: (n: XElement) => string) {
  const seen = new Set<string>();
  for (const n of nodes) {
    const id = key(n);
    if (!id || seen.has(id)) throw new Error(`Missing or duplicate ${n.name} identifier: ${id}`);
    seen.add(id);
  }
}

/** XPWE 5.x / XC4 4.4 direct-cost import, with source-backed return export. */
export function importXmlBudget(source: string, fileName = 'budget.xml', currency?: string): ImportResult {
  const root = parseLiteXml(source);
  const format: ExchangeFormat = root.name === 'PweDocumento' ? 'xpwe' : root.name === 'XC4' ? 'xc4' : (() => { throw new Error('Expected XPWE or XC4 XML'); })();
  const b = new BudgetBuilder();
  const warnings = new Set<string>(['Only direct item costs are mapped; tax, overhead, analyses and measurement formulas remain in the embedded source.']);
  let name = fileName;
  if (format === 'xpwe') {
    const ep = all(root, 'EPItem');
    const vc = all(root, 'VCItem');
    assertUnique(ep, n => n.attrs.ID);
    assertUnique(vc, n => n.attrs.ID);
    const prices = new Map(ep.map(n => [n.attrs.ID, n]));
    name = value(all(root, 'PweDGDatiGenerali')[0], 'Oggetto') || fileName;
    const chapterMap = new Map<string, CostItem>();
    for (const v of vc) {
      let parent: CostItem | undefined;
      let path = '';
      for (const [ref, tag] of [['IDSpCat','DGSuperCategorieItem'], ['IDCat','DGCategorieItem'], ['IDSbCat','DGSubCategorieItem']]) {
        const id = value(v, ref);
        if (!id || id === '0') continue;
        path += `/${ref}:${id}`;
        let ch = chapterMap.get(path);
        if (!ch) {
          const cat = all(root, tag).find(c => c.attrs.ID === id);
          ch = b.add({ rowType:'chapter', code: value(cat,'Codice') || id, description:value(cat,'DesSintetica') || `${ref} ${id}`, parentId:parent?.id ?? null, depth: parent ? parent.depth + 1 : 0 });
          chapterMap.set(path, ch);
        }
        parent = ch;
      }
      const p = prices.get(value(v, 'IDEP'));
      if (!p) throw new Error(`XPWE VCItem ${v.attrs.ID}: missing price reference ${value(v, 'IDEP')}`);
      const q = number(value(v,'Quantita'), 'Quantita');
      const price = number(value(p,'Prezzo1'), 'Prezzo1');
      b.add({ rowType:'begrotingspost', code:value(p,'Tariffa'), description:value(p,'DesEstesa') || value(p,'DesRidotta'), unit:unit(value(p,'UnMisura'),warnings), quantity:q, materialPrice:price, unitPrice:price ?? 0, total:(q ?? 0)*(price ?? 0), parentId:parent?.id ?? null, depth:parent ? parent.depth + 1 : 0, nr:v.attrs.ID });
    }
    const adjustment = number(value(all(root, 'PweDGDatiGenerali')[0], 'PercPrezzi'), 'PercPrezzi');
    if (adjustment) warnings.add(`XPWE price adjustment PercPrezzi=${adjustment} is retained in source, not applied to Prezzo1.`);
  } else {
    if (value(root,'verze') !== '4.4') throw new Error('Only XC4 version 4.4 has been verified.');
    name = value(all(root,'stavba')[0],'nazev') || fileName;
    assertUnique(all(root,'polozka'), n => value(n,'id_polozka'));
    for (const object of all(root,'objekt')) {
      const ch = b.add({ rowType:'chapter', code:value(object,'znacka'), description:value(object,'nazev') });
      for (const section of all(object,'stavDil')) {
        const sub = b.add({ rowType:'chapter', code:value(section,'znacka'), description:value(section,'nazev'), parentId:ch.id, depth:1 });
        for (const p of all(section,'polozka')) {
          if (all(p,'polozka').length > 1) throw new Error('Nested XC4 linked items require an explicit mapping.');
          const q = number(value(p,'mnozstvi'), 'mnozstvi');
          const price = number(value(p,'joc'),'joc');
          b.add({ rowType:'begrotingspost', code:value(p,'znacka'), description:value(p,'nazev'), notes:value(p,'popis'), unit:unit(value(p,'id_mj'),warnings), quantity:q, materialPrice:price, unitPrice:price ?? 0, total:(q ?? 0)*(price ?? 0), nr:value(p,'id_polozka'), parentId:sub.id, depth:2 });
        }
      }
    }
    if (all(root,'polozka').length !== b.items.filter(i => i.rowType === 'begrotingspost').length) throw new Error('XC4 items outside supported object/section structure.');
  }
  if (!b.items.some(i => i.rowType === 'begrotingspost')) throw new Error('No budget items found. A price catalogue alone is not a budget.');
  const inferredCurrency = currency || (format === 'xpwe' ? 'EUR' : 'CZK');
  if (!currency) warnings.add(`Currency assumed ${inferredCurrency}; override it when the source uses another currency.`);
  if (b.items.filter(i => i.rowType === 'begrotingspost').every(i => !i.materialPrice)) warnings.add('All prices are blank or zero; this may be an unpriced bill of quantities.');
  const references = Object.fromEntries(b.items.filter(i => i.rowType === 'begrotingspost').map(i => [i.id,i.nr]));
  const items = recalculateItems(b.items);
  return {
    format, items, warnings:[...warnings],
    schedule: { name, currency:inferredCurrency, uitvoeringskosten:0, algemeneKosten:0, winstRisico:0,
      budgetExchange: { version:1, format, source, fileName, directCostsOnly:true, references, snapshot:structuredClone(items), scheduleSnapshot:{ name, currency:inferredCurrency } },
    },
  };
}

const core = (i: CostItem) => JSON.stringify([i.id,i.rowType,i.parentId,i.sortOrder,i.code,i.description,i.unit,i.quantity,i.materialPrice,i.laborPrice,i.normQuantity,i.normFactor,i.normDivisor,i.normUnitPrice,i.notes]);
const shape = (i: CostItem) => JSON.stringify([i.id,i.rowType,i.parentId,i.sortOrder]);

/** Return to the original XML while preserving fields the app does not understand.
 * Structural changes fail explicitly: they must not silently disappear on export.
 */
export function exportXmlBudget(schedule: CostSchedule, items: CostItem[], format: ExchangeFormat): { text: string; warnings: string[] } {
  const src = schedule.budgetExchange;
  if (!src || src.format !== format || src.version !== 1) throw new Error(`${format.toUpperCase()} export requires a ${format.toUpperCase()} source imported with the converter. Use CSV/XLSX for a new native budget.`);
  if (schedule.uitvoeringskosten || schedule.algemeneKosten || schedule.winstRisico) throw new Error('New overhead percentages cannot be returned to a direct-cost source.');
  if (schedule.currency !== src.scheduleSnapshot.currency) throw new Error('Changing currency requires currency conversion; return export refused.');
  if (items.length !== src.snapshot.length || items.some((i, n) => shape(i) !== shape(src.snapshot[n]))) throw new Error('Added, removed, moved or reordered rows cannot be returned to this source template. Export a normalized CSV/XLSX instead.');
  for (const [index, item] of items.entries()) {
    for (const key of ['quantity','materialPrice'] as const) if (item[key] !== null && !Number.isFinite(item[key])) throw new Error(`Non-finite ${key} in ${item.code}`);
    for (const key of ['branchId','resourceType','resourceLibraryId','tariefGroep','staartPercentage','btwTarief'] as const) if ((item[key] ?? null) !== (src.snapshot[index][key] ?? null)) throw new Error(`Unsupported change to ${key} in ${item.code}`);
  }
  const changed = items.filter((i,n) => core(i) !== core(src.snapshot[n]));
  if (!changed.length && schedule.name === src.scheduleSnapshot.name) return { text:src.source, warnings:[] };
  if (changed.some(i => i.rowType !== 'begrotingspost')) throw new Error('Chapter edits cannot yet be returned to this source template.');
  // The lightweight parser strips namespace prefixes; do not rewrite namespaced extensions.
  if (/<\/?[\w.-]+:[\w.-]+\b|\sxmlns[=:]/.test(src.source)) throw new Error('Namespaced XML extensions cannot be rewritten safely.');
  const root = parseLiteXml(src.source);
  const warnings = ['Vendor validation is still required before using the returned file for a tender.'];
  const oldById = new Map(src.snapshot.map(i => [i.id,i]));
  for (const item of changed) {
    const old = oldById.get(item.id)!;
    const sourceId = src.references?.[old.id] ?? old.nr;
    if (item.laborPrice !== old.laborPrice || item.normUnitPrice !== old.normUnitPrice || item.normQuantity !== old.normQuantity || item.normFactor !== old.normFactor || item.normDivisor !== old.normDivisor) throw new Error('Resource/norm price edits cannot be flattened implicitly. Edit the imported material price or export CSV/XLSX.');
    if (format === 'xpwe') {
      if (item.notes !== old.notes) throw new Error('XPWE note edits have no supported field mapping.');
      const v = all(root,'VCItem').find(n => n.attrs.ID === sourceId)!;
      const ep = all(root,'EPItem');
      let p = ep.find(n => n.attrs.ID === value(v,'IDEP'))!;
      const epChanged = item.code !== old.code || item.description !== old.description || item.unit !== old.unit || item.materialPrice !== old.materialPrice;
      if (epChanged) {
        // Each VC can share a price entry: clone before editing so other posts stay unchanged.
        p = structuredClone(p);
        const used = new Set(ep.map(n => n.attrs.ID));
        let id = 1; while (used.has(String(id))) id++;
        p.attrs.ID = String(id);
        all(root,'PweElencoPrezzi')[0].children.push(p);
        set(v,'IDEP',id);
        set(p,'Tariffa',item.code);
        if (item.description !== old.description) for (const key of ['DesEstesa','DesRidotta','DesBreve']) set(p,key,item.description);
        if (item.unit !== old.unit) set(p,'UnMisura',item.unit);
        if (item.materialPrice !== old.materialPrice) {
          set(p,'Prezzo1',item.materialPrice);
          const analysis = childElement(p,'PweEPAnalisi');
          if (analysis && children(analysis).length) { analysis.children = []; warnings.push(`Price analysis flattened for ${item.code}.`); }
        }
      }
      if (item.quantity !== old.quantity) {
        // Linked measurements elsewhere could recompute a different total.
        if (all(root,'RGItem').some(n => value(n,'IDVV') === sourceId)) throw new Error(`XPWE quantity ${item.code} is referenced by another measurement; edit its source measurements first.`);
        set(v,'Quantita',item.quantity);
        const measures = childElement(v,'PweVCMisure');
        const replacement = node('RGItem',[field('IDVV',-2),field('Descrizione','Open Calc Studio'),field('PartiUguali',item.quantity),field('Lunghezza',''),field('Larghezza',''),field('HPeso',''),field('Quantita',item.quantity),field('Flags',0)],{ID:'1'});
        if (measures) measures.children = [replacement]; else v.children.push(node('PweVCMisure',[replacement]));
        set(v,'Flags',0);
        warnings.push(`Measurement breakdown replaced by a single quantity for ${item.code}.`);
      }
    } else {
      const p = all(root,'polozka').find(n => value(n,'id_polozka') === sourceId)!;
      set(p,'znacka',item.code); set(p,'nazev',item.description); set(p,'popis',item.notes);
      if (item.unit !== old.unit) set(p,'id_mj',item.unit);
      if (item.materialPrice !== old.materialPrice) set(p,'joc',item.materialPrice);
      if (item.quantity !== old.quantity) {
        set(p,'mnozstvi',item.quantity); set(p,'mnozstvi_puvodni',item.quantity); set(p,'mnozstvi_dodatky',''); set(p,'vymera','');
        warnings.push(`Measurement expression cleared for ${item.code}; explicit quantity retained.`);
      }
    }
  }
  if (schedule.name !== src.scheduleSnapshot.name) {
    const n = all(root,format === 'xpwe' ? 'PweDGDatiGenerali' : 'stavba')[0];
    if (!n) throw new Error('Source has no project name container.');
    set(n,format === 'xpwe' ? 'Oggetto' : 'nazev',schedule.name);
  }
  return { text:'<?xml version="1.0" encoding="UTF-8"?>\n'+xml(root), warnings };
}
