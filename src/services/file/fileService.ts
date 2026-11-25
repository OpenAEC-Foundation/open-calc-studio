import { uiText } from '../../i18n/uiText';
import type { ProjectFile, CostSchedule, CostItem, CompanyInfo, SubSheet, SpreadsheetsData, RowType, OfferteDocument, ProjectSnapshot } from '@/types/costModel';
import { defaultCompanyInfo } from '@/state/slices/companySlice';
import { createDefaultProjectInfo } from '@/types/costModel';
import { synthesizeStaartItems, ensureBtwLaagItem } from '@/services/calculation/staartDefaults';
import { usedPriceArticles } from '@/services/pricing/priceUpdates';
import { generateIfcGuid, toIfcGlobalId } from '@/services/ifc/ifcHelpers';

/**
 * Huidige versie van het .ifcCalc-bestandsformaat (major.minor.patch).
 * Eén bron van waarheid — overal dit gebruiken, nooit een losse literal.
 * Beleid en versiehistorie: docs/ifccalc-formaat.md.
 * - major omhoog = breaking (oudere apps weigeren met nette melding)
 * - minor omhoog = additief (oudere bestanden migreren automatisch mee)
 */
export const FILE_FORMAT_VERSION = '2.4.0';

function createProjectFile(
  schedule: CostSchedule,
  items: CostItem[],
  companyInfo?: CompanyInfo,
  spreadsheets?: SpreadsheetsData | SubSheet[],
  offerte?: OfferteDocument,
  snapshots?: ProjectSnapshot[],
): ProjectFile {
  const spreadsheetsData: SpreadsheetsData = Array.isArray(spreadsheets)
    ? { sheets: spreadsheets, activeSheetId: spreadsheets[0]?.id ?? null }
    : spreadsheets ?? { sheets: [], activeSheetId: null };
  return {
    version: FILE_FORMAT_VERSION,
    schedule,
    items,
    resourceLibrary: usedPriceArticles(items),
    companyInfo: companyInfo ?? { ...defaultCompanyInfo },
    spreadsheets: spreadsheetsData,
    offerte,
    snapshots: snapshots && snapshots.length > 0 ? snapshots : undefined,
    createdAt: new Date().toISOString(),
    modifiedAt: new Date().toISOString(),
  };
}

export function serializeProject(
  schedule: CostSchedule,
  items: CostItem[],
  companyInfo?: CompanyInfo,
  spreadsheets?: SpreadsheetsData | SubSheet[],
  offerte?: OfferteDocument,
  snapshots?: ProjectSnapshot[],
): string {
  return JSON.stringify(createProjectFile(schedule, items, companyInfo, spreadsheets, offerte, snapshots), null, 2);
}

/** Migrate a v1 item (with isChapter, resources, rowType='normal') to v2 format */
function migrateItemV1toV2(item: any): CostItem {
  let rowType: RowType;

  if (item.isChapter) {
    rowType = 'chapter';
  } else if (item.rowType === 'normal') {
    rowType = 'begrotingspost';
  } else {
    // staart types pass through unchanged
    rowType = item.rowType;
  }

  return {
    id: item.id,
    parentId: item.parentId,
    sortOrder: item.sortOrder,
    code: item.code ?? '',
    description: item.description ?? '',
    unit: item.unit ?? 'st',
    quantity: item.quantity ?? null,
    materialPrice: item.materialPrice ?? null,
    laborPrice: item.laborPrice ?? null,
    unitPrice: item.unitPrice ?? 0,
    total: item.total ?? 0,
    isCollapsed: item.isCollapsed ?? false,
    depth: item.depth ?? 0,
    notes: item.notes ?? '',
    ifcGuid: item.ifcGuid || generateIfcGuid(), // geen lege GlobalId (knownbug 153)
    rowType,
    staartPercentage: item.staartPercentage ?? null,
    nr: item.nr ?? '',
    normQuantity: item.normQuantity ?? null,
    normFactor: item.normFactor ?? null,
    normDivisor: item.normDivisor ?? null,
    normUnitPrice: item.normUnitPrice ?? null,
    resourceType: item.resourceType ?? null,
    resourceLibraryId: item.resourceLibraryId ?? null,
    verrekenbaar: rowType === 'chapter' ? (item.verrekenbaar ?? 'V') : null,
    tariefGroep: item.tariefGroep ?? null,
  };
}

/**
 * Hoofdvariant met een oude willekeurige id (knownbug 160) omzetten naar
 * 'main', samen met alles wat ernaar verwijst. Alleen als er precies één
 * hoofdvariant met de naam "main" is en er nog geen variant 'main' bestaat.
 */
export function migrateLegacyMainBranch(schedule: { branches?: { id: string; name: string; parentId: string | null }[]; activeBranchId?: string | null }, items: { branchId?: string | null }[]): void {
  const branches = schedule.branches;
  if (!Array.isArray(branches) || branches.some(b => b.id === 'main')) return;
  const roots = branches.filter(b => b.parentId === null);
  if (roots.length !== 1 || roots[0].name !== 'main') return;
  const old = roots[0].id;
  for (const branch of branches) {
    if (branch.id === old) branch.id = 'main';
    if (branch.parentId === old) branch.parentId = 'main';
  }
  if (schedule.activeBranchId === old) schedule.activeBranchId = 'main';
  for (const item of items) if (item.branchId === old) item.branchId = 'main';
}

/** Is formaatversie `version` ouder dan `target` (major.minor.patch, numeriek vergeleken)? */
function formatVersionBefore(version: string, target: string): boolean {
  const a = version.split('.').map((n) => parseInt(n, 10) || 0), b = target.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) < (b[i] ?? 0);
  return false;
}

export function deserializeProject(json: string): ProjectFile {
  const parsed = JSON.parse(json);
  if (!parsed.schedule || !Array.isArray(parsed.items)) {
    throw new Error('Invalid file format');
  }
  // De versie zoals het bestand binnenkwam, vóór de migraties hieronder hem ophogen.
  const sourceVersion = parsed.version ? String(parsed.version) : '1.0.0';

  // Legacy files without version (e.g. raw schedule+items exports)
  if (!parsed.version) {
    parsed.version = '2.0.0';
    parsed.resourceLibrary = parsed.resourceLibrary ?? [];
    parsed.items = parsed.items.map(migrateItemV1toV2);
  }

  // Nieuwer-dan-deze-app: een hogere MAJOR betekent breaking wijzigingen die
  // deze app niet kent — weiger met een duidelijke melding in plaats van het
  // bestand half/fout te interpreteren (en bij opslaan stilletjes te slopen).
  const fileMajor = parseInt(String(parsed.version).split('.')[0], 10);
  const appMajor = parseInt(FILE_FORMAT_VERSION.split('.')[0], 10);
  if (!isNaN(fileMajor) && fileMajor > appMajor) {
    throw new Error(
      uiText("diagnostics.fileService.thisFileUsesANewerIfcCalcFormat", "This file uses a newer .ifcCalc format ({{p0}}) than this app supports (up to {{p1}}). Update Open Calc Studio to open it.", { p0: parsed.version, p1: FILE_FORMAT_VERSION })
    );
  }

  // Migrate v1 files to v2
  const isV1 = parsed.version.startsWith('1.');
  if (isV1) {
    parsed.version = '2.0.0';
    parsed.items = parsed.items.map(migrateItemV1toV2);
    parsed.resourceLibrary = parsed.resourceLibrary ?? [];
  }

  // Backward compatibility: ensure offerte section items have v2 fields
  if (parsed.offerte?.secties) {
    for (const section of parsed.offerte.secties) {
      if (Array.isArray(section.items)) {
        for (const item of section.items) {
          if (!item.afbeeldingen) item.afbeeldingen = [];
          if (!item.subItems) item.subItems = [];
        }
      }
    }
  }

  // Backward compatibility: ensure projectInfo exists on schedule
  if (!parsed.schedule.projectInfo) {
    parsed.schedule.projectInfo = createDefaultProjectInfo();
  }

  // De project-GlobalId van de IFC-export is schedule.ifcGuid. Een lege of ongeldige waarde
  // (oudere bestanden: leeg, of een UUID van 36 tekens uit de inschrijfstaat-import) eenmalig
  // herstellen, zodat de GlobalId daarna bij elke export gelijk blijft (knownbugs 151, 153).
  if (toIfcGlobalId(parsed.schedule.ifcGuid) !== parsed.schedule.ifcGuid) {
    parsed.schedule.ifcGuid = toIfcGlobalId(parsed.schedule.ifcGuid) ?? generateIfcGuid();
  }

  // Backward compatibility: branches fields
  if (parsed.schedule.branchesEnabled === undefined) {
    parsed.schedule.branchesEnabled = false;
  }
  if (!Array.isArray(parsed.schedule.branches)) {
    parsed.schedule.branches = [];
  }

  // Knownbug 160: "Create main" maakte vroeger een hoofdvariant met een
  // willekeurige id. De rest van de app herkent alleen de id 'main'; zet zo'n
  // hoofdvariant (ook in de momentopnamen) om naar 'main'.
  migrateLegacyMainBranch(parsed.schedule, parsed.items);
  if (Array.isArray(parsed.snapshots)) {
    for (const snapshot of parsed.snapshots) {
      if (snapshot?.schedule && Array.isArray(snapshot.items)) migrateLegacyMainBranch(snapshot.schedule, snapshot.items);
    }
  }

  // v2.0 → v2.1 — subSheets[] promoted to spreadsheets object
  if (parsed.version === '2.0.0' || parsed.version === '2.0') {
    parsed.spreadsheets = {
      sheets: parsed.subSheets ?? [],
      activeSheetId: parsed.subSheets?.[0]?.id ?? null,
    };
    delete parsed.subSheets;
    parsed.version = '2.1.0';
  }
  // Ensure v2.1+ has the spreadsheets object even if missing
  if (!parsed.spreadsheets) {
    parsed.spreadsheets = { sheets: [], activeSheetId: null };
  }

  // Migrate: legacy schedule.staartRows → staart_* CostItems
  // (Required so live staart calculation has items to operate on.)
  // Alleen voor oudere formaatversies: in een nieuwer bestand heeft de gebruiker de
  // staartregels zelf verwijderd, en die mogen niet bij elke keer openen terugkomen
  // (knownbug 107). Staart-rijen bestaan sinds 2.1.0 (v0.7.4); 2.2.0 kwam daarna.
  if (parsed.items && Array.isArray(parsed.items)) {
    const hasStaartItems = parsed.items.some(
      (it: any) => typeof it?.rowType === 'string' && it.rowType.startsWith('staart_'),
    );
    if (formatVersionBefore(sourceVersion, '2.2.0') && !hasStaartItems && !parsed.schedule.budgetExchange?.directCostsOnly && !parsed.schedule.directCostsOnly) {
      const staartItems = synthesizeStaartItems(parsed.schedule);
      parsed.items = [...parsed.items, ...staartItems];
    }
    // Migrate: staart van vóór het lage btw-tarief krijgt een "Btw laag"-regel
    // (9%, zonder grondslag → € 0 tot de grondslag wordt ingevuld). Btw laag kwam
    // tijdens formaat 2.2.0; vanaf 2.3.0 is een ontbrekende regel bewust verwijderd.
    if (formatVersionBefore(sourceVersion, '2.3.0')) parsed.items = ensureBtwLaagItem(parsed.items);
  }

  return parsed as ProjectFile;
}

