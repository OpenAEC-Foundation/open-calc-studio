import i18next from 'i18next';
import type { GridColumn } from '@/types/costModel';
import type { GridView } from '@/state/slices/uiSlice';

export const ROW_HEIGHT = 24;
export const OVERSCAN = 10;

/**
 * Kolomdefinitie met i18n-sleutels i.p.v. vaste teksten. `getColumnsForView`
 * lost de sleutels bij elke aanroep op via i18next, zodat een taalwissel
 * direct doorwerkt zodra de consumerende componenten herrenderen
 * (react-i18next triggert dat voor componenten met useTranslation).
 */
interface ColumnDef extends Omit<GridColumn, 'label' | 'abbr' | 'tooltip'> {
  labelKey: string;
  abbrKey?: string;
  tooltipKey?: string;
}

/** i18next.t met 'grid'-namespace; vóór init valt hij terug op de sleutel. */
const tr = (key: string): string =>
  i18next.isInitialized ? i18next.t(key, { ns: 'grid' }) : key;

function resolveColumn(def: ColumnDef): GridColumn {
  const { labelKey, abbrKey, tooltipKey, ...rest } = def;
  return {
    ...rest,
    label: tr(labelKey),
    ...(abbrKey ? { abbr: tr(abbrKey) } : {}),
    ...(tooltipKey ? { tooltip: tr(tooltipKey) } : {}),
  };
}

/** UI-1: norm-gebaseerde kolommen (huidige layout) */
const GRID_COLUMN_DEFS: ColumnDef[] = [
  { key: 'sortIndex', labelKey: 'columns.id', width: 32, minWidth: 28, editable: false, type: 'computed', align: 'center' },
  { key: 'rowType', labelKey: 'columns.type', width: 62, minWidth: 50, editable: false, type: 'computed', align: 'center' },
  { key: 'rowNumber', labelKey: 'columns.nr', width: 50, minWidth: 40, editable: false, type: 'computed', align: 'center' },
  { key: 'code', labelKey: 'columns.code', abbrKey: 'abbr.code', width: 42, minWidth: 32, editable: true, type: 'text', align: 'left' },
  { key: 'description', labelKey: 'columns.description', abbrKey: 'abbr.description', width: 380, minWidth: 120, editable: true, type: 'text', align: 'left' },
  { key: 'quantity', labelKey: 'columns.quantity', abbrKey: 'abbr.quantity', width: 80, minWidth: 50, editable: true, type: 'number', align: 'center', tooltipKey: 'tooltips.quantity' },
  { key: 'productienorm', labelKey: 'columns.productienorm', abbrKey: 'abbr.productienorm', width: 80, minWidth: 50, editable: true, type: 'number', align: 'center', tooltipKey: 'tooltips.productienorm' },
  { key: 'productiecapaciteit', labelKey: 'columns.productiecapaciteit', abbrKey: 'abbr.productiecapaciteit', width: 80, minWidth: 50, editable: true, type: 'number', align: 'center', tooltipKey: 'tooltips.productiecapaciteit' },
  { key: 'hoeveelheid', labelKey: 'columns.hoeveelheid', abbrKey: 'abbr.hoeveelheid', width: 90, minWidth: 60, editable: true, type: 'number', align: 'center', tooltipKey: 'tooltips.hoeveelheid' },
  { key: 'unit', labelKey: 'columns.unit', abbrKey: 'abbr.unit', width: 55, minWidth: 45, editable: true, type: 'unit-select', align: 'center', tooltipKey: 'tooltips.unit' },
  { key: 'verrekenbaar', labelKey: 'columns.verrekenbaar', abbrKey: 'abbr.verrekenbaar', width: 32, minWidth: 28, editable: true, type: 'vn-select', align: 'center', tooltipKey: 'tooltips.verrekenbaar' },
  { key: 'normUnitPrice', labelKey: 'columns.normUnitPrice', abbrKey: 'abbr.normUnitPrice', width: 100, minWidth: 60, editable: true, type: 'currency', align: 'center', tooltipKey: 'tooltips.normUnitPrice' },
  { key: 'unitPrice', labelKey: 'columns.unitPrice', abbrKey: 'abbr.unitPrice', width: 100, minWidth: 60, editable: false, type: 'computed', align: 'center', tooltipKey: 'tooltips.unitPrice' },
  { key: 'total', labelKey: 'columns.amount', abbrKey: 'abbr.amount', width: 110, minWidth: 70, editable: true, type: 'computed', align: 'center', tooltipKey: 'tooltips.total' },
];

/** UI-2: resource-breakdown kolommen (zoals WpCalc screenshot) */
const WPCALC_COLUMN_DEFS: ColumnDef[] = [
  { key: 'sortIndex', labelKey: 'columns.id', width: 32, minWidth: 28, editable: false, type: 'computed', align: 'center' },
  { key: 'rowType', labelKey: 'columns.type', width: 62, minWidth: 50, editable: false, type: 'computed', align: 'center' },
  { key: 'chapterCode', labelKey: 'columns.chapterCode', abbrKey: 'abbr.chapterCode', width: 40, minWidth: 30, editable: true, type: 'text', align: 'center', tooltipKey: 'tooltips.chapterCode' },
  { key: 'paragraphCode', labelKey: 'columns.paragraph', abbrKey: 'abbr.paragraph', width: 65, minWidth: 40, editable: false, type: 'computed', align: 'center', tooltipKey: 'tooltips.paragraph' },
  { key: 'rowNumber', labelKey: 'columns.nr', width: 50, minWidth: 40, editable: true, type: 'text', align: 'center' },
  { key: 'description', labelKey: 'columns.description', abbrKey: 'abbr.description', width: 240, minWidth: 120, editable: true, type: 'text', align: 'left' },
  { key: 'quantity', labelKey: 'columns.quantity', abbrKey: 'abbr.quantity', width: 70, minWidth: 45, editable: true, type: 'number', align: 'right' },
  { key: 'unit', labelKey: 'columns.unit', abbrKey: 'abbr.unit', width: 50, minWidth: 30, editable: true, type: 'unit-select', align: 'center' },
  { key: 'normUnitPrice', labelKey: 'columns.price', abbrKey: 'abbr.price', width: 70, minWidth: 50, editable: true, type: 'currency', align: 'right', tooltipKey: 'tooltips.wpPrice' },
  { key: 'productienorm', labelKey: 'columns.norm', abbrKey: 'abbr.norm', width: 60, minWidth: 40, editable: true, type: 'number', align: 'right', tooltipKey: 'tooltips.wpNorm' },
  { key: 'hoeveelheid', labelKey: 'columns.hours', abbrKey: 'abbr.hours', width: 60, minWidth: 45, editable: true, type: 'number', align: 'right', tooltipKey: 'tooltips.wpHours' },
  { key: 'tarief', labelKey: 'columns.tarief', abbrKey: 'abbr.tarief', width: 45, minWidth: 35, editable: true, type: 'tarief-select', align: 'center', tooltipKey: 'tooltips.wpTarief' },
  { key: 'arbeidTotal', labelKey: 'columns.labour', abbrKey: 'abbr.labour', width: 80, minWidth: 50, editable: false, type: 'computed', align: 'right', tooltipKey: 'tooltips.wpLabour' },
  { key: 'materiaalTotal', labelKey: 'columns.material', abbrKey: 'abbr.material', width: 80, minWidth: 50, editable: false, type: 'computed', align: 'right', tooltipKey: 'tooltips.wpMaterial' },
  { key: 'materieelTotal', labelKey: 'columns.equipment', abbrKey: 'abbr.equipment', width: 80, minWidth: 50, editable: false, type: 'computed', align: 'right', tooltipKey: 'tooltips.wpEquipment' },
  { key: 'stelpostTotal', labelKey: 'columns.provisionalSum', abbrKey: 'abbr.provisionalSum', width: 80, minWidth: 50, editable: false, type: 'computed', align: 'right', tooltipKey: 'tooltips.wpProvisionalSum' },
  { key: 'onderaannemingTotal', labelKey: 'columns.subcontracting', abbrKey: 'abbr.subcontracting', width: 85, minWidth: 50, editable: false, type: 'computed', align: 'right', tooltipKey: 'tooltips.wpSubcontracting' },
  { key: 'kostenEd', labelKey: 'columns.costsPerUnit', abbrKey: 'abbr.costsPerUnit', width: 80, minWidth: 50, editable: false, type: 'computed', align: 'right', tooltipKey: 'tooltips.wpCostsPerUnit' },
  { key: 'unitPrice', labelKey: 'columns.subtotal', abbrKey: 'abbr.subtotal', width: 90, minWidth: 60, editable: false, type: 'computed', align: 'right' },
  { key: 'total', labelKey: 'columns.total', abbrKey: 'abbr.total', width: 100, minWidth: 70, editable: true, type: 'computed', align: 'right' },
];

/** Inschrijfstaat RAW: Code, Omschrijving, Hoeveelheid, Eenheid, Verr., Eenheidsprijs, Bedrag */
const INSCHRIJFSTAAT_COLUMN_DEFS: ColumnDef[] = [
  { key: 'rowType', labelKey: 'columns.type', width: 62, minWidth: 50, editable: false, type: 'computed', align: 'center' },
  { key: 'rowNumber', labelKey: 'columns.nr', width: 50, minWidth: 40, editable: false, type: 'computed', align: 'center' },
  { key: 'code', labelKey: 'columns.code', abbrKey: 'abbr.code', width: 80, minWidth: 40, editable: true, type: 'text', align: 'left' },
  { key: 'description', labelKey: 'columns.description', abbrKey: 'abbr.description', width: 420, minWidth: 150, editable: true, type: 'text', align: 'left' },
  { key: 'hoeveelheid', labelKey: 'columns.hoeveelheid', abbrKey: 'abbr.hoeveelheid', width: 100, minWidth: 60, editable: true, type: 'number', align: 'center' },
  { key: 'unit', labelKey: 'columns.unitShort', abbrKey: 'abbr.unit', width: 45, minWidth: 35, editable: true, type: 'unit-select', align: 'center' },
  { key: 'verrekenbaar', labelKey: 'columns.stelpostShort', abbrKey: 'abbr.verrekenbaar', width: 32, minWidth: 28, editable: true, type: 'vn-select', align: 'center', tooltipKey: 'tooltips.inschrijfVerrekenbaar' },
  { key: 'unitPrice', labelKey: 'columns.unitPrice', abbrKey: 'abbr.unitPrice', width: 110, minWidth: 70, editable: false, type: 'computed', align: 'right' },
  { key: 'total', labelKey: 'columns.amount', abbrKey: 'abbr.amount', width: 120, minWidth: 80, editable: true, type: 'computed', align: 'right' },
];

/** UI-3: Simple — alleen de essentiële kolommen */
const SIMPLE_COLUMN_DEFS: ColumnDef[] = [
  { key: 'sortIndex', labelKey: 'columns.id', width: 32, minWidth: 28, editable: false, type: 'computed', align: 'center' },
  { key: 'rowNumber', labelKey: 'columns.nr', width: 50, minWidth: 40, editable: false, type: 'computed', align: 'center' },
  { key: 'description', labelKey: 'columns.description', abbrKey: 'abbr.description', width: 450, minWidth: 150, editable: true, type: 'text', align: 'left' },
  { key: 'quantity', labelKey: 'columns.quantity', abbrKey: 'abbr.quantity', width: 80, minWidth: 50, editable: true, type: 'number', align: 'right' },
  { key: 'unit', labelKey: 'columns.unit', abbrKey: 'abbr.unit', width: 55, minWidth: 40, editable: true, type: 'unit-select', align: 'center' },
  { key: 'normUnitPrice', labelKey: 'columns.price', abbrKey: 'abbr.price', width: 90, minWidth: 60, editable: true, type: 'currency', align: 'right' },
  { key: 'unitPrice', labelKey: 'columns.unitPrice', abbrKey: 'abbr.unitPrice', width: 100, minWidth: 60, editable: false, type: 'computed', align: 'right' },
  { key: 'total', labelKey: 'columns.total', abbrKey: 'abbr.total', width: 110, minWidth: 70, editable: true, type: 'computed', align: 'right' },
];

/** Branch column (shown leftmost when branchesEnabled) */
const BRANCH_COLUMN_DEF: ColumnDef = {
  key: 'branch', labelKey: 'columns.branch', abbrKey: 'abbr.branch', width: 100, minWidth: 60,
  editable: true, type: 'text', align: 'left',
  tooltipKey: 'tooltips.branch',
};

/**
 * Statisch geresolvede exports — labels bevriezen op de taal van het moment
 * van importeren. Alleen gebruiken voor structurele info (key/width/minWidth,
 * zoals viewSlice en tests doen); voor UI-teksten altijd getColumnsForView.
 */
export const GRID_COLUMNS: GridColumn[] = GRID_COLUMN_DEFS.map(resolveColumn);
export const WPCALC_COLUMNS: GridColumn[] = WPCALC_COLUMN_DEFS.map(resolveColumn);
export const INSCHRIJFSTAAT_COLUMNS: GridColumn[] = INSCHRIJFSTAAT_COLUMN_DEFS.map(resolveColumn);

/** Get the column set for the active grid view (labels in de actieve taal) */
export function getColumnsForView(view: GridView, branchesEnabled = false): GridColumn[] {
  let defs: ColumnDef[];
  if (view === 'wpcalc') defs = WPCALC_COLUMN_DEFS;
  else if (view === 'inschrijfstaat') defs = INSCHRIJFSTAAT_COLUMN_DEFS;
  else if (view === 'simple') defs = SIMPLE_COLUMN_DEFS;
  else defs = GRID_COLUMN_DEFS;
  const cols = defs.map(resolveColumn);
  if (branchesEnabled) {
    const branchColumn = resolveColumn(BRANCH_COLUMN_DEF);
    // Insert directly after ID column (sortIndex)
    const insertAt = cols.findIndex(c => c.key === 'sortIndex');
    if (insertAt >= 0) {
      return [...cols.slice(0, insertAt + 1), branchColumn, ...cols.slice(insertAt + 1)];
    }
    // Fallback: prepend
    return [branchColumn, ...cols];
  }
  return cols;
}

/** Column keys that may never be hidden — they carry structural info the grid
 *  relies on (the description text and the row identity columns). */
const NON_HIDEABLE_COLUMNS: ReadonlySet<string> = new Set([
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
  // Staart: percentage (shown in quantity column) is editable
  if (rowType.startsWith('staart_')) {
    // Afronding: het bedrag is direct invulbaar (vaste sluitpost);
    // leegmaken schakelt terug naar automatisch afronden.
    if (rowType === 'staart_afronding') return colKey === 'total';
    return colKey === 'quantity'; // quantity = percentage for staart rows
  }
  // Aantal: rekenregel, begrotingspost (leaf only), bewakingspost (leaf only)
  if (colKey === 'quantity') {
    // Ook op (bewakings)posten bewerkbaar: bij een kale post rekent
    // hoeveelheid × prijs; bij een post mét regels voedt het alleen de
    // afgeleide eenheidsprijs (totaal / hoeveelheid).
    return rowType === 'regel' || rowType === 'begrotingspost' || rowType === 'bewakingspost';
  }
  // Hoeveelheid/Uren: alleen direct invulbaar op tekstregel
  // Op begrotingspost/bewakingspost is dit een berekende som
  if (colKey === 'hoeveelheid') {
    // Op (bewakings)posten toont de hoeveelheid-kolom het Aantal — bewerken
    // schrijft naar quantity (zelfde mapping als de editor). Op regels blijft
    // hoeveelheid berekend (aant × pnorm / pcap).
    return rowType === 'tekstregel' || rowType === 'begrotingspost' || rowType === 'bewakingspost';
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
