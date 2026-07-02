/**
 * Bouw 1 style begroting report generator.
 *
 * Produces a landscape A4 HTML report with the standard Bouw 1 layout:
 * - Header with company logo/name, project meta (Volgnr, T.b.v., Project, Datum)
 * - Column layout: Hst | Par | Nr | Omschrijving | Aantal | Eh. | Prijs | Norm | Uren | Tar. | Loon | Materiaal | Materieel | Stelpost | Ond.aann. | Kosten/eh | Subtotaal | Totaal
 * - Chapter subtotals with column breakdowns (uren, loon, materiaal, materieel, stelpost, ond.aann.)
 * - Summary page: uren per tariefgroep, column totals, opslagen (AK, garanties, W&R), risico/winst/verzekering, BTW
 * - Footer with company details and page numbering
 */

import type { CostItem, CostSchedule, CompanyInfo } from '@/types/costModel';
import { getStaartBreakdown } from '@/services/calculation/calculator';
import { isStagartRowType } from '@/types/costModel';

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtNL(value: number | null, decimals = 2): string {
  if (value === null || value === undefined || value === 0) return '';
  return new Intl.NumberFormat('nl-NL', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
}

function fmtNLForce(value: number, decimals = 2): string {
  return new Intl.NumberFormat('nl-NL', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
}

function fmtNorm(value: number | null): string {
  if (value === null || value === undefined || value === 0) return '';
  return new Intl.NumberFormat('nl-NL', { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(value);
}

/**
 * Compute per-item column breakdowns for Bouw1 view.
 * For a 'regel' row: loon/materiaal/materieel/stelpost/onderaanneming based on resourceType.
 * For parent rows: sum of children.
 */
interface Bouw1Row {
  item: CostItem;
  hst: string;
  par: string;
  nr: string;
  loon: number;
  materiaal: number;
  materieel: number;
  stelpost: number;
  ondaann: number;
  uren: number;
  tarief: number;
  kostenEh: number;
  subtotaal: number;
}

function computeBouw1Rows(items: CostItem[], schedule: CostSchedule): Bouw1Row[] {
  const tarieven = schedule.tarieven ?? { A: 64, B: 43, C: 82 };

  // Build a map of item -> its direct children
  const childrenMap = new Map<string | null, CostItem[]>();
  for (const item of items) {
    if (isStagartRowType(item.rowType) || item.rowType === 'witregel') continue;
    const list = childrenMap.get(item.parentId) ?? [];
    list.push(item);
    childrenMap.set(item.parentId, list);
  }

  // Compute breakdown per item (bottom-up)
  const breakdownMap = new Map<string, { loon: number; materiaal: number; materieel: number; stelpost: number; ondaann: number; uren: number }>();

  function computeBreakdown(item: CostItem): { loon: number; materiaal: number; materieel: number; stelpost: number; ondaann: number; uren: number } {
    const cached = breakdownMap.get(item.id);
    if (cached) return cached;

    const children = childrenMap.get(item.id) ?? [];
    if (children.length > 0) {
      // Sum children
      let loon = 0, materiaal = 0, materieel = 0, stelpost = 0, ondaann = 0, uren = 0;
      for (const child of children) {
        const cb = computeBreakdown(child);
        loon += cb.loon;
        materiaal += cb.materiaal;
        materieel += cb.materieel;
        stelpost += cb.stelpost;
        ondaann += cb.ondaann;
        uren += cb.uren;
      }
      const result = { loon, materiaal, materieel, stelpost, ondaann, uren };
      breakdownMap.set(item.id, result);
      return result;
    }

    // Leaf node (regel or begrotingspost without children)
    const total = item.total;
    const rt = item.resourceType;
    let loon = 0, materiaal = 0, materieel = 0, stelpost = 0, ondaann = 0, uren = 0;

    if (item.rowType === 'regel') {
      // Compute uren from norm
      uren = item.normQuantity ?? 0;
      if (item.normFactor != null) uren *= item.normFactor;
      if (item.normDivisor != null && item.normDivisor !== 0) uren /= item.normDivisor;

      // Get tarief for this row
      const tg = item.tariefGroep ?? 'A';
      const tarief = tarieven[tg] ?? 64;

      if (rt === 'arbeid') {
        loon = total;
      } else if (rt === 'materiaal') {
        materiaal = total;
      } else if (rt === 'materieel') {
        materieel = total;
      } else if (rt === 'onderaannemer') {
        ondaann = total;
      } else if (rt === 'overig') {
        stelpost = total;
      } else {
        // No resource type set: if has normUnitPrice, try to figure from pricing
        if (item.normUnitPrice != null && item.normUnitPrice > 0) {
          // Has a unit price set: materiaal-like
          const laborPart = uren * tarief;
          if (laborPart > 0) {
            loon = laborPart;
            materiaal = total - laborPart;
            if (materiaal < 0) { loon = total; materiaal = 0; }
          } else {
            materiaal = total;
          }
        } else if (uren > 0) {
          loon = uren * tarief;
          if (total > loon) {
            materiaal = total - loon;
          } else {
            loon = total;
          }
        } else {
          // Default: put in onderaanneming if it looks like a subcontract, else materiaal
          materiaal = total;
        }
      }
    } else if (item.rowType === 'begrotingspost') {
      // Standalone begrotingspost without children
      if (rt === 'arbeid') loon = total;
      else if (rt === 'materiaal') materiaal = total;
      else if (rt === 'materieel') materieel = total;
      else if (rt === 'onderaannemer') ondaann = total;
      else if (rt === 'overig') stelpost = total;
      else ondaann = total; // default: onderaanneming for standalone posts
    } else if (item.rowType === 'tekstregel') {
      // No values
    }

    const result = { loon, materiaal, materieel, stelpost, ondaann, uren };
    breakdownMap.set(item.id, result);
    return result;
  }

  // Build output rows
  const rows: Bouw1Row[] = [];
  const visibleItems = items.filter(it => !isStagartRowType(it.rowType) && it.rowType !== 'witregel');

  for (const item of visibleItems) {
    const bd = computeBreakdown(item);

    // Generate Hst/Par/Nr columns from hierarchy
    let hst = '', par = '', nr = '';
    if (item.nr) {
      const parts = item.nr.split('.');
      if (parts.length >= 1) hst = parts[0];
      if (parts.length >= 2) par = parts[1];
      if (parts.length >= 3) nr = parts.slice(2).join('.');
    }

    // Determine tarief
    const tg = item.tariefGroep ?? 'A';
    const tarief = tarieven[tg] ?? 64;

    // Kosten/eh
    let kostenEh = 0;
    if (item.quantity && item.quantity > 0 && item.total > 0) {
      kostenEh = item.total / item.quantity;
    }

    rows.push({
      item,
      hst,
      par,
      nr,
      loon: bd.loon,
      materiaal: bd.materiaal,
      materieel: bd.materieel,
      stelpost: bd.stelpost,
      ondaann: bd.ondaann,
      uren: bd.uren,
      tarief,
      kostenEh,
      subtotaal: item.total,
    });
  }

  return rows;
}

/** Column totals for summary page */
interface ColumnTotals {
  uren: number;
  loon: number;
  materiaal: number;
  materieel: number;
  stelpost: number;
  ondaann: number;
}

function computeColumnTotals(items: CostItem[], schedule: CostSchedule): ColumnTotals {
  const rows = computeBouw1Rows(items, schedule);
  // Only sum top-level chapters
  const topLevelRows = rows.filter(r => r.item.parentId === null && r.item.rowType === 'chapter');
  let uren = 0, loon = 0, materiaal = 0, materieel = 0, stelpost = 0, ondaann = 0;
  for (const r of topLevelRows) {
    uren += r.uren;
    loon += r.loon;
    materiaal += r.materiaal;
    materieel += r.materieel;
    stelpost += r.stelpost;
    ondaann += r.ondaann;
  }
  return { uren, loon, materiaal, materieel, stelpost, ondaann };
}

export function buildBouw1Html(
  schedule: CostSchedule,
  items: CostItem[],
  includeActions: boolean,
  companyInfo?: CompanyInfo,
  logoDataUrl?: string,
): string {
  const today = new Date().toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const bouw1Rows = computeBouw1Rows(items, schedule);
  const hasStaart = items.some(item => isStagartRowType(item.rowType));
  const breakdown = hasStaart ? getStaartBreakdown(items) : null;
  const colTotals = computeColumnTotals(items, schedule);

  const companyName = companyInfo?.name || 'Bedrijfsnaam';
  const companyAddress = [companyInfo?.visitAddress, companyInfo?.visitCity].filter(Boolean).join(' - ');
  const companyPhone = companyInfo?.phone || '';
  const companyEmail = companyInfo?.email || '';
  const companyFax = companyInfo?.fax || '';

  const footerLine = [companyName, companyAddress, companyPhone ? `tel. ${companyPhone}` : '', companyEmail ? `e-mail ${companyEmail}` : '', companyFax ? `fax ${companyFax}` : ''].filter(Boolean).join(' - ');

  // Build data rows grouped by chapter
  let tableRows = '';

  // Track current chapter for subtotals
  let currentTopChapter: CostItem | null = null;

  for (let idx = 0; idx < bouw1Rows.length; idx++) {
    const dr = bouw1Rows[idx];
    const item = dr.item;

    // When entering a new top-level chapter, emit subtotal for previous one
    if (item.rowType === 'chapter' && item.depth === 0) {
      if (currentTopChapter && idx > 0) {
        // Find the Bouw1Row for the current chapter to get totals
        const chapterDR = bouw1Rows.find(r => r.item.id === currentTopChapter!.id);
        if (chapterDR) {
          tableRows += buildChapterSubtotalRow(chapterDR);
        }
        tableRows += '<tr class="spacer"><td colspan="18"></td></tr>';
      }
      // Repeat header at each chapter start
      tableRows += buildHeaderRow();
      currentTopChapter = item;
    }

    tableRows += buildDataRow(dr);
  }

  // Final chapter subtotal
  if (currentTopChapter) {
    const chapterDR = bouw1Rows.find(r => r.item.id === currentTopChapter!.id);
    if (chapterDR) {
      tableRows += buildChapterSubtotalRow(chapterDR);
    }
  }

  // Summary section
  let summaryHtml = buildSummarySection(colTotals, breakdown, hasStaart);

  const actionsHtml = includeActions
    ? `<div class="print-actions">
  <button class="print-btn" onclick="window.print()">Afdrukken</button>
  <button class="close-btn" onclick="window.close()">Sluiten</button>
</div>`
    : '';

  const logoHtml = logoDataUrl
    ? `<img src="${logoDataUrl}" class="company-logo" alt="Logo" />`
    : `<div class="company-name-large">${esc(companyName)}</div>`;

  return `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8">
<title>Begroting - ${esc(schedule.projectName || schedule.name)}</title>
<style>
${getBouw1Styles()}
</style>
</head>
<body>
${actionsHtml}
<div class="page-content">
  <div class="header">
    <div class="header-left">
      ${logoHtml}
    </div>
    <div class="header-right">
      <table class="meta-table">
        <tr><td class="meta-label">Volgnr.:</td><td class="meta-value">${esc(schedule.projectNumber || '')}</td></tr>
        <tr><td class="meta-label">T.b.v.:</td><td class="meta-value">${esc(schedule.client || '')}</td></tr>
        <tr><td class="meta-label">Project:</td><td class="meta-value">${esc(schedule.projectName || schedule.name || '')}</td></tr>
        <tr><td class="meta-label">Datum:</td><td class="meta-value">${today}</td></tr>
      </table>
      <div class="report-title">${esc(schedule.description || 'Begroting')}</div>
    </div>
  </div>

  <table class="bouw1-grid">
    <thead>
      ${buildHeaderRow()}
    </thead>
    <tbody>
      ${tableRows}
    </tbody>
  </table>

  ${summaryHtml}
</div>
<div class="footer">
  <div class="footer-text">Op al onze offertes zijn de algemene voorwaarden van toepassing. Deze voorwaarden zijn bij dit document als bijlage bijgesloten.</div>
  <div class="footer-company">${esc(footerLine)}</div>
</div>
</body>
</html>`;
}

function buildHeaderRow(): string {
  return `<tr class="header-row">
    <th class="col-hst">Hst</th>
    <th class="col-par">Par</th>
    <th class="col-nr">Nr</th>
    <th class="col-desc">Omschrijving</th>
    <th class="col-qty">Aantal</th>
    <th class="col-unit">Eh.</th>
    <th class="col-price">Prijs</th>
    <th class="col-norm">Norm</th>
    <th class="col-uren">Uren</th>
    <th class="col-tar">Tar.</th>
    <th class="col-loon">Loon</th>
    <th class="col-mat">Materiaal</th>
    <th class="col-meel">Materieel</th>
    <th class="col-stel">Stelpost</th>
    <th class="col-ond">Ond.aann.</th>
    <th class="col-keh">Kosten/eh</th>
    <th class="col-sub">Subtotaal</th>
    <th class="col-tot">Totaal</th>
  </tr>`;
}

function buildDataRow(dr: Bouw1Row): string {
  const item = dr.item;

  if (item.rowType === 'chapter') {
    // Chapter rows: only show hst (at depth 0) or hst+par (depth 1), plus description
    // They don't have amount columns in the Bouw1 format (totals shown separately)
    return `<tr class="chapter-row depth-${item.depth}">
      <td class="col-hst">${item.depth === 0 ? esc(dr.hst) : ''}</td>
      <td class="col-par">${item.depth >= 1 ? esc(dr.par) : ''}</td>
      <td class="col-nr"></td>
      <td class="col-desc" colspan="15">${esc(item.description)}</td>
    </tr>`;
  }

  if (item.rowType === 'tekstregel') {
    return `<tr class="text-row">
      <td class="col-hst">${esc(dr.hst)}</td>
      <td class="col-par">${esc(dr.par)}</td>
      <td class="col-nr">${esc(dr.nr)}</td>
      <td class="col-desc" colspan="15">${esc(item.description)}</td>
    </tr>`;
  }

  // Regular data row
  const indent = item.depth > 2 ? '&nbsp;'.repeat((item.depth - 2) * 3) : '';
  const tariefLabel = item.tariefGroep ?? 'A';

  // Quantity & unit
  const qty = fmtNL(item.quantity);
  const unit = item.unit ?? '';

  // Price column: normUnitPrice or unitPrice
  const price = item.normUnitPrice != null && item.normUnitPrice > 0
    ? fmtNL(item.normUnitPrice)
    : (item.unitPrice > 0 ? fmtNL(item.unitPrice) : '');

  // Norm column
  const norm = fmtNorm(item.normFactor);

  // Uren column
  const uren = fmtNL(dr.uren);

  return `<tr class="data-row ${item.rowType}-row">
    <td class="col-hst">${esc(dr.hst)}</td>
    <td class="col-par">${esc(dr.par)}</td>
    <td class="col-nr">${esc(dr.nr)}</td>
    <td class="col-desc">${indent}${esc(item.description)}</td>
    <td class="col-qty num">${qty}</td>
    <td class="col-unit">${esc(String(unit))}</td>
    <td class="col-price num">${price}</td>
    <td class="col-norm num">${norm}</td>
    <td class="col-uren num">${uren}</td>
    <td class="col-tar">${tariefLabel}</td>
    <td class="col-loon num">${fmtNL(dr.loon)}</td>
    <td class="col-mat num">${fmtNL(dr.materiaal)}</td>
    <td class="col-meel num">${fmtNL(dr.materieel)}</td>
    <td class="col-stel num">${fmtNL(dr.stelpost)}</td>
    <td class="col-ond num">${fmtNL(dr.ondaann)}</td>
    <td class="col-keh num">${fmtNL(dr.kostenEh)}</td>
    <td class="col-sub num">${fmtNL(item.total)}</td>
    <td class="col-tot num">${fmtNL(item.total)}</td>
  </tr>`;
}

function buildChapterSubtotalRow(chapterDR: Bouw1Row): string {
  return `<tr class="chapter-subtotal">
    <td colspan="8"></td>
    <td class="num">${fmtNL(chapterDR.uren)}</td>
    <td></td>
    <td class="num">${fmtNL(chapterDR.loon)}</td>
    <td class="num">${fmtNL(chapterDR.materiaal)}</td>
    <td class="num">${fmtNL(chapterDR.materieel)}</td>
    <td class="num">${fmtNL(chapterDR.stelpost)}</td>
    <td class="num">${fmtNL(chapterDR.ondaann)}</td>
    <td colspan="3"></td>
  </tr>`;
}

function buildSummarySection(
  colTotals: ColumnTotals,
  breakdown: ReturnType<typeof getStaartBreakdown> | null,
  hasStaart: boolean,
): string {
  const kostprijs = breakdown?.kostprijs ?? (colTotals.loon + colTotals.materiaal + colTotals.materieel + colTotals.stelpost + colTotals.ondaann);
  const akBasis = colTotals.loon + colTotals.materiaal + colTotals.materieel;

  // Opslag-percentages én -bedragen komen uit de staart-breakdown: die is
  // afgeleid uit de daadwerkelijke staart-items (dus inclusief door de
  // gebruiker aangepaste percentages). Alleen als er geen staart is
  // (breakdown === null) vallen we terug op de standaard-percentages.

  // AK over onderaanneming
  const akOndPct = breakdown?.akOaPercentage ?? 9;
  const akOndAmount = breakdown?.akOaAmount ?? colTotals.ondaann * (akOndPct / 100);

  // Algemene bedrijfskosten (over loon + materiaal + materieel)
  const akPct = breakdown?.abkPercentage ?? 6;
  const akAmount = breakdown?.abkAmount ?? akBasis * (akPct / 100);

  // Garanties
  const garantiePct = breakdown?.garantiesPercentage ?? 2;
  const garantieAmount = breakdown?.garantiesAmount ?? akBasis * (garantiePct / 100);

  // Werkvoorbereiding & projectmanagement
  const wvPct = breakdown?.wvpmPercentage ?? 2;
  const wvAmount = breakdown?.wvpmAmount ?? akBasis * (wvPct / 100);

  const totaalKostprijs = breakdown?.kostprijsBouw1 ?? (kostprijs + akOndAmount + akAmount + garantieAmount + wvAmount);

  // Risico, winst, verzekering
  const risicoPct = breakdown?.risicoPercentage ?? 3;
  const winstPct = breakdown?.winstPercentage ?? 5;
  const verzekeringPct = breakdown?.verzekeringPercentage ?? 0.5;

  const risico = breakdown?.risicoAmount ?? totaalKostprijs * (risicoPct / 100);
  const winst = breakdown?.winstAmount ?? totaalKostprijs * (winstPct / 100);
  const verzekering = breakdown?.verzekeringAmount ?? totaalKostprijs * (verzekeringPct / 100);

  const totaalExclBtw = breakdown?.aanneemsomExcl ?? (totaalKostprijs + risico + winst + verzekering);
  const btwPct = breakdown?.btwPercentage ?? 21;

  return `
  <div class="summary-section">
    <div class="page-break"></div>

    <h3 class="summary-title">Samenvatting</h3>

    <table class="summary-table">
      <tr class="summary-header">
        <th class="s-desc">Omschrijving</th>
        <th class="s-pct">%</th>
        <th class="s-loon">Loon</th>
        <th class="s-mat">Materiaal</th>
        <th class="s-meel">Materieel</th>
        <th class="s-stel">Stelpost</th>
        <th class="s-ond">Ond.aann.</th>
        <th class="s-bedrag">Bedrag</th>
        <th class="s-post">Post</th>
        <th class="s-tot">Totaal</th>
      </tr>

      <tr>
        <td>Totaal kolommen:</td>
        <td></td>
        <td class="num">${fmtNLForce(colTotals.loon)}</td>
        <td class="num">${fmtNLForce(colTotals.materiaal)}</td>
        <td class="num">${fmtNLForce(colTotals.materieel)}</td>
        <td class="num">${fmtNLForce(colTotals.stelpost)}</td>
        <td class="num">${fmtNLForce(colTotals.ondaann)}</td>
        <td></td>
        <td></td>
        <td></td>
      </tr>

      <tr>
        <td>Algemene kosten over onderaanneming:</td>
        <td class="num">${akOndPct} %</td>
        <td></td><td></td><td></td><td></td>
        <td class="num">${fmtNLForce(akOndAmount)}</td>
        <td></td>
        <td class="num">${fmtNLForce(akOndAmount)}</td>
        <td></td>
      </tr>

      <tr>
        <td>Algemene bedrijfskosten:</td>
        <td class="num">${akPct} %</td>
        <td class="num">${fmtNLForce(colTotals.loon * akPct / 100)}</td>
        <td class="num">${fmtNLForce(colTotals.materiaal * akPct / 100)}</td>
        <td class="num">${fmtNLForce(colTotals.materieel * akPct / 100)}</td>
        <td></td><td></td>
        <td class="num">${fmtNLForce(akAmount)}</td>
        <td></td>
        <td></td>
      </tr>

      <tr>
        <td>Garanties:</td>
        <td class="num">${garantiePct} %</td>
        <td class="num">${fmtNLForce(colTotals.loon * garantiePct / 100)}</td>
        <td class="num">${fmtNLForce(colTotals.materiaal * garantiePct / 100)}</td>
        <td class="num">${fmtNLForce(colTotals.materieel * garantiePct / 100)}</td>
        <td></td><td></td>
        <td class="num">${fmtNLForce(garantieAmount)}</td>
        <td></td>
        <td></td>
      </tr>

      <tr>
        <td>Werkvoorbereiding &amp; projectmanagement</td>
        <td class="num">${wvPct} %</td>
        <td class="num">${fmtNLForce(colTotals.loon * wvPct / 100)}</td>
        <td class="num">${fmtNLForce(colTotals.materiaal * wvPct / 100)}</td>
        <td class="num">${fmtNLForce(colTotals.materieel * wvPct / 100)}</td>
        <td></td><td></td>
        <td class="num">${fmtNLForce(wvAmount)}</td>
        <td></td>
        <td></td>
      </tr>

      <tr class="summary-kostprijs">
        <td>Totaal kostprijs:</td>
        <td></td>
        <td class="num">${fmtNLForce(colTotals.loon * (1 + akPct / 100 + garantiePct / 100 + wvPct / 100))}</td>
        <td class="num">${fmtNLForce(colTotals.materiaal * (1 + akPct / 100 + garantiePct / 100 + wvPct / 100))}</td>
        <td class="num">${fmtNLForce(colTotals.materieel * (1 + akPct / 100 + garantiePct / 100 + wvPct / 100))}</td>
        <td class="num">${fmtNLForce(colTotals.stelpost)}</td>
        <td class="num">${fmtNLForce(colTotals.ondaann + akOndAmount)}</td>
        <td></td>
        <td></td>
        <td></td>
      </tr>

      <tr>
        <td>Risico:</td>
        <td class="num">${risicoPct} %</td>
        <td colspan="4"></td>
        <td></td>
        <td class="num">${fmtNLForce(totaalKostprijs)}</td>
        <td class="num">${fmtNLForce(risico)}</td>
        <td></td>
      </tr>

      <tr>
        <td>Winst:</td>
        <td class="num">${winstPct} %</td>
        <td colspan="4"></td>
        <td></td>
        <td class="num">${fmtNLForce(totaalKostprijs)}</td>
        <td class="num">${fmtNLForce(winst)}</td>
        <td></td>
      </tr>

      <tr>
        <td>Verzekering:</td>
        <td class="num">${verzekeringPct} %</td>
        <td colspan="4"></td>
        <td></td>
        <td class="num">${fmtNLForce(totaalKostprijs)}</td>
        <td class="num">${fmtNLForce(verzekering)}</td>
        <td></td>
      </tr>

      <tr class="summary-total">
        <td>Totaal excl. btw.:</td>
        <td></td>
        <td colspan="8" class="num total-amount">${fmtNLForce(hasStaart && breakdown ? breakdown.aanneemsomAfgerond : totaalExclBtw)}</td>
      </tr>

      <tr>
        <td>Btw hoog:</td>
        <td class="num">${btwPct} %</td>
        <td colspan="5"></td>
        <td class="num">${fmtNLForce(hasStaart && breakdown ? breakdown.aanneemsomAfgerond : totaalExclBtw)}</td>
        <td class="num">${fmtNLForce((hasStaart && breakdown ? breakdown.aanneemsomAfgerond : totaalExclBtw) * btwPct / 100)}</td>
        <td></td>
      </tr>

      <tr class="summary-total grand-total">
        <td>Totaalprijs incl. btw.:</td>
        <td></td>
        <td colspan="8" class="num total-amount">${fmtNLForce((hasStaart && breakdown ? breakdown.aanneemsomAfgerond : totaalExclBtw) * (1 + btwPct / 100))}</td>
      </tr>
    </table>
  </div>`;
}

function getBouw1Styles(): string {
  return `
/* OpenAEC Style Book â€” Design Tokens */
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400&display=swap');

:root {
  --oaec-accent: #D97706;
  --oaec-accent-hover: #EA580C;
  --oaec-highlight: #F59E0B;
  --oaec-text: #36363E;
  --oaec-text-secondary: #A1A1AA;
  --oaec-bg: #FAFAF9;
  --oaec-surface: #F5F5F4;
  --oaec-dark: #2A2A32;
  --oaec-success: #16A34A;
  --oaec-border: #E7E5E4;
  --oaec-border-strong: #A8A29E;
  --oaec-radius: 8px;
  --oaec-shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
  --oaec-shadow-md: 0 4px 6px -1px rgba(0,0,0,0.1);
}

@page {
  size: A4 landscape;
  margin: 10mm 8mm 14mm 8mm;
  @bottom-right { content: counter(page) " / " counter(pages); font-family: 'Inter', sans-serif; font-size: 7pt; color: var(--oaec-text-secondary); }
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: 'Inter', 'Segoe UI', sans-serif;
  font-size: 7.5pt;
  color: var(--oaec-text);
  line-height: 1.4;
  padding: 6mm;
  background: white;
}

/* Action buttons â€” OpenAEC amber primary */
.print-actions { position: fixed; top: 12px; right: 12px; display: flex; gap: 8px; z-index: 1000; }
.print-btn {
  padding: 8px 24px; background: var(--oaec-accent); color: white; border: none;
  border-radius: var(--oaec-radius); cursor: pointer; font-family: 'Inter', sans-serif;
  font-size: 10pt; font-weight: 600; transition: background 0.15s ease;
  box-shadow: var(--oaec-shadow-sm);
}
.print-btn:hover { background: var(--oaec-accent-hover); box-shadow: var(--oaec-shadow-md); }
.close-btn {
  padding: 8px 24px; background: transparent; color: var(--oaec-text); border: 1.5px solid var(--oaec-border-strong);
  border-radius: var(--oaec-radius); cursor: pointer; font-family: 'Inter', sans-serif;
  font-size: 10pt; font-weight: 500; transition: all 0.15s ease;
}
.close-btn:hover { background: var(--oaec-surface); border-color: var(--oaec-text); }

/* Header */
.header { display: flex; justify-content: space-between; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid var(--oaec-accent); }
.header-left { display: flex; align-items: flex-start; }
.company-logo { max-height: 48px; max-width: 200px; }
.company-name-large { font-family: 'Space Grotesk', sans-serif; font-size: 16pt; font-weight: 700; color: var(--oaec-text); padding-top: 4px; }
.header-right { text-align: left; }
.meta-table { font-size: 7.5pt; border-collapse: collapse; }
.meta-table td { padding: 0 8px 2px 0; }
.meta-label { color: var(--oaec-text-secondary); font-weight: 500; text-transform: uppercase; font-size: 6.5pt; letter-spacing: 0.3px; }
.meta-value { color: var(--oaec-text); font-weight: 500; }
.report-title { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 9pt; margin-top: 4px; color: var(--oaec-text); }

/* Main grid */
.bouw1-grid {
  width: 100%;
  border-collapse: collapse;
  font-size: 7pt;
  table-layout: fixed;
}
.bouw1-grid thead { display: table-header-group; }
.bouw1-grid tbody tr { page-break-inside: avoid; break-inside: avoid; }
.chapter-row { page-break-after: avoid; break-after: avoid; }
.chapter-subtotal { page-break-before: avoid; break-before: avoid; }

.bouw1-grid th, .bouw1-grid td {
  padding: 2px 3px;
  vertical-align: top;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Column widths (landscape A4 ~ 277mm printable = ~785pt) */
.col-hst { width: 22px; text-align: left; }
.col-par { width: 22px; text-align: left; }
.col-nr { width: 22px; text-align: left; }
.col-desc { width: auto; text-align: left; white-space: normal; word-wrap: break-word; }
.col-qty { width: 42px; text-align: right; }
.col-unit { width: 22px; text-align: center; }
.col-price { width: 52px; text-align: right; }
.col-norm { width: 36px; text-align: right; }
.col-uren { width: 42px; text-align: right; }
.col-tar { width: 18px; text-align: center; }
.col-loon { width: 56px; text-align: right; }
.col-mat { width: 56px; text-align: right; }
.col-meel { width: 52px; text-align: right; }
.col-stel { width: 52px; text-align: right; }
.col-ond { width: 52px; text-align: right; }
.col-keh { width: 52px; text-align: right; }
.col-sub { width: 56px; text-align: right; }
.col-tot { width: 56px; text-align: right; }

.num { text-align: right; font-variant-numeric: tabular-nums; }

/* Header row â€” amber accent stripe */
.header-row th {
  background: linear-gradient(180deg, #FEF3C7 0%, #FDE68A 100%);
  border-top: 2px solid var(--oaec-accent);
  border-bottom: 1px solid var(--oaec-accent);
  font-weight: 600;
  font-size: 6.5pt;
  padding: 3px 3px;
  text-align: left;
  color: var(--oaec-text);
  text-transform: uppercase;
  letter-spacing: 0.2px;
}
.header-row th.col-qty,
.header-row th.col-price,
.header-row th.col-norm,
.header-row th.col-uren,
.header-row th.col-loon,
.header-row th.col-mat,
.header-row th.col-meel,
.header-row th.col-stel,
.header-row th.col-ond,
.header-row th.col-keh,
.header-row th.col-sub,
.header-row th.col-tot { text-align: right; }
.header-row th.col-unit,
.header-row th.col-tar { text-align: center; }

/* Chapter rows */
.chapter-row td {
  font-family: 'Space Grotesk', sans-serif;
  font-weight: 700;
  padding-top: 4px;
  padding-bottom: 2px;
  color: var(--oaec-text);
}
.chapter-row.depth-0 td { font-size: 8pt; }
.chapter-row.depth-1 td { font-size: 7.5pt; padding-left: 8px; }
.chapter-row.depth-2 td { font-size: 7pt; font-weight: 600; padding-left: 16px; }

/* Data rows */
.data-row td { border-bottom: none; }
.data-row:hover td { background: #FFFBEB; }

/* Text rows */
.text-row td { font-style: italic; color: var(--oaec-text-secondary); }

/* Chapter subtotal */
.chapter-subtotal td {
  border-top: 1.5px solid var(--oaec-accent);
  font-weight: 600;
  padding-top: 3px;
  padding-bottom: 3px;
  color: var(--oaec-text);
}

/* Spacer between chapters */
.spacer td { height: 8px; border: none; }

/* Footer */
.footer {
  margin-top: 16px;
  padding-top: 6px;
  border-top: 1px solid var(--oaec-border);
  font-size: 6pt;
  color: var(--oaec-text-secondary);
}
.footer-text { margin-bottom: 2px; }
.footer-company { font-weight: 500; }

/* Summary section */
.page-break { page-break-before: always; }
.summary-section { margin-top: 24px; }
.summary-title { font-family: 'Space Grotesk', sans-serif; font-size: 11pt; font-weight: 700; margin-bottom: 12px; color: var(--oaec-text); border-bottom: 2px solid var(--oaec-accent); padding-bottom: 4px; display: inline-block; }

.summary-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 7.5pt;
}
.summary-table th, .summary-table td {
  padding: 3px 6px;
  vertical-align: top;
}
.summary-header th {
  background: linear-gradient(180deg, #FEF3C7 0%, #FDE68A 100%);
  border-top: 2px solid var(--oaec-accent);
  border-bottom: 1px solid var(--oaec-accent);
  font-weight: 600;
  text-align: left;
  font-size: 7pt;
  text-transform: uppercase;
  letter-spacing: 0.2px;
  color: var(--oaec-text);
}
.summary-header th.num,
.s-loon, .s-mat, .s-meel, .s-stel, .s-ond, .s-bedrag, .s-post, .s-tot { text-align: right; }
.s-pct { text-align: right; width: 40px; }
.s-desc { width: auto; }
.s-loon { width: 70px; }
.s-mat { width: 70px; }
.s-meel { width: 60px; }
.s-stel { width: 60px; }
.s-ond { width: 70px; }
.s-bedrag { width: 70px; }
.s-post { width: 70px; }
.s-tot { width: 80px; }

.summary-kostprijs td {
  border-top: 1.5px solid var(--oaec-accent);
  font-weight: 600;
}
.summary-total td {
  border-top: 2px solid var(--oaec-text);
  font-weight: 700;
  font-size: 8.5pt;
  padding-top: 6px;
}
.grand-total td {
  border-top: 3px double var(--oaec-accent);
  font-size: 9pt;
  color: var(--oaec-text);
}
.total-amount { font-weight: 700; }

@media print {
  .print-actions { display: none; }
  body { padding: 0; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
}
`;
}
