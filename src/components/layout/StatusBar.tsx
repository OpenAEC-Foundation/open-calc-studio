import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../../state/appStore";
import { formatCurrency, formatNumber } from "../../utils/formatting";
import { getGrandTotal } from "../../services/calculation/calculator";
import { getColumnsForView } from "../grid/gridConstants";
import { summarizeCellSelection, needsResourceTotals } from "../../services/grid/cellValue";
import { computeResourceTotals } from "../../services/grid/resourceTotals";
import "./StatusBar.css";

const ZOOM_PRESETS = [50, 75, 100, 125, 150, 175, 200];

interface ZoomPickerProps {
  value: number;
  onChange: (zoom: number) => void;
  onStep: (direction: 1 | -1) => void;
  label?: string;
  title?: string;
  smallerLabel?: string;
  largerLabel?: string;
}

/** Zoomregelaar: − en +, en klikken op het percentage opent een invoerveld met vaste standen. */
function ZoomPicker({ value, onChange, onStep, label, title, smallerLabel, largerLabel }: ZoomPickerProps) {
  const [editing, setEditing] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [inputValue, setInputValue] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setInputValue(String(value)); }, [value]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [dropdownOpen]);

  const commitValue = useCallback(() => {
    const num = parseInt(inputValue, 10);
    if (!isNaN(num) && num >= 50 && num <= 200) {
      onChange(num);
    } else {
      setInputValue(String(value));
    }
    setEditing(false);
    setDropdownOpen(false);
  }, [inputValue, value, onChange]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { commitValue(); }
    else if (e.key === "Escape") { setInputValue(String(value)); setEditing(false); }
  };

  const handlePresetClick = (preset: number) => {
    onChange(preset);
    setInputValue(String(preset));
    setDropdownOpen(false);
    setEditing(false);
  };

  return (
    <div className="status-zoom" ref={dropdownRef} title={title}>
      {label && <span className="status-item-label">{label}</span>}
      <button className="status-zoom-btn" onClick={() => onStep(-1)} aria-label={smallerLabel}>−</button>
      <div className="status-zoom-value-wrapper">
        {editing ? (
          <input
            ref={inputRef}
            className="status-zoom-input"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value.replace(/[^0-9]/g, ""))}
            onKeyDown={handleKeyDown}
            onBlur={event => { if (!(event.relatedTarget as HTMLElement | null)?.closest('.status-zoom-dropdown')) commitValue(); }}
            maxLength={3}
          />
        ) : (
          <button
            className="status-zoom-value"
            onClick={() => { setEditing(true); setDropdownOpen(true); }}
          >
            {value}%
          </button>
        )}
        {dropdownOpen && (
          <div className="status-zoom-dropdown">
            {ZOOM_PRESETS.map((val) => (
              <button
                key={val}
                className={`status-zoom-preset${val === value ? ' active' : ''}`}
                onMouseDown={event => event.preventDefault()} onClick={() => handlePresetClick(val)}
              >
                {val}%
              </button>
            ))}
          </div>
        )}
      </div>
      <button className="status-zoom-btn" onClick={() => onStep(1)} aria-label={largerLabel}>+</button>
    </div>
  );
}

/** Zoom van alleen de begrotingstabel. */
function ZoomControl() {
  const gridZoom = useAppStore((s) => s.gridZoom);
  const setGridZoom = useAppStore((s) => s.setGridZoom);
  return <ZoomPicker value={gridZoom} onChange={setGridZoom} onStep={(direction) => setGridZoom(gridZoom + 10 * direction)} />;
}

/** Excel-achtige samenvatting van een celselectie: som, aantal en gemiddelde. */
function SelectionSummary() {
  const { t } = useTranslation();
  const items = useAppStore((s) => s.items);
  const gridView = useAppStore((s) => s.gridView);
  const branchesEnabled = useAppStore((s) => s.schedule.branchesEnabled ?? false);
  const cellSelectionStart = useAppStore((s) => s.cellSelectionStart);
  const cellSelectionEnd = useAppStore((s) => s.cellSelectionEnd);
  const getGridRows = useAppStore((s) => s.getGridRows);

  const summary = useMemo(() => {
    if (!cellSelectionStart || !cellSelectionEnd) return null;
    // Eén enkele cel: geen som tonen (dat is alleen ruis in de balk).
    const cells =
      (Math.abs(cellSelectionEnd.row - cellSelectionStart.row) + 1) *
      (Math.abs(cellSelectionEnd.col - cellSelectionStart.col) + 1);
    if (cells < 2) return null;

    const columns = getColumnsForView(gridView, branchesEnabled);
    const minCol = Math.min(cellSelectionStart.col, cellSelectionEnd.col);
    const maxCol = Math.max(cellSelectionStart.col, cellSelectionEnd.col);
    // Resource-uitsplitsing alleen berekenen als er ook zo'n kolom in de
    // selectie zit — die walk over alle items is te duur voor elke sleep.
    const rt = needsResourceTotals(columns, minCol, maxCol)
      ? computeResourceTotals(items)
      : undefined;

    const s = summarizeCellSelection(getGridRows(), columns, cellSelectionStart, cellSelectionEnd, rt);
    return s.count > 0 ? s : null;
  }, [items, gridView, branchesEnabled, cellSelectionStart, cellSelectionEnd, getGridRows]);

  if (!summary) return null;
  const fmt = (n: number) => (summary.currency ? formatCurrency(n) : formatNumber(n));

  return (
    <>
      <div className="status-item status-selection">
        <span className="status-item-label">{t('statusBar.sum')}</span>
        <span className="status-item-value" style={{ fontWeight: 600 }}>{fmt(summary.sum)}</span>
      </div>
      <div className="status-separator" />
      <div className="status-item status-selection">
        <span className="status-item-label">{t('statusBar.count')}</span>
        <span className="status-item-value">{summary.count}</span>
      </div>
      <div className="status-separator" />
      <div className="status-item status-selection">
        <span className="status-item-label">{t('statusBar.avg')}</span>
        <span className="status-item-value">{fmt(summary.sum / summary.count)}</span>
      </div>
      <div className="status-separator" />
    </>
  );
}

/** App-brede interface-zoom (schaalt ook de tekst) — los van de grid-zoom. */
function UiZoomControl() {
  const { t } = useTranslation();
  const uiZoom = useAppStore((s) => s.uiZoom);
  const stepUiZoom = useAppStore((s) => s.stepUiZoom);
  const setUiZoom = useAppStore((s) => s.setUiZoom);
  return (
    <ZoomPicker
      value={uiZoom}
      onChange={setUiZoom}
      onStep={stepUiZoom}
      label="UI:"
      title={t('statusBar.uiZoomTitle')}
      smallerLabel={t('statusBar.uiSmaller')}
      largerLabel={t('statusBar.uiLarger')}
    />
  );
}

export default function StatusBar() {
  const { t } = useTranslation();
  const { items, activeRow, activeCol, schedule, setActiveBranch } = useAppStore();
  const grandTotal = getGrandTotal(items);
  const branchesEnabled = schedule.branchesEnabled ?? false;
  const branches = schedule.branches ?? [];
  const activeBranchId = schedule.activeBranchId;

  return (
    <div className="status-bar">
      <div className="status-bar-left">
        <div className="status-item">
          <span className="status-item-label">{schedule.status}</span>
        </div>
        <div className="status-separator" />
        <div className="status-item">
          <span className="status-item-label">{t("items")}:</span>
          <span className="status-item-value">{items.length}</span>
        </div>
        <div className="status-separator" />
        <div className="status-item">
          <span className="status-item-label">{t("cell")}:</span>
          <span className="status-item-value">R{activeRow + 1}C{activeCol + 1}</span>
        </div>
      </div>

      <div className="status-bar-center">
        {branchesEnabled && branches.length > 0 && (
          <div className="status-item">
            <span className="status-item-label">🌿 {t('statusBar.variant')}</span>
            <select
              style={{ fontSize: 11, padding: '1px 4px', border: '1px solid var(--theme-border)', borderRadius: 3, background: 'var(--theme-surface)', color: 'var(--theme-text)' }}
              value={activeBranchId ?? ''}
              onChange={(e) => setActiveBranch(e.target.value || undefined)}
            >
              <option value="">{t('statusBar.allVariants')}</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        )}
      </div>

      <div className="status-bar-right">
        <SelectionSummary />
        <div className="status-item">
          <span className="status-item-label">{t("total")}:</span>
          <span className="status-item-value" style={{ fontWeight: 600 }}>{formatCurrency(grandTotal)}</span>
        </div>
        <div className="status-separator" />
        <UiZoomControl />
        <div className="status-separator" />
        <ZoomControl />
      </div>
    </div>
  );
}
