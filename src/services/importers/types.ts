import type { CostItem, CostSchedule, CompanyInfo } from '@/types/costModel';

/**
 * Gestructureerde importmelding: een vaste code plus interpolatiewaarden, zodat
 * de UI de melding in de taal van de gebruiker kan tonen
 * (`dialogs:importWarnings.<format>.<code>`).
 */
export interface ImportWarningCode {
  code: string;
  params?: Record<string, string | number>;
}

/**
 * Eén gedeeld resultaat-contract voor álle importers (XML, binair, tekst).
 * `format` is een korte formaat-aanduiding (bv. 'cuf', 'dnc', 'xtb'),
 * `companyInfo` wordt alleen gevuld door formaten die bedrijfsgegevens dragen.
 */
export interface ImportResult {
  schedule: Partial<CostSchedule>;
  items: CostItem[];
  /** Leesbare meldingen (Nederlands); altijd gevuld, ook als er codes zijn. */
  warnings: string[];
  /**
   * Optioneel, parallel aan `warnings`: element i is de gestructureerde vorm
   * van `warnings[i]`. De tekst in `warnings` dient als terugval wanneer er
   * voor een code (nog) geen vertaling is.
   */
  warningCodes?: ImportWarningCode[];
  format?: string;
  companyInfo?: Partial<CompanyInfo>;
}
