import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/state/appStore';
import { SubSheetRowContextMenu } from './SubSheetRowContextMenu';
import { SubSheetBorderPicker } from './SubSheetBorderPicker';
import { shiftFormulaRefs } from '@/services/spreadsheet/formulaRefs';
import type { CellBorder } from '@/types/costModel';

const COL_WIDTH = 90;
const ROW_HEIGHT = 24;
const ROW_HEADER_WIDTH = 40;

function colLabel(index: number): string {
  let label = '';
  let n = index;
  while (n >= 0) {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  }
  return label;
}

export function SubSheetEditor({ sheetId }: { sheetId: string }) {
  const { t } = useTranslation();
  const sheet = useAppStore((s) => s.subSheets.find((ss) => ss.id === sheetId));
  const setCell = useAppStore((s) => s.setSubSheetCell);
  const toggleBold = useAppStore((s) => s.toggleSubSheetCellBold);
  const toggleItalic = useAppStore((s) => s.toggleSubSheetCellItalic);
  const setCellAlign = useAppStore((s) => s.setSubSheetCellAlign);
  const setCellFormat = useAppStore((s) => s.setSubSheetCellFormat);
  const setCellDecimals = useAppStore((s) => s.setSubSheetCellDecimals);
  const setCellFontSize = useAppStore((s) => s.setSubSheetCellFontSize);
  const setZoom = useAppStore((s) => s.setSubSheetZoomLevel);
  const zoom = sheet?.zoomLevel ?? 1.0;

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!e.ctrlKey) return;
    if (!sheet) return;
    e.preventDefault();
    const step = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom(sheet.id, zoom + step);
  }, [sheet, zoom, setZoom]);

  const [activeCell, setActiveCell] = useState<string | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<string | null>(null); // for range selection
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse cell ref to col/row indices
  const parseRef = (ref: string) => {
    const col = ref.replace(/\d/g, '');
    const row = parseInt(ref.replace(/[A-Z]/gi, ''));
    return { col, row, colIdx: col.charCodeAt(0) - 65 };
  };

  const [isDragging, setIsDragging] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [rowMenu, setRowMenu] = useState<{ row: number; x: number; y: number } | null>(null);
  const [borderPicker, setBorderPicker] = useState<{ x: number; y: number; refs: string[] } | null>(null);

  // Get all cell refs in the current selection range — MUST be before doCopy/doPaste/doCut
  const getSelectedCellRefs = useCallback((): string[] => {
    if (!activeCell) return [];
    if (!selectionEnd) return [activeCell];
    const a = parseRef(activeCell);
    const b = parseRef(selectionEnd);
    const minCol = Math.min(a.colIdx, b.colIdx);
    const maxCol = Math.max(a.colIdx, b.colIdx);
    const minRow = Math.min(a.row, b.row);
    const maxRow = Math.max(a.row, b.row);
    const refs: string[] = [];
    for (let c = minCol; c <= maxCol; c++) {
      for (let r = minRow; r <= maxRow; r++) {
        refs.push(`${colLabel(c)}${r}`);
      }
    }
    return refs;
  }, [activeCell, selectionEnd]);

  // Interne kopieerbuffer: het klembord krijgt de zichtbare wáárden (zodat
  // plakken in Excel/LibreOffice waarden geeft), maar binnen OCS plakken we
  // de onderliggende formules — met relatief meegeschoven celverwijzingen,
  // net als in Excel/LibreOffice. Herkenning via de klembord-vingerafdruk.
  const lastCopyRef = useRef<{ clipText: string; anchor: { colIdx: number; row: number }; raw: string[][] } | null>(null);

  const doCopy = useCallback(() => {
    if (!sheet || !activeCell) return;
    const refs = getSelectedCellRefs();
    if (refs.length === 0) return;
    const parsed = refs.map(r => parseRef(r));
    const minCol = Math.min(...parsed.map(p => p.colIdx));
    const maxCol = Math.max(...parsed.map(p => p.colIdx));
    const minRow = Math.min(...parsed.map(p => p.row));
    const maxRow = Math.max(...parsed.map(p => p.row));
    const rows: string[] = [];
    const raw: string[][] = [];
    for (let r = minRow; r <= maxRow; r++) {
      const cols: string[] = [];
      const rawCols: string[] = [];
      for (let c = minCol; c <= maxCol; c++) {
        const ref = `${colLabel(c)}${r}`;
        const cell = sheet.cells[ref];
        cols.push(cell?.computed !== undefined ? String(cell.computed) : (cell?.value || ''));
        rawCols.push(cell?.value || '');
      }
      rows.push(cols.join('\t'));
      raw.push(rawCols);
    }
    const clipText = rows.join('\n');
    lastCopyRef.current = { clipText, anchor: { colIdx: minCol, row: minRow }, raw };
    navigator.clipboard.writeText(clipText);
  }, [sheet, activeCell, getSelectedCellRefs]);

  const doPaste = useCallback(() => {
    if (!activeCell) return;
    navigator.clipboard.readText().then(text => {
      if (!text) return;
      const start = parseRef(activeCell);

      // Interne plak: klembord matcht onze laatste kopie → formules plakken
      // met relatief verschoven verwijzingen (Excel-gedrag).
      const internal = lastCopyRef.current;
      if (internal && internal.clipText === text.replace(/\r/g, '').replace(/\n$/, '')) {
        const dCol = start.colIdx - internal.anchor.colIdx;
        const dRow = start.row - internal.anchor.row;
        for (let r = 0; r < internal.raw.length; r++) {
          for (let c = 0; c < internal.raw[r].length; c++) {
            const ref = `${colLabel(start.colIdx + c)}${start.row + r}`;
            const rawVal = internal.raw[r][c];
            if (rawVal) setCell(sheetId, ref, shiftFormulaRefs(rawVal, dCol, dRow));
          }
        }
        return;
      }

      // Externe plak (bv. LibreOffice/Excel): blok relatief vanaf de
      // plakpositie neerzetten; formule-teksten blijven ongewijzigd.
      const lines = text.replace(/\r/g, '').split('\n');
      for (let r = 0; r < lines.length; r++) {
        const cols = lines[r].split('\t');
        for (let c = 0; c < cols.length; c++) {
          const ref = `${colLabel(start.colIdx + c)}${start.row + r}`;
          const val = cols[c].trim();
          if (val) setCell(sheetId, ref, val);
        }
      }
    });
  }, [activeCell, sheetId, setCell]);

  const doCut = useCallback(() => {
    doCopy();
    for (const ref of getSelectedCellRefs()) {
      setCell(sheetId, ref, '');
    }
  }, [doCopy, getSelectedCellRefs, sheetId, setCell]);

  // Colors for formula cell references (like LibreOffice Calc)
  const REF_COLORS = ['#e74c3c', '#2980b9', '#27ae60', '#8e44ad', '#e67e22', '#1abc9c'];

  // Extract cell refs from current formula being edited
  const formulaRefs: string[] = (() => {
    if (!editing || !editValue.startsWith('=')) return [];
    const matches = editValue.slice(1).match(/\b([A-Z]+\d+)\b/gi);
    return matches ? matches.map(m => m.toUpperCase()) : [];
  })();

  // Get the highlight color for a cell if it's referenced in the formula
  const getRefColor = (cellRef: string): string | null => {
    const idx = formulaRefs.indexOf(cellRef.toUpperCase());
    return idx >= 0 ? REF_COLORS[idx % REF_COLORS.length] : null;
  };

  // Check if a cell is within the current selection range
  const isCellSelected = (cellRef: string) => {
    if (!activeCell) return false;
    if (!selectionEnd) return cellRef === activeCell;
    const a = parseRef(activeCell);
    const b = parseRef(selectionEnd);
    const c = parseRef(cellRef);
    const minCol = Math.min(a.colIdx, b.colIdx);
    const maxCol = Math.max(a.colIdx, b.colIdx);
    const minRow = Math.min(a.row, b.row);
    const maxRow = Math.max(a.row, b.row);
    return c.colIdx >= minCol && c.colIdx <= maxCol && c.row >= minRow && c.row <= maxRow;
  };

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editing]);

  // Spreadsheet-scoped undo/redo (Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z).
  // Uses capture phase + stopPropagation so the cost-grid's window-level
  // bubble-phase undo handler does not also fire when focus is in the sheet.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      if (!active?.closest('.subsheet-container')) return;

      if (e.ctrlKey && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        e.stopPropagation();
        useAppStore.getState().undoSpreadsheet();
      } else if (
        (e.ctrlKey && (e.key === 'y' || e.key === 'Y')) ||
        (e.ctrlKey && e.shiftKey && (e.key === 'z' || e.key === 'Z'))
      ) {
        e.preventDefault();
        e.stopPropagation();
        useAppStore.getState().redoSpreadsheet();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  // Listen for ribbon formatting actions
  useEffect(() => {
    const handler = (e: Event) => {
      const action = (e as CustomEvent).detail as string;
      const refs = getSelectedCellRefs();
      if (refs.length === 0) return;
      for (const ref of refs) {
        if (action === 'bold') toggleBold(sheetId, ref);
        else if (action === 'italic') toggleItalic(sheetId, ref);
        else if (action === 'align-left') setCellAlign(sheetId, ref, 'left');
        else if (action === 'align-center') setCellAlign(sheetId, ref, 'center');
        else if (action === 'align-right') setCellAlign(sheetId, ref, 'right');
        else if (action.startsWith('format-')) setCellFormat(sheetId, ref, action.replace('format-', ''));
        else if (action === 'decimals-up') {
          const cell = sheet?.cells[ref];
          setCellDecimals(sheetId, ref, (cell?.decimals ?? 2) + 1);
        } else if (action === 'decimals-down') {
          const cell = sheet?.cells[ref];
          setCellDecimals(sheetId, ref, Math.max(0, (cell?.decimals ?? 2) - 1));
        } else if (action.startsWith('fontsize-')) {
          setCellFontSize(sheetId, ref, parseInt(action.replace('fontsize-', '')));
        }
      }
    };
    document.addEventListener('spreadsheet-action', handler);
    return () => document.removeEventListener('spreadsheet-action', handler);
  }, [sheetId, sheet, getSelectedCellRefs, toggleBold, toggleItalic, setCellAlign, setCellFormat, setCellDecimals, setCellFontSize]);

  const commitEdit = useCallback((cellRef: string) => {
    setCell(sheetId, cellRef, editValue);
    setEditing(false);
  }, [sheetId, editValue, setCell]);

  const handleCellClick = useCallback((cellRef: string, shiftKey: boolean) => {
    if (shiftKey && activeCell) {
      setSelectionEnd(cellRef);
      // Keep focus on container so Ctrl+C/V/X/Delete work on the selection
      requestAnimationFrame(() => containerRef.current?.focus());
      return;
    }
    // Formula mode: if editing a formula and clicking another cell, insert cell ref
    if (editing && activeCell && cellRef !== activeCell && editValue.startsWith('=')) {
      // Check if last char is an operator or opening paren — append ref
      const lastChar = editValue.slice(-1);
      if ('=+-*/('.includes(lastChar) || editValue === '=') {
        setEditValue(editValue + cellRef);
      } else {
        // Replace last token if it looks incomplete, or just append
        setEditValue(editValue + '+' + cellRef);
      }
      return;
    }
    if (activeCell === cellRef && !editing) {
      const cell = sheet?.cells[cellRef];
      setEditValue(cell?.value || '');
      setEditing(true);
    } else {
      if (editing && activeCell) {
        commitEdit(activeCell);
      }
      setActiveCell(cellRef);
      setSelectionEnd(null);
      setEditing(false);
      // Focus container so keyboard shortcuts (Ctrl+C/V/X, Delete) work
      requestAnimationFrame(() => containerRef.current?.focus());
    }
  }, [activeCell, editing, editValue, sheet, commitEdit]);

  const handleCellDoubleClick = useCallback((cellRef: string) => {
    setActiveCell(cellRef);
    const cell = sheet?.cells[cellRef];
    setEditValue(cell?.value || '');
    setEditing(true);
  }, [sheet]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!activeCell) return;

    // Ctrl+B: toggle bold on all selected cells
    if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
      e.preventDefault();
      for (const ref of getSelectedCellRefs()) {
        toggleBold(sheetId, ref);
      }
      return;
    }

    // Ctrl+I: toggle italic on all selected cells
    if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
      e.preventDefault();
      for (const ref of getSelectedCellRefs()) toggleItalic(sheetId, ref);
      return;
    }
    // Ctrl+C: copy
    if ((e.ctrlKey || e.metaKey) && e.key === 'c') { e.preventDefault(); doCopy(); return; }
    // Ctrl+V: paste
    if ((e.ctrlKey || e.metaKey) && e.key === 'v') { e.preventDefault(); doPaste(); return; }
    // Ctrl+X: cut
    if ((e.ctrlKey || e.metaKey) && e.key === 'x') { e.preventDefault(); doCut(); return; }

    if (editing) {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitEdit(activeCell);
        // Move down
        const col = activeCell.replace(/\d/g, '');
        const row = parseInt(activeCell.replace(/[A-Z]/gi, ''));
        setActiveCell(`${col}${row + 1}`);
        setSelectionEnd(null);
        // Restore focus to container so next keystroke starts edit in new cell
        requestAnimationFrame(() => {
          containerRef.current?.focus();
        });
      } else if (e.key === 'Escape') {
        setEditing(false);
        requestAnimationFrame(() => {
          containerRef.current?.focus();
        });
      } else if (e.key === 'Tab') {
        e.preventDefault();
        commitEdit(activeCell);
        const col = activeCell.replace(/\d/g, '');
        const row = parseInt(activeCell.replace(/[A-Z]/gi, ''));
        const colIdx = col.charCodeAt(0) - 65;
        setActiveCell(`${colLabel(colIdx + (e.shiftKey ? -1 : 1))}${row}`);
        setSelectionEnd(null);
        requestAnimationFrame(() => {
          containerRef.current?.focus();
        });
      }
      return;
    }

    // Not editing — navigate or start editing
    const col = activeCell.replace(/\d/g, '');
    const row = parseInt(activeCell.replace(/[A-Z]/gi, ''));
    const colIdx = col.charCodeAt(0) - 65;

    switch (e.key) {
      case 'ArrowUp':
        if (e.shiftKey) {
          const end = selectionEnd ? parseRef(selectionEnd) : { col, row, colIdx };
          setSelectionEnd(`${end.col}${Math.max(1, end.row - 1)}`);
        } else {
          if (row > 1) { setActiveCell(`${col}${row - 1}`); setSelectionEnd(null); }
        }
        break;
      case 'ArrowDown':
        if (e.shiftKey) {
          const end = selectionEnd ? parseRef(selectionEnd) : { col, row, colIdx };
          setSelectionEnd(`${end.col}${end.row + 1}`);
        } else {
          setActiveCell(`${col}${row + 1}`); setSelectionEnd(null);
        }
        break;
      case 'Enter':
        setActiveCell(`${col}${row + 1}`); setSelectionEnd(null);
        break;
      case 'ArrowLeft':
        if (e.shiftKey) {
          const end = selectionEnd ? parseRef(selectionEnd) : { col, row, colIdx };
          if (end.colIdx > 0) setSelectionEnd(`${colLabel(end.colIdx - 1)}${end.row}`);
        } else {
          if (colIdx > 0) { setActiveCell(`${colLabel(colIdx - 1)}${row}`); setSelectionEnd(null); }
        }
        break;
      case 'ArrowRight':
        if (e.shiftKey) {
          const end = selectionEnd ? parseRef(selectionEnd) : { col, row, colIdx };
          setSelectionEnd(`${colLabel(end.colIdx + 1)}${end.row}`);
        } else {
          setActiveCell(`${colLabel(colIdx + 1)}${row}`); setSelectionEnd(null);
        }
        break;
      case 'Tab':
        e.preventDefault();
        setActiveCell(`${colLabel(colIdx + (e.shiftKey ? -1 : 1))}${row}`); setSelectionEnd(null);
        break;
      case 'Delete':
      case 'Backspace':
        for (const ref of getSelectedCellRefs()) {
          setCell(sheetId, ref, '');
        }
        break;
      case 'F2':
        const cell = sheet?.cells[activeCell];
        setEditValue(cell?.value || '');
        setEditing(true);
        break;
      default:
        // Start typing to edit — prevent default so char isn't doubled
        if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
          e.preventDefault();
          setEditValue(e.key);
          setEditing(true);
        }
    }
  }, [activeCell, editing, commitEdit, sheet, sheetId, setCell]);

  if (!sheet) {
    return <div className="subsheet-empty">{t('sheetNotFound')}</div>;
  }

  return (
    <div
      ref={containerRef}
      className="subsheet-container"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onMouseUp={() => setIsDragging(false)}
      onMouseLeave={() => setIsDragging(false)}
      onContextMenu={(e) => {
        e.preventDefault();
        setCtxMenu({ x: e.clientX, y: e.clientY });
      }}
      onClick={() => ctxMenu && setCtxMenu(null)}
    >
      {/* Formula bar */}
      <div className="subsheet-formula-bar">
        <span className="subsheet-cell-ref">{activeCell || ''}</span>
        <span className="subsheet-formula-sep" />
        <input
          className="subsheet-formula-input"
          value={editing ? editValue : (activeCell ? (sheet.cells[activeCell]?.value || '') : '')}
          onChange={(e) => {
            if (!activeCell) return;
            setEditValue(e.target.value);
            if (!editing) setEditing(true);
          }}
          onKeyDown={(e) => {
            if (!activeCell) return;
            if (e.key === 'Enter') {
              e.preventDefault();
              commitEdit(activeCell);
            } else if (e.key === 'Escape') {
              setEditing(false);
            }
          }}
          onFocus={() => {
            if (activeCell && !editing) {
              setEditValue(sheet.cells[activeCell]?.value || '');
              setEditing(true);
            }
          }}
          onBlur={() => {
            // Delay to allow cell clicks in formula mode
            setTimeout(() => {
              if (editing && activeCell) {
                commitEdit(activeCell);
              }
            }, 150);
          }}
          placeholder="Formule of waarde..."
          disabled={!activeCell}
        />
      </div>

      <div
        className="subsheet-grid-wrapper"
        onWheel={handleWheel}
        style={{ ['--sheet-scale' as any]: zoom }}
      >
        <table className="subsheet-grid">
          <thead>
            <tr>
              <th className="subsheet-corner" style={{ width: ROW_HEADER_WIDTH, minWidth: ROW_HEADER_WIDTH }} />
              {Array.from({ length: sheet.columns }, (_, i) => (
                <th
                  key={i}
                  className="subsheet-col-header"
                  style={{ width: COL_WIDTH, minWidth: COL_WIDTH }}
                >
                  {colLabel(i)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: sheet.rows }, (_, rowIdx) => {
              const rowNum = rowIdx + 1;
              const rowBg = sheet.rowColors?.[rowIdx];
              return (
                <tr key={rowNum} style={rowBg ? { background: rowBg } : undefined}>
                  <td
                    className="subsheet-row-header"
                    style={rowBg ? { background: rowBg } : undefined}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setRowMenu({ row: rowIdx, x: e.clientX, y: e.clientY });
                    }}
                  >{rowNum}</td>
                  {Array.from({ length: sheet.columns }, (_, colIdx) => {
                    const cellRef = `${colLabel(colIdx)}${rowNum}`;
                    const cell = sheet.cells[cellRef];
                    const isActive = activeCell === cellRef;
                    const isSelected = isCellSelected(cellRef);
                    const isEditing = isActive && editing;
                    const refColor = getRefColor(cellRef);

                    // Display: show computed value or raw value with formatting
                    const dec = cell?.decimals ?? 2;
                    const fmt = cell?.format || 'auto';
                    const display = cell
                      ? (cell.computed !== undefined
                          ? (fmt === 'currency'
                              ? `€ ${cell.computed.toLocaleString('nl-NL', { minimumFractionDigits: dec, maximumFractionDigits: dec })}`
                              : fmt === 'percentage'
                                ? `${(cell.computed * 100).toFixed(dec)}%`
                                : typeof cell.computed === 'number'
                                  ? cell.computed.toLocaleString('nl-NL', { minimumFractionDigits: dec, maximumFractionDigits: dec })
                                  : cell.value)
                          : cell.value)
                      : '';
                    // Determine default alignment based on format/content
                    const isNumericFormat =
                      cell?.format === 'currency' ||
                      cell?.format === 'percentage' ||
                      cell?.format === 'number' ||
                      (cell?.format !== 'text' && cell?.computed !== undefined) ||
                      (!cell?.format && cell?.value !== undefined && cell.value !== '' && !cell.value.startsWith('=') && !isNaN(Number(cell.value.replace(',', '.'))));
                    const defaultAlign: 'right' | undefined = isNumericFormat ? 'right' : undefined;
                    const resolvedAlign = cell?.align ?? defaultAlign;
                    const borderStyleStr = (b?: CellBorder) =>
                      b && b.style !== 'none' ? `${b.width}px ${b.style} ${b.color}` : undefined;
                    const cellBorders = cell?.borders;
                    const cellStyle: React.CSSProperties = {
                      height: ROW_HEIGHT,
                      ...(resolvedAlign ? { textAlign: resolvedAlign } : {}),
                      ...(rowBg && !isActive && !isSelected ? { background: rowBg } : {}),
                      ...(refColor ? { outline: `2px solid ${refColor}`, outlineOffset: '-1px', zIndex: 1, background: `${refColor}15` } : {}),
                      ...(borderStyleStr(cellBorders?.top) ? { borderTop: borderStyleStr(cellBorders?.top) } : {}),
                      ...(borderStyleStr(cellBorders?.right) ? { borderRight: borderStyleStr(cellBorders?.right) } : {}),
                      ...(borderStyleStr(cellBorders?.bottom) ? { borderBottom: borderStyleStr(cellBorders?.bottom) } : {}),
                      ...(borderStyleStr(cellBorders?.left) ? { borderLeft: borderStyleStr(cellBorders?.left) } : {}),
                    };

                    return (
                      <td
                        key={cellRef}
                        className={`subsheet-cell${isActive ? ' active' : ''}${isSelected && !isActive ? ' selected' : ''}${cell?.value?.startsWith('=') ? ' formula' : ''}${refColor ? ' formula-ref' : ''}`}
                        style={cellStyle}
                        onMouseDown={(e) => {
                          // In formula mode: prevent blur so click can insert cell ref
                          if (editing && editValue.startsWith('=') && cellRef !== activeCell) {
                            e.preventDefault();
                          }
                          // Start drag selection
                          if (e.button === 0 && !editing) {
                            if (e.shiftKey) {
                              setSelectionEnd(cellRef);
                            } else {
                              if (editing && activeCell) commitEdit(activeCell);
                              setActiveCell(cellRef);
                              setSelectionEnd(null);
                              setEditing(false);
                              setIsDragging(true);
                            }
                          }
                        }}
                        onMouseEnter={() => {
                          if (isDragging) {
                            setSelectionEnd(cellRef);
                          }
                        }}
                        onMouseUp={() => {
                          setIsDragging(false);
                        }}
                        onClick={(e) => {
                          // Only handle click for formula mode insertion; normal selection done in mouseDown
                          if (editing && editValue.startsWith('=') && cellRef !== activeCell) {
                            handleCellClick(cellRef, e.shiftKey);
                          }
                        }}
                        onDoubleClick={() => handleCellDoubleClick(cellRef)}
                      >
                        {isEditing ? (
                          <input
                            ref={inputRef}
                            className="subsheet-cell-input"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => {
                              // Delay commit to allow click handlers to fire first
                              setTimeout(() => commitEdit(cellRef), 100);
                            }}
                          />
                        ) : (
                          <span className="subsheet-cell-value" style={{
                            ...(cell?.bold ? { fontWeight: 700 } : {}),
                            ...(cell?.italic ? { fontStyle: 'italic' } : {}),
                            ...(cell?.fontSize ? { fontSize: cell.fontSize } : {}),
                          }}>{display}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {ctxMenu && (
        <div
          className="subsheet-context-menu"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
        >
          <button onClick={() => { doCut(); setCtxMenu(null); }}>Knippen (Ctrl+X)</button>
          <button onClick={() => { doCopy(); setCtxMenu(null); }}>Kopiëren (Ctrl+C)</button>
          <button onClick={() => { doPaste(); setCtxMenu(null); }}>Plakken (Ctrl+V)</button>
          <div className="subsheet-ctx-sep" />
          <button onClick={() => {
            for (const ref of getSelectedCellRefs()) toggleBold(sheetId, ref);
            setCtxMenu(null);
          }}>Vet (Ctrl+B)</button>
          <button onClick={() => {
            for (const ref of getSelectedCellRefs()) setCell(sheetId, ref, '');
            setCtxMenu(null);
          }}>Wissen (Delete)</button>
          <div className="subsheet-ctx-sep" />
          <button onClick={() => {
            const refs = getSelectedCellRefs();
            if (refs.length === 0) { setCtxMenu(null); return; }
            setBorderPicker({ x: ctxMenu.x, y: ctxMenu.y, refs });
            setCtxMenu(null);
          }}>Randen…</button>
        </div>
      )}
      {borderPicker && (
        <SubSheetBorderPicker
          sheetId={sheetId}
          cellRefs={borderPicker.refs}
          x={borderPicker.x}
          y={borderPicker.y}
          onClose={() => setBorderPicker(null)}
        />
      )}
      {rowMenu && (
        <SubSheetRowContextMenu
          sheetId={sheet.id}
          rowIndex={rowMenu.row}
          x={rowMenu.x}
          y={rowMenu.y}
          onClose={() => setRowMenu(null)}
        />
      )}
    </div>
  );
}
