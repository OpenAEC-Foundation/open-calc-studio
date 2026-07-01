import type { ProjectFile, CostSchedule, CostItem, CompanyInfo, SubSheet, SpreadsheetsData, RowType, OfferteDocument, ProjectSnapshot } from '@/types/costModel';
import { defaultCompanyInfo } from '@/state/slices/companySlice';
import { createDefaultProjectInfo } from '@/types/costModel';
import { synthesizeStaartItems } from '@/services/calculation/staartDefaults';

/**
 * Huidige versie van het .ifcCalc-bestandsformaat (major.minor.patch).
 * Eén bron van waarheid — overal dit gebruiken, nooit een losse literal.
 * Beleid en versiehistorie: docs/ifccalc-formaat.md.
 * - major omhoog = breaking (oudere apps weigeren met nette melding)
 * - minor omhoog = additief (oudere bestanden migreren automatisch mee)
 */
export const FILE_FORMAT_VERSION = '2.2.0';

export function createProjectFile(
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
    resourceLibrary: [],
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
    ifcGuid: item.ifcGuid ?? '',
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

export function deserializeProject(json: string): ProjectFile {
  const parsed = JSON.parse(json);
  if (!parsed.schedule || !Array.isArray(parsed.items)) {
    throw new Error('Invalid file format');
  }

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
      `Dit bestand gebruikt een nieuwer .ifcCalc-formaat (${parsed.version}) dan deze app ondersteunt (t/m ${FILE_FORMAT_VERSION}). Werk Open Calc Studio bij om het te openen.`
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

  // Backward compatibility: branches fields
  if (parsed.schedule.branchesEnabled === undefined) {
    parsed.schedule.branchesEnabled = false;
  }
  if (!Array.isArray(parsed.schedule.branches)) {
    parsed.schedule.branches = [];
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
  if (parsed.items && Array.isArray(parsed.items)) {
    const hasStaartItems = parsed.items.some(
      (it: any) => typeof it?.rowType === 'string' && it.rowType.startsWith('staart_'),
    );
    if (!hasStaartItems) {
      const staartItems = synthesizeStaartItems(parsed.schedule);
      parsed.items = [...parsed.items, ...staartItems];
    }
  }

  return parsed as ProjectFile;
}

/** Alias of `deserializeProject` — matches v0.5.2+ naming. */
export const parseProjectFile = deserializeProject;
