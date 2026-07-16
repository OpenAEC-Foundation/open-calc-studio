export type CostUnit = 'st' | 'm' | 'm²' | 'm³' | 'kg' | 'ton' | 'uur' | 'dgn' | 'km' | 'keer' | 'ls' | 'week' | 'mnd' | 'post' | '%' | 'pm';

export type RowType =
  | 'chapter'           // Hoofdstuk/Paragraaf (groen)
  | 'begrotingspost'    // Bestekspost (ih)
  | 'bewakingspost'     // Bewakingspost (cb) - bruin
  | 'regel'             // Middel/resource (cn) - geel
  | 'tekstregel'        // Tekstregel/opmerking (opm) - werkomschrijving/certificering
  | 'witregel'          // Witomschrijving - meerdere regels, alleen description
  | 'staart_ukk' | 'staart_ak' | 'staart_wr' | 'staart_afronding'
  | 'staart_ak_oa' | 'staart_abk' | 'staart_garanties' | 'staart_wvpm' | 'staart_risico' | 'staart_winst' | 'staart_verzekering' | 'staart_btw';

export type ResourceType = 'onderaannemer' | 'materieel' | 'materiaal' | 'arbeid' | 'overig';

/** RAW verrekenbaarheid: V=verrekenbaar, A=aanbod(vast), N=niet verrekenbaar */
export type Verrekenbaarheid = 'V' | 'A' | 'N' | 'F' | null;

export interface CostItem {
  id: string;
  parentId: string | null;
  sortOrder: number;
  code: string;
  description: string;
  unit: CostUnit;
  quantity: number | null;
  materialPrice: number | null;
  laborPrice: number | null;
  unitPrice: number;
  total: number;
  isCollapsed: boolean;
  depth: number;
  notes: string;
  ifcGuid: string;
  rowType: RowType;
  staartPercentage: number | null;
  nr: string;

  /** Per-row breakdown for staart_* items, populated by recalculateItems() */
  staartItemBreakdown?: StaartItemBreakdown;

  /**
   * Rekenbasis van een percentage-staartregel:
   * - 'cumulatief' (default, undefined): over het opgehoogde bedrag t/m de
   *   vorige staartregel (cascade, WPCalc-stijl).
   * - 'kostprijs': vlak over de directe kosten (BasCalc-stijl — 6/9/4% zijn
   *   dan alle drie over hetzelfde kostprijsbedrag).
   */
  staartBasis?: 'cumulatief' | 'kostprijs' | null;

  /**
   * Alleen op staart_afronding: sluit de aanneemsom exact op dit doelbedrag
   * (afronding = doel − som van kostprijs en opslagen), zoals de vaste
   * afrondingspost in BasCalc. null/undefined = automatisch afronden.
   */
  staartDoelbedrag?: number | null;

  /**
   * Alleen op staart_afronding: handmatig in het grid ingevuld
   * afrondingsbedrag (vaste sluitpost). Heeft voorrang op
   * staartDoelbedrag; null/undefined = automatisch afronden.
   */
  staartVastBedrag?: number | null;

  // Normberekening (alleen voor 'regel' rijen)
  normQuantity: number | null;
  normFactor: number | null;
  normDivisor: number | null;
  normUnitPrice: number | null;

  // Middelclassificatie (alleen voor 'regel' rijen)
  resourceType: ResourceType | null;
  resourceLibraryId: string | null;

  // Tariefgroep (A/B/C) voor loonberekening
  tariefGroep: 'A' | 'B' | 'C' | null;

  // RAW verrekenbaarheid
  verrekenbaar: Verrekenbaarheid;

  // Excel-link voor hoeveelheid
  excelLink?: ExcelLink | null;

  // Branch (variant) — null/'main' = shown in all variants
  branchId?: string | null;

  // Hoeveelheid-link: pick waarde uit spreadsheet / PDF meting / IFC quantity
  quantityLink?: QuantityLink | null;

  /**
   * Wijzigingshistorie van deze regel: per veldwijziging de oude/nieuwe waarde,
   * wanneer en door welke Windows-gebruiker. Optioneel — oudere bestanden en
   * verse regels hebben (nog) geen historie. Zie services/history/itemHistory.
   */
  history?: FieldChange[];
}

/** Eén vastgelegde veldwijziging op een CostItem (zie itemHistory.ts). */
export interface FieldChange {
  /** veldnaam, bv. 'quantity', 'description', 'materialPrice' */
  field: string;
  /** waarde vóór de wijziging */
  oldValue: string | number | boolean | null;
  /** waarde ná de wijziging */
  newValue: string | number | boolean | null;
  /** ISO-datumtijd van de wijziging */
  timestamp: string;
  /** Windows-gebruikersnaam die de wijziging deed */
  user: string;
}

/** Link a CostItem's quantity field to a value from another tab */
export type QuantityLink =
  | { source: 'spreadsheet'; sheetId: string; cellRef: string }
  | { source: 'pdf'; measurementId: string; kind: 'length' | 'area' | 'sum-length' | 'sum-area' }
  | { source: 'ifc'; fragmentId: string; quantity: 'volume' | 'area' | 'length' | 'count' };

export interface ExcelLink {
  filePath: string;
  sheet: string;
  cell: string;
}

export interface CostSchedule {
  id: string;
  name: string;
  description: string;
  status: 'DRAFT' | 'FINAL' | 'REVISED';
  predefinedType: 'BUDGET' | 'ESTIMATE' | 'TENDER';
  currency: string;
  projectName: string;
  projectNumber: string;
  client: string;
  author: string;
  reportDate?: string;  // ISO YYYY-MM-DD, default today (used in PDF header)
  ifcGuid: string;
  uitvoeringskosten: number;
  algemeneKosten: number;
  winstRisico: number;
  tarieven?: Record<string, number>;  // e.g. { A: 64, B: 43, C: 82, D: 88 }
  staartRows?: StagartRow[];          // imported staart breakdown
  projectProperties?: ProjectProperty[];  // building metrics (Bruto inhoud, BVO, etc.)
  projectInfo?: ProjectInfo;               // v2: project metadata for offerte
  branches?: Branch[];                     // Budget variants (git-like tree)
  branchesEnabled?: boolean;               // Toggle to show Branch column in grid
  activeBranchId?: string;                 // Currently selected branch for filtering
  reportLogoPreset?: 'bouw1' | 'custom';  // Which logo set to use in PDF reports (default: 'bouw1')
  /**
   * Wijzigingen-bijhouden ("track changes"): ISO-tijdstip vanaf wanneer
   * regelwijzigingen visueel gemarkeerd worden in de grid. null/undefined = uit.
   * Een regel kleurt als ze een history-entry heeft met timestamp >= deze waarde.
   */
  changeTrackingSince?: string | null;
  /**
   * Hoe gewijzigde regels gemarkeerd worden: 'row' = hele regel kleuren
   * (default), 'cell' = alleen de gewijzigde cel(len).
   */
  changeDisplayMode?: 'row' | 'cell';
  /** Toon wijzigingsmarkeringen ook in de rapportage-PDF. Default false. */
  reportShowChanges?: boolean;
  /**
   * Rapportage: toon alleen het subtotaal per hoofdstuk — posten, regels en
   * opmerkingen worden weggelaten; de staart blijft staan. Default false.
   */
  reportChapterTotalsOnly?: boolean;
  /**
   * Rapportage: toon de verrekenbaar-kolom (S/Verr., 'V') in tabelrapporten.
   * undefined = tonen (bestaand gedrag); false = kolom weglaten.
   */
  reportShowVerrekenbaar?: boolean;
}

/** Budget variant branch — forms a tree via parentId */
export interface Branch {
  id: string;
  name: string;
  parentId: string | null;   // null = root (main)
  color?: string;            // optional color for UI
}

export interface StagartRow {
  label: string;
  percentage: number | null;
  loon: number | null;
  materiaal: number | null;
  materieel: number | null;
  stelpost: number | null;
  onderaanneming: number | null;
  bedrag: number | null;
  subtotaal: number | null;
  totaal: number | null;
  itemtype: number;
}

/** Per-staart-row breakdown computed live by calculator.
 *  Replaces cached schedule.staartRows for reporting. */
export interface StaartItemBreakdown {
  loon: number;
  materiaal: number;
  materieel: number;
  stelpost: number;
  onderaanneming: number;
  bedrag: number;       // base amount the percentage is applied to (for staart_risico/winst/etc)
  subtotaal: number;    // this row's total contribution (percentage * base, or sum of resource cols)
  totaal: number;       // running cumulative grand total up to and including this row
}

export interface CompanyInfo {
  name: string;
  postalAddress: string;
  postalCity: string;
  visitAddress: string;
  visitCity: string;
  phone: string;
  fax: string;
  email: string;
  logoLeft: string;   // base64 encoded PNG (leeg = standaard logo)
  logoRight: string;  // base64 encoded PNG (leeg = standaard logo)
}

export interface ResourceLibraryItem {
  id: string;
  code: string;
  description: string;
  unit: CostUnit;
  resourceType: ResourceType;
  defaultUnitPrice: number | null;
  category: string;
}

export interface GridColumn {
  key: string;
  label: string;
  abbr?: string;
  width: number;
  minWidth: number;
  editable: boolean;
  type: 'text' | 'number' | 'currency' | 'computed' | 'unit-select' | 'vn-select' | 'tarief-select';
  align: 'left' | 'right' | 'center';
  tooltip?: string;
}

export interface SpreadsheetsData {
  sheets: SubSheet[];
  activeSheetId: string | null;
}

export interface ProjectFile {
  version: string;
  schedule: CostSchedule;
  items: CostItem[];
  resourceLibrary?: ResourceLibraryItem[];
  companyInfo: CompanyInfo;
  /** @deprecated v2.0 — use `spreadsheets` (v2.1+). Kept for backward-compat reading. */
  subSheets?: SubSheet[];
  spreadsheets?: SpreadsheetsData;
  offerte?: OfferteDocument;
  snapshots?: ProjectSnapshot[];
  brandSlug?: string;            // Referentie naar huisstijl (bijv. 'bouw1', 'custom')
  createdAt: string;
  modifiedAt: string;
}

// ── Versioning / Snapshots ──

export interface ProjectSnapshot {
  id: string;
  label: string;                     // "Versie 31-03-2026" of "Offerte v2 naar klant"
  timestamp: string;                 // ISO datetime
  type: 'verstuurd' | 'concept' | 'definitief' | 'gewijzigd';
  notitie: string;                   // Gebruikersnotitie bij deze versie
  schedule: CostSchedule;            // Snapshot van schedule op dat moment
  items: CostItem[];                 // Snapshot van alle items
  offerte?: OfferteDocument;         // Snapshot van offerte (indien aanwezig)
  totaalExclBtw: number;             // Berekende totaal op moment van snapshot
}

export interface SnapshotDiff {
  type: 'added' | 'removed' | 'changed';
  itemId: string;
  field?: string;
  oldValue?: string | number | null;
  newValue?: string | number | null;
  description: string;
}

export interface DocumentTab {
  id: string;
  filePath: string | null;
  fileName: string;
  isModified: boolean;
  items: CostItem[];
  schedule: CostSchedule;
}

/** Snapshot of all per-document state, stored when switching tabs */
export interface DocumentData {
  items: CostItem[];
  schedule: CostSchedule;
  companyInfo: CompanyInfo;
  subSheets: SubSheet[];
  activeSubSheetId: string | null;
  undoStack: { items: CostItem[]; description: string }[];
  redoStack: { items: CostItem[]; description: string }[];
  activeRow: number;
  activeCol: number;
  selectionStart: number | null;
  selectionEnd: number | null;
  scrollTop: number;
}

// ── Sub-sheets (deelberekeningen) ──

export interface SubSheet {
  id: string;
  name: string;
  columns: number;  // default 10
  rows: number;     // default 50
  cells: Record<string, SubSheetCell>;  // keyed by "A1", "B2", etc.
  rowColors?: Record<number, string>;      // row index → hex color
  columnWidths?: Record<string, number>;   // col letter → px
  zoomLevel?: number;                      // 0.5..2.0, default 1.0
}

export type CellAlign = 'left' | 'center' | 'right';
export type CellFormat = 'auto' | 'number' | 'currency' | 'percentage' | 'text';

export interface CellBorder {
  style: 'none' | 'solid' | 'dashed';
  width: 1 | 2 | 3;
  color: string; // hex
}

export interface CellBorders {
  top?: CellBorder;
  right?: CellBorder;
  bottom?: CellBorder;
  left?: CellBorder;
}

export interface SubSheetCell {
  value: string;          // raw input (can be formula starting with =)
  computed?: number;      // evaluated numeric result (if formula)
  format?: CellFormat;
  bold?: boolean;
  italic?: boolean;
  align?: CellAlign;
  decimals?: number;      // number of decimal places (default 2)
  fontSize?: number;      // font size in px (default 11)
  borders?: CellBorders;
}

// ── Offerte module ──

export type OfferteType = 'particulier' | 'raw' | 'eenvoudig';
export type OfferteSectionType = 'technisch' | 'opties' | 'opdrachtgever' | 'betalingstermijnen' | 'garanties' | 'vrij' | 'meerwerk';

export interface OfferteDocument {
  id: string;
  type: OfferteType;
  offerteNummer: string;
  offerteDatum: string;
  geldigheid: number;
  geadresseerde: OfferteGeadresseerde;
  begeleidendSchrijven: string;
  secties: OfferteSection[];
  betalingstermijnen: BetalingsTermijn[];
  garanties: Garantie[];
  voorwaarden: string;
  ondertekening: Ondertekenaar[];
}

export interface OfferteGeadresseerde {
  naam: string;
  adres: string;
  postcode: string;
  plaats: string;
}

export interface OfferteSection {
  id: string;
  titel: string;
  type: OfferteSectionType;
  linkedChapterId: string | null;
  begeleidendeTekst: string;
  items: OfferteSectionItem[];
}

export interface OfferteSectionItem {
  id: string;
  onderdeel: string;
  omschrijving: string;
  afbeeldingPath: string | null;  // deprecated — use afbeeldingen[]
  linkedCostItemId: string | null;
  properties: OfferteProperty[];
  layers: OfferteMaterialLayer[];
  priceOverride: number | null;
  pricePerUnit: number | null;
  priceUnit: string | null;
  isSelected: boolean;
  // v2 fields
  afbeeldingen: OfferteImage[];
  subItems: string[];
}

export interface BetalingsTermijn {
  id: string;
  beschrijving: string;
  percentage: number;
  toelichting: string;
}

export interface Garantie {
  id: string;
  onderdeel: string;
  termijn: string;
  toelichting: string;
  linkedCostItemIds: string[];
}

export interface Ondertekenaar {
  naam: string;
  functie: string;
  email: string;
  telefoon: string;
}

export type LayerFunction = 'constructie' | 'isolatie' | 'beplating' | 'afwerking' | 'folie' | 'overig';

export interface OfferteProperty {
  id: string;
  name: string;
  value: string;
  unit?: string;
}

export interface OfferteMaterialLayer {
  id: string;
  material: string;
  thickness: number | null;
  function: LayerFunction;
  rcValue: number | null;
}

export interface ProjectProperty {
  id: string;
  name: string;
  value: number | null;
  unit: string;
  isDefault?: boolean;  // true for Bruto inhoud and BVO — cannot be deleted
}

// ── Offerte v2: afbeeldingen & projectinfo ──

export interface OfferteImage {
  id: string;
  path: string;
  thumbnail: string;  // base64 encoded
  caption?: string;
  widthMm?: number;
}

export interface ProjectInfo {
  projectType: string;  // 'waterwoning' | 'woning' | 'renovatie' | 'utiliteit' | custom
  architect: string;
  locatie: string;
  bouwmethode: string;
  tekeningSoort: string;
  renderImages: OfferteImage[];
  projectFotos: OfferteImage[];
  aanhefType: string;  // 'dhr' | 'mevr' | 'fam' | etc.
  aanhefNaam: string;
}

export interface OfferteTemplate {
  id: string;
  name: string;
  projectType: string;
  sections: OfferteTemplateSection[];
  defaultBetalingstermijnen: BetalingsTermijn[];
  defaultGaranties: Garantie[];
  defaultVoorwaarden: string;
}

export interface OfferteTemplateSection {
  titel: string;
  type: OfferteSectionType;
  linkedChapterCodes: string[];
}

export function createDefaultProjectInfo(): ProjectInfo {
  return {
    projectType: '',
    architect: '',
    locatie: '',
    bouwmethode: '',
    tekeningSoort: '',
    renderImages: [],
    projectFotos: [],
    aanhefType: 'dhr',
    aanhefNaam: '',
  };
}

export function createDefaultProjectProperties(): ProjectProperty[] {
  return [
    { id: crypto.randomUUID(), name: 'Bruto inhoud', value: null, unit: 'm\u00B3', isDefault: true },
    { id: crypto.randomUUID(), name: 'BVO', value: null, unit: 'm\u00B2', isDefault: true },
  ];
}

/** Helper: check if a row type is a "staart" (surcharge) type */
export function isStagartRowType(rowType: RowType): boolean {
  return rowType.startsWith('staart_');
}

/** Helper: check if a row type can have children */
export function isContainerRowType(rowType: RowType): boolean {
  return rowType === 'chapter' || rowType === 'begrotingspost' || rowType === 'bewakingspost';
}
