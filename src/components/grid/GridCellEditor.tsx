import React, { useRef, useEffect, useCallback } from 'react';
import { COST_UNITS, getColumnsForView, isCellEditable } from './gridConstants';
import { formatNumberForEdit } from '@/utils/formatting';
import { useAppStore } from '@/state/appStore';
import { isContainerRowType } from '@/types/costModel';
import type { CostItem } from '@/types/costModel';

interface Props {
  item: CostItem;
  colIndex: number;
  style: React.CSSProperties;
  onCommit: (item: CostItem, colIndex: number, value: string) => void;
}

export const GridCellEditor: React.FC<Props> = ({ item, colIndex, style, onCommit }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const { editValue, selectOnFocus, stopEditing, startEditing, setActiveCell, activeRow, gridView } = useAppStore();
  const columns = getColumnsForView(gridView);
  const col = columns[colIndex];

  // Only consider columns that are actually editable for THIS item's rowType
  const editableCols = columns.map((c, i) => ({ ...c, index: i })).filter(c => isCellEditable(c.key, item.rowType, gridView));

  const isWitregelDesc = item.rowType === 'witregel' && col.key === 'description';

  const isSelect = col.type === 'unit-select' || col.type === 'vn-select' || col.type === 'tarief-select';

  useEffect(() => {
    if (isSelect) {
      const el = selectRef.current;
      if (el) {
        el.focus();
        // Auto-open dropdown
        try { el.showPicker(); } catch { /* not supported in all browsers */ }
      }
    } else if (isWitregelDesc) {
      const ta = textareaRef.current;
      if (ta) {
        ta.focus();
        if (selectOnFocus) ta.select();
        else ta.setSelectionRange(ta.value.length, ta.value.length);
      }
    } else {
      const input = inputRef.current;
      if (input) {
        input.focus();
        if (selectOnFocus) {
          input.select();
        } else {
          input.setSelectionRange(input.value.length, input.value.length);
        }
      }
    }
  }, [col.type, selectOnFocus, isWitregelDesc, isSelect]);

  const initialValue = (() => {
    if (editValue) return editValue;
    const keyMap: Record<string, string> = { productienorm: 'normQuantity', productiecapaciteit: 'normFactor', hoeveelheid: 'quantity' };
    const fieldKey = keyMap[col.key] ?? col.key;
    const raw = item[fieldKey as keyof CostItem];
    if (raw === null || raw === undefined) return '';
    if (col.type === 'currency' || col.type === 'number' || col.type === 'computed') {
      // NL-notatie (komma), zodat een ongewijzigde commit exact round-tript;
      // "6.66" zou door de NL-parser als 666 gelezen worden.
      return formatNumberForEdit(raw as number);
    }
    return String(raw);
  })();

  // Zelfde inspringing als GridCell (padding per diepte + chevron op
  // containerrijen), zodat de tekst tijdens het bewerken op zijn plek
  // blijft staan in plaats van naar de linkerrand te springen.
  const descPaddingLeft = (() => {
    if (col.key !== 'description') return undefined;
    const base = gridView === 'wpcalc'
      ? (item.rowType === 'chapter' && item.depth === 0 ? 4 : 4 + item.depth * 16)
      : item.depth * 16 + 4;
    return base + (isContainerRowType(item.rowType) ? 16 : 0);
  })();
  const editorStyle = descPaddingLeft !== undefined ? { ...style, paddingLeft: descPaddingLeft } : style;

  // Alleen committen als de tekst echt gewijzigd is: klik-in/klik-uit of
  // Tab-en door cellen mag waarden nooit herschrijven (en vult de
  // geschiedenis niet met lege bewerkingen).
  const commitIfChanged = useCallback((value: string) => {
    if (value !== initialValue) onCommit(item, colIndex, value);
  }, [initialValue, onCommit, item, colIndex]);

  const moveToNextCell = useCallback((shift: boolean) => {
    const currentEditIdx = editableCols.findIndex(c => c.index === colIndex);
    if (shift) {
      if (currentEditIdx > 0) {
        setActiveCell(activeRow, editableCols[currentEditIdx - 1].index, item.id);
      } else if (activeRow > 0) {
        // Moving to previous row — we don't know that item's ID, keep current
        setActiveCell(activeRow - 1, editableCols[editableCols.length - 1].index);
      }
    } else {
      if (currentEditIdx < editableCols.length - 1) {
        setActiveCell(activeRow, editableCols[currentEditIdx + 1].index, item.id);
      } else {
        // Moving to next row — we don't know that item's ID, keep current
        setActiveCell(activeRow + 1, editableCols[0].index);
      }
    }
  }, [colIndex, activeRow, editableCols, setActiveCell, item.id]);

  // Block editing for cells not editable on this rowType
  if (!isCellEditable(col.key, item.rowType, gridView)) {
    stopEditing();
    return null;
  }

  if (isSelect) {
    const options: string[] = col.type === 'tarief-select' ? ['A', 'B', 'C'] : col.type === 'vn-select' ? ['V', 'A', 'N', 'F'] : [...COST_UNITS];
    const defaultVal = col.type === 'tarief-select' ? (item.tariefGroep ?? 'A') : col.type === 'vn-select' ? (item.verrekenbaar ?? 'V') : String(item.unit);
    return (
      <select
        ref={selectRef}
        defaultValue={defaultVal}
        style={style}
        className="grid-cell-editor"
        onChange={(e) => {
          onCommit(item, colIndex, e.target.value);
          stopEditing();
          moveToNextCell(false);
        }}
        onBlur={() => stopEditing()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            stopEditing();
          } else if (e.key === 'Tab') {
            e.preventDefault();
            const val = (e.target as HTMLSelectElement).value;
            if (val !== defaultVal) onCommit(item, colIndex, val);
            stopEditing();
            moveToNextCell(e.shiftKey);
            requestAnimationFrame(() => startEditing());
          } else if (col.type === 'vn-select' || col.type === 'tarief-select') {
            // Direct keyboard selection for V/A/N/F or A/B/C
            const key = e.key.toUpperCase();
            if (options.includes(key)) {
              e.preventDefault();
              onCommit(item, colIndex, key);
              stopEditing();
              moveToNextCell(false);
            }
          }
        }}
      >
        {options.map((u) => (
          <option key={u} value={u}>{u}</option>
        ))}
      </select>
    );
  }

  // Witregel description uses textarea for multi-line editing
  if (isWitregelDesc) {
    const lineCount = Math.max(3, (initialValue.match(/\n/g) || []).length + 2);
    return (
      <textarea
        ref={textareaRef}
        defaultValue={initialValue}
        style={{ ...editorStyle, height: lineCount * 24, resize: 'vertical' }}
        className="grid-cell-editor grid-cell-editor-textarea"
        onBlur={(e) => {
          commitIfChanged(e.target.value);
          stopEditing();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            stopEditing();
          } else if (e.key === 'Tab') {
            e.preventDefault();
            commitIfChanged((e.target as HTMLTextAreaElement).value);
            stopEditing();
            moveToNextCell(e.shiftKey);
            requestAnimationFrame(() => startEditing());
          }
          // Enter adds newline (default textarea behavior)
        }}
      />
    );
  }

  return (
    <input
      ref={inputRef}
      defaultValue={initialValue}
      style={editorStyle}
      className="grid-cell-editor"
      onBlur={(e) => {
        commitIfChanged(e.target.value);
        stopEditing();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commitIfChanged((e.target as HTMLInputElement).value);
          stopEditing();
          setActiveCell(activeRow + 1, colIndex);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          stopEditing();
        } else if (e.key === 'Tab') {
          e.preventDefault();
          commitIfChanged((e.target as HTMLInputElement).value);
          stopEditing();
          moveToNextCell(e.shiftKey);
          // Re-enter edit mode in the next cell
          requestAnimationFrame(() => startEditing());
        }
      }}
    />
  );
};
