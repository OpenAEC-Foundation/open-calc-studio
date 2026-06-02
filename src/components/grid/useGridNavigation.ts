import { useCallback } from 'react';
import { useAppStore } from '@/state/appStore';
import { getColumnsForView, isCellEditable } from './gridConstants';
import type { CostUnit } from '@/types/costModel';
import { getGridCellDisplayValue } from '@/services/clipboard/excelClipboard';

export function useGridNavigation(visibleRowCount: number, visibleItems?: { id: string; rowType: string }[]) {
  const { activeRow, activeCol, isEditing, setActiveCell, setActiveCellExtend,
    getSelectedRowIndices, startEditing, stopEditing,
    updateItem, pushHistory, items, copyItems, getVisibleItems, gridView,
    cellSelectionStart, cellSelectionEnd } =
    useAppStore();

  const columns = getColumnsForView(gridView);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (isEditing) return;

      // Ctrl+C: copy cell range or selected rows
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        e.preventDefault();

        // If there is a cell range selection, copy that range as TSV
        if (cellSelectionStart && cellSelectionEnd) {
          const visible = getVisibleItems().filter(i => !i.rowType.startsWith('staart_'));
          const minRow = Math.min(cellSelectionStart.row, cellSelectionEnd.row);
          const maxRow = Math.max(cellSelectionStart.row, cellSelectionEnd.row);
          const minCol = Math.min(cellSelectionStart.col, cellSelectionEnd.col);
          const maxCol = Math.max(cellSelectionStart.col, cellSelectionEnd.col);

          const lines: string[] = [];
          for (let r = minRow; r <= maxRow; r++) {
            if (r < 0 || r >= visible.length) continue;
            const item = visible[r];
            const cells: string[] = [];
            for (let c = minCol; c <= maxCol; c++) {
              if (c < 0 || c >= columns.length) { cells.push(''); continue; }
              cells.push(getGridCellDisplayValue(item, columns[c].key));
            }
            lines.push(cells.join('\t'));
          }
          const tsv = lines.join('\n');
          navigator.clipboard.writeText(tsv).catch(() => {
            const textarea = document.createElement('textarea');
            textarea.value = tsv;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
          });
          return;
        }

        // Fallback: copy selected rows
        const visible = getVisibleItems();
        const indices = getSelectedRowIndices();
        const selectedItems = indices
          .filter((i) => i >= 0 && i < visible.length)
          .map((i) => visible[i]);
        if (selectedItems.length > 0) {
          copyItems(selectedItems);
        }
        return;
      }

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          if (activeRow > 0) {
            if (e.shiftKey) {
              setActiveCellExtend(activeRow - 1, activeCol);
            } else {
              setActiveCell(activeRow - 1, activeCol, visibleItems?.[activeRow - 1]?.id);
            }
          }
          break;
        case 'ArrowDown':
          e.preventDefault();
          if (activeRow < visibleRowCount - 1) {
            if (e.shiftKey) {
              setActiveCellExtend(activeRow + 1, activeCol);
            } else {
              setActiveCell(activeRow + 1, activeCol, visibleItems?.[activeRow + 1]?.id);
            }
          }
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (activeCol > 0) setActiveCell(activeRow, activeCol - 1, visibleItems?.[activeRow]?.id);
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (activeCol < columns.length - 1) setActiveCell(activeRow, activeCol + 1, visibleItems?.[activeRow]?.id);
          break;
        case 'Tab': {
          e.preventDefault();
          const editableCols = columns
            .map((c, i) => ({ ...c, index: i }))
            .filter((c) => c.editable);
          const currentEditIdx = editableCols.findIndex((c) => c.index === activeCol);
          const nearestIdx =
            currentEditIdx >= 0
              ? currentEditIdx
              : editableCols.findIndex((c) => c.index >= activeCol);
          if (e.shiftKey) {
            const prevIdx = (nearestIdx > 0 ? nearestIdx : editableCols.length) - 1;
            setActiveCell(activeRow, editableCols[prevIdx].index, visibleItems?.[activeRow]?.id);
          } else {
            const nextIdx = nearestIdx >= 0 ? (nearestIdx + 1) % editableCols.length : 0;
            if (nextIdx === 0 && activeRow < visibleRowCount - 1) {
              setActiveCell(activeRow + 1, editableCols[0].index, visibleItems?.[activeRow + 1]?.id);
            } else {
              setActiveCell(activeRow, editableCols[nextIdx].index, visibleItems?.[activeRow]?.id);
            }
          }
          startEditing();
          break;
        }
        case 'Enter':
        case 'F2':
          e.preventDefault();
          if (columns[activeCol]?.editable && visibleItems) {
            const item = visibleItems[activeRow];
            if (item && isCellEditable(columns[activeCol].key, item.rowType, gridView)) {
              startEditing();
            }
          }
          break;
        case 'Home': {
          e.preventDefault();
          const homeRow = e.ctrlKey ? 0 : activeRow;
          const homeCol = e.ctrlKey ? activeCol : 0;
          setActiveCell(homeRow, homeCol, visibleItems?.[homeRow]?.id);
          break;
        }
        case 'End': {
          e.preventDefault();
          const endRow = e.ctrlKey ? Math.max(0, visibleRowCount - 1) : activeRow;
          const endCol = e.ctrlKey ? activeCol : columns.length - 1;
          setActiveCell(endRow, endCol, visibleItems?.[endRow]?.id);
          break;
        }
        case 'PageUp': {
          e.preventDefault();
          const puRow = Math.max(0, activeRow - 20);
          setActiveCell(puRow, activeCol, visibleItems?.[puRow]?.id);
          break;
        }
        case 'PageDown': {
          e.preventDefault();
          const pdRow = Math.min(visibleRowCount - 1, activeRow + 20);
          setActiveCell(pdRow, activeCol, visibleItems?.[pdRow]?.id);
          break;
        }
        case 'Delete': {
          e.preventDefault();
          const col = columns[activeCol];
          if (col?.editable && visibleItems) {
            const indices = getSelectedRowIndices();
            const validIndices = indices.filter((i) => i >= 0 && i < visibleItems.length);
            if (validIndices.length > 0) {
              pushHistory(items, `Clear ${col.key}`);
              for (const idx of validIndices) {
                const itemId = visibleItems[idx].id;
                if (col.type === 'text') {
                  updateItem(itemId, col.key, '');
                } else if (col.type === 'number' || col.type === 'currency') {
                  updateItem(itemId, col.key, null);
                } else if (col.type === 'unit-select') {
                  updateItem(itemId, col.key, 'st' as CostUnit);
                }
              }
            }
          }
          break;
        }
        default:
          if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && columns[activeCol]?.editable && visibleItems) {
            const item = visibleItems[activeRow];
            if (item && isCellEditable(columns[activeCol].key, item.rowType, gridView)) {
              e.preventDefault();
              startEditing(e.key);
            }
          }
          break;
      }
    },
    [activeRow, activeCol, isEditing, visibleRowCount, setActiveCell, setActiveCellExtend,
      getSelectedRowIndices, startEditing, stopEditing, updateItem, pushHistory, items, visibleItems,
      copyItems, getVisibleItems, columns, cellSelectionStart, cellSelectionEnd]
  );

  return { handleKeyDown };
}
