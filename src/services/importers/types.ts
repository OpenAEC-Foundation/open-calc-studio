import type { CostItem, CostSchedule, CompanyInfo } from '@/types/costModel';

/**
 * Eén gedeeld resultaat-contract voor álle importers (XML, binair, tekst).
 * `format` is een korte formaat-aanduiding (bv. 'cuf', 'dnc', 'xtb'),
 * `companyInfo` wordt alleen gevuld door formaten die bedrijfsgegevens dragen.
 */
export interface ImportResult {
  schedule: Partial<CostSchedule>;
  items: CostItem[];
  warnings: string[];
  format?: string;
  companyInfo?: Partial<CompanyInfo>;
}
