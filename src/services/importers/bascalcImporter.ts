import * as XLSX from 'xlsx';
import type { CostItem, CostSchedule, RowType, CompanyInfo, ResourceType } from '@/types/costModel';
import { makeCostItem, normalizeUnit, genId, genIfcGuid } from './core';

function getDepthFromCode(code: string): number {
  const len = code.replace(/\s/g, '').length;
  if (len <= 1) return 0;
  if (len <= 2) return 1;
  if (len <= 3) return 2;
  return 3; // 6-char bestekspost
}

function getRowType(code: string): RowType {
  const c = code.replace(/\s/g, '');
  switch (c) {
    case '929990': return 'staart_ukk';
    case '939990': return 'staart_ak';
    case '949990': return 'staart_wr';
    case '959990': return 'staart_afronding';
    default: return 'begrotingspost';
  }
}

/** Map S-code to ResourceType */
function mapResourceType(sColumn: string): ResourceType {
  const s = sColumn.toLowerCase();
  if (s === 'm') return 'arbeid'; // mankracht = arbeid
  if (s === 'h') return 'materieel'; // hulpmiddel = materieel
  return 'overig';
}

function cellStr(row: unknown[], col: number): string {
  const v = row[col];
  if (v === undefined || v === null) return '';
  return String(v).trim();
}

function cellNum(row: unknown[], col: number): number | null {
  const v = row[col];
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

export function importBasCalcFile(arrayBuffer: ArrayBuffer): { schedule: CostSchedule; items: CostItem[]; companyInfo: CompanyInfo } {
  const wb = XLSX.read(arrayBuffer, { type: 'array' });

  // --- Read Menu sheet for project info and company data ---
  let projectName = '';
  let projectNumber = '';
  let client = '';
  let author = '';
  const companyInfo: CompanyInfo = {
    name: '',
    postalAddress: '',
    postalCity: '',
    visitAddress: '',
    visitCity: '',
    phone: '',
    fax: '',
    email: '',
    logoLeft: '',
    logoRight: '',
  };
  const menuSheet = wb.Sheets['Menu'];
  if (menuSheet) {
    const menuData: unknown[][] = XLSX.utils.sheet_to_json(menuSheet, { header: 1 });
    for (const row of menuData) {
      if (!row || row.length < 5) continue;
      const label4 = String(row[4] ?? '').trim().toLowerCase();
      if (label4.startsWith('project') || label4.startsWith('werk')) {
        if (!projectName) projectName = cellStr(row, 5);
        const label8 = String(row[8] ?? '').trim().toLowerCase();
        if (label8.startsWith('werknummer') || label8.startsWith('project')) {
          projectNumber = cellStr(row, 9);
        }
      }
      if (label4.startsWith('opdrachtgever') || label4.startsWith('klant')) {
        client = cellStr(row, 5);
      }
      if (label4.startsWith('bedrijf')) {
        author = cellStr(row, 5);
      }
    }

    if (menuData.length > 13) companyInfo.name = cellStr(menuData[13] ?? [], 5);
    if (menuData.length > 14) companyInfo.postalAddress = cellStr(menuData[14] ?? [], 5);
    if (menuData.length > 15) companyInfo.postalCity = cellStr(menuData[15] ?? [], 5);
    if (menuData.length > 16) companyInfo.visitAddress = cellStr(menuData[16] ?? [], 5);
    if (menuData.length > 17) companyInfo.visitCity = cellStr(menuData[17] ?? [], 5);
    if (menuData.length > 18) companyInfo.phone = cellStr(menuData[18] ?? [], 5);
    if (menuData.length > 19) companyInfo.fax = cellStr(menuData[19] ?? [], 5);
    if (menuData.length > 20) companyInfo.email = cellStr(menuData[20] ?? [], 5);
  }

  // --- Read Eindblad for staartkosten percentages ---
  let uitvoeringskosten = 6;
  let algemeneKosten = 9;
  let winstRisico = 5;
  const eindSheet = wb.Sheets['Eindblad'];
  if (eindSheet) {
    const eindData: unknown[][] = XLSX.utils.sheet_to_json(eindSheet, { header: 1 });
    for (const row of eindData) {
      if (!row || row.length < 16) continue;
      const code = String(row[8] ?? '').trim();
      const pct = cellNum(row, 15);
      if (pct === null) continue;
      if (code === '929990') uitvoeringskosten = pct;
      else if (code === '939990') algemeneKosten = pct;
      else if (code === '949990') winstRisico = pct;
    }
  }

  // --- Read Kostprijs sheet ---
  const kostprijsSheet = wb.Sheets['Kostprijs'];
  if (!kostprijsSheet) {
    throw new Error('Geen "Kostprijs" tabblad gevonden in het BasCalc bestand');
  }

  const data: unknown[][] = XLSX.utils.sheet_to_json(kostprijsSheet, { header: 1 });

  const items: CostItem[] = [];
  let sortOrder = 0;

  // Track parent hierarchy by depth
  const parentStack: { id: string; depth: number }[] = [];

  // Collect all rows
  const rowEntries: { type: string; row: unknown[] }[] = [];
  for (const row of data) {
    if (!row || row.length === 0) continue;
    const rijtype = cellStr(row, 0); // Column A
    if (rijtype === 'ih' || rijtype === 'cn' || rijtype === 'cb' || rijtype === 'cp' || rijtype === 'opm') {
      rowEntries.push({ type: rijtype, row });
    }
  }

  for (let idx = 0; idx < rowEntries.length; idx++) {
    const entry = rowEntries[idx];

    if (entry.type === 'ih') {
      const row = entry.row;
      const code = cellStr(row, 2);     // Column C
      if (!code) continue;

      const description = cellStr(row, 3); // Column D
      const quantity = cellNum(row, 8);    // Column I (Hoeveelheid)
      const unit = normalizeUnit(cellStr(row, 9)); // Column J (Eenheid)
      const ehPrijs = cellNum(row, 12);    // Column M (Eh.prijs post)
      const bedrag = cellNum(row, 13);     // Column N (Bedrag post)

      const depth = getDepthFromCode(code);
      const rowType = getRowType(code);

      // Determine if this is a chapter based on code length
      const isChapter = depth < 3;

      // Find parent
      while (parentStack.length > 0 && parentStack[parentStack.length - 1].depth >= depth) {
        parentStack.pop();
      }
      const parentId = parentStack.length > 0 ? parentStack[parentStack.length - 1].id : null;

      // Determine material vs labor from the 'S' column (K, index 10)
      let materialPrice: number | null = null;
      let laborPrice: number | null = null;

      if (!isChapter && ehPrijs !== null) {
        const sColumn = cellStr(row, 10).toLowerCase();
        if (sColumn === 'h') {
          laborPrice = ehPrijs;
        } else if (sColumn === 'm') {
          materialPrice = ehPrijs;
        } else {
          materialPrice = ehPrijs;
        }
      }

      // For staartkosten rows, extract percentage
      let staartPercentage: number | null = null;
      if (rowType !== 'begrotingspost') {
        staartPercentage = cellNum(row, 8) ?? cellNum(row, 5);
      }

      const unitPrice = (materialPrice ?? 0) + (laborPrice ?? 0);
      const total = bedrag ?? (quantity !== null ? quantity * unitPrice : 0);

      const itemRowType: RowType = isChapter ? 'chapter' : rowType;

      const item = makeCostItem({
        parentId,
        sortOrder: sortOrder++,
        code,
        description,
        unit: isChapter ? 'st' : unit,
        quantity: isChapter ? null : quantity,
        materialPrice: isChapter ? null : materialPrice,
        laborPrice: isChapter ? null : laborPrice,
        unitPrice: isChapter ? 0 : unitPrice,
        total,
        depth,
        rowType: itemRowType,
        staartPercentage,
        verrekenbaar: isChapter ? 'V' : null,
      });

      items.push(item);

      // Push to parent stack if it's a container (chapter or begrotingspost)
      // so that cb/cn rows become children of the begrotingspost, not the chapter
      parentStack.push({ id: item.id, depth });
    } else if (entry.type === 'cb') {
      const row = entry.row;
      const code = cellStr(row, 2);
      const description = cellStr(row, 3);
      const bedrag = cellNum(row, 13);

      const parentId = parentStack.length > 0 ? parentStack[parentStack.length - 1].id : null;
      const depth = parentId ? (parentStack[parentStack.length - 1].depth + 1) : 0;

      // cb rows with code 'opm' are tekstregel (opmerking), not bewakingspost
      const isTekst = code.trim().toLowerCase() === 'opm';

      const item = makeCostItem({
        parentId,
        sortOrder: sortOrder++,
        code: isTekst ? '' : code,
        description,
        total: isTekst ? 0 : (bedrag ?? 0),
        depth,
        rowType: isTekst ? 'tekstregel' : 'bewakingspost',
      });

      items.push(item);
      // Only bewakingspost can be parent of cn rows
      if (!isTekst) {
        parentStack.push({ id: item.id, depth });
      }
    } else if (entry.type === 'cn' || entry.type === 'cp') {
      // Regel → own CostItem row with norm fields
      const row = entry.row;
      const code = cellStr(row, 2);
      const description = cellStr(row, 3);
      const colE = cellNum(row, 4);     // Column E → Aantal (quantity)
      const colF = cellNum(row, 5);    // Column F → Productienorm (normQuantity)
      const colH = cellNum(row, 7);    // Column H → Productiecapaciteit (normFactor)
      const rUnit = normalizeUnit(cellStr(row, 9));
      const sColumn = cellStr(row, 10);
      const rEhPrijs = cellNum(row, 12);
      const rBedrag = cellNum(row, 13);

      const resourceType = mapResourceType(sColumn);

      // Find parent: most recent bewakingspost or ih item
      const parentId = parentStack.length > 0 ? parentStack[parentStack.length - 1].id : null;
      const depth = parentId ? (parentStack[parentStack.length - 1].depth + 1) : 0;

      const item = makeCostItem({
        parentId,
        sortOrder: sortOrder++,
        code,
        description,
        unit: rUnit,
        total: rBedrag ?? 0,
        depth,
        rowType: 'regel',
        quantity: colE,          // Aantal
        normQuantity: colF,      // Productienorm
        normFactor: colH,        // Productiecapaciteit
        normUnitPrice: rEhPrijs, // Prijs per middel
        resourceType,
      });

      items.push(item);
    } else if (entry.type === 'opm') {
      // Tekstregel (opmerking) → text-only row, no calculation
      const row = entry.row;
      const description = cellStr(row, 3);

      const parentId = parentStack.length > 0 ? parentStack[parentStack.length - 1].id : null;
      const depth = parentId ? (parentStack[parentStack.length - 1].depth + 1) : 0;

      const item = makeCostItem({
        parentId,
        sortOrder: sortOrder++,
        description,
        depth,
        rowType: 'tekstregel',
      });

      items.push(item);
    }
  }

  // --- Build schedule ---
  const schedule: CostSchedule = {
    id: genId(),
    name: projectName || 'BasCalc import',
    description: '',
    status: 'DRAFT',
    predefinedType: 'ESTIMATE',
    currency: 'EUR',
    projectName: projectName || '',
    projectNumber: projectNumber || '',
    client: client || '',
    author: author || '',
    ifcGuid: genIfcGuid(),
    uitvoeringskosten,
    algemeneKosten,
    winstRisico,
  };

  return { schedule, items, companyInfo };
}
