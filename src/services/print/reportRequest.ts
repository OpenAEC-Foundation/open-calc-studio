/**
 * Schedule- en itemvelden voor de PDF-request naar Rust (Bouw 1, IBIS,
 * directie en de generieke rapporten). De veldnamen volgen de serde-namen
 * van `ReportRequest`/`CostItem` in src-tauri/src/reports/mod.rs.
 *
 * Altijd alle regels meesturen: met "alleen hoofdstuktotalen" filtert Rust
 * zelf de getoonde rijen (reportChapterTotalsOnly), maar rekent de staart
 * over alle regels — net als de app.
 */
import type { CostItem, CostSchedule } from '@/types/costModel';

export function reportRequestSchedule(schedule: CostSchedule) {
  return {
    name: schedule.name,
    projectName: schedule.projectName,
    projectNumber: schedule.projectNumber,
    client: schedule.client,
    author: schedule.author,
    description: schedule.description,
    status: schedule.status,
    algemeneKosten: schedule.algemeneKosten,
    winstRisico: schedule.winstRisico,
    tarieven: schedule.tarieven,
    staartRows: schedule.staartRows || null,
    reportShowChanges: schedule.reportShowChanges ?? false,
    reportShowVerrekenbaar: schedule.reportShowVerrekenbaar ?? null,
    reportAmountsSubtotalsOnly: schedule.reportAmountsSubtotalsOnly ?? false,
    reportChapterTotalsOnly: schedule.reportChapterTotalsOnly ?? false,
    reportHeaderHeightMm: schedule.reportHeaderHeightMm ?? null,
    reportHeaderLineColor: schedule.reportHeaderLineColor ?? null,
    changeTrackingSince: schedule.changeTrackingSince ?? null,
  };
}

export function reportRequestItems(items: CostItem[]) {
  return items.map(item => ({
    id: item.id,
    code: item.code,
    description: item.description,
    nr: item.nr || null,
    rowType: item.rowType,
    quantity: item.quantity,
    unit: item.unit,
    unitPrice: item.unitPrice,
    total: item.total,
    normUnitPrice: item.normUnitPrice,
    // Materiaalprijs van een kale post (kostprijskolom materiaal vs. loon)
    materialPrice: item.materialPrice ?? null,
    laborPrice: item.laborPrice,
    depth: item.depth,
    parentId: item.parentId,
    staartPercentage: item.staartPercentage,
    staartBasis: item.staartBasis ?? null,
    staartDoelbedrag: item.staartDoelbedrag ?? null,
    // Btw: per-onderdeel tarief en de handmatige laag-grondslag
    staartBtwBasis: item.staartBtwBasis ?? null,
    btwTarief: item.btwTarief ?? null,
    verrekenbaar: item.verrekenbaar,
    resourceType: item.resourceType,
    tariefGroep: item.tariefGroep,
    normQuantity: item.normQuantity,
    normFactor: item.normFactor,
    normDivisor: item.normDivisor,
    history: item.history ?? null,
  }));
}
