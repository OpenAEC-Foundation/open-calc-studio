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

/** A mapped number cell without a usable value; it was imported as empty. */
export interface ImportCellDiagnostic {
  /** Sheet-qualified address, e.g. "Blad1!B3". */
  address: string;
  /** Target field the column is mapped to (quantity, unitPrice, …). */
  field: string;
  /** Header of the source column. */
  column: string;
  /** `noCachedValue`: a formula never calculated in Excel; `error`: an Excel error. */
  kind: 'noCachedValue' | 'error';
  /** The Excel error text (#REF!, #DIV/0!) for `error`. */
  text?: string;
}

export interface ImportCellDiagnostics {
  /** Mapped number values that are stored formula results: imported as they are, not recalculated. */
  formulaValues: number;
  /** Mapped number cells without a usable value. */
  unusableCells: number;
  /** Those cells with their address; at most 200 per column, so it can be shorter than `unusableCells`. */
  cells: ImportCellDiagnostic[];
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
  /**
   * Spreadsheet imports: which mapped number values are stored formula
   * results and which cells had no usable value. The same information as the
   * warnings, but structured, for callers without a UI (#88).
   */
  cellDiagnostics?: ImportCellDiagnostics;
  format?: string;
  companyInfo?: Partial<CompanyInfo>;
}
