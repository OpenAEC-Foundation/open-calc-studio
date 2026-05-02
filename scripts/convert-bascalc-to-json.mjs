/**
 * Converts a BasCalc XLS file to a JSON file for use as default budget.
 * Usage: node scripts/convert-bascalc-to-json.mjs <input.xls> <output.json>
 */
import XLSX from 'xlsx';
import { readFileSync, writeFileSync } from 'fs';
import { randomUUID } from 'crypto';

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  console.error('Usage: node convert-bascalc-to-json.mjs <input.xls> <output.json>');
  process.exit(1);
}

function generateIfcGuid() {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';
  let r = '';
  for (let i = 0; i < 22; i++) r += chars[Math.floor(Math.random() * 64)];
  return r;
}

function mapUnit(raw) {
  if (!raw) return 'st';
  const u = raw.toString().trim().toLowerCase();
  const map = {
    'm2': 'm²', 'm1': 'm', 'm3': 'm³', 'uur': 'uur', 'st': 'st',
    'ton': 'ton', 'dgn': 'dgn', 'km': 'km', 'keer': 'keer', '%': '%',
    'pm': 'pm', 'kg': 'kg', 'ls': 'ls', 'week': 'week', 'mnd': 'mnd', 'post': 'post',
  };
  return map[u] || 'st';
}

function cellStr(row, col) {
  const v = row[col];
  if (v === undefined || v === null) return '';
  return String(v).trim();
}

function cellNum(row, col) {
  const v = row[col];
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function getDepthFromCode(code) {
  const len = code.replace(/\s/g, '').length;
  if (len <= 1) return 0;
  if (len <= 2) return 1;
  if (len <= 3) return 2;
  return 3;
}

function getRowType(code) {
  const c = code.replace(/\s/g, '');
  switch (c) {
    case '929990': return 'staart_ukk';
    case '939990': return 'staart_ak';
    case '949990': return 'staart_wr';
    case '959990': return 'staart_afronding';
    default: return 'begrotingspost';
  }
}

function mapResourceType(sColumn) {
  const s = sColumn.toLowerCase();
  if (s === 'm') return 'arbeid';
  if (s === 'h') return 'materieel';
  return 'overig';
}

function createEmptyItem(overrides) {
  return {
    id: randomUUID(),
    parentId: null,
    sortOrder: 0,
    code: '',
    description: '',
    unit: 'st',
    quantity: null,
    materialPrice: null,
    laborPrice: null,
    unitPrice: 0,
    total: 0,
    isCollapsed: false,
    depth: 0,
    notes: '',
    ifcGuid: generateIfcGuid(),
    rowType: 'begrotingspost',
    staartPercentage: null,
    nr: '',
    normQuantity: null,
    normFactor: null,
    normDivisor: null,
    normUnitPrice: null,
    resourceType: null,
    resourceLibraryId: null,
    verrekenbaar: 'V',
    ...overrides,
  };
}

const buf = readFileSync(inputPath);
const wb = XLSX.read(buf, { type: 'buffer' });

// Read Menu sheet
let projectName = '', projectNumber = '', client = '', author = '';
const companyInfo = { name: '', postalAddress: '', postalCity: '', visitAddress: '', visitCity: '', phone: '', fax: '', email: '' };
const menuSheet = wb.Sheets['Menu'];
if (menuSheet) {
  const menuData = XLSX.utils.sheet_to_json(menuSheet, { header: 1 });
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
    if (label4.startsWith('opdrachtgever') || label4.startsWith('klant')) client = cellStr(row, 5);
    if (label4.startsWith('bedrijf')) author = cellStr(row, 5);
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

// Read Eindblad for staartkosten
let uitvoeringskosten = 6, algemeneKosten = 9, winstRisico = 5;
const eindSheet = wb.Sheets['Eindblad'];
if (eindSheet) {
  const eindData = XLSX.utils.sheet_to_json(eindSheet, { header: 1 });
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

// Read Kostprijs sheet
const kostprijsSheet = wb.Sheets['Kostprijs'];
if (!kostprijsSheet) {
  console.error('Geen "Kostprijs" tabblad gevonden');
  process.exit(1);
}

const data = XLSX.utils.sheet_to_json(kostprijsSheet, { header: 1 });
const items = [];
let sortOrder = 0;
const parentStack = [];

for (const row of data) {
  if (!row || row.length === 0) continue;
  const rijtype = cellStr(row, 0);

  if (rijtype === 'ih') {
    const code = cellStr(row, 2);
    if (!code) continue;
    const description = cellStr(row, 3);
    const quantity = cellNum(row, 8);
    const unit = mapUnit(cellStr(row, 9));
    const ehPrijs = cellNum(row, 12);
    const bedrag = cellNum(row, 13);
    const depth = getDepthFromCode(code);
    const rowType = getRowType(code);
    const isChapter = depth < 3;

    while (parentStack.length > 0 && parentStack[parentStack.length - 1].depth >= depth) {
      parentStack.pop();
    }
    const parentId = parentStack.length > 0 ? parentStack[parentStack.length - 1].id : null;

    let materialPrice = null, laborPrice = null;
    if (!isChapter && ehPrijs !== null) {
      const sCol = cellStr(row, 10).toLowerCase();
      if (sCol === 'h') laborPrice = ehPrijs;
      else materialPrice = ehPrijs;
    }

    let staartPercentage = null;
    if (rowType !== 'begrotingspost') staartPercentage = cellNum(row, 8) ?? cellNum(row, 5);

    const unitPrice = (materialPrice ?? 0) + (laborPrice ?? 0);
    const total = bedrag ?? (quantity !== null ? quantity * unitPrice : 0);
    const itemRowType = isChapter ? 'chapter' : rowType;

    const item = createEmptyItem({
      parentId, sortOrder: sortOrder++, code, description,
      unit: isChapter ? 'st' : unit, quantity: isChapter ? null : quantity,
      materialPrice: isChapter ? null : materialPrice, laborPrice: isChapter ? null : laborPrice,
      unitPrice: isChapter ? 0 : unitPrice, total, depth, rowType: itemRowType, staartPercentage,
    });
    items.push(item);
    parentStack.push({ id: item.id, depth });

  } else if (rijtype === 'cb') {
    const code = cellStr(row, 2);
    const description = cellStr(row, 3);
    const bedrag = cellNum(row, 13);
    const parentId = parentStack.length > 0 ? parentStack[parentStack.length - 1].id : null;
    const depth = parentId ? (parentStack[parentStack.length - 1].depth + 1) : 0;

    // cb rows with code 'opm' are tekstregel, not bewakingspost
    const isTekst = code.trim().toLowerCase() === 'opm';

    const item = createEmptyItem({
      parentId, sortOrder: sortOrder++,
      code: isTekst ? '' : code,
      description,
      total: isTekst ? 0 : (bedrag ?? 0),
      depth,
      rowType: isTekst ? 'tekstregel' : 'bewakingspost',
    });
    items.push(item);
    if (!isTekst) parentStack.push({ id: item.id, depth });

  } else if (rijtype === 'cn' || rijtype === 'cp') {
    const code = cellStr(row, 2);
    const description = cellStr(row, 3);
    const colE = cellNum(row, 4);     // Aantal (quantity)
    const colF = cellNum(row, 5);    // Productienorm (normQuantity)
    const colH = cellNum(row, 7);    // Productiecapaciteit (normFactor)
    const rUnit = mapUnit(cellStr(row, 9));
    const sColumn = cellStr(row, 10);
    const rEhPrijs = cellNum(row, 12);
    const rBedrag = cellNum(row, 13);
    const resourceType = mapResourceType(sColumn);
    const parentId = parentStack.length > 0 ? parentStack[parentStack.length - 1].id : null;
    const depth = parentId ? (parentStack[parentStack.length - 1].depth + 1) : 0;

    const item = createEmptyItem({
      parentId, sortOrder: sortOrder++, code, description, unit: rUnit,
      total: rBedrag ?? 0, depth, rowType: 'regel',
      quantity: colE, normQuantity: colF, normFactor: colH, normUnitPrice: rEhPrijs, resourceType,
    });
    items.push(item);

  } else if (rijtype === 'opm') {
    const description = cellStr(row, 3);
    const parentId = parentStack.length > 0 ? parentStack[parentStack.length - 1].id : null;
    const depth = parentId ? (parentStack[parentStack.length - 1].depth + 1) : 0;

    const item = createEmptyItem({
      parentId, sortOrder: sortOrder++, description, depth, rowType: 'tekstregel',
    });
    items.push(item);
  }
}

const schedule = {
  id: randomUUID(),
  name: projectName || 'BasCalc import',
  description: '',
  status: 'DRAFT',
  predefinedType: 'ESTIMATE',
  currency: 'EUR',
  projectName: projectName || '',
  projectNumber: projectNumber || '',
  client: client || '',
  author: author || '',
  ifcGuid: generateIfcGuid(),
  uitvoeringskosten,
  algemeneKosten,
  winstRisico,
};

const output = { schedule, items, companyInfo };
writeFileSync(outputPath, JSON.stringify(output, null, 2));
console.log(`Converted ${items.length} items to ${outputPath}`);
