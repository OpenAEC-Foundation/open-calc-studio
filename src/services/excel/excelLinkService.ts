import { readWorkbookForValues } from '@/services/importers/safeWorkbook';
import { cellIssueKind, type TabularCellIssue } from '@/services/importers/genericTabularImporter';
import { parseAmount } from '@/services/importers/core';
import * as XLSX from 'xlsx';
import type { CostItem } from '../../types/costModel';

/**
 * One sheet for the cell picker. `data[0][0]` is the top-left cell of the used
 * range (`ref`), which is not always A1: a sheet whose data starts at B3 has
 * `origin = { row: 2, col: 1 }`. Add the origin to a data index to get the
 * real Excel address (knownbugs 79).
 */
export interface ExcelPickerSheet {
  data: (string | number | null)[][];
  ref: string;
  /** 0-based sheet row/column of `data[0][0]`. */
  origin: { row: number; col: number };
  /**
   * Cells without a usable value, by address ("B4"): an Excel error or a
   * formula never calculated in Excel (#88). Their value in `data` is not used.
   */
  issues?: Record<string, PickerCellIssue>;
}

export type PickerCellIssue = Pick<TabularCellIssue, 'kind' | 'text'>;

export interface ParsedExcelFile {
  sheetNames: string[];
  sheets: Record<string, ExcelPickerSheet>;
}

function workbookToPickerSheets(wb: XLSX.WorkBook, uncalculated: boolean): ParsedExcelFile {
  const sheets: Record<string, ExcelPickerSheet> = {};
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const ref = ws['!ref'] || 'A1';
    const start = XLSX.utils.decode_range(ref).s;
    const data = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, {
      header: 1,
      defval: null,
      // Keep empty rows so data[i] stays sheet row origin.row + i.
      blankrows: true,
    });
    // Same judgement as "Update Excel links", so the picker never offers a
    // value that the refresh would refuse (#REF! as 23, a placeholder 0).
    const issues: Record<string, PickerCellIssue> = {};
    for (const address of Object.keys(ws)) {
      if (address.startsWith('!')) continue;
      const issue = cellIssueKind(ws[address] as XLSX.CellObject, uncalculated);
      if (issue) issues[address] = issue;
    }
    sheets[name] = { data, ref, origin: { row: start.r, col: start.c }, ...(Object.keys(issues).length ? { issues } : {}) };
  }
  return { sheetNames: wb.SheetNames, sheets };
}

function readPickerFile(data: Uint8Array | ArrayBuffer): ParsedExcelFile {
  const { workbook, uncalculated } = readWorkbookForValues(data, { type: 'array' });
  return workbookToPickerSheets(workbook, uncalculated);
}

/** Parse an Excel file (from File object) and return sheet names + data for the picker */
export async function parseExcelFile(file: File): Promise<ParsedExcelFile> {
  return readPickerFile(await file.arrayBuffer());
}

/** Parse an Excel file from path (Tauri FS) */
export async function parseExcelFileFromPath(filePath: string): Promise<ParsedExcelFile | null> {
  try {
    const tauriFs = await import('@tauri-apps/plugin-fs');
    return readPickerFile(await tauriFs.readFile(filePath));
  } catch (e) {
    console.error(`[ExcelLink] Failed to parse ${filePath}:`, e);
    return null;
  }
}

/**
 * Een getal dat als tekst in een cel staat, streng gelezen: "6,5" is 6,5 en
 * "1.234,5" is 1234,5; tekst als "12abc" is geen getal (knownbug 83).
 */
function textCellNumber(text: string): number | null {
  const s = text.trim();
  if (!/^[+-]?[\d\s.,]+$/.test(s) || !/\d/.test(s)) return null;
  const parsed = parseAmount(s);
  return parsed.invalid ? null : parsed.value;
}

/** Numeric value of a picker cell value, or null when it is not a number. */
export function toPickerNumber(val: string | number | null | undefined): number | null {
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  if (val === null || val === undefined) return null;
  return textCellNumber(String(val));
}

/** Why the cell at an Excel address (e.g. "B4") has no usable value, or null. */
export function pickerCellIssue(sheet: ExcelPickerSheet | undefined, cell: string): PickerCellIssue | null {
  if (!sheet?.issues || !cell) return null;
  return sheet.issues[cell.toUpperCase()] ?? null;
}

/** Numeric value at an Excel address (e.g. "B4") in a picker sheet, or null. */
export function pickerCellValue(sheet: ExcelPickerSheet | undefined, cell: string): number | null {
  if (!sheet || !cell) return null;
  if (!/^[A-Z]+[1-9][0-9]*$/i.test(cell)) return null;
  if (pickerCellIssue(sheet, cell)) return null;
  const addr = XLSX.utils.decode_cell(cell.toUpperCase());
  const r = addr.r - sheet.origin.row;
  const c = addr.c - sheet.origin.col;
  if (r < 0 || c < 0) return null;
  return toPickerNumber(sheet.data[r]?.[c]);
}

/** Convert column index (0-based) to Excel column letter (A, B, ..., Z, AA, AB, ...) */
export function colIndexToLetter(index: number): string {
  let result = '';
  let n = index;
  while (n >= 0) {
    result = String.fromCharCode((n % 26) + 65) + result;
    n = Math.floor(n / 26) - 1;
  }
  return result;
}

/** Build cell reference from row/col (0-based) */
export function cellRef(row: number, col: number): string {
  return `${colIndexToLetter(col)}${row + 1}`;
}

/** Update all items that have Excel links, returns updated items and count */
export async function updateAllExcelLinks(items: CostItem[]): Promise<{
  updatedItems: CostItem[];
  updateCount: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let updateCount = 0;

  // One read per file: cache the promise, not the result, so items linked to
  // the same file do not each parse it while the first read is in flight.
  const fileCache = new Map<string, Promise<{ workbook: XLSX.WorkBook; uncalculated: boolean } | null>>();
  const readLinkedFile = (filePath: string) => {
    let pending = fileCache.get(filePath);
    if (!pending) {
      pending = (async () => {
        try {
          const tauriFs = await import('@tauri-apps/plugin-fs');
          return readWorkbookForValues(await tauriFs.readFile(filePath), { type: 'array' });
        } catch {
          return null;
        }
      })();
      fileCache.set(filePath, pending);
    }
    return pending;
  };

  const updatedItems = await Promise.all(
    items.map(async (item) => {
      if (!item.excelLink) return item;

      const { filePath, sheet, cell } = item.excelLink;

      try {
        const file = await readLinkedFile(filePath);
        if (!file) {
          errors.push(`Kan bestand niet lezen: ${filePath}`);
          return item;
        }
        const wb = file.workbook;

        const ws = wb.Sheets[sheet];
        if (!ws) {
          errors.push(`Sheet "${sheet}" niet gevonden in ${filePath}`);
          return item;
        }

        const cellObj = ws[cell];
        if (!cellObj) {
          errors.push(`Cel ${cell} is leeg in ${sheet} (${filePath})`);
          return item;
        }

        // Een Excel-fout (#REF!, #DIV/0!) heeft een numerieke foutcode als v
        // (23, 7, …): die mag nooit als hoeveelheid binnenkomen. Een formule
        // die nooit in Excel is berekend, heeft geen of een nep-uitkomst (#88).
        const issue = cellIssueKind(cellObj, file.uncalculated);
        if (issue?.kind === 'error') {
          errors.push(`Cel ${cell} bevat een Excel-fout (${issue.text}) in ${sheet} (${filePath})`);
          return item;
        }
        if (issue?.kind === 'noCachedValue') {
          errors.push(`Cel ${cell} heeft een formule die nooit in Excel is berekend in ${sheet} (${filePath}); open en sla het bestand op in Excel`);
          return item;
        }
        if (cellObj.t === 'z') {
          errors.push(`Cel ${cell} is leeg in ${sheet} (${filePath})`);
          return item;
        }

        const newQty = toPickerNumber(typeof cellObj.v === 'number' ? cellObj.v : String(cellObj.v ?? ''));
        if (newQty === null) {
          errors.push(`Cel ${cell} bevat geen getal in ${sheet} (${filePath})`);
          return item;
        }

        if (item.quantity !== newQty) {
          updateCount++;
          return { ...item, quantity: newQty };
        }
        return item;
      } catch (e) {
        errors.push(`Fout bij ${filePath}!${sheet}!${cell}: ${e}`);
        return item;
      }
    }),
  );

  return { updatedItems, updateCount, errors };
}
