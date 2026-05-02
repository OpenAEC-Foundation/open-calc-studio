import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { ExcelLink } from '../../types/costModel';
import { parseExcelFile, parseExcelFileFromPath, cellRef, colIndexToLetter } from '../../services/excel/excelLinkService';
import './Modal.css';
import './ExcelCellPicker.css';

interface ExcelCellPickerProps {
  open: boolean;
  initialLink?: ExcelLink | null;
  onSelect: (link: ExcelLink, value: number | null) => void;
  onCancel: () => void;
}

interface SheetData {
  data: (string | number | null)[][];
  ref: string;
}

export default function ExcelCellPicker({ open, initialLink, onSelect, onCancel }: ExcelCellPickerProps) {
  const [filePath, setFilePath] = useState(initialLink?.filePath || '');
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [sheets, setSheets] = useState<Record<string, SheetData>>({});
  const [activeSheet, setActiveSheet] = useState(initialLink?.sheet || '');
  const [selectedCell, setSelectedCell] = useState(initialLink?.cell || '');
  const [selectedValue, setSelectedValue] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      if (initialLink) {
        setFilePath(initialLink.filePath);
        setActiveSheet(initialLink.sheet);
        setSelectedCell(initialLink.cell);
        // Auto-load if we have a path
        loadFromPath(initialLink.filePath);
      } else {
        setFilePath('');
        setSheetNames([]);
        setSheets({});
        setActiveSheet('');
        setSelectedCell('');
        setSelectedValue(null);
        setError(null);
      }
    }
  }, [open]);

  const loadFromPath = async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await parseExcelFileFromPath(path);
      if (!result) {
        setError('Kan bestand niet lezen');
        return;
      }
      setSheetNames(result.sheetNames);
      setSheets(result.sheets);
      if (result.sheetNames.length > 0) {
        const sheet = initialLink?.sheet && result.sheetNames.includes(initialLink.sheet)
          ? initialLink.sheet
          : result.sheetNames[0];
        setActiveSheet(sheet);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = useCallback(async () => {
    // Try Tauri dialog first
    try {
      if ((window as any).__TAURI_INTERNALS__) {
        const dialog = await import('@tauri-apps/plugin-dialog');
        const selected = await dialog.open({
          filters: [{ name: 'Excel', extensions: ['xlsx', 'xls', 'ods', 'csv'] }],
          multiple: false,
        });
        if (selected && typeof selected === 'string') {
          setFilePath(selected);
          await loadFromPath(selected);
          return;
        }
      }
    } catch { /* fallback to browser file input */ }

    // Browser fallback
    fileInputRef.current?.click();
  }, []);

  const handleBrowserFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFilePath(file.name);
    setLoading(true);
    setError(null);
    try {
      const result = await parseExcelFile(file);
      setSheetNames(result.sheetNames);
      setSheets(result.sheets);
      if (result.sheetNames.length > 0) {
        setActiveSheet(result.sheetNames[0]);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const handleCellClick = useCallback((rowIdx: number, colIdx: number) => {
    const ref = cellRef(rowIdx, colIdx);
    setSelectedCell(ref);
    const data = sheets[activeSheet]?.data;
    if (data && data[rowIdx]) {
      const val = data[rowIdx][colIdx];
      setSelectedValue(typeof val === 'number' ? val : (parseFloat(String(val)) || null));
    } else {
      setSelectedValue(null);
    }
  }, [activeSheet, sheets]);

  const handleConfirm = useCallback(() => {
    if (!activeSheet || !selectedCell) return;
    onSelect({ filePath, sheet: activeSheet, cell: selectedCell }, selectedValue);
  }, [filePath, activeSheet, selectedCell, selectedValue, onSelect]);

  if (!open) return null;

  const currentData = sheets[activeSheet]?.data || [];
  const maxCols = currentData.reduce((max, row) => Math.max(max, row?.length || 0), 0);
  // Limit display to first 200 rows and 50 columns for performance
  const displayRows = currentData.slice(0, 200);
  const displayCols = Math.min(maxCols, 50);

  return (
    <div className="modal-overlay modal-open">
      <div className="modal-dialog modal-dialog-open excel-picker-dialog">
        <div className="modal-header">
          <span className="modal-title">Link naar Excel</span>
          <button className="modal-close" onClick={onCancel}>×</button>
        </div>

        <div className="excel-picker-toolbar">
          <button className="excel-picker-browse" onClick={handleFileSelect}>
            Bestand kiezen...
          </button>
          <span className="excel-picker-path" title={filePath}>
            {filePath ? filePath.split(/[/\\]/).pop() : 'Geen bestand geselecteerd'}
          </span>
          {selectedCell && (
            <span className="excel-picker-ref">
              {activeSheet}!{selectedCell}
              {selectedValue !== null && ` = ${selectedValue}`}
            </span>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.ods,.csv"
            style={{ display: 'none' }}
            onChange={handleBrowserFile}
          />
        </div>

        <div className="excel-picker-body">
          {loading && (
            <div className="excel-picker-loading">
              <div className="progress-modal-spinner" />
              <span>Bestand laden...</span>
            </div>
          )}
          {error && <div className="excel-picker-error">{error}</div>}
          {!loading && sheetNames.length > 0 && (
            <div className="excel-picker-grid-wrapper" ref={gridRef}>
              <table className="excel-picker-grid">
                <thead>
                  <tr>
                    <th className="excel-picker-corner"></th>
                    {Array.from({ length: displayCols }, (_, i) => (
                      <th key={i} className="excel-picker-col-header">
                        {colIndexToLetter(i)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((row, ri) => (
                    <tr key={ri}>
                      <td className="excel-picker-row-header">{ri + 1}</td>
                      {Array.from({ length: displayCols }, (_, ci) => {
                        const ref = cellRef(ri, ci);
                        const isSelected = ref === selectedCell;
                        const val = row?.[ci];
                        return (
                          <td
                            key={ci}
                            className={`excel-picker-cell${isSelected ? ' selected' : ''}${typeof val === 'number' ? ' numeric' : ''}`}
                            onClick={() => handleCellClick(ri, ci)}
                          >
                            {val !== null && val !== undefined ? String(val) : ''}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {sheetNames.length > 1 && (
          <div className="excel-picker-sheets">
            {sheetNames.map(name => (
              <button
                key={name}
                className={`excel-picker-sheet-tab${name === activeSheet ? ' active' : ''}`}
                onClick={() => { setActiveSheet(name); setSelectedCell(''); setSelectedValue(null); }}
              >
                {name}
              </button>
            ))}
          </div>
        )}

        <div className="modal-footer">
          <button className="modal-btn modal-btn-secondary" onClick={onCancel}>
            Annuleren
          </button>
          <button
            className="modal-btn modal-btn-primary"
            onClick={handleConfirm}
            disabled={!selectedCell || !activeSheet}
          >
            Selecteren
          </button>
        </div>
      </div>
    </div>
  );
}
