/**
 * WPCalc (.calc) exporter
 *
 * Exports the app's internal data model to a WPCalc-compatible Access MDB file.
 * This requires the Tauri backend (Windows only) since MDB writing uses ODBC via PowerShell.
 *
 * The Rust Tauri command:
 * 1. Copies an embedded empty .calc MDB template to the target path
 * 2. Populates all tables (calculaties, data, staart, tarieven) via ADO/OLEDB
 */

import type { CostItem, CostSchedule, CompanyInfo, StagartRow, StaartItemBreakdown } from '@/types/costModel';
import { isTauriEnvironment } from '@/services/file/nativeFileService';
import { computeKostprijsBreakdown, computeStaartItemBreakdowns, effectiveTarieven } from '@/services/calculation/calculator';

/**
 * Export the current budget as a WPCalc .calc file.
 * Returns the saved file path, or null if cancelled.
 */
export async function exportWpCalcFile(
  schedule: CostSchedule,
  items: CostItem[],
  companyInfo?: CompanyInfo | null,
): Promise<string | null> {
  if (!isTauriEnvironment()) {
    throw new Error('WPCalc export is only available in the desktop app (requires Access OLEDB driver).');
  }

  // Show save dialog
  const { save } = await import('@tauri-apps/plugin-dialog');
  const outputPath = await save({
    filters: [{ name: 'WPCalc', extensions: ['calc'] }],
    defaultPath: `${schedule.projectName || schedule.name || 'begroting'}.calc`,
  });

  if (!outputPath) return null;

  // Build the export request matching the Rust struct
  const request = buildExportRequest(schedule, items, companyInfo);

  // Invoke the Tauri command
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('export_wpcalc', {
    request,
    outputPath,
  });

  return outputPath;
}

/**
 * Transform the app's data model into the WpCalcExportRequest format
 * expected by the Rust backend.
 */
export function buildExportRequest(
  schedule: CostSchedule,
  items: CostItem[],
  companyInfo?: CompanyInfo | null,
) {
  return {
    schedule: {
      name: schedule.name || '',
      projectName: schedule.projectName || '',
      projectNumber: schedule.projectNumber || '',
      client: schedule.client || '',
      author: schedule.author || '',
      description: schedule.description || '',
      algemeneKosten: schedule.algemeneKosten || 0,
      winstRisico: schedule.winstRisico || 0,
      // De tarieven waarmee de app rekent: zonder (of met een lege) tabel de
      // standaardtarieven, anders schrijft de export loon 0 (knownbug 287).
      tarieven: effectiveTarieven(schedule),
      // De staart zoals hij nu in de app staat, niet de staartRows van een
      // eerdere WpCalc-import (knownbug 272).
      staartRows: buildStaartRows(items),
    },
    items: items
      .filter((item) => !item.rowType.startsWith('staart_'))
      .map((item) => ({
        id: item.id,
        code: item.code || '',
        description: item.description || '',
        rowType: item.rowType,
        quantity: item.quantity,
        unit: item.unit || 'st',
        unitPrice: item.unitPrice || 0,
        total: item.total || 0,
        materialPrice: item.materialPrice,
        laborPrice: item.laborPrice,
        depth: item.depth || 0,
        parentId: item.parentId,
        sortOrder: item.sortOrder || 0,
        resourceType: item.resourceType,
        tariefGroep: item.tariefGroep,
        // WpCalc kent geen productiecapaciteit: de norm daar is uren per
        // eenheid. Stuur daarom norm ÷ capaciteit mee, anders rekent de
        // export (kosteneh = prijs + norm × tarief) het loon te hoog.
        normQuantity: item.normQuantity != null ? item.normQuantity / (item.normFactor || 1) : null,
        normUnitPrice: item.normUnitPrice,
      })),
    companyInfo: companyInfo
      ? {
          name: companyInfo.name || '',
          postalAddress: companyInfo.postalAddress || '',
          postalCity: companyInfo.postalCity || '',
        }
      : null,
  };
}

/** WpCalc-label en itemtype per staartsoort (1 = over de kolommen, 2 = over de kostprijs, 64 = btw, 128 = afronding). */
const STAART_EXPORT: Record<string, { label: string; itemtype: number }> = {
  staart_ak_oa: { label: 'Algemene kosten over onderaanneming:', itemtype: 1 },
  staart_abk: { label: 'Algemene bedrijfskosten:', itemtype: 1 },
  staart_garanties: { label: 'Garanties:', itemtype: 1 },
  staart_wvpm: { label: 'Werkvoorbereiding & projectmanagement', itemtype: 1 },
  staart_ukk: { label: 'Uitvoeringskosten:', itemtype: 1 },
  staart_risico: { label: 'Risico:', itemtype: 2 },
  staart_winst: { label: 'Winst:', itemtype: 2 },
  staart_verzekering: { label: 'Verzekering:', itemtype: 2 },
  staart_ak: { label: 'Algemene kosten:', itemtype: 2 },
  staart_wr: { label: 'Winst & risico:', itemtype: 2 },
  staart_afronding: { label: 'Afronding', itemtype: 128 },
  staart_btw_laag: { label: 'Btw laag:', itemtype: 64 },
  staart_btw: { label: 'Btw hoog:', itemtype: 64 },
};
const PHASE1 = ['staart_ak_oa', 'staart_abk', 'staart_garanties', 'staart_wvpm'];
const PHASE2 = ['staart_risico', 'staart_winst', 'staart_verzekering', 'staart_ukk', 'staart_ak', 'staart_wr'];
const BTW = ['staart_btw_laag', 'staart_btw'];

/**
 * Staartregels voor het WpCalc-bestand, gebouwd uit de staart_*-regels zoals
 * de app ze nu rekent (percentage, grondslag, bedrag, lopend totaal), in de
 * volgorde van het staartpaneel. Zonder staartregels `null`: dan schrijft de
 * Rust-kant alleen de standaard totaalregels.
 */
export function buildStaartRows(items: CostItem[]): StagartRow[] | null {
  const live = computeStaartItemBreakdowns(items);
  const staart = live.filter((i) => i.rowType in STAART_EXPORT);
  if (staart.length === 0) return null;

  const kolommen = computeKostprijsBreakdown(live);
  const totaalKolommen = kolommen.loon + kolommen.materiaal + kolommen.materieel + kolommen.stelpost + kolommen.onderaanneming;
  const empty = { loon: null, materiaal: null, materieel: null, stelpost: null, onderaanneming: null, bedrag: null, subtotaal: null };
  const totalRow = (label: string, itemtype: number, totaal: number): StagartRow =>
    ({ label, percentage: null, ...empty, totaal, itemtype });
  const rowOf = (item: CostItem): StagartRow => {
    const { label, itemtype } = STAART_EXPORT[item.rowType];
    const bd: StaartItemBreakdown | undefined = item.staartItemBreakdown;
    return {
      // Vaste WpCalc-labels, zodat de import elke regel weer herkent.
      label,
      percentage: item.rowType === 'staart_afronding' ? null : item.staartPercentage ?? null,
      loon: bd?.loon ?? null,
      materiaal: bd?.materiaal ?? null,
      materieel: bd?.materieel ?? null,
      stelpost: bd?.stelpost ?? null,
      onderaanneming: bd?.onderaanneming ?? null,
      bedrag: bd?.bedrag ?? null,
      subtotaal: bd?.subtotaal ?? item.total,
      totaal: bd?.totaal ?? null,
      itemtype,
    };
  };
  const ofTypes = (types: string[]) =>
    types.flatMap((rt) => staart.filter((i) => i.rowType === rt)).map(rowOf);
  const som = (rows: StagartRow[]) => rows.reduce((s, r) => s + (r.subtotaal ?? 0), 0);

  const phase1 = ofTypes(PHASE1);
  const excl = [...ofTypes(PHASE2), ...ofTypes(['staart_afronding'])];
  const btw = ofTypes(BTW);
  const kostprijs = totaalKolommen + som(phase1);
  const exclBtw = kostprijs + som(excl);
  return [
    { ...totalRow('Totaal kolommen:', 32, totaalKolommen), ...kolommen },
    ...phase1, totalRow('Totaal kostprijs:', 4, kostprijs),
    ...excl, totalRow('Totaal excl. btw.:', 4, exclBtw),
    ...btw, totalRow('Totaalprijs incl. btw.:', 4, exclBtw + som(btw)),
  ];
}
