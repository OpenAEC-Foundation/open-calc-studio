import type { StateCreator } from 'zustand';
import type { SubSheet, SubSheetCell, CellBorder, CellBorders } from '@/types/costModel';
import { parseLocaleNumber, parseNlNumber } from '@/utils/formatting';
import { normalizeDecimalsInExpression } from '@/utils/numericInput';
import { colIndexFromLabel, colLabelFromIndex } from '@/services/spreadsheet/formulaRefs';

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
  /** Meerdere ingetypte waarden in één stap (MCP set_cells_batch), zelfde regels als setSubSheetCell. */
  setSubSheetCellValues: (sheetId: string, values: Record<string, string>) => void;
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
  // Hydration and navigation keep their original setter; user edits must trigger Save/close protection.
  const edit = (patch: Partial<SubSheetSlice> | ((state: SubSheetSlice) => Partial<SubSheetSlice>)) => {
    set(patch);
    const state = get() as unknown as { activeDocumentId?: string; updateDocument?: (id: string, patch: { isModified: boolean }) => void };
    if (state.activeDocumentId) state.updateDocument?.(state.activeDocumentId, { isModified: true });
  };

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
    edit((s) => ({
      subSheets: [...s.subSheets, sheet],
      activeSubSheetId: id,
    }));
    return id;
  },

  removeSubSheet: (id) => {
    snapshot(id);
    edit((s) => {
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
    edit((s) => ({
      subSheets: s.subSheets.map((ss) =>
        ss.id === id ? { ...ss, name } : ss
      ),
    }));
  },

  setActiveSubSheet: (id) => set({ activeSubSheetId: id }),

  setSubSheetCell: (sheetId, cellRef, value) => {
    get().setSubSheetCellValues(sheetId, { [cellRef]: value });
  },

  setSubSheetCellValues: (sheetId, values) => {
    snapshot(sheetId);
    edit((s) => ({
      subSheets: s.subSheets.map((ss) => {
        if (ss.id !== sheetId) return ss;
        const cells = { ...ss.cells };
        for (const [cellRef, value] of Object.entries(values)) {
          cells[cellRef] = withTypedValue(ss.cells[cellRef], value);
        }
        // Formulas are evaluated by recalcSheetCells, together with every
        // formula that depends on these cells (knownbugs #47).
        return { ...ss, cells: recalcSheetCells(cells) };
      }),
    }));
  },

  setSubSheetCells: (sheetId, cells) => {
    snapshot(sheetId);
    edit((s) => ({
      subSheets: s.subSheets.map((ss) =>
        ss.id === sheetId ? { ...ss, cells: recalcSheetCells(cells) } : ss
      ),
    }));
  },

  toggleSubSheetCellBold: (sheetId, cellRef) => {
    snapshot(sheetId);
    edit((s) => ({
      subSheets: s.subSheets.map((ss) => {
        if (ss.id !== sheetId) return ss;
        const cell = ss.cells[cellRef] || { value: '' };
        return { ...ss, cells: { ...ss.cells, [cellRef]: { ...cell, bold: !cell.bold } } };
      }),
    }));
  },

  toggleSubSheetCellItalic: (sheetId, cellRef) => {
    snapshot(sheetId);
    edit((s) => ({
      subSheets: s.subSheets.map((ss) => {
        if (ss.id !== sheetId) return ss;
        const cell = ss.cells[cellRef] || { value: '' };
        return { ...ss, cells: { ...ss.cells, [cellRef]: { ...cell, italic: !cell.italic } } };
      }),
    }));
  },

  setSubSheetCellAlign: (sheetId, cellRef, align) => {
    snapshot(sheetId);
    edit((s) => ({
      subSheets: s.subSheets.map((ss) => {
        if (ss.id !== sheetId) return ss;
        const cell = ss.cells[cellRef] || { value: '' };
        return { ...ss, cells: { ...ss.cells, [cellRef]: { ...cell, align } } };
      }),
    }));
  },

  setSubSheetCellFormat: (sheetId, cellRef, format) => {
    snapshot(sheetId);
    edit((s) => ({
      subSheets: s.subSheets.map((ss) => {
        if (ss.id !== sheetId) return ss;
        const cell = ss.cells[cellRef] || { value: '' };
        return { ...ss, cells: { ...ss.cells, [cellRef]: { ...cell, format: format as import('@/types/costModel').CellFormat } } };
      }),
    }));
  },

  setSubSheetCellDecimals: (sheetId, cellRef, decimals) => {
    snapshot(sheetId);
    edit((s) => ({
      subSheets: s.subSheets.map((ss) => {
        if (ss.id !== sheetId) return ss;
        const cell = ss.cells[cellRef] || { value: '' };
        return { ...ss, cells: { ...ss.cells, [cellRef]: { ...cell, decimals } } };
      }),
    }));
  },

  setSubSheetCellFontSize: (sheetId, cellRef, fontSize) => {
    snapshot(sheetId);
    edit((s) => ({
      subSheets: s.subSheets.map((ss) => {
        if (ss.id !== sheetId) return ss;
        const cell = ss.cells[cellRef] || { value: '' };
        return { ...ss, cells: { ...ss.cells, [cellRef]: { ...cell, fontSize } } };
      }),
    }));
  },

  setSubSheetRowColor: (sheetId, rowIndex, color) => {
    snapshot(sheetId);
    edit((s) => ({
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
    edit((s) => ({
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
    edit((s) => ({
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
    edit((s) => ({
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

/**
 * Een cel met een nieuw ingetypte waarde. Opmaak (vet, notatie, decimalen,
 * randen …) blijft staan, ook bij leegmaken (knownbug 49), zoals in Excel.
 */
function withTypedValue(prev: SubSheetCell | undefined, value: string): SubSheetCell {
  const cell: SubSheetCell = { ...prev, value };
  delete cell.computed;
  if (!value.startsWith('=')) {
    // Getalnotatie van de app (issue #65): "6,66" en "1.234,56" in
    // 1.234,56-notatie, "6.66" en "1,234.56" in 1,234.56-notatie; staan
    // beide tekens erin, dan is het laatste het decimaalteken.
    // Ongewijzigde invoer houdt zijn waarde, ook na een wissel van de
    // notatie ("1,250" blijft 1250 als je de cel opent en weer sluit).
    const n = prev && prev.value === value && prev.computed !== undefined
      ? prev.computed
      : parseLocaleNumber(value);
    if (n !== null) cell.computed = n;
  }
  return cell;
}

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
  return ref.toUpperCase().trim().replace(/\$/g, '');
}

/**
 * Wat een formule uit een cel leest: een getal, tekst, of een fout (een
 * formule zonder uitkomst, of een cel in een kringverwijzing). Een lege cel
 * is 0, zoals in Excel.
 */
type CellRead = number | 'text' | 'error';
type CellReader = (ref: string) => CellRead;

function isFormula(cell: SubSheetCell | undefined): cell is SubSheetCell {
  return typeof cell?.value === 'string' && cell.value.startsWith('=');
}

function readCell(cells: Record<string, SubSheetCell>, key: string): CellRead {
  const cell = cells[key];
  if (!cell) return 0;
  if (cell.computed !== undefined) return cell.computed;
  const value = String(cell.value ?? '');
  if (value.startsWith('=')) return 'error';
  if (value.trim() === '') return 0;
  // Cel zonder berekende waarde (geïmporteerd/met de hand bewerkt bestand):
  // vast NL lezen, zodat opgeslagen bladen niet van betekenis veranderen.
  const n = parseNlNumber(value);
  return n === null ? 'text' : n;
}

/**
 * Re-evaluate every formula cell of a sheet, so a change to one cell reaches
 * all formulas that depend on it, directly or through other formulas.
 * De volgorde wordt iteratief bepaald (diepte-eerst zonder recursie), zodat
 * ook een lopend totaal over duizenden rijen geen stack overflow geeft
 * (knownbug 268). Cellen in een kringverwijzing krijgen geen uitkomst, en
 * elke formule die zo'n cel (of een andere fout) leest ook niet.
 */
export function recalcSheetCells(
  cells: Record<string, SubSheetCell>,
): Record<string, SubSheetCell> {
  const result: Record<string, SubSheetCell> = { ...cells };
  const formulaKeys = Object.keys(result).filter((k) => isFormula(result[k]));

  // Afhankelijkheden: de formulecellen die een formule leest, via een droge run.
  const deps = new Map<string, string[]>();
  for (const key of formulaKeys) {
    const refs = new Set<string>();
    evaluateFormula(result[key].value.slice(1), (ref) => {
      const k = cellRefToKey(ref);
      if (isFormula(result[k])) refs.add(k);
      return 0;
    });
    deps.set(key, [...refs]);
  }

  // Diepte-eerst met een eigen stapel; post-order = rekenvolgorde.
  const state = new Map<string, 'open' | 'done'>();
  const cyclic = new Set<string>();
  const order: string[] = [];
  for (const start of formulaKeys) {
    if (state.has(start)) continue;
    const path: string[] = [start];
    const next: number[] = [0];
    state.set(start, 'open');
    while (path.length > 0) {
      const top = path.length - 1;
      const key = path[top];
      const keyDeps = deps.get(key)!;
      if (next[top] < keyDeps.length) {
        const dep = keyDeps[next[top]++];
        const st = state.get(dep);
        if (st === 'open') {
          // Kringverwijzing: elke cel op de lus is ongeldig.
          for (const k of path.slice(path.indexOf(dep))) cyclic.add(k);
        } else if (st === undefined) {
          state.set(dep, 'open');
          path.push(dep);
          next.push(0);
        }
      } else {
        state.set(key, 'done');
        order.push(key);
        path.pop();
        next.pop();
      }
    }
  }

  const read: CellReader = (ref) => {
    const key = cellRefToKey(ref);
    return cyclic.has(key) ? 'error' : readCell(result, key);
  };
  for (const key of order) {
    const cell = result[key];
    const computed = cyclic.has(key) ? null : evaluateFormula(cell.value.slice(1), read);
    const updated: SubSheetCell = { ...cell };
    if (computed !== null) updated.computed = computed;
    else delete updated.computed;
    result[key] = updated;
  }
  return result;
}

// Celverwijzing met optionele `$` (absoluut), niet midden in een woord of getal.
const REF = String.raw`\$?[A-Z]+\$?\d+`;
const SUM_RE = new RegExp(String.raw`\bSUM\((${REF}):(${REF})\)`, 'gi');
const REF_RE = new RegExp(String.raw`(?<![A-Z0-9_$])(${REF})(?![A-Z0-9_])`, 'gi');
// Plaatshouder voor een ingevulde waarde: geen cijfer, punt of komma, dus
// normalizeDecimalsInExpression laat hem staan.
const SLOT = String.fromCharCode(0xe000);
const ALLOWED_RE = new RegExp(`^[\\d\\s+\\-*/().${SLOT}]+$`);
const SLOT_RE = new RegExp(SLOT, 'g');

/**
 * Evaluate a simple formula. Supports:
 * - Cell references: A1, AA12, $A$1 (de `$` verandert niets aan de waarde)
 * - Basic math: +, -, *, /
 * - SUM(A1:A10), ook omgekeerd (A10:A1) en over meerdere kolommen
 * - Parentheses
 * Verwijzingen gaan als getal mee, niet als ingevulde tekst: een negatieve
 * waarde (`10-A1` met A1=-5, knownbug 48) of een heel kleine (1e-7,
 * knownbug 54) breekt de formule dan niet. Tekst of een fout in een verwezen
 * cel maakt de formule ongeldig (knownbug 53); SUM slaat tekst over, zoals
 * Excel, maar geeft een fout door.
 */
function evaluateFormula(
  expr: string,
  read: CellReader,
): number | null {
  try {
    if (expr.includes(SLOT)) return null;
    const values: number[] = [];
    let failed = false;
    const slot = (v: CellRead) => {
      if (typeof v === 'number') values.push(v);
      else failed = true;
      return SLOT;
    };

    let processed = expr.trim();

    // NL-functienaam (LibreOffice/Excel NL plakt "=SOM(...)")
    processed = processed.replace(/\bSOM\(/gi, 'SUM(');

    // Handle SUM(range)
    processed = processed.replace(SUM_RE, (_match, start: string, end: string) =>
      slot(sumRange(start, end, read)),
    );

    // Replace cell references with a slot for their value
    processed = processed.replace(REF_RE, (_match, ref: string) => slot(read(ref)));
    if (failed) return null;

    // Komma-decimalen en duizendtal-punten naar punt-notatie
    // ("=B2*1,05" en "=1.234,56*2" uit NL-spreadsheets)
    processed = normalizeDecimalsInExpression(processed);

    // Evaluate the math expression safely (only allow numbers, operators and slots)
    if (!ALLOWED_RE.test(processed)) return null;
    // `--A1` is in Excel twee keer min (= A1), in JS een decrement. Zet
    // daarom een spatie tussen opeenvolgende + en -, en geef een slot door als
    // `(+v[i])`, waar ++/-- niet op kunnen: `=--A1` geeft A1, `=A1++` een fout.
    let i = 0;
    const body = processed
      .replace(/([+-])(?=[+-])/g, '$1 ')
      .replace(SLOT_RE, () => `(+v[${i++}])`);
    const result = Function('v', `"use strict"; return (${body})`)(values);
    return typeof result === 'number' && isFinite(result) ? result : null;
  } catch {
    return null;
  }
}

function sumRange(
  start: string,
  end: string,
  read: CellReader,
): CellRead {
  const a = parseRef(cellRefToKey(start));
  const b = parseRef(cellRefToKey(end));
  const colFrom = Math.min(colIndexFromLabel(a.col), colIndexFromLabel(b.col));
  const colTo = Math.max(colIndexFromLabel(a.col), colIndexFromLabel(b.col));
  const rowFrom = Math.min(a.row, b.row);
  const rowTo = Math.max(a.row, b.row);

  let sum = 0;
  for (let c = colFrom; c <= colTo; c++) {
    const col = colLabelFromIndex(c);
    for (let r = rowFrom; r <= rowTo; r++) {
      const v = read(`${col}${r}`);
      if (v === 'error') return 'error';
      if (typeof v === 'number') sum += v;
    }
  }
  return sum;
}
