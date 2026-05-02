/**
 * Import an Inschrijfstaat RAW Excel file (.xls/.xlsx).
 * Reads the format produced by WpCalc/BasCalc/Open Calc Studio:
 *
 * Column A = row type: vk(header), vr(data), vs(subtotal), vt(total)
 * Column C = Code
 * Column D = Omschrijving
 * Column E = Hoeveelheid
 * Column F = Eenheid
 * Column G = S (verrekenbaar)
 * Column H = Eenheidsprijs
 * Column I = Bedrag
 */

import type { CostItem, CostSchedule, CostUnit, CompanyInfo, Verrekenbaarheid } from '@/types/costModel';

function generateId(): string {
  return crypto.randomUUID();
}

function generateIfcGuid(): string {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';
  let r = '';
  for (let i = 0; i < 22; i++) r += chars[Math.floor(Math.random() * 64)];
  return r;
}

function mapUnit(raw: string): CostUnit {
  const u = raw.trim().toLowerCase();
  switch (u) {
    case 'm': case 'm1': return 'm';
    case 'm2': return 'm²';
    case 'm3': return 'm³';
    case 'kg': return 'kg';
    case 'ton': return 'ton';
    case 'uur': return 'uur';
    case 'st': return 'st';
    case 'dgn': return 'dgn';
    case 'km': return 'km';
    case 'keer': return 'keer';
    case 'ls': return 'ls';
    case 'week': return 'week';
    case 'mnd': return 'mnd';
    case 'post': return 'post';
    case '%': return '%';
    case 'pm': return 'pm';
    case 'eur': return 'post';
    default: return 'st';
  }
}

function unspaceTitle(text: string): string {
  // "A A N V A N G S W E R K" → "AANVANGSWERK"
  const stripped = text.replace(/\s+/g, '');
  if (stripped.length > 0 && stripped === stripped.toUpperCase()) {
    // Title case it
    return stripped.charAt(0) + stripped.slice(1).toLowerCase();
  }
  return stripped;
}

function isSpacedTitle(text: string): boolean {
  // Check if text is "X X X X X ..." pattern (single chars with spaces)
  const trimmed = text.trim();
  if (trimmed.length < 3) return false;
  // Every other character should be a space
  for (let i = 1; i < trimmed.length; i += 2) {
    if (trimmed[i] !== ' ') return false;
  }
  return true;
}

function createEmptyItem(overrides: Partial<CostItem>): CostItem {
  return {
    id: generateId(),
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
    tariefGroep: null,
    ...overrides,
  };
}

interface ParsedRow {
  type: string;       // vr, vs, vt
  code: string;
  description: string;
  quantity: number | null;
  unit: string;
  verrekenbaar: string;
  unitPrice: number;
  total: number;
}

/**
 * Determine hierarchy level from code:
 * - 1 digit (1-9) or 2 digits (10-99) → chapter
 * - 4 digits (1000-9999) → sub-chapter (also chapter)
 * - 6 digits (100010) → bestekspost (begrotingspost)
 * - "opm" → tekstregel
 */
function getRowInfo(code: string): { rowType: 'chapter' | 'begrotingspost' | 'tekstregel'; depth: number } {
  const c = code.trim();
  if (c.toLowerCase() === 'opm' || c === '') {
    return { rowType: 'tekstregel', depth: 0 };
  }
  const num = parseInt(c, 10);
  if (isNaN(num)) {
    return { rowType: 'tekstregel', depth: 0 };
  }
  if (c.length <= 2) {
    return { rowType: 'chapter', depth: 0 };
  }
  if (c.length <= 4) {
    return { rowType: 'chapter', depth: 1 };
  }
  return { rowType: 'begrotingspost', depth: 2 };
}

export async function importInschrijfstaatFile(buffer: ArrayBuffer): Promise<{
  schedule: CostSchedule;
  items: CostItem[];
  companyInfo?: CompanyInfo;
}> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // Parse header info
  let companyName = '';
  let companyAddress = '';
  let companyCity = '';
  let projectName = '';
  let bestekNr = '';
  let opdrachtgever = '';

  for (let r = 0; r < Math.min(13, data.length); r++) {
    const rowType = String(data[r][0] || '').trim();
    if (rowType !== 'vk') continue;

    const colC = String(data[r][2] || '').trim();
    const colI = String(data[r][8] || '').trim();

    // Company info (rows 3-5 typically)
    if (r === 3 && colC) companyName = colC;
    if (r === 4 && colC) companyAddress = colC;
    if (r === 5 && colC) companyCity = colC;

    // Project info
    if (colC.startsWith('Project:')) projectName = colC.replace('Project:', '').trim();
    if (colI.startsWith('Bestek:')) bestekNr = colI.replace('Bestek:', '').trim();
    if (colI.startsWith('Opdrachtgever:')) opdrachtgever = colI.replace('Opdrachtgever:', '').trim();
  }

  // Parse data rows
  const parsedRows: ParsedRow[] = [];
  for (let r = 13; r < data.length; r++) {
    const rowType = String(data[r][0] || '').trim();
    if (rowType !== 'vr') continue; // Skip subtotals, totals

    const code = String(data[r][2] || '').trim();
    const desc = String(data[r][3] || '').trim();
    const qty = data[r][4] !== '' && data[r][4] !== null ? Number(data[r][4]) : null;
    const unit = String(data[r][5] || '').trim();
    const verr = String(data[r][6] || '').trim();
    const ehpr = Number(data[r][7]) || 0;
    const bedr = Number(data[r][8]) || 0;

    parsedRows.push({
      type: rowType,
      code,
      description: desc,
      quantity: isNaN(qty as number) ? null : qty,
      unit,
      verrekenbaar: verr,
      unitPrice: ehpr,
      total: bedr,
    });
  }

  // Build hierarchy
  const items: CostItem[] = [];
  let sortOrder = 0;
  let currentChapter: CostItem | null = null;
  let currentSubChapter: CostItem | null = null;

  for (const row of parsedRows) {
    const info = getRowInfo(row.code);

    // Unspace chapter titles
    let desc = row.description;
    if (info.rowType === 'chapter' && isSpacedTitle(desc)) {
      desc = unspaceTitle(desc);
    }

    const verr = (['V', 'A', 'N', 'F'].includes(row.verrekenbaar.toUpperCase())
      ? row.verrekenbaar.toUpperCase()
      : 'V') as Verrekenbaarheid;

    if (info.rowType === 'chapter' && info.depth === 0) {
      // Top-level chapter
      currentChapter = createEmptyItem({
        code: row.code,
        description: desc,
        rowType: 'chapter',
        depth: 0,
        parentId: null,
        sortOrder: sortOrder++,
        total: row.total,
        verrekenbaar: verr,
      });
      items.push(currentChapter);
      currentSubChapter = null;
    } else if (info.rowType === 'chapter' && info.depth === 1) {
      // Sub-chapter
      currentSubChapter = createEmptyItem({
        code: row.code,
        description: desc,
        rowType: 'chapter',
        depth: 1,
        parentId: currentChapter?.id ?? null,
        sortOrder: sortOrder++,
        total: row.total,
        verrekenbaar: verr,
      });
      items.push(currentSubChapter);
    } else if (info.rowType === 'begrotingspost') {
      // Bestekspost
      const parentId = currentSubChapter?.id ?? currentChapter?.id ?? null;
      items.push(createEmptyItem({
        code: row.code,
        description: desc,
        rowType: 'begrotingspost',
        depth: parentId ? (currentSubChapter ? 2 : 1) : 0,
        parentId,
        sortOrder: sortOrder++,
        quantity: row.quantity,
        unit: mapUnit(row.unit),
        unitPrice: row.unitPrice,
        total: row.total,
        verrekenbaar: verr,
      }));
    } else if (info.rowType === 'tekstregel') {
      // Opmerking / tekstregel
      const parentId = currentSubChapter?.id ?? currentChapter?.id ?? null;
      items.push(createEmptyItem({
        code: row.code,
        description: desc,
        rowType: 'tekstregel',
        depth: parentId ? (currentSubChapter ? 2 : 1) : 0,
        parentId,
        sortOrder: sortOrder++,
      }));
    }
  }

  const schedule: CostSchedule = {
    id: bestekNr || crypto.randomUUID(),
    name: projectName || 'Inschrijfstaat',
    description: bestekNr,
    status: 'DRAFT',
    predefinedType: 'TENDER',
    currency: 'EUR',
    projectName: projectName,
    projectNumber: bestekNr,
    client: opdrachtgever,
    author: companyName,
    ifcGuid: crypto.randomUUID(),
    uitvoeringskosten: 0,
    algemeneKosten: 0,
    winstRisico: 0,
  };

  const companyInfo: CompanyInfo | undefined = companyName ? {
    name: companyName,
    postalAddress: companyAddress,
    postalCity: companyCity,
    visitAddress: '',
    visitCity: '',
    phone: '',
    fax: '',
    email: '',
    logoLeft: '',
    logoRight: '',
  } : undefined;

  return { schedule, items, companyInfo };
}
