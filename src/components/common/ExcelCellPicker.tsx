import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { ExcelLink } from '../../types/costModel';
import {
  parseExcelFile,
  parseExcelFileFromPath,
  cellRef,
  colIndexToLetter,
  pickerCellValue,
  type ExcelPickerSheet,
} from '../../services/excel/excelLinkService';
import './Modal.css';
import './ExcelCellPicker.css';

interface ExcelCellPickerProps {
  open: boolean;
  initialLink?: ExcelLink | null;
  onSelect: (link: ExcelLink, value: number | null) => void;
  onCancel: () => void;
}

export default function ExcelCellPicker({ open, initialLink, onSelect, onCancel }: ExcelCellPickerProps) {
  const { t } = useTranslation('dialogs');
  const [filePath, setFilePath] = useState(initialLink?.filePath || '');
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [sheets, setSheets] = useState<Record<string, ExcelPickerSheet>>({});
  const [activeSheet, setActiveSheet] = useState(initialLink?.sheet || '');
  const [selectedCell, setSelectedCell] = useState(initialLink?.cell || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // The value is always read from the loaded sheet at the selected address, so
  // it can never carry over from a previous item (knownbugs 67).
  const selectedValue = useMemo(
    () => pickerCellValue(sheets[activeSheet], selectedCell),
    [sheets, activeSheet, selectedCell],
  );

  // Guards against a slow file load from a previous open landing in this one.
  const loadSeq = useRef(0);

  const loadFromPath = async (path: string, preferredSheet?: string) => {
    const seq = ++loadSeq.current;
    setLoading(true);
    setError(null);
    try {
      const result = await parseExcelFileFromPath(path);
      if (seq !== loadSeq.current) return;
      if (!result) {
        setError(t('excelPicker.cannotReadFile'));
        return;
      }
      setSheetNames(result.sheetNames);
      setSheets(result.sheets);
      if (result.sheetNames.length > 0) {
        const sheet = preferredSheet && result.sheetNames.includes(preferredSheet)
          ? preferredSheet
          : result.sheetNames[0];
        setActiveSheet(sheet);
      }
    } catch (e) {
      if (seq === loadSeq.current) setError(String(e));
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  };

  // Reset all state each time the modal opens; the component stays mounted
  // between items, so nothing from the previous item may survive.
  const linkKey = initialLink ? `${initialLink.filePath}|${initialLink.sheet}|${initialLink.cell}` : '';
  useEffect(() => {
    if (!open) return;
    loadSeq.current++;
    setSheetNames([]);
    setSheets({});
    setError(null);
    setLoading(false);
    if (initialLink) {
      setFilePath(initialLink.filePath);
      setActiveSheet(initialLink.sheet);
      setSelectedCell(initialLink.cell);
      // Auto-load if we have a path
      void loadFromPath(initialLink.filePath, initialLink.sheet);
    } else {
      setFilePath('');
      setActiveSheet('');
      setSelectedCell('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only on open or a different link
  }, [open, linkKey]);

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
    const seq = ++loadSeq.current;
    setFilePath(file.name);
    setLoading(true);
    setError(null);
    try {
      const result = await parseExcelFile(file);
      if (seq !== loadSeq.current) return;
      setSheetNames(result.sheetNames);
      setSheets(result.sheets);
      if (result.sheetNames.length > 0) {
        setActiveSheet(result.sheetNames[0]);
      }
    } catch (err) {
      if (seq === loadSeq.current) setError(String(err));
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, []);

  /** rowIdx/colIdx index the sheet data; the origin makes them real addresses (knownbugs 79). */
  const handleCellClick = useCallback((rowIdx: number, colIdx: number) => {
    const origin = sheets[activeSheet]?.origin ?? { row: 0, col: 0 };
    setSelectedCell(cellRef(rowIdx + origin.row, colIdx + origin.col));
  }, [activeSheet, sheets]);

  const handleConfirm = useCallback(() => {
    if (!activeSheet || !selectedCell) return;
    onSelect({ filePath, sheet: activeSheet, cell: selectedCell }, selectedValue);
  }, [filePath, activeSheet, selectedCell, selectedValue, onSelect]);

  if (!open) return null;

  const currentData = sheets[activeSheet]?.data || [];
  const origin = sheets[activeSheet]?.origin ?? { row: 0, col: 0 };
  const maxCols = currentData.reduce((max, row) => Math.max(max, row?.length || 0), 0);
  // Limit display to first 200 rows and 50 columns for performance
  const displayRows = currentData.slice(0, 200);
  const displayCols = Math.min(maxCols, 50);

  return (
    <div className="modal-overlay modal-open">
      <div className="modal-dialog modal-dialog-open excel-picker-dialog">
        <div className="modal-header">
          <span className="modal-title">{t('excelPicker.title')}</span>
          <button className="modal-close" onClick={onCancel}>×</button>
        </div>

        <div className="excel-picker-toolbar">
          <button className="excel-picker-browse" onClick={handleFileSelect}>
            {t('excelPicker.chooseFile')}
          </button>
          <span className="excel-picker-path" title={filePath}>
            {filePath ? filePath.split(/[/\\]/).pop() : t('excelPicker.noFileSelected')}
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
              <span>{t('excelPicker.loadingFile')}</span>
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
                        {colIndexToLetter(i + origin.col)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((row, ri) => (
                    <tr key={ri}>
                      <td className="excel-picker-row-header">{ri + origin.row + 1}</td>
                      {Array.from({ length: displayCols }, (_, ci) => {
                        const ref = cellRef(ri + origin.row, ci + origin.col);
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
                onClick={() => { setActiveSheet(name); setSelectedCell(''); }}
              >
                {name}
              </button>
            ))}
          </div>
        )}

        <div className="modal-footer">
          <button className="modal-btn modal-btn-secondary" onClick={onCancel}>
            {t('excelPicker.cancel')}
          </button>
          <button
            className="modal-btn modal-btn-primary"
            onClick={handleConfirm}
            disabled={!selectedCell || !activeSheet}
          >
            {t('excelPicker.select')}
          </button>
        </div>
      </div>
    </div>
  );
}
