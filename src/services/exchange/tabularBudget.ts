import { readWorkbook } from '@/services/importers/safeWorkbook';
import * as XLSX from 'xlsx';
import type { CostSchedule, CostItem, CostUnit, ProjectFile } from '../../types/costModel';
import { BudgetBuilder, genId, genIfcGuid } from '../importers/core';
import { serializeProject, deserializeProject } from '../file/fileService';
import { recalculateItems } from '../calculation/calculator';

/** Explicit column/row mapping avoids guessing national tender layouts. Zero-based columns, one-based rows. */
export interface BudgetTableProfile {
  sheet: string;
  firstRow: number;
  lastRow: number;
  currency: string;
  decimalSeparator: '.' | ',';
  columns: { code?: number; description: number; unit: number; quantity: number; price: number };
}
const knownUnits = new Set<string>(['st','m','m²','m³','kg','ton','uur','dgn','km','keer','ls','week','mnd','post','%','pm']);
const unitMap: Record<string, CostUnit> = { m2:'m²',m3:'m³',mq:'m²',mc:'m³',no:'st',nr:'st',each:'st',item:'post',sum:'ls',hr:'uur',h:'uur',t:'ton' };
const headers = ['id','parentId','rowType','code','description','unit','quantity','materialPrice','laborPrice','notes'];

function numeric(raw: unknown, separator: '.' | ',', label: string): number | null {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const s = String(raw).trim();
  // Thousands separators are deliberately not guessed.
  const normalized = separator === ',' ? s.replace(',','.') : s;
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized) || !Number.isFinite(Number(normalized))) throw new Error(`Invalid number at ${label}: ${s}`);
  return Number(normalized);
}
function schedule(name: string, currency: string): CostSchedule {
  return { id:genId(),name,description:'',status:'DRAFT',predefinedType:'ESTIMATE',currency,projectName:'',projectNumber:'',client:'',author:'',ifcGuid:genIfcGuid(),uitvoeringskosten:0,algemeneKosten:0,winstRisico:0, directCostsOnly:true };
}

/** Regional spreadsheets require a reviewed profile. XLS is readable but never re-created as a tender template. */
export function importBudgetTable(data: Uint8Array, fileName: string, profile?: BudgetTableProfile): { project: ProjectFile; warnings: string[] } {
  const wb = /\.csv$/i.test(fileName)
    ? readWorkbook(new TextDecoder('utf-8',{fatal:true}).decode(data),{type:'string',raw:true})
    : readWorkbook(data,{type:'array',raw:true});
  const warnings: string[] = ['Normalized direct costs only: original layout, formulas, macros, taxes and overhead are not reproduced.'];
  const b = new BudgetBuilder();
  let currency: string;
  if (profile) {
    const sheet = wb.Sheets[profile.sheet];
    if (!sheet) throw new Error(`Sheet not found: ${profile.sheet}`);
    if (!Number.isInteger(profile.firstRow) || !Number.isInteger(profile.lastRow) || profile.firstRow < 1 || profile.lastRow < profile.firstRow) throw new Error('Invalid row range.');
    for (const c of Object.values(profile.columns)) if (!Number.isInteger(c) || c < 0) throw new Error('Columns must be zero-based nonnegative integers.');
    currency = profile.currency;
    const cell = (row: number, col: number | undefined): unknown => {
      if (col === undefined) return '';
      const address = XLSX.utils.encode_cell({r:row-1,c:col});
      const c = sheet[address];
      if (c?.t === 'e') throw new Error(`Spreadsheet error at ${profile.sheet}!${address}`);
      if (c?.f && c.v === undefined) throw new Error(`Formula without a cached value at ${profile.sheet}!${address}`);
      return c?.v;
    };
    for (let r = profile.firstRow; r <= profile.lastRow; r++) {
      const c = profile.columns;
      const description = String(cell(r,c.description) ?? '').trim();
      const rawUnit = String(cell(r,c.unit) ?? '').trim();
      if (!description && !rawUnit && cell(r,c.quantity) == null && cell(r,c.price) == null) continue;
      if (!description || !rawUnit) throw new Error(`Row ${r} is not an item (missing description/unit). Narrow the profile row range.`);
      const unit = knownUnits.has(rawUnit) ? rawUnit as CostUnit : unitMap[rawUnit.toLowerCase()];
      if (!unit) throw new Error(`Unmapped unit "${rawUnit}" at row ${r}. Add a reviewed unit mapping.`);
      b.add({rowType:'begrotingspost',code:String(cell(r,c.code) ?? ''),description,unit,quantity:numeric(cell(r,c.quantity),profile.decimalSeparator,`row ${r} quantity`),materialPrice:numeric(cell(r,c.price),profile.decimalSeparator,`row ${r} price`)});
    }
    warnings.push('Formula cache values are used; recalculate the source workbook in its originating application first.');
  } else {
    const sheet = wb.Sheets.Budget ?? wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet,{header:1,defval:'',raw:true});
    if (JSON.stringify(rows[0]) !== JSON.stringify([...headers,'currency'])) throw new Error('This is not an OCS normalized table. Supply an explicit BudgetTableProfile.');
    const currencies = new Set(rows.slice(1).filter(r => r.some(v => v !== '')).map(r => String(r[10])));
    if (currencies.size !== 1) throw new Error('Expected one explicit currency in the normalized table.');
    currency = [...currencies][0];
    for (const row of rows.slice(1)) {
      if (row.every(v => v === '')) continue;
      if (!['chapter','begrotingspost'].includes(String(row[2]))) throw new Error(`Unsupported row type: ${row[2]}`);
      if (!knownUnits.has(String(row[5]))) throw new Error(`Unknown unit: ${row[5]}`);
      b.add({ id:String(row[0]),parentId:row[1] ? String(row[1]) : null,rowType:row[2] as 'chapter'|'begrotingspost',code:String(row[3]),description:String(row[4]),unit:row[5] as CostUnit,quantity:numeric(row[6],'.','quantity'),materialPrice:numeric(row[7],'.','materialPrice'),laborPrice:numeric(row[8],'.','laborPrice'),notes:String(row[9]) });
    }
    const byId = new Map(b.items.map(i => [i.id,i]));
    if (byId.size !== b.items.length || byId.has('')) throw new Error('Missing/duplicate item IDs.');
    for (const item of b.items) {
      const visited = new Set([item.id]);
      let parent = item.parentId;
      while (parent) {
        const p = byId.get(parent);
        if (!p || visited.has(parent) || p.rowType !== 'chapter') throw new Error('Invalid parent hierarchy.');
        visited.add(parent); item.depth++; parent = p.parentId;
      }
    }
  }
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Currency must be an explicit three-letter code.');
  if (!b.items.length) throw new Error('No items in selected table.');
  return {project:deserializeProject(serializeProject(schedule(fileName,currency),recalculateItems(b.items))),warnings};
}

/** Portable OCS table, NOT a recreated national tender workbook. */
export function exportBudgetTable(project: ProjectFile, format: 'csv'|'xlsx'): { data: Uint8Array; warnings: string[] } {
  if (!project.items.length) throw new Error('Cannot export an empty budget table.');
  for (const i of project.items) {
    if (!['chapter','begrotingspost'].includes(i.rowType) || i.normUnitPrice != null || i.normQuantity != null || i.branchId) throw new Error('Normalized table supports only chapters and direct-price items; resources, norms, variants and staart require another format.');
  }
  // Text values are explicitly strings in XLSX; refuse dangerous CSV cells rather than changing their meaning.
  const rows = project.items.map(i => headers.map(h => i[h as keyof CostItem] ?? '').concat(project.schedule.currency));
  if (format === 'csv' && rows.some(row => row.some(v => typeof v === 'string' && /^\s*[=+@-]/.test(v)))) throw new Error('Formula-like text cannot be exported safely to CSV. Use XLSX.');
  const sheet = XLSX.utils.aoa_to_sheet([[...headers,'currency'],...rows]);
  sheet['!cols'] = headers.concat('currency').map(h => ({wch:h === 'description' ? 70 : h === 'notes' ? 40 : 18}));
  if (format === 'csv') return {data:new TextEncoder().encode(XLSX.utils.sheet_to_csv(sheet)),warnings:['Normalized OCS table; source layout and unrepresented project metadata are omitted.']};
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,sheet,'Budget');
  return {data:new Uint8Array(XLSX.write(wb,{type:'array',bookType:'xlsx'})),warnings:['Normalized OCS table; source layout and unrepresented project metadata are omitted.']};
}
