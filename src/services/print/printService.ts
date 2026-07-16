import type { CostItem, CostSchedule, CompanyInfo } from '@/types/costModel';
import type { ReportView, PageOrientation, PageSize } from '@/state/slices/uiSlice';
import { getStaartBreakdown } from '@/services/calculation/calculator';
import { buildBouw1Html } from './bouw1PrintService';

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtCurrency(value: number): string {
  return new Intl.NumberFormat('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function fmtNumber(value: number | null): string {
  if (value === null || value === 0) return '';
  return new Intl.NumberFormat('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function fmtPercentage(value: number): string {
  return new Intl.NumberFormat('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value) + '%';
}

/** Column definition for report views */
interface ReportCol {
  key: string;
  label: string;
  cssClass: string;
}

function getColumnsForView(view: ReportView, showHoeveelheid = true): ReportCol[] {
  const filterQty = (cols: ReportCol[]) =>
    showHoeveelheid ? cols : cols.filter(c => c.key !== 'quantity' && c.key !== 'unit' && c.key !== 'unitPrice' && c.key !== 'normUnitPrice');
  switch (view) {
    case 'werkbeschrijving':
      return filterQty([
        { key: 'code', label: 'Code', cssClass: 'code' },
        { key: 'description', label: 'Omschrijving', cssClass: 'desc' },
        { key: 'quantity', label: 'Hoeveelheid', cssClass: 'number' },
        { key: 'unit', label: 'Eenheid', cssClass: 'center' },
        { key: 'verrekenbaar', label: 'Verr.', cssClass: 'center' },
      ]);
    case 'hoofdaanneming':
      return filterQty([
        { key: 'code', label: 'Code', cssClass: 'code' },
        { key: 'description', label: 'Omschrijving', cssClass: 'desc' },
        { key: 'quantity', label: 'Hoeveelheid', cssClass: 'number' },
        { key: 'unit', label: 'Eh.', cssClass: 'center' },
        { key: 'verrekenbaar', label: 'S', cssClass: 'center' },
        { key: 'unitPrice', label: 'Eh. Prijs', cssClass: 'number' },
        { key: 'total', label: 'Bedrag', cssClass: 'number' },
      ]);
    case 'onderaanneming':
      return filterQty([
        { key: 'nr', label: 'Nr', cssClass: 'nr' },
        { key: 'code', label: 'Code', cssClass: 'code' },
        { key: 'description', label: 'Omschrijving', cssClass: 'desc' },
        { key: 'total', label: 'Bedrag', cssClass: 'number' },
      ]);
    case 'inschrijfstaat':
      return filterQty([
        { key: 'nr', label: 'Nr', cssClass: 'nr' },
        { key: 'code', label: 'Code', cssClass: 'code' },
        { key: 'description', label: 'Omschrijving', cssClass: 'desc' },
        { key: 'quantity', label: 'Hoeveelheid', cssClass: 'number' },
        { key: 'unit', label: 'Eenheid', cssClass: 'center' },
        { key: 'verrekenbaar', label: 'Verr.', cssClass: 'center' },
        { key: 'unitPrice', label: 'Eenheidsprijs', cssClass: 'number' },
        { key: 'total', label: 'Bedrag', cssClass: 'number' },
      ]);
    case 'nacalculatie':
      return filterQty([
        { key: 'nr', label: 'Nr', cssClass: 'nr' },
        { key: 'code', label: 'Code', cssClass: 'code' },
        { key: 'description', label: 'Omschrijving', cssClass: 'desc' },
        { key: 'quantity', label: 'Hoeveelheid', cssClass: 'number' },
        { key: 'unit', label: 'Eenheid', cssClass: 'center' },
        { key: 'normUnitPrice', label: 'Prijs/middel', cssClass: 'number' },
        { key: 'unitPrice', label: 'Eenheidsprijs', cssClass: 'number' },
        { key: 'total', label: 'Bedrag', cssClass: 'number' },
      ]);
    case 'bouw1':
    case 'ibis':
    case 'directie':
    case 'offerte':
      // These use their own builders; return minimal cols for type safety
      return [
        { key: 'description', label: 'Omschrijving', cssClass: 'desc' },
        { key: 'total', label: 'Totaal', cssClass: 'number' },
      ];
  }
}

function getViewTitle(view: ReportView): string {
  switch (view) {
    case 'werkbeschrijving': return 'Werkbeschrijving';
    case 'hoofdaanneming': return 'Hoofdaanneming';
    case 'onderaanneming': return 'Onderaanneming';
    case 'inschrijfstaat': return 'Inschrijfstaat';
    case 'nacalculatie': return 'Nacalculatie';
    case 'bouw1': return 'Bouw 1 Begroting';
    case 'ibis': return 'IBIS-stijl Begroting';
    case 'directie': return 'Directiebegroting';
    case 'offerte': return 'Offerte';
  }
}

/** Determine which items are visible for a given view */
function filterItems(items: CostItem[], view: ReportView): CostItem[] {
  let filtered = items.filter(item => !item.rowType.startsWith('staart_') && item.rowType !== 'witregel');

  if (view === 'werkbeschrijving') {
    // Hoofdstukken, posten én tekstregels (opmerkingen bij de posten)
    filtered = filtered.filter(item =>
      item.rowType === 'chapter' || item.rowType === 'begrotingspost' || item.rowType === 'tekstregel'
    );
  } else if (view === 'hoofdaanneming') {
    // Chapters, begrotingsposten en tekstregel (geen bewakingsposten/regels)
    filtered = filtered.filter(item =>
      item.rowType === 'chapter' || item.rowType === 'begrotingspost' || item.rowType === 'tekstregel'
    );
  } else if (view === 'onderaanneming') {
    // Only chapters and begrotingsposten (subtotals only)
    filtered = filtered.filter(item =>
      item.rowType === 'chapter' || item.rowType === 'begrotingspost'
    );
  }

  return filtered;
}

function getCellValue(item: CostItem, key: string, _view: ReportView): string {
  switch (key) {
    case 'nr': return item.nr ?? '';
    case 'code': return escapeHtml(item.code);
    case 'description': return escapeHtml(item.description);
    case 'quantity': return fmtNumber(item.quantity);
    case 'unit': return escapeHtml(String(item.unit ?? ''));
    // V/N/… per regel — ook op posten (S-kolom in de besteksopmaak)
    case 'verrekenbaar': return item.verrekenbaar ?? '';
    case 'normUnitPrice': return item.normUnitPrice != null ? fmtCurrency(item.normUnitPrice) : '';
    case 'unitPrice': return item.unitPrice ? fmtCurrency(item.unitPrice) : '';
    case 'total': return item.total === 0 ? '' : fmtCurrency(item.total);
    default: return '';
  }
}

/**
 * Rapport-items volgens de rapportinstellingen: met "alleen subtotaal per
 * hoofdstuk" blijven enkel hoofdstukregels en de staart over. Gedeeld door
 * de HTML-print én de PDF-request (Rust).
 */
export function itemsForReport(schedule: CostSchedule, items: CostItem[]): CostItem[] {
  if (!schedule.reportChapterTotalsOnly) return items;
  return items.filter(i => i.rowType === 'chapter' || i.rowType.startsWith('staart_'));
}

function buildHtml(
  schedule: CostSchedule,
  itemsIn: CostItem[],
  view: ReportView,
  includeActions: boolean,
  showHoeveelheid = true,
  companyInfo?: CompanyInfo,
  logoDataUrl?: string,
  orientation: PageOrientation = 'landscape',
  paperSize: PageSize = 'A4',
): string {
  const items = itemsForReport(schedule, itemsIn);
  // Bouw 1 view uses its own dedicated builder (always landscape).
  // IBIS-stijl en directiebegroting renderen als PDF via de Rust/Typst-
  // template; de browser-print (zonder Tauri) valt terug op de Bouw 1
  // HTML-builder als vangnet.
  if (view === 'bouw1' || view === 'ibis' || view === 'directie') {
    return buildBouw1Html(schedule, items, includeActions, companyInfo, logoDataUrl);
  }
  const pageSizeCss = `${paperSize} ${orientation}`;
  const title = getViewTitle(view);
  // Calculate content height per page for page-break visualization
  const pageHeightMm = orientation === 'landscape'
    ? (paperSize === 'A3' ? 297 : 210)
    : (paperSize === 'A3' ? 420 : 297);
  const pageContentHeightMm = pageHeightMm - 35; // 15mm top + 20mm bottom margin
  let columns = getColumnsForView(view, showHoeveelheid);
  // Verrekenbaar-kolom is optioneel (rapport-eigenschap); default aan.
  if (schedule.reportShowVerrekenbaar === false) {
    columns = columns.filter(c => c.key !== 'verrekenbaar');
  }
  const colCount = columns.length;
  const hasTotalCol = columns.some(c => c.key === 'total');
  const today = new Date().toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const hasStaart = items.some(item => item.rowType.startsWith('staart_'));
  const breakdown = hasStaart ? getStaartBreakdown(items) : null;
  const grandTotal = breakdown ? breakdown.aanneemsomAfgerond : items
    .filter(item => item.parentId === null)
    .reduce((sum, item) => sum + item.total, 0);

  const normalItems = filterItems(items, view);

  const headers = columns.map(c => `<th class="${c.cssClass}">${c.label}</th>`).join('');

  let tableRows = '';
  let rowNum = 0;

  // Werkbeschrijving en hoofdaanneming renderen "clean" (besteksopmaak):
  // geen cellijnen/zebra, inspringende paragrafen, en bij hoofdaanneming een
  // subtotaal per paragraaf (het hoofdstuk dat de posten direct bevat).
  const cleanView = view === 'werkbeschrijving' || view === 'hoofdaanneming';
  const useSubtotalRows = view === 'hoofdaanneming' && hasTotalCol;

  // Verrekenbaar erft van het dichtstbijzijnde hoofdstuk erboven: de 'V'
  // staat meestal op hoofdstukniveau, het rapport toont hem per postregel.
  const byId = new Map(items.map(i => [i.id, i]));
  const verrOf = (item: CostItem): string => {
    let v = item.verrekenbaar ?? '';
    let cur = item.parentId;
    while (!v && cur) {
      const p = byId.get(cur);
      if (!p) break;
      v = p.verrekenbaar ?? '';
      cur = p.parentId;
    }
    return v;
  };

  // Paragraaf waarvan nog een subtotaal openstaat (parentId van de laatste post)
  let pendingSubtotalParentId: string | null = null;
  const flushSubtotal = (): string => {
    if (!useSubtotalRows || !pendingSubtotalParentId) return '';
    const parent = items.find(i => i.id === pendingSubtotalParentId);
    pendingSubtotalParentId = null;
    if (!parent || parent.total === 0) return '';
    return `<tr class="subtotal-row">
      <td colspan="${colCount - 1}" class="total-label">Subtotaal</td>
      <td class="amount">${fmtCurrency(parent.total)}</td>
    </tr><tr class="spacer-row"><td colspan="${colCount}">&nbsp;</td></tr>`;
  };

  for (let idx = 0; idx < normalItems.length; idx++) {
    const item = normalItems[idx];

    if (item.rowType === 'chapter') {
      const flushed = flushSubtotal();
      tableRows += flushed;
      // Witregel tussen groepen (als het subtotaal er niet al één gaf)
      if (!flushed && cleanView && idx > 0 && normalItems[idx - 1].rowType !== 'chapter') {
        tableRows += `<tr class="spacer-row"><td colspan="${colCount}">&nbsp;</td></tr>`;
      }
    } else if (item.rowType === 'begrotingspost') {
      pendingSubtotalParentId = item.parentId;
    }

    rowNum++;
    const indentPx = item.depth * 16;
    const indentStyle = indentPx > 0 ? ` style="padding-left:${indentPx}px"` : '';
    const zebraClass = rowNum % 2 === 0 ? 'even' : '';

    if (item.rowType === 'chapter') {
      const cells = columns.map(c => {
        if (c.key === 'description') return `<td class="desc"${indentStyle}>${escapeHtml(item.description)}</td>`;
        // Bij hoofdaanneming: geen totaal naast hoofdstuknaam
        if (c.key === 'total') return `<td class="amount">${useSubtotalRows ? '' : (item.total === 0 ? '' : fmtCurrency(item.total))}</td>`;
        if (c.key === 'code') return `<td class="code">${escapeHtml(item.code)}</td>`;
        // Clean views: S/V leeg op hoofdstukregels (de posten dragen de V)
        if (c.key === 'verrekenbaar') return `<td class="center">${cleanView ? '' : (item.verrekenbaar ?? '')}</td>`;
        if (c.key === 'nr') return `<td class="nr">${item.nr ?? ''}</td>`;
        return '<td></td>';
      }).join('');
      tableRows += `<tr class="chapter-row depth-${item.depth}">${cells}</tr>`;
    } else if (item.rowType === 'tekstregel') {
      const cells = columns.map(c => {
        if (c.key === 'description') return `<td class="desc tekst-desc"${indentStyle}>${escapeHtml(item.description)}</td>`;
        return `<td class="${c.cssClass}">${getCellValue(item, c.key, view)}</td>`;
      }).join('');
      tableRows += `<tr class="tekstregel-row${zebraClass ? ' even' : ''}">${cells}</tr>`;
    } else {
      const cells = columns.map(c => {
        if (c.key === 'description') return `<td class="desc"${indentStyle}>${escapeHtml(item.description)}</td>`;
        if (c.key === 'verrekenbaar') return `<td class="${c.cssClass}">${item.rowType === 'witregel' ? '' : verrOf(item)}</td>`;
        return `<td class="${c.cssClass}">${getCellValue(item, c.key, view)}</td>`;
      }).join('');
      tableRows += `<tr${zebraClass ? ' class="even"' : ''}>${cells}</tr>`;
    }
  }

  // Subtotaal van de laatste paragraaf
  tableRows += flushSubtotal();

  // Staartkosten section (only for views with total column)
  if (hasTotalCol && hasStaart && breakdown) {
    const totalLabelColspan = colCount - 1;

    tableRows += `<tr class="subtotal-row">
      <td colspan="${totalLabelColspan}" class="total-label">Subtotaal directe kosten (Kostprijs)</td>
      <td class="amount">${fmtCurrency(breakdown.kostprijs)}</td>
    </tr>`;

    if (view === 'nacalculatie') {
      const staartItems = items.filter(item => item.rowType.startsWith('staart_'));
      for (const item of staartItems) {
        if (item.rowType === 'staart_afronding') {
          tableRows += `<tr class="staart-row">
            <td colspan="${colCount - 1}" class="desc">${escapeHtml(item.description)}</td>
            <td class="amount">${fmtCurrency(item.total)}</td>
          </tr>`;
        } else {
          const pctStr = fmtPercentage(item.staartPercentage ?? 0);
          tableRows += `<tr class="staart-row">
            <td colspan="${colCount - 1}" class="desc">${escapeHtml(item.description)} (${pctStr})</td>
            <td class="amount">${fmtCurrency(item.total)}</td>
          </tr>`;
        }

        if (item.rowType === 'staart_ukk') {
          tableRows += `<tr class="subtotal-row">
            <td colspan="${totalLabelColspan}" class="total-label">Subtotaal 1</td>
            <td class="amount">${fmtCurrency(breakdown.subtotaal1)}</td>
          </tr>`;
        } else if (item.rowType === 'staart_ak') {
          tableRows += `<tr class="subtotal-row">
            <td colspan="${totalLabelColspan}" class="total-label">Subtotaal 2</td>
            <td class="amount">${fmtCurrency(breakdown.subtotaal2)}</td>
          </tr>`;
        }
      }
    }

    const finalTotal = breakdown.afronding !== 0 ? breakdown.aanneemsomAfgerond : breakdown.aanneemsom;
    tableRows += `<tr class="total-row">
      <td colspan="${totalLabelColspan}" class="total-label">Aanneemsom excl. BTW</td>
      <td class="amount">${fmtCurrency(finalTotal)}</td>
    </tr>`;
  } else if (hasTotalCol) {
    const totalLabelColspan = colCount - 1;
    tableRows += `<tr class="total-row">
      <td colspan="${totalLabelColspan}" class="total-label">Totaal excl. BTW</td>
      <td class="amount">${fmtCurrency(grandTotal)}</td>
    </tr>`;
  }

  const actionsHtml = includeActions
    ? `<div class="print-actions">
  <button class="print-btn" onclick="window.print()">Afdrukken</button>
  <button class="close-btn" onclick="window.close()">Sluiten</button>
</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8">
<title>${title} - ${escapeHtml(schedule.projectName || schedule.name)}</title>
<style>
/* OpenAEC Style Book */
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400&display=swap');
@page {
  size: ${pageSizeCss};
  margin: 15mm 12mm 20mm 12mm;
  @bottom-right { content: "Pagina " counter(page) " / " counter(pages); font-family: 'Inter', sans-serif; font-size: 8pt; color: #A1A1AA; }
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Inter', 'Segoe UI', sans-serif; font-size: 9pt; color: #36363E; line-height: 1.4; padding: 10mm; background: white; }
.header { display: flex; justify-content: space-between; margin-bottom: 14px; padding-bottom: 8px; border-bottom: 2px solid #D97706; }
.header-left h1 { font-family: 'Space Grotesk', sans-serif; font-size: 16pt; font-weight: 700; margin-bottom: 2px; color: #36363E; }
.header-left .subtitle { font-size: 10pt; color: #A1A1AA; font-weight: 500; }
.header-right { text-align: right; font-size: 9pt; }
.header-right .label { color: #A1A1AA; font-weight: 500; text-transform: uppercase; font-size: 7.5pt; letter-spacing: 0.3px; }
.meta { display: grid; grid-template-columns: auto 1fr auto 1fr; gap: 2px 16px; margin-bottom: 12px; font-size: 9pt; }
.meta .label { color: #A1A1AA; font-weight: 500; text-transform: uppercase; font-size: 7.5pt; letter-spacing: 0.3px; }
table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
thead th { background: linear-gradient(180deg, #FEF3C7 0%, #FDE68A 100%); border-top: 2px solid #D97706; border-bottom: 1px solid #D97706; border-left: none; border-right: none; padding: 5px 6px; text-align: left; font-weight: 600; font-size: 8pt; white-space: nowrap; text-transform: uppercase; letter-spacing: 0.2px; color: #36363E; }
th.number, td.number, td.amount { text-align: right; font-variant-numeric: tabular-nums; }
th.nr, td.nr { text-align: left; width: 35px; color: #A1A1AA; }
th.code { width: 70px; }
td.code { font-family: 'JetBrains Mono', 'Consolas', monospace; font-size: 8pt; color: #A1A1AA; }
th.center, td.center { text-align: center; }
tbody td { border-top: none; border-bottom: 1px solid #E7E5E4; border-left: none; border-right: none; padding: 3px 6px; }
tr.even td { background: #FAFAF9; }
.chapter-row td { font-family: 'Space Grotesk', sans-serif; font-weight: 700; background: #F5F5F4; border-bottom: 1px solid #D97706; }
.chapter-row.depth-0 td { font-size: 9.5pt; background: #FEF3C7; border-top: 2px solid #D97706; color: #36363E; }
.chapter-row.depth-1 td { background: #FFFBEB; font-size: 9pt; }
.chapter-row.depth-2 td { background: #F5F5F4; font-size: 8.5pt; font-weight: 600; }
.tekstregel-row td { font-weight: 700; font-style: italic; }
.subtotal-row td { font-weight: 600; font-size: 9pt; border-top: 1.5px solid #D97706; background: #FEF3C7; padding: 5px 6px; }
.spacer-row td { border: none; background: white; height: 10px; padding: 0; }
.subtotal-row .total-label { text-align: right; padding-right: 12px; }
.staart-row td { background: #FFFBEB; border-bottom: 1px solid #E7E5E4; border-top: none; border-left: none; border-right: none; font-style: italic; }
.total-row td { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 10pt; border-top: 3px double #D97706; background: #FEF3C7; padding: 6px; color: #36363E; }
.total-row .total-label { text-align: right; padding-right: 12px; }
.footer { margin-top: 20px; padding-top: 6px; border-top: 1px solid #E7E5E4; font-size: 8pt; color: #A1A1AA; display: flex; justify-content: space-between; }
.print-actions { position: fixed; top: 12px; right: 12px; display: flex; gap: 8px; z-index: 1000; }
.print-btn { padding: 8px 24px; background: #D97706; color: white; border: none; border-radius: 8px; cursor: pointer; font-family: 'Inter', sans-serif; font-size: 10pt; font-weight: 600; transition: background 0.15s ease; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
.print-btn:hover { background: #EA580C; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
.close-btn { padding: 8px 24px; background: transparent; color: #36363E; border: 1.5px solid #A8A29E; border-radius: 8px; cursor: pointer; font-family: 'Inter', sans-serif; font-size: 10pt; font-weight: 500; transition: all 0.15s ease; }
.close-btn:hover { background: #F5F5F4; border-color: #36363E; }
${cleanView ? `
/* Clean besteksopmaak (werkbeschrijving/hoofdaanneming): geen cellijnen of
   vullingen; hiërarchie via typografie en inspringing, zoals een klassiek
   bestek. Dunne lijn onder de koprij en lijnen om hoofdstukregels. */
thead th { background: none; border-top: none; border-bottom: 1px solid #A8A29E; }
tbody td { border-bottom: none; }
tr.even td { background: transparent; }
.chapter-row td,
.chapter-row.depth-0 td,
.chapter-row.depth-1 td,
.chapter-row.depth-2 td { background: transparent; border-top: none; border-bottom: none; font-size: 8.5pt; }
.chapter-row.depth-0 td,
.chapter-row.depth-1 td { border-top: 1px solid #A8A29E; border-bottom: 1px solid #A8A29E; }
.chapter-row.depth-2 td, .chapter-row.depth-3 td { font-style: italic; }
.tekstregel-row td { font-weight: 700; font-style: italic; color: #57575E; }
.subtotal-row td { background: transparent; border-top: 1px solid #A8A29E; font-weight: 700; }
.subtotal-row .total-label { text-align: left; padding-left: 22px; }
.total-row td { background: transparent; border-top: 1px solid #36363E; }
` : ''}
/* Page break indicator (preview only) */
.page-break-line { display: none; }
${!includeActions ? `
.page-break-line {
  display: block;
  border: none;
  border-top: 2px dashed #ef4444;
  margin: 4px 0;
  position: relative;
}
.page-break-line::after {
  content: 'pagina-einde';
  position: absolute;
  right: 0;
  top: -10px;
  font-size: 7pt;
  color: #ef4444;
  font-family: 'Inter', sans-serif;
  background: white;
  padding: 0 4px;
}
` : ''}
.report-logo-right {
  /* Koptekst-logo rechtsboven; position:fixed herhaalt op elke geprinte pagina */
  position: fixed;
  top: 0;
  right: 0;
  height: 10mm;
  max-width: 45mm;
  object-fit: contain;
}
@media print {
  .print-actions { display: none; }
  .page-break-line { display: none !important; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  .chapter-row.depth-0 { page-break-before: auto; }
}
</style>
</head>
<body>
${actionsHtml}
${companyInfo?.logoRight ? `<img class="report-logo-right" src="${companyInfo.logoRight}" alt="">` : ''}
<div class="header"${companyInfo?.logoRight ? ' style="margin-top:12mm"' : ''}>
  <div class="header-left">
    <h1>${escapeHtml(schedule.projectName || schedule.name || 'Begroting')}</h1>
    <div class="subtitle">${title}</div>
  </div>
  <div class="header-right">
    <div><span class="label">Datum: </span>${today}</div>
    <div><span class="label">Status: </span>${schedule.status}</div>
  </div>
</div>
<div class="meta">
  ${schedule.projectNumber ? `<span class="label">Projectnummer:</span><span>${escapeHtml(schedule.projectNumber)}</span>` : ''}
  ${schedule.client ? `<span class="label">Opdrachtgever:</span><span>${escapeHtml(schedule.client)}</span>` : ''}
  ${schedule.author ? `<span class="label">Auteur:</span><span>${escapeHtml(schedule.author)}</span>` : ''}
  ${schedule.description ? `<span class="label">Omschrijving:</span><span>${escapeHtml(schedule.description)}</span>` : ''}
</div>
<table>
  <thead><tr>${headers}</tr></thead>
  <tbody>${tableRows}</tbody>
</table>
<div class="footer">
  <span>Open Calc Studio - ${escapeHtml(schedule.name || 'Begroting')}</span>
  <span>${today}</span>
</div>
${!includeActions ? `<script>
(function() {
  // Insert page-break indicators in preview mode
  var pageH = ${pageContentHeightMm}; // mm
  var mmToPx = 96 / 25.4; // CSS px per mm
  var pageHPx = pageH * mmToPx;
  var body = document.body;
  var totalH = body.scrollHeight;
  var markers = [];
  for (var y = pageHPx; y < totalH; y += pageHPx) {
    // Find the element at this y position and insert a marker before it
    var el = document.elementFromPoint(10, y);
    if (!el || el === body) continue;
    // Walk up to find a direct child of tbody or body
    var tr = el.closest('tr');
    if (tr && !markers.includes(tr)) {
      markers.push(tr);
      var hr = document.createElement('tr');
      hr.innerHTML = '<td colspan="20"><hr class="page-break-line"></td>';
      hr.className = 'page-break-marker';
      tr.parentNode.insertBefore(hr, tr);
    }
  }
})();
</script>` : ''}
</body>
</html>`;
}

export function printBudget(schedule: CostSchedule, items: CostItem[], view: ReportView, showHoeveelheid = true, companyInfo?: CompanyInfo, logoDataUrl?: string, orientation: PageOrientation = 'landscape', paperSize: PageSize = 'A4'): void {
  const html = buildHtml(schedule, items, view, true, showHoeveelheid, companyInfo, logoDataUrl, orientation, paperSize);
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
  }
}

/** Generate print HTML string without opening a window (for file export / testing) */
export function generatePrintHtml(schedule: CostSchedule, items: CostItem[], view: ReportView, showHoeveelheid = true, companyInfo?: CompanyInfo, logoDataUrl?: string, orientation: PageOrientation = 'landscape', paperSize: PageSize = 'A4'): string {
  return buildHtml(schedule, items, view, false, showHoeveelheid, companyInfo, logoDataUrl, orientation, paperSize);
}
