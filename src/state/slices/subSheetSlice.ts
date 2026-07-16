import type { StateCreator } from 'zustand';
import type { SubSheet, SubSheetCell, CellBorder, CellBorders } from '@/types/costModel';
import { parseNlNumber } from '@/utils/formatting';
import { normalizeDecimalsInExpression } from '@/utils/numericInput';

export type BorderPreset = 'none' | 'all' | 'outer' | 'thick-outer' | 'inner' | 'top' | 'bottom';

export interface SubSheetSlice {
  subSheets: SubSheet[];
  activeSubSheetId: string | null;

  setSubSheets: (sheets: SubSheet[]) => void;
  addSubSheet: (name?: string) => string;
  removeSubSheet: (id: string) => void;
  renameSubSheet: (id: string, name: string) => void;
  setActiveSubSheet: (id: string | null) => void;
  setSubSheetCell: (sheetId: string, cellRef: string, value: string) => void;
  setSubSheetCells: (sheetId: string, cells: Record<string, SubSheetCell>) => void;
  toggleSubSheetCellBold: (sheetId: string, cellRef: string) => void;
  toggleSubSheetCellItalic: (sheetId: string, cellRef: string) => void;
  setSubSheetCellAlign: (sheetId: string, cellRef: string, align: 'left' | 'center' | 'right') => void;
  setSubSheetCellFormat: (sheetId: string, cellRef: string, format: string) => void;
  setSubSheetCellDecimals: (sheetId: string, cellRef: string, decimals: number) => void;
  setSubSheetCellFontSize: (sheetId: string, cellRef: string, fontSize: number) => void;
  setSubSheetRowColor: (sheetId: string, rowIndex: number, color: string | null) => void;
  setSubSheetColumnWidth: (sheetId: string, col: string, width: number) => void;
  setSubSheetZoomLevel: (sheetId: string, zoom: number) => void;
  setSubSheetCellBorders: (sheetId: string, cellRef: string, borders: CellBorders | undefined) => void;
  setSubSheetSelectionBorders: (sheetId: string, cellRefs: string[], preset: BorderPreset) => void;
  getSubSheet: (id: string) => SubSheet | undefined;
}

export const createSubSheetSlice: StateCreator<SubSheetSlice> = (set, get) => {
  // Helper to push a snapshot of the current sheet state before mutation.
  // Uses `get() as any` to access the spreadsheetHistorySlice action since
  // slices are composed in appStore.ts.
  const snapshot = (sheetId: string) => {
    const existing = get().subSheets.find((ss) => ss.id === sheetId);
    if (existing) {
      const push = (get() as any).pushSpreadsheetSnapshot as
        | ((s: SubSheet) => void)
        | undefined;
      if (push) push(existing);
    }
  };

  return {
  subSheets: [],
  activeSubSheetId: null,

  setSubSheets: (sheets) => set({ subSheets: sheets, activeSubSheetId: null }),

  addSubSheet: (name) => {
    const id = crypto.randomUUID();
    const sheetName = name || `Blad ${get().subSheets.length + 1}`;
    const sheet: SubSheet = {
      id,
      name: sheetName,
      columns: 10,
      rows: 50,
      cells: {},
    };
    set((s) => ({
      subSheets: [...s.subSheets, sheet],
      activeSubSheetId: id,
    }));
    return id;
  },

  removeSubSheet: (id) => {
    snapshot(id);
    set((s) => {
      const filtered = s.subSheets.filter((ss) => ss.id !== id);
      return {
        subSheets: filtered,
        activeSubSheetId: s.activeSubSheetId === id
          ? null
          : s.activeSubSheetId,
      };
    });
  },

  renameSubSheet: (id, name) => {
    snapshot(id);
    set((s) => ({
      subSheets: s.subSheets.map((ss) =>
        ss.id === id ? { ...ss, name } : ss
      ),
    }));
  },

  setActiveSubSheet: (id) => set({ activeSubSheetId: id }),

  setSubSheetCell: (sheetId, cellRef, value) => {
    snapshot(sheetId);
    set((s) => ({
      subSheets: s.subSheets.map((ss) => {
        if (ss.id !== sheetId) return ss;
        const cell: SubSheetCell = { value };
        // Try to evaluate if it's a formula or number
        if (value.startsWith('=')) {
          const computed = evaluateFormula(value.slice(1), ss.cells);
          if (computed !== null) cell.computed = computed;
        } else {
          // NL-notatie: "6,66" moet 6,66 zijn, niet 6 (parseFloat stopt bij de komma)
          const n = parseNlNumber(value);
          if (n !== null) cell.computed = n;
        }
        return {
          ...ss,
          cells: { ...ss.cells, [cellRef]: cell },
        };
      }),
    }));
  },

  setSubSheetCells: (sheetId, cells) => {
    snapshot(sheetId);
    set((s) => ({
      subSheets: s.subSheets.map((ss) =>
        ss.id === sheetId ? { ...ss, cells } : ss
      ),
    }));
  },

  toggleSubSheetCellBold: (sheetId, cellRef) => {
    snapshot(sheetId);
    set((s) => ({
      subSheets: s.subSheets.map((ss) => {
        if (ss.id !== sheetId) return ss;
        const cell = ss.cells[cellRef] || { value: '' };
        return { ...ss, cells: { ...ss.cells, [cellRef]: { ...cell, bold: !cell.bold } } };
      }),
    }));
  },

  toggleSubSheetCellItalic: (sheetId, cellRef) => {
    snapshot(sheetId);
    set((s) => ({
      subSheets: s.subSheets.map((ss) => {
        if (ss.id !== sheetId) return ss;
        const cell = ss.cells[cellRef] || { value: '' };
        return { ...ss, cells: { ...ss.cells, [cellRef]: { ...cell, italic: !cell.italic } } };
      }),
    }));
  },

  setSubSheetCellAlign: (sheetId, cellRef, align) => {
    snapshot(sheetId);
    set((s) => ({
      subSheets: s.subSheets.map((ss) => {
        if (ss.id !== sheetId) return ss;
        const cell = ss.cells[cellRef] || { value: '' };
        return { ...ss, cells: { ...ss.cells, [cellRef]: { ...cell, align } } };
      }),
    }));
  },

  setSubSheetCellFormat: (sheetId, cellRef, format) => {
    snapshot(sheetId);
    set((s) => ({
      subSheets: s.subSheets.map((ss) => {
        if (ss.id !== sheetId) return ss;
        const cell = ss.cells[cellRef] || { value: '' };
        return { ...ss, cells: { ...ss.cells, [cellRef]: { ...cell, format: format as import('@/types/costModel').CellFormat } } };
      }),
    }));
  },

  setSubSheetCellDecimals: (sheetId, cellRef, decimals) => {
    snapshot(sheetId);
    set((s) => ({
      subSheets: s.subSheets.map((ss) => {
        if (ss.id !== sheetId) return ss;
        const cell = ss.cells[cellRef] || { value: '' };
        return { ...ss, cells: { ...ss.cells, [cellRef]: { ...cell, decimals } } };
      }),
    }));
  },

  setSubSheetCellFontSize: (sheetId, cellRef, fontSize) => {
    snapshot(sheetId);
    set((s) => ({
      subSheets: s.subSheets.map((ss) => {
        if (ss.id !== sheetId) return ss;
        const cell = ss.cells[cellRef] || { value: '' };
        return { ...ss, cells: { ...ss.cells, [cellRef]: { ...cell, fontSize } } };
      }),
    }));
  },

  setSubSheetRowColor: (sheetId, rowIndex, color) => {
    snapshot(sheetId);
    set((s) => ({
      subSheets: s.subSheets.map((ss) => {
        if (ss.id !== sheetId) return ss;
        const rowColors = { ...(ss.rowColors ?? {}) };
        if (color === null) delete rowColors[rowIndex];
        else rowColors[rowIndex] = color;
        return { ...ss, rowColors };
      }),
    }));
  },

  setSubSheetColumnWidth: (sheetId, col, width) => {
    snapshot(sheetId);
    set((s) => ({
      subSheets: s.subSheets.map((ss) =>
        ss.id === sheetId
          ? { ...ss, columnWidths: { ...(ss.columnWidths ?? {}), [col]: Math.max(40, width) } }
          : ss,
      ),
    }));
  },

  setSubSheetZoomLevel: (sheetId, zoom) =>
    set((s) => ({
      subSheets: s.subSheets.map((ss) =>
        ss.id === sheetId ? { ...ss, zoomLevel: Math.max(0.5, Math.min(2.0, zoom)) } : ss,
      ),
    })),

  setSubSheetCellBorders: (sheetId, cellRef, borders) => {
    snapshot(sheetId);
    set((s) => ({
      subSheets: s.subSheets.map((ss) => {
        if (ss.id !== sheetId) return ss;
        const cell = ss.cells[cellRef] ?? { value: '' };
        return { ...ss, cells: { ...ss.cells, [cellRef]: { ...cell, borders } } };
      }),
    }));
  },

  setSubSheetSelectionBorders: (sheetId, cellRefs, preset) => {
    if (cellRefs.length === 0) return;
    snapshot(sheetId);
    const map = applyPreset(cellRefs, preset);
    set((s) => ({
      subSheets: s.subSheets.map((ss) => {
        if (ss.id !== sheetId) return ss;
        const newCells = { ...ss.cells };
        for (const [ref, newBorders] of Object.entries(map)) {
          const existing = newCells[ref] ?? { value: '' };
          const merged: CellBorders = { ...(existing.borders ?? {}), ...newBorders };
          // Clean up 'none' style entries for clarity
          const cleaned: CellBorders = {};
          if (merged.top && merged.top.style !== 'none') cleaned.top = merged.top;
          if (merged.right && merged.right.style !== 'none') cleaned.right = merged.right;
          if (merged.bottom && merged.bottom.style !== 'none') cleaned.bottom = merged.bottom;
          if (merged.left && merged.left.style !== 'none') cleaned.left = merged.left;
          const hasAny = cleaned.top || cleaned.right || cleaned.bottom || cleaned.left;
          newCells[ref] = { ...existing, borders: hasAny ? cleaned : undefined };
        }
        return { ...ss, cells: newCells };
      }),
    }));
  },

  getSubSheet: (id) => get().subSheets.find((ss) => ss.id === id),
  };
};

// ── Border preset helpers ──

function parseRef(ref: string): { col: string; row: number } {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  return { col: m?.[1] ?? '', row: parseInt(m?.[2] ?? '0', 10) };
}

function colIndex(col: string): number {
  let n = 0;
  for (const c of col) n = n * 26 + (c.charCodeAt(0) - 64);
  return n;
}

function applyPreset(refs: string[], preset: BorderPreset): Record<string, CellBorders> {
  const parsed = refs.map((ref) => {
    const { col, row } = parseRef(ref);
    return { ref, col, row, colIdx: colIndex(col) };
  });
  const minCol = Math.min(...parsed.map((p) => p.colIdx));
  const maxCol = Math.max(...parsed.map((p) => p.colIdx));
  const minRow = Math.min(...parsed.map((p) => p.row));
  const maxRow = Math.max(...parsed.map((p) => p.row));
  const black: CellBorder = { style: 'solid', width: 1, color: '#000000' };
  const thick: CellBorder = { style: 'solid', width: 2, color: '#000000' };
  const noneBorder: CellBorder = { style: 'none', width: 1, color: '#000000' };

  const result: Record<string, CellBorders> = {};
  for (const { ref, row, colIdx } of parsed) {
    const b: CellBorders = {};
    if (preset === 'all') {
      b.top = b.right = b.bottom = b.left = black;
    } else if (preset === 'none') {
      b.top = b.right = b.bottom = b.left = noneBorder;
    } else if (preset === 'outer' || preset === 'thick-outer') {
      const edge = preset === 'thick-outer' ? thick : black;
      if (row === minRow) b.top = edge;
      if (row === maxRow) b.bottom = edge;
      if (colIdx === minCol) b.left = edge;
      if (colIdx === maxCol) b.right = edge;
    } else if (preset === 'inner') {
      if (row !== minRow) b.top = black;
      if (row !== maxRow) b.bottom = black;
      if (colIdx !== minCol) b.left = black;
      if (colIdx !== maxCol) b.right = black;
    } else if (preset === 'top') {
      b.top = black;
    } else if (preset === 'bottom') {
      b.bottom = black;
    }
    result[ref] = b;
  }
  return result;
}

// ── Simple formula evaluator ──

function cellRefToKey(ref: string): string {
  return ref.toUpperCase().trim();
}

function getCellValue(cells: Record<string, SubSheetCell>, ref: string): number {
  const key = cellRefToKey(ref);
  const cell = cells[key];
  if (!cell) return 0;
  if (cell.computed !== undefined) return cell.computed;
  const n = parseNlNumber(cell.value);
  return n === null ? 0 : n;
}

/**
 * Evaluate a simple formula. Supports:
 * - Cell references: A1, B2, etc.
 * - Basic math: +, -, *, /
 * - SUM(A1:A10)
 * - Parentheses
 */
function evaluateFormula(
  expr: string,
  cells: Record<string, SubSheetCell>,
): number | null {
  try {
    let processed = expr.trim();

    // NL-functienaam (LibreOffice/Excel NL plakt "=SOM(...)")
    processed = processed.replace(/\bSOM\(/gi, 'SUM(');

    // Handle SUM(range)
    processed = processed.replace(
      /SUM\(([A-Z]+\d+):([A-Z]+\d+)\)/gi,
      (_match, start, end) => {
        return String(sumRange(start, end, cells));
      },
    );

    // Replace cell references with their values
    processed = processed.replace(
      /\b([A-Z]+)(\d+)\b/gi,
      (_match, col, row) => {
        return String(getCellValue(cells, `${col.toUpperCase()}${row}`));
      },
    );

    // Komma-decimalen en duizendtal-punten naar punt-notatie
    // ("=B2*1,05" en "=1.234,56*2" uit NL-spreadsheets)
    processed = normalizeDecimalsInExpression(processed);

    // Evaluate the math expression safely (only allow numbers and operators)
    if (!/^[\d\s+\-*/().]+$/.test(processed)) return null;
    const result = Function(`"use strict"; return (${processed})`)();
    return typeof result === 'number' && isFinite(result) ? result : null;
  } catch {
    return null;
  }
}

function sumRange(
  start: string,
  end: string,
  cells: Record<string, SubSheetCell>,
): number {
  const startCol = start.replace(/\d/g, '').toUpperCase();
  const startRow = parseInt(start.replace(/[A-Z]/gi, ''));
  const endCol = end.replace(/\d/g, '').toUpperCase();
  const endRow = parseInt(end.replace(/[A-Z]/gi, ''));

  let sum = 0;
  const colStart = startCol.charCodeAt(0);
  const colEnd = endCol.charCodeAt(0);

  for (let c = colStart; c <= colEnd; c++) {
    for (let r = startRow; r <= endRow; r++) {
      const ref = `${String.fromCharCode(c)}${r}`;
      sum += getCellValue(cells, ref);
    }
  }
  return sum;
}
