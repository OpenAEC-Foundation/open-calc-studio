/**
 * Export budget data as an Inschrijfstaat RAW Excel file (.xls/.xlsx).
 * Produces the same format as WpCalc/BasCalc inschrijfstaat exports:
 *
 * Row structure:
 *   Row 0:  %_vrij_% metadata
 *   Row 1:  Settings (delete_off, insert_off, sort_off)
 *   Row 2:  Column config (widths, hide flags)
 *   Row 3-5: Company info (name, address, city)
 *   Row 6:  Empty
 *   Row 7:  Title "I N S C H R I J F S T A A T"
 *   Row 8:  Empty
 *   Row 9:  Project name + Bestek nr
 *   Row 10: Document nr + Opdrachtgever
 *   Row 11: Empty
 *   Row 12: Column headers
 *   Row 13+: Data rows (vr=data, vs=subtotal, vt=total)
 *
 * Columns: A(type,hidden) B(hidden) C(Code) D(Omschrijving)
 *          E(Hoeveelheid) F(Eenheid) G(S/verr) H(ehpr) I(bedrag) J(hidden)
 */

import type { CostItem, CostSchedule, CompanyInfo } from '@/types/costModel';

function spaceOutTitle(text: string): string {
  return text.split('').join(' ');
}

function mapUnitToExport(unit: string): string {
  switch (unit) {
    case 'm²': return 'm2';
    case 'm³': return 'm3';
    case 'post': return 'EUR';
    default: return unit;
  }
}

export function exportInschrijfstaat(
  schedule: CostSchedule,
  items: CostItem[],
  companyInfo?: CompanyInfo | null,
): ArrayBuffer {
  // We use the xlsx library (already available as dependency)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const XLSX = (window as any).__xlsx_module;
  if (!XLSX) {
    // Fallback: build without xlsx — use dynamic import approach
    throw new Error('XLSX module not available');
  }

  return buildWorkbook(XLSX, schedule, items, companyInfo);
}

/**
 * Build the workbook using the XLSX library reference.
 * This is called from the async wrapper that loads xlsx.
 */
export function buildInschrijfstaatRows(
  schedule: CostSchedule,
  items: CostItem[],
  companyInfo?: CompanyInfo | null,
): any[][] {
  const rows: any[][] = [];

  // Row 0: metadata
  rows.push(['%_vrij_%', '', '', 0, '', '', '', 0, 0, 0]);
  // Row 1: settings
  rows.push([4, 'delete_off insert_off sort_off', '', '', '', '', '', '', '', '']);
  // Row 2: column config
  rows.push([2, 'hide', 'w:7', '', 'w:9', 'w:4', 'w:2', 'w:9', 'sub w:11', 'hide']);

  // Rows 3-5: Company info
  rows.push(['vk', '', companyInfo?.name || '', '', '', '', '', '', '', '']);
  rows.push(['vk', '', companyInfo?.postalAddress || '', '', '', '', '', '', '', '']);
  rows.push(['vk', '', companyInfo?.postalCity || '', '', '', '', '', '', '', '']);
  // Row 6: empty
  rows.push(['vk', '', '', '', '', '', '', '', '', '']);
  // Row 7: Title
  rows.push(['vk', '', '', spaceOutTitle('INSCHRIJFSTAAT'), '', '', '', '', '', '']);
  // Row 8: empty
  rows.push(['vk', '', '', '', '', '', '', '', '', '']);
  // Row 9: Project + Bestek
  rows.push(['vk', '', `Project: ${schedule.projectName || schedule.name || ''}`, '', '', '', '', '',
    `Bestek: ${schedule.projectNumber || schedule.description || ''}`, `Bestek: ${schedule.projectNumber || schedule.description || ''}`]);
  // Row 10: Nummer + Opdrachtgever
  rows.push(['vk', '', `Nummer: ${schedule.id || ''}`, '', '', '', '', '',
    `Opdrachtgever: ${schedule.client || ''}`, `Opdrachtgever: ${schedule.client || ''}`]);
  // Row 11: empty
  rows.push(['vk', '', '', '', '', '', '', '', '', '']);
  // Row 12: Column headers
  rows.push(['vk', '', 'Code', 'Omschrijving', 'Hoeveelheid', 'Eh.', 'S', 'ehpr iss', 'bedr iss', '']);

  // Build hierarchy for subtotal insertion
  const childrenMap = new Map<string | null, CostItem[]>();
  for (const item of items) {
    const pid = item.parentId;
    if (!childrenMap.has(pid)) childrenMap.set(pid, []);
    childrenMap.get(pid)!.push(item);
  }

  function getChildren(parentId: string | null): CostItem[] {
    return (childrenMap.get(parentId) ?? []).sort((a, b) => a.sortOrder - b.sortOrder);
  }

  function isChapterLevel(item: CostItem): boolean {
    return item.rowType === 'chapter';
  }

  // Recursively output items
  function outputItem(item: CostItem): void {
    if (item.rowType === 'witregel') return; // Skip blank lines

    const code = item.code || '';
    const desc = item.rowType === 'chapter'
      ? spaceOutTitle(item.description.toUpperCase())
      : item.description;
    const qty = (item.rowType === 'begrotingspost' || item.rowType === 'regel')
      ? (item.quantity ?? 0) : '';
    const unit = (item.rowType === 'begrotingspost' || item.rowType === 'regel')
      ? mapUnitToExport(item.unit || 'st') : '';
    const verr = item.rowType === 'chapter' ? (item.verrekenbaar || '') :
                 (item.rowType === 'begrotingspost' || item.rowType === 'regel')
                  ? 'N' : '';
    const ehpr = item.unitPrice || 0;
    const bedr = item.total || 0;

    rows.push(['vr', ' ', code, desc, qty, unit, verr, ehpr, bedr, 0]);

    // Output children
    const children = getChildren(item.id);
    for (const child of children) {
      // Skip regels in inschrijfstaat view — they're internal calculation details
      if (child.rowType === 'regel' || child.rowType === 'bewakingspost') {
        // In inschrijfstaat, we don't show sub-breakdown
        continue;
      }
      outputItem(child);
    }

    // If this is a top-level chapter, add subtotal
    if (isChapterLevel(item) && !item.parentId) {
      rows.push(['vs', ' ', '', 'Subtotaal\n', '', '', '', 0, bedr, bedr]);
    }
  }

  // Process top-level items
  const topItems = getChildren(null);
  for (const item of topItems) {
    outputItem(item);
  }

  // Total row
  const grandTotal = topItems.reduce((sum, i) => sum + (i.total || 0), 0);
  rows.push(['vt', ' ', '', 'Totaal', '', '', '', 0, grandTotal, grandTotal]);

  return rows;
}

/**
 * Export as XLSX ArrayBuffer
 */
function buildWorkbook(
  XLSX: any,
  schedule: CostSchedule,
  items: CostItem[],
  companyInfo?: CompanyInfo | null,
): ArrayBuffer {
  const rows = buildInschrijfstaatRows(schedule, items, companyInfo);

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Set column widths (matching original format)
  ws['!cols'] = [
    { hidden: true },    // A: type (hidden)
    { hidden: true },    // B: hidden
    { wch: 10 },         // C: Code
    { wch: 40 },         // D: Omschrijving
    { wch: 12 },         // E: Hoeveelheid
    { wch: 5 },          // F: Eenheid
    { wch: 3 },          // G: S
    { wch: 12 },         // H: ehpr iss
    { wch: 14 },         // I: bedr iss
    { hidden: true },    // J: hidden
  ];

  // Format number cells
  for (let r = 13; r < rows.length; r++) {
    const hCell = XLSX.utils.encode_cell({ r, c: 7 });
    const iCell = XLSX.utils.encode_cell({ r, c: 8 });
    const jCell = XLSX.utils.encode_cell({ r, c: 9 });
    if (ws[hCell] && typeof ws[hCell].v === 'number') ws[hCell].z = '#,##0.00';
    if (ws[iCell] && typeof ws[iCell].v === 'number') ws[iCell].z = '#,##0.00';
    if (ws[jCell] && typeof ws[jCell].v === 'number') ws[jCell].z = '#,##0.00';
  }

  XLSX.utils.book_append_sheet(wb, ws, 'Bijlage');
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
}

/**
 * Async export function that loads xlsx dynamically
 */
export async function exportInschrijfstaatAsync(
  schedule: CostSchedule,
  items: CostItem[],
  companyInfo?: CompanyInfo | null,
): Promise<Blob> {
  const XLSX = await import('xlsx');
  const rows = buildInschrijfstaatRows(schedule, items, companyInfo);

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Set column widths
  ws['!cols'] = [
    { hidden: true },
    { hidden: true },
    { wch: 10 },
    { wch: 40 },
    { wch: 12 },
    { wch: 5 },
    { wch: 3 },
    { wch: 12 },
    { wch: 14 },
    { hidden: true },
  ];

  // Format number cells
  for (let r = 13; r < rows.length; r++) {
    const hCell = XLSX.utils.encode_cell({ r, c: 7 });
    const iCell = XLSX.utils.encode_cell({ r, c: 8 });
    const jCell = XLSX.utils.encode_cell({ r, c: 9 });
    if (ws[hCell] && typeof ws[hCell].v === 'number') ws[hCell].z = '#,##0.00';
    if (ws[iCell] && typeof ws[iCell].v === 'number') ws[iCell].z = '#,##0.00';
    if (ws[jCell] && typeof ws[jCell].v === 'number') ws[jCell].z = '#,##0.00';
  }

  XLSX.utils.book_append_sheet(wb, ws, 'Bijlage');
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
