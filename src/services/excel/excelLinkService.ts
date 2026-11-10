import { readWorkbook } from '@/services/importers/safeWorkbook';
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
}

export interface ParsedExcelFile {
  sheetNames: string[];
  sheets: Record<string, ExcelPickerSheet>;
}

function workbookToPickerSheets(wb: XLSX.WorkBook): ParsedExcelFile {
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
    sheets[name] = { data, ref, origin: { row: start.r, col: start.c } };
  }
  return { sheetNames: wb.SheetNames, sheets };
}

/** Parse an Excel file (from File object) and return sheet names + data for the picker */
export async function parseExcelFile(file: File): Promise<ParsedExcelFile> {
  const buf = await file.arrayBuffer();
  return workbookToPickerSheets(readWorkbook(buf, { type: 'array' }));
}

/** Parse an Excel file from path (Tauri FS) */
export async function parseExcelFileFromPath(filePath: string): Promise<ParsedExcelFile | null> {
  try {
    const tauriFs = await import('@tauri-apps/plugin-fs');
    const bytes = await tauriFs.readFile(filePath);
    return workbookToPickerSheets(readWorkbook(bytes, { type: 'array' }));
  } catch (e) {
    console.error(`[ExcelLink] Failed to parse ${filePath}:`, e);
    return null;
  }
}

/** Numeric value of a picker cell value, or null when it is not a number. */
export function toPickerNumber(val: string | number | null | undefined): number | null {
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  if (val === null || val === undefined) return null;
  const n = parseFloat(String(val));
  return Number.isFinite(n) ? n : null;
}

/** Numeric value at an Excel address (e.g. "B4") in a picker sheet, or null. */
export function pickerCellValue(sheet: ExcelPickerSheet | undefined, cell: string): number | null {
  if (!sheet || !cell) return null;
  if (!/^[A-Z]+[1-9][0-9]*$/i.test(cell)) return null;
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

  // Group by filePath for efficiency
  const fileCache = new Map<string, XLSX.WorkBook | null>();

  const updatedItems = await Promise.all(
    items.map(async (item) => {
      if (!item.excelLink) return item;

      const { filePath, sheet, cell } = item.excelLink;

      try {
        let wb = fileCache.get(filePath);
        if (wb === undefined) {
          try {
            const tauriFs = await import('@tauri-apps/plugin-fs');
            const bytes = await tauriFs.readFile(filePath);
            wb = readWorkbook(bytes, { type: 'array' });
          } catch {
            wb = null;
          }
          fileCache.set(filePath, wb);
        }

        if (!wb) {
          errors.push(`Kan bestand niet lezen: ${filePath}`);
          return item;
        }

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

        const newQty = typeof cellObj.v === 'number' ? cellObj.v : parseFloat(String(cellObj.v));
        if (isNaN(newQty)) {
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
