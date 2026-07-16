import * as XLSX from 'xlsx';
import type { CostItem } from '../../types/costModel';

/** Parse an Excel file (from File object) and return sheet names + data for the picker */
export async function parseExcelFile(file: File): Promise<{
  sheetNames: string[];
  sheets: Record<string, { data: (string | number | null)[][]; ref: string }>;
}> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheets: Record<string, { data: (string | number | null)[][]; ref: string }> = {};

  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const data = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, {
      header: 1,
      defval: null,
    });
    sheets[name] = { data, ref: ws['!ref'] || 'A1' };
  }

  return { sheetNames: wb.SheetNames, sheets };
}

/** Parse an Excel file from path (Tauri FS) */
export async function parseExcelFileFromPath(filePath: string): Promise<{
  sheetNames: string[];
  sheets: Record<string, { data: (string | number | null)[][]; ref: string }>;
} | null> {
  try {
    const tauriFs = await import('@tauri-apps/plugin-fs');
    const bytes = await tauriFs.readFile(filePath);
    const wb = XLSX.read(bytes, { type: 'array' });
    const sheets: Record<string, { data: (string | number | null)[][]; ref: string }> = {};

    for (const name of wb.SheetNames) {
      const ws = wb.Sheets[name];
      if (!ws) continue;
      const data = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, {
        header: 1,
        defval: null,
      });
      sheets[name] = { data, ref: ws['!ref'] || 'A1' };
    }

    return { sheetNames: wb.SheetNames, sheets };
  } catch (e) {
    console.error(`[ExcelLink] Failed to parse ${filePath}:`, e);
    return null;
  }
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
            wb = XLSX.read(bytes, { type: 'array' });
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
