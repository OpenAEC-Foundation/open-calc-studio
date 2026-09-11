import type { CostItem, CostSchedule } from '../../types/costModel';
import { makeReportContext, type ReportContext } from '@/i18n/reportI18n';

/**
 * Generates an HTML report for a cost schedule.
 * The report is self-contained (inline CSS) and can be opened in a browser or printed to PDF.
 *
 * Teksten, getallen en datum volgen de rapporttaal (instelling `reportLocale`).
 * Zonder `ctx` wordt de rapporttaal gebruikt zoals die op dat moment geladen
 * is; `await getReportContext()` garandeert dat een lazy geladen taal klaarstaat.
 */
export function generateReport(schedule: CostSchedule, items: CostItem[], ctx: ReportContext = makeReportContext()): string {
  const { t } = ctx;
  const nf = new Intl.NumberFormat(ctx.intlLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // Zelfde gedrag als utils/formatting: 0 en null blijven leeg.
  const formatCurrency = (value: number | null): string => (value === null || value === 0 ? '' : nf.format(value));
  const formatNumber = formatCurrency;
  const L = (key: string): string => escapeHtml(t(key));
  const now = new Date();
  const dateStr = now.toLocaleDateString(ctx.intlLocale, { year: 'numeric', month: 'long', day: 'numeric' });

  // Calculate grand total
  const topLevelItems = items.filter(i => i.parentId === null);
  const grandTotal = topLevelItems.reduce((sum, item) => sum + item.total, 0);

  // Build chapter summary
  const chapters = items.filter(i => i.rowType === 'chapter' && i.depth === 0);

  let chapterRows = '';
  chapters.forEach((chapter, idx) => {
    chapterRows += `
      <tr>
        <td>${idx + 1}</td>
        <td>${escapeHtml(chapter.code)}</td>
        <td>${escapeHtml(chapter.description)}</td>
        <td class="num">${formatCurrency(chapter.total)}</td>
      </tr>`;
  });

  // Build detail rows
  let detailRows = '';
  items.filter(i => i.rowType !== 'witregel').forEach((item, idx) => {
    const indent = item.depth * 20;
    const isChapter = item.rowType === 'chapter';
    const rowClass = isChapter ? 'chapter-row' : '';

    detailRows += `
      <tr class="${rowClass}">
        <td>${idx + 1}</td>
        <td>${escapeHtml(item.code)}</td>
        <td style="padding-left: ${indent + 8}px">${escapeHtml(item.description)}</td>
        <td>${escapeHtml(ctx.unit(item.unit))}</td>
        <td class="num">${item.quantity !== null ? formatNumber(item.quantity) : ''}</td>
        <td class="num">${item.materialPrice !== null ? formatCurrency(item.materialPrice) : ''}</td>
        <td class="num">${item.laborPrice !== null ? formatCurrency(item.laborPrice) : ''}</td>
        <td class="num">${formatCurrency(item.unitPrice)}</td>
        <td class="num">${formatCurrency(item.total)}</td>
      </tr>`;
  });

  return `<!DOCTYPE html>
<html lang="${ctx.lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(schedule.name)} - ${L('views.budgetReport')}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
      font-size: 11px;
      color: #1f2937;
      background: #fff;
      padding: 20mm;
    }
    @media print {
      body { padding: 0; }
      .no-print { display: none; }
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 2px solid #2d8a4e;
    }
    .header h1 {
      font-size: 20px;
      font-weight: 600;
      color: #2d8a4e;
    }
    .header .subtitle {
      font-size: 13px;
      color: #6b7280;
      margin-top: 4px;
    }
    .meta {
      text-align: right;
      font-size: 10px;
      color: #6b7280;
      line-height: 1.6;
    }
    .section-title {
      font-size: 14px;
      font-weight: 600;
      color: #1f2937;
      margin: 20px 0 10px 0;
      padding-bottom: 4px;
      border-bottom: 1px solid #d1d5db;
    }
    .info-grid {
      display: grid;
      grid-template-columns: 120px 1fr 120px 1fr;
      gap: 6px 16px;
      margin-bottom: 20px;
      font-size: 11px;
    }
    .info-grid .label { font-weight: 600; color: #6b7280; }
    .info-grid .value { color: #1f2937; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 16px;
      font-size: 10px;
    }
    th {
      background: #f3f4f6;
      border: 1px solid #d1d5db;
      padding: 6px 8px;
      text-align: left;
      font-weight: 600;
      font-size: 10px;
    }
    td {
      border: 1px solid #e5e7eb;
      padding: 4px 8px;
    }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .chapter-row {
      background: #f9fafb;
      font-weight: 600;
    }
    .total-row {
      background: #2d8a4e;
      color: white;
      font-weight: 700;
      font-size: 12px;
    }
    .total-row td { border-color: #2d8a4e; }
    .summary-box {
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      padding: 16px;
      margin-top: 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .summary-box .label { font-size: 14px; font-weight: 600; color: #166534; }
    .summary-box .amount { font-size: 20px; font-weight: 700; color: #166534; }
    .footer {
      margin-top: 24px;
      padding-top: 12px;
      border-top: 1px solid #d1d5db;
      font-size: 9px;
      color: #9ca3af;
      display: flex;
      justify-content: space-between;
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>${escapeHtml(schedule.name)}</h1>
      <div class="subtitle">${escapeHtml(schedule.description)}</div>
    </div>
    <div class="meta">
      <div>${L('meta.date')}: ${dateStr}</div>
      <div>${L('meta.status')}: ${escapeHtml(t(`status.${schedule.status}`, { defaultValue: String(schedule.status ?? '') }))}</div>
      <div>${L('meta.type')}: ${escapeHtml(schedule.predefinedType)}</div>
    </div>
  </div>

  <div class="info-grid">
    <span class="label">${L('meta.project')}:</span>
    <span class="value">${escapeHtml(schedule.projectName)}</span>
    <span class="label">${L('meta.projectNumberShort')}:</span>
    <span class="value">${escapeHtml(schedule.projectNumber)}</span>
    <span class="label">${L('meta.client')}:</span>
    <span class="value">${escapeHtml(schedule.client)}</span>
    <span class="label">${L('meta.preparedBy')}:</span>
    <span class="value">${escapeHtml(schedule.author)}</span>
  </div>

  <div class="section-title">${L('headings.chapterSummary')}</div>
  <table>
    <thead>
      <tr>
        <th style="width:30px">${L('columns.nr')}</th>
        <th style="width:80px">${L('columns.code')}</th>
        <th>${L('columns.description')}</th>
        <th style="width:120px" class="num">${L('columns.total')}</th>
      </tr>
    </thead>
    <tbody>
      ${chapterRows}
      <tr class="total-row">
        <td colspan="3">${L('totals.budgetTotal')}</td>
        <td class="num">${formatCurrency(grandTotal)}</td>
      </tr>
    </tbody>
  </table>

  <div class="section-title">${L('headings.detailedSpec')}</div>
  <table>
    <thead>
      <tr>
        <th style="width:30px">${L('columns.nr')}</th>
        <th style="width:60px">${L('columns.code')}</th>
        <th>${L('columns.description')}</th>
        <th style="width:40px">${L('columns.unit')}</th>
        <th style="width:70px" class="num">${L('columns.quantityShort')}</th>
        <th style="width:80px" class="num">${L('columns.material')}</th>
        <th style="width:80px" class="num">${L('columns.labourCost')}</th>
        <th style="width:80px" class="num">${L('columns.unitPriceAbbr')}</th>
        <th style="width:90px" class="num">${L('columns.total')}</th>
      </tr>
    </thead>
    <tbody>
      ${detailRows}
      <tr class="total-row">
        <td colspan="8">${L('totals.budgetTotal')}</td>
        <td class="num">${formatCurrency(grandTotal)}</td>
      </tr>
    </tbody>
  </table>

  <div class="summary-box">
    <span class="label">${L('totals.budgetTotalExclVat')}</span>
    <span class="amount">${formatCurrency(grandTotal)}</span>
  </div>

  <div class="footer">
    <span>${escapeHtml(t('footer.generatedBy', { version: __APP_VERSION__ }))}</span>
    <span>${dateStr}</span>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
