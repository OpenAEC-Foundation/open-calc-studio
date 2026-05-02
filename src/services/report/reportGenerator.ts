import type { CostItem, CostSchedule } from '../../types/costModel';
import { formatCurrency, formatNumber } from '../../utils/formatting';

/**
 * Generates an HTML report for a cost schedule.
 * The report is self-contained (inline CSS) and can be opened in a browser or printed to PDF.
 */
export function generateReport(schedule: CostSchedule, items: CostItem[]): string {
  const now = new Date();
  const dateStr = now.toLocaleDateString('nl-NL', { year: 'numeric', month: 'long', day: 'numeric' });

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
        <td>${escapeHtml(item.unit)}</td>
        <td class="num">${item.quantity !== null ? formatNumber(item.quantity) : ''}</td>
        <td class="num">${item.materialPrice !== null ? formatCurrency(item.materialPrice) : ''}</td>
        <td class="num">${item.laborPrice !== null ? formatCurrency(item.laborPrice) : ''}</td>
        <td class="num">${formatCurrency(item.unitPrice)}</td>
        <td class="num">${formatCurrency(item.total)}</td>
      </tr>`;
  });

  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(schedule.name)} - Begrotingsrapport</title>
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
      <div>Datum: ${dateStr}</div>
      <div>Status: ${escapeHtml(schedule.status)}</div>
      <div>Type: ${escapeHtml(schedule.predefinedType)}</div>
    </div>
  </div>

  <div class="info-grid">
    <span class="label">Project:</span>
    <span class="value">${escapeHtml(schedule.projectName)}</span>
    <span class="label">Projectnr:</span>
    <span class="value">${escapeHtml(schedule.projectNumber)}</span>
    <span class="label">Opdrachtgever:</span>
    <span class="value">${escapeHtml(schedule.client)}</span>
    <span class="label">Opgesteld door:</span>
    <span class="value">${escapeHtml(schedule.author)}</span>
  </div>

  <div class="section-title">Samenvatting per hoofdstuk</div>
  <table>
    <thead>
      <tr>
        <th style="width:30px">Nr</th>
        <th style="width:80px">Code</th>
        <th>Omschrijving</th>
        <th style="width:120px" class="num">Totaal</th>
      </tr>
    </thead>
    <tbody>
      ${chapterRows}
      <tr class="total-row">
        <td colspan="3">Totaal begroting</td>
        <td class="num">${formatCurrency(grandTotal)}</td>
      </tr>
    </tbody>
  </table>

  <div class="section-title">Gedetailleerde specificatie</div>
  <table>
    <thead>
      <tr>
        <th style="width:30px">Nr</th>
        <th style="width:60px">Code</th>
        <th>Omschrijving</th>
        <th style="width:40px">Eenheid</th>
        <th style="width:70px" class="num">Hoev.</th>
        <th style="width:80px" class="num">Materiaal</th>
        <th style="width:80px" class="num">Arbeid</th>
        <th style="width:80px" class="num">Eenh.prijs</th>
        <th style="width:90px" class="num">Totaal</th>
      </tr>
    </thead>
    <tbody>
      ${detailRows}
      <tr class="total-row">
        <td colspan="8">Totaal begroting</td>
        <td class="num">${formatCurrency(grandTotal)}</td>
      </tr>
    </tbody>
  </table>

  <div class="summary-box">
    <span class="label">Totaal begroting (excl. BTW)</span>
    <span class="amount">${formatCurrency(grandTotal)}</span>
  </div>

  <div class="footer">
    <span>Gegenereerd door Open Calc Studio v${__APP_VERSION__}</span>
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
