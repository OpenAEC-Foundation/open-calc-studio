import type { GridColumn } from '@/types/costModel';
import type { GridView } from '@/state/slices/uiSlice';

export const ROW_HEIGHT = 24;
export const OVERSCAN = 10;

/** UI-1: norm-gebaseerde kolommen (huidige layout) */
export const GRID_COLUMNS: GridColumn[] = [
  { key: 'sortIndex', label: 'ID', width: 32, minWidth: 28, editable: false, type: 'computed', align: 'center' },
  { key: 'rowType', label: 'Type', width: 62, minWidth: 50, editable: false, type: 'computed', align: 'center' },
  { key: 'rowNumber', label: 'Nr', width: 50, minWidth: 40, editable: false, type: 'computed', align: 'center' },
  { key: 'code', label: 'Code', abbr: 'code', width: 42, minWidth: 32, editable: true, type: 'text', align: 'left' },
  { key: 'description', label: 'Omschrijving', abbr: 'omschr', width: 380, minWidth: 120, editable: true, type: 'text', align: 'left' },
  { key: 'quantity', label: 'Aantal', abbr: 'aant', width: 80, minWidth: 50, editable: true, type: 'number', align: 'center', tooltip: 'Aantal (aant)\nAlleen op rekenregel\nDimensieloos getal' },
  { key: 'productienorm', label: 'Prod.norm', abbr: 'pnorm', width: 80, minWidth: 50, editable: true, type: 'number', align: 'center', tooltip: 'Productienorm (pnorm)\nAlleen op rekenregel\nBijv. 8 uur per persoon per dag' },
  { key: 'productiecapaciteit', label: 'Prod.cap.', abbr: 'pcap', width: 80, minWidth: 50, editable: true, type: 'number', align: 'center', tooltip: 'Productiecapaciteit (pcap)\nAlleen op rekenregel\nDeler in de hoeveelheidformule' },
  { key: 'hoeveelheid', label: 'Hoeveelheid', abbr: 'hoev', width: 90, minWidth: 60, editable: true, type: 'number', align: 'center', tooltip: 'Hoeveelheid (hoev)\nregel: aant × pnorm / pcap\nbgrps: toont Aantal\ntekst: direct invulbaar' },
  { key: 'unit', label: 'Eenheid', abbr: 'eenh', width: 55, minWidth: 45, editable: true, type: 'unit-select', align: 'center', tooltip: 'Eenheid (eenh)\nbgrps, bwkps, regel' },
  { key: 'verrekenbaar', label: 'Verr.', abbr: 'verr', width: 32, minWidth: 28, editable: true, type: 'vn-select', align: 'center', tooltip: 'Verrekenbaarheid (verr)\nAlleen op hfdst\nV=Verrekenbaar, A=Aanbod\nN=Niet verrekenbaar, F=Fictief' },
  { key: 'normUnitPrice', label: 'Prijs/middel', abbr: 'pmddl', width: 100, minWidth: 60, editable: true, type: 'currency', align: 'center', tooltip: 'Prijs per middel (pmddl)\nAlleen op rekenregel' },
  { key: 'unitPrice', label: 'Eenheidsprijs', abbr: 'ehprs', width: 100, minWidth: 60, editable: false, type: 'computed', align: 'center', tooltip: 'Eenheidsprijs (ehprs)\nregel: hoev × pmddl\nbwkps: Σ regel ehprs\nbgrps: bedrag / hoev' },
  { key: 'total', label: 'Bedrag', abbr: 'bedrag', width: 110, minWidth: 70, editable: false, type: 'computed', align: 'center', tooltip: 'Bedrag (bedrag)\nregel: = ehprs\nbwkps: Σ regel bedrag\nbgrps: Σ bwkps bedrag\nhfdst: Σ onderliggende bedrag' },
];

/** UI-2: resource-breakdown kolommen (zoals WpCalc screenshot) */
export const WPCALC_COLUMNS: GridColumn[] = [
  { key: 'sortIndex', label: 'ID', width: 32, minWidth: 28, editable: false, type: 'computed', align: 'center' },
  { key: 'rowType', label: 'Type', width: 62, minWidth: 50, editable: false, type: 'computed', align: 'center' },
  { key: 'chapterCode', label: 'Hst', abbr: 'hst', width: 40, minWidth: 30, editable: true, type: 'text', align: 'center', tooltip: 'Hoofdstuknummer' },
  { key: 'paragraphCode', label: 'Paragraaf', abbr: 'par', width: 65, minWidth: 40, editable: false, type: 'computed', align: 'center', tooltip: 'Paragraafnummer' },
  { key: 'rowNumber', label: 'Nr', width: 50, minWidth: 40, editable: true, type: 'text', align: 'center' },
  { key: 'description', label: 'Omschrijving', abbr: 'omschr', width: 240, minWidth: 120, editable: true, type: 'text', align: 'left' },
  { key: 'quantity', label: 'Aantal', abbr: 'aant', width: 70, minWidth: 45, editable: true, type: 'number', align: 'right' },
  { key: 'unit', label: 'Eenheid', abbr: 'eenh', width: 50, minWidth: 30, editable: true, type: 'unit-select', align: 'center' },
  { key: 'normUnitPrice', label: 'Prijs', abbr: 'prijs', width: 70, minWidth: 50, editable: true, type: 'currency', align: 'right', tooltip: 'Prijs per eenheid / middel' },
  { key: 'productienorm', label: 'Norm', abbr: 'norm', width: 60, minWidth: 40, editable: true, type: 'number', align: 'right', tooltip: 'Productienorm' },
  { key: 'hoeveelheid', label: 'Uren', abbr: 'uren', width: 60, minWidth: 45, editable: true, type: 'number', align: 'right', tooltip: 'Uren (berekend: aant × norm)' },
  { key: 'tarief', label: 'Tar.', abbr: 'tar', width: 45, minWidth: 35, editable: true, type: 'tarief-select', align: 'center', tooltip: 'Tariefgroep (A/B/C)' },
  { key: 'arbeidTotal', label: 'Loon', abbr: 'loon', width: 80, minWidth: 50, editable: false, type: 'computed', align: 'right', tooltip: 'Loonkosten\nSom van regels met resourceType=arbeid' },
  { key: 'materiaalTotal', label: 'Materiaal', abbr: 'mat', width: 80, minWidth: 50, editable: false, type: 'computed', align: 'right', tooltip: 'Materiaalkosten\nSom van regels met resourceType=materiaal' },
  { key: 'materieelTotal', label: 'Materieel', abbr: 'matrl', width: 80, minWidth: 50, editable: false, type: 'computed', align: 'right', tooltip: 'Materieelkosten\nSom van regels met resourceType=materieel' },
  { key: 'stelpostTotal', label: 'Stelpost', abbr: 'stelp', width: 80, minWidth: 50, editable: false, type: 'computed', align: 'right', tooltip: 'Stelpostkosten\nSom van regels met resourceType=overig' },
  { key: 'onderaannemingTotal', label: 'Onderaann.', abbr: 'oa', width: 85, minWidth: 50, editable: false, type: 'computed', align: 'right', tooltip: 'Onderaannemingskosten\nSom van regels met resourceType=onderaannemer' },
  { key: 'kostenEd', label: 'Kosten e/d', abbr: 'k e/d', width: 80, minWidth: 50, editable: false, type: 'computed', align: 'right', tooltip: 'Kosten per eenheid/dag' },
  { key: 'unitPrice', label: 'Subtotaal', abbr: 'subtot', width: 90, minWidth: 60, editable: false, type: 'computed', align: 'right' },
  { key: 'total', label: 'Totaal', abbr: 'totaal', width: 100, minWidth: 70, editable: false, type: 'computed', align: 'right' },
];

/** Inschrijfstaat RAW: Code, Omschrijving, Hoeveelheid, Eenheid, Verr., Eenheidsprijs, Bedrag */
export const INSCHRIJFSTAAT_COLUMNS: GridColumn[] = [
  { key: 'rowType', label: 'Type', width: 62, minWidth: 50, editable: false, type: 'computed', align: 'center' },
  { key: 'rowNumber', label: 'Nr', width: 50, minWidth: 40, editable: false, type: 'computed', align: 'center' },
  { key: 'code', label: 'Code', abbr: 'code', width: 80, minWidth: 40, editable: true, type: 'text', align: 'left' },
  { key: 'description', label: 'Omschrijving', abbr: 'omschr', width: 420, minWidth: 150, editable: true, type: 'text', align: 'left' },
  { key: 'hoeveelheid', label: 'Hoeveelheid', abbr: 'hoev', width: 100, minWidth: 60, editable: true, type: 'number', align: 'center' },
  { key: 'unit', label: 'Eh.', abbr: 'eenh', width: 45, minWidth: 35, editable: true, type: 'unit-select', align: 'center' },
  { key: 'verrekenbaar', label: 'S', abbr: 'verr', width: 32, minWidth: 28, editable: true, type: 'vn-select', align: 'center', tooltip: 'Stelpost\nV=Verrekenbaar, A=Aanbod\nN=Niet verrekenbaar, F=Fictief' },
  { key: 'unitPrice', label: 'Eenheidsprijs', abbr: 'ehprs', width: 110, minWidth: 70, editable: false, type: 'computed', align: 'right' },
  { key: 'total', label: 'Bedrag', abbr: 'bedrag', width: 120, minWidth: 80, editable: false, type: 'computed', align: 'right' },
];

/** UI-3: Simple — alleen de essentiële kolommen */
export const SIMPLE_COLUMNS: GridColumn[] = [
  { key: 'sortIndex', label: 'ID', width: 32, minWidth: 28, editable: false, type: 'computed', align: 'center' },
  { key: 'rowNumber', label: 'Nr', width: 50, minWidth: 40, editable: false, type: 'computed', align: 'center' },
  { key: 'description', label: 'Omschrijving', abbr: 'omschr', width: 450, minWidth: 150, editable: true, type: 'text', align: 'left' },
  { key: 'quantity', label: 'Aantal', abbr: 'aant', width: 80, minWidth: 50, editable: true, type: 'number', align: 'right' },
  { key: 'unit', label: 'Eenheid', abbr: 'eenh', width: 55, minWidth: 40, editable: true, type: 'unit-select', align: 'center' },
  { key: 'normUnitPrice', label: 'Prijs', abbr: 'prijs', width: 90, minWidth: 60, editable: true, type: 'currency', align: 'right' },
  { key: 'unitPrice', label: 'Eenheidsprijs', abbr: 'ehprs', width: 100, minWidth: 60, editable: false, type: 'computed', align: 'right' },
  { key: 'total', label: 'Totaal', abbr: 'totaal', width: 110, minWidth: 70, editable: false, type: 'computed', align: 'right' },
];

/** Branch column (shown leftmost when branchesEnabled) */
export const BRANCH_COLUMN: GridColumn = {
  key: 'branch', label: 'Branch', abbr: 'branch', width: 100, minWidth: 60,
  editable: true, type: 'text', align: 'left',
  tooltip: 'Begrotingsvariant (branch) — main / aanbouw / variant 1 etc.',
};

/** Get the column set for the active grid view */
export function getColumnsForView(view: GridView, branchesEnabled = false): GridColumn[] {
  let cols: GridColumn[];
  if (view === 'wpcalc') cols = WPCALC_COLUMNS;
  else if (view === 'inschrijfstaat') cols = INSCHRIJFSTAAT_COLUMNS;
  else if (view === 'simple') cols = SIMPLE_COLUMNS;
  else cols = GRID_COLUMNS;
  if (branchesEnabled) {
    // Insert directly after ID column (sortIndex)
    const insertAt = cols.findIndex(c => c.key === 'sortIndex');
    if (insertAt >= 0) {
      return [...cols.slice(0, insertAt + 1), BRANCH_COLUMN, ...cols.slice(insertAt + 1)];
    }
    // Fallback: prepend
    return [BRANCH_COLUMN, ...cols];
  }
  return cols;
}

/** Column keys that may never be hidden — they carry structural info the grid
 *  relies on (the description text and the row identity columns). */
export const NON_HIDEABLE_COLUMNS: ReadonlySet<string> = new Set([
  'description',
  'sortIndex',
  'rowType',
]);

/** Whether a column may be hidden by the user. */
export function isColumnHideable(colKey: string): boolean {
  return !NON_HIDEABLE_COLUMNS.has(colKey);
}

/** Whether a column is currently hidden in the given view. */
export function isColumnHidden(
  hiddenColumns: Record<string, boolean>,
  gridView: string,
  colKey: string,
): boolean {
  return !!hiddenColumns[`${gridView}:${colKey}`];
}

export const COST_UNITS = ['st', 'm', 'm²', 'm³', 'kg', 'ton', 'uur', 'dgn', 'km', 'keer', 'ls', 'week', 'mnd', 'post', '%', 'pm'] as const;

/** Check if a column is editable for a given rowType */
export function isCellEditable(colKey: string, rowType: string, _gridView?: GridView): boolean {
  // WPCalc: de uren-som van een hoofdstuk wordt bewerkt op de FOOTERRIJ
  // (de blauwe "+"-optelling; rowType 'tekstregel' → kolom 'hoeveelheid' is
  // verderop al bewerkbaar). De hoofdstukrij zelf toont geen uren meer.
  // Code always editable (except staart)
  if (colKey === 'code') return !rowType.startsWith('staart_');
  // Description editable on all rows, including staart
  if (colKey === 'description') return true;
  // Staart: percentage (shown in quantity column) is editable, afronding is computed
  if (rowType.startsWith('staart_')) {
    if (rowType === 'staart_afronding') return false;
    return colKey === 'quantity'; // quantity = percentage for staart rows
  }
  // Aantal: rekenregel, begrotingspost (leaf only), bewakingspost (leaf only)
  if (colKey === 'quantity') {
    return rowType === 'regel';
  }
  // Hoeveelheid/Uren: alleen direct invulbaar op tekstregel
  // Op begrotingspost/bewakingspost is dit een berekende som
  if (colKey === 'hoeveelheid') {
    return rowType === 'tekstregel';
  }
  // Prijs/middel: rekenregel, begrotingspost, bewakingspost
  if (colKey === 'normUnitPrice') {
    return rowType === 'regel' || rowType === 'begrotingspost' || rowType === 'bewakingspost';
  }
  // Prod.norm, Prod.cap.: alleen rekenregel
  if (colKey === 'productienorm' || colKey === 'productiecapaciteit') {
    return rowType === 'regel';
  }
  // Eenheid: begrotingspost, bewakingspost, regel, tekstregel
  if (colKey === 'unit') {
    return rowType === 'begrotingspost' || rowType === 'bewakingspost' || rowType === 'regel' || rowType === 'tekstregel';
  }
  // Verrekenbaar: alleen chapter
  if (colKey === 'verrekenbaar') return rowType === 'chapter';
  // Tarief: alleen op rekenregel
  if (colKey === 'tarief') return rowType === 'regel';
  // Hoofdstuknummer: editable op chapter
  if (colKey === 'chapterCode') return rowType === 'chapter';
  // Nr: read-only (hiërarchisch berekend uit parent + sortOrder)
  if (colKey === 'rowNumber') return false;
  // Resource breakdown and computed columns are not editable
  if (colKey === 'materiaalTotal' || colKey === 'arbeidTotal' || colKey === 'materieelTotal' || colKey === 'onderaannemingTotal' || colKey === 'stelpostTotal'
    || colKey === 'paragraphCode' || colKey === 'kostenEd') {
    return false;
  }
  return false;
}
