/** Headless bidirectional conversion. No React or DOM dependency. */
import type { CostSchedule, ProjectFile } from '../types/costModel';
import { genId, genIfcGuid } from '../services/importers/core';
import { importXmlBudget, exportXmlBudget } from '../services/exchange/xmlBudget';
import { serializeProject, deserializeProject } from '../services/file/fileService';
import { importBudgetTable, exportBudgetTable, type BudgetTableProfile } from '../services/exchange/tabularBudget';
export { importBudgetTable, exportBudgetTable };
export type { BudgetTableProfile };
import type { ExchangeFormat } from '../services/exchange/types';
export { importXmlBudget, exportXmlBudget } from '../services/exchange/xmlBudget';
export type { ExchangeFormat, BudgetExchangeSource } from '../services/exchange/types';

export interface ConversionResult { data: Uint8Array; fileName: string; warnings: string[] }

export function convertToIfcCalc(data: ArrayBuffer | Uint8Array | string, fileName: string, options: { currency?: string; profile?: BudgetTableProfile } = {}): ConversionResult {
  if (/\.(csv|xlsx|xls)$/i.test(fileName)) {
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data instanceof Uint8Array ? data : new Uint8Array(data);
    const result = importBudgetTable(bytes,fileName,options.profile);
    return { data:new TextEncoder().encode(serializeProject(result.project.schedule,result.project.items)), fileName:fileName.replace(/\.[^.]+$/, '')+'.ifcCalc', warnings:result.warnings };
  }
  const source = typeof data === 'string' ? data : new TextDecoder('utf-8', { fatal:true, ignoreBOM:true }).decode(data);
  const result = importXmlBudget(source, fileName, options.currency);
  const schedule: CostSchedule = {
    id:genId(), name:fileName, description:'', status:'DRAFT', predefinedType:'ESTIMATE', currency:options.currency ?? 'EUR',
    projectName:'', projectNumber:'', client:'', author:'', ifcGuid:genIfcGuid(), uitvoeringskosten:0, algemeneKosten:0, winstRisico:0,
    ...result.schedule,
  };
  return { data:new TextEncoder().encode(serializeProject(schedule,result.items)), fileName:fileName.replace(/\.[^.]+$/, '')+'.ifcCalc', warnings:result.warnings };
}

export function convertFromIfcCalc(input: string | ProjectFile, format: ExchangeFormat | 'csv' | 'xlsx', fileName = `budget.${format === 'xc4' ? 'xml' : format}`): ConversionResult {
  const project = typeof input === 'string' ? deserializeProject(input) : input;
  if (format === 'csv' || format === 'xlsx') return { ...exportBudgetTable(project,format), fileName };
  const result = exportXmlBudget(project.schedule,project.items,format);
  return { data:new TextEncoder().encode(result.text), fileName, warnings:result.warnings };
}
