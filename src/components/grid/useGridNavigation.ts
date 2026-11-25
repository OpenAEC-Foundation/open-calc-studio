import { useCallback } from 'react';
import { useAppStore } from '@/state/appStore';
import { columnFieldKey, getColumnsForView, hiddenByQuantityToggle, isCellEditable, isColumnHidden } from './gridConstants';
import type { CostUnit } from '@/types/costModel';
import { copyItemsToExcel, getGridCellDisplayValue, tsvCell } from '@/services/clipboard/excelClipboard';
import { isFooterRow } from '@/services/grid/gridRows';
import i18next from '@/i18n/config';

export function useGridNavigation(visibleRowCount: number, visibleItems?: { id: string; rowType: string }[]) {
  const { activeRow, activeCol, isEditing, setActiveCell, setActiveCellExtend,
    getSelectedRowIndices, startEditing, stopEditing,
    updateItem, pushHistory, items, copyItems, getGridRows, gridView,
    cellSelectionStart, cellSelectionEnd, schedule, showHoeveelheid, hiddenColumns } =
    useAppStore();

  // Mét branchesEnabled: kolomindices moeten gelijk lopen met het gerenderde grid.
  const columns = getColumnsForView(gridView, !!schedule.branchesEnabled);
  // Verborgen kolommen (kolommenu of lintknop Hoeveelheid) zijn 0 px breed: de toetsen slaan ze over.
  const colVisible = useCallback((i: number) => {
    const col = columns[i];
    return !!col && !hiddenByQuantityToggle(col.key, gridView, showHoeveelheid) && !isColumnHidden(hiddenColumns, gridView, col.key);
  }, [columns, gridView, showHoeveelheid, hiddenColumns]);
  const visibleIndices = columns.map((_, i) => i).filter(colVisible);
  const firstVisibleCol = visibleIndices[0] ?? 0;
  const lastVisibleCol = visibleIndices[visibleIndices.length - 1] ?? columns.length - 1;

  /** Zet de doelrij meteen in bewerkmodus, mits die cel daar bewerkbaar is.
   *  Zo kun je met de pijltjes een kolom doorlopen en direct doortypen —
   *  op een rijtype waar de kolom niet geldt (bv. een hoofdstukrij) blijft
   *  het bij selecteren, anders zou de editor meteen weer sluiten. */
  const editIfPossible = useCallback((row: number) => {
    const item = visibleItems?.[row];
    if (!item || item.id.startsWith('footer:')) return;
    const col = columns[activeCol];
    if (!col?.editable || !colVisible(activeCol) || !isCellEditable(col.key, item.rowType, gridView)) return;
    requestAnimationFrame(() => startEditing());
  }, [visibleItems, columns, activeCol, gridView, startEditing, colVisible]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (isEditing) return;

      // Ctrl+C: copy cell range or selected rows
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'c') {
        e.preventDefault();

        // If there is a cell range selection, copy that range as TSV.
        // Cel-selectie-indices zijn grid-rij-indices → via de gerenderde
        // rijenlijst vertalen; footerrijen slaan we over.
        if (cellSelectionStart && cellSelectionEnd) {
          const visible = getGridRows();
          const minRow = Math.min(cellSelectionStart.row, cellSelectionEnd.row);
          const maxRow = Math.max(cellSelectionStart.row, cellSelectionEnd.row);
          const minCol = Math.min(cellSelectionStart.col, cellSelectionEnd.col);
          const maxCol = Math.max(cellSelectionStart.col, cellSelectionEnd.col);

          const lines: string[] = [];
          for (let r = minRow; r <= maxRow; r++) {
            if (r < 0 || r >= visible.length) continue;
            const item = visible[r];
            if (isFooterRow(item.id)) continue;
            const cells: string[] = [];
            for (let c = minCol; c <= maxCol; c++) {
              if (c < 0 || c >= columns.length) { cells.push(''); continue; }
              cells.push(tsvCell(getGridCellDisplayValue(item, columns[c].key)));
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

        // Fallback: copy selected rows (indices → gerenderde rijenlijst)
        const visible = getGridRows();
        const indices = getSelectedRowIndices();
        const selectedItems = indices
          .filter((i) => i >= 0 && i < visible.length)
          .map((i) => visible[i])
          .filter((it) => !isFooterRow(it.id));
        if (selectedItems.length > 0) {
          copyItems(selectedItems);
          // Ook als tekst op het systeemklembord, voor plakken in Excel. De
          // globale sneltoets slaat dit event over (defaultPrevented), dus
          // zonder deze regel bleef het klembord leeg (knownbug 29).
          void copyItemsToExcel(selectedItems);
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
              editIfPossible(activeRow - 1);
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
              editIfPossible(activeRow + 1);
            }
          }
          break;
        case 'ArrowLeft':
          e.preventDefault();
          { const prev = visibleIndices.filter((i) => i < activeCol).pop(); if (prev != null) setActiveCell(activeRow, prev, visibleItems?.[activeRow]?.id); }
          break;
        case 'ArrowRight':
          e.preventDefault();
          { const next = visibleIndices.find((i) => i > activeCol); if (next != null) setActiveCell(activeRow, next, visibleItems?.[activeRow]?.id); }
          break;
        case 'Tab': {
          e.preventDefault();
          const editableCols = columns
            .map((c, i) => ({ ...c, index: i }))
            .filter((c) => c.editable && colVisible(c.index));
          if (editableCols.length === 0) break;
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
          if (columns[activeCol]?.editable && colVisible(activeCol) && visibleItems) {
            const item = visibleItems[activeRow];
            if (item && isCellEditable(columns[activeCol].key, item.rowType, gridView)) {
              startEditing();
            }
          }
          break;
        case 'Home': {
          e.preventDefault();
          const homeRow = e.ctrlKey ? 0 : activeRow;
          const homeCol = e.ctrlKey ? activeCol : firstVisibleCol;
          setActiveCell(homeRow, homeCol, visibleItems?.[homeRow]?.id);
          break;
        }
        case 'End': {
          e.preventDefault();
          const endRow = e.ctrlKey ? Math.max(0, visibleRowCount - 1) : activeRow;
          const endCol = e.ctrlKey ? activeCol : lastVisibleCol;
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
          if (col?.editable && colVisible(activeCol) && visibleItems) {
            // Het echte veld (Prod.norm → normQuantity, …) en alleen cellen die op
            // dat rijtype bewerkbaar zijn; ongewijzigde cellen tellen niet mee,
            // zodat er geen lege undo-stap komt (knownbug 22).
            const fieldKey = columnFieldKey(col.key);
            const clearedValue: string | null | undefined = col.type === 'text' ? ''
              : (col.type === 'number' || col.type === 'currency') ? null
              : col.type === 'unit-select' ? ('st' as CostUnit)
              : undefined;
            if (clearedValue === undefined) break;
            const ownPostPrice = (it: { rowType: string }) => fieldKey === 'normUnitPrice'
              && (it.rowType === 'begrotingspost' || it.rowType === 'bewakingspost');
            const targets = getSelectedRowIndices()
              .filter((i) => i >= 0 && i < visibleItems.length)
              .map((i) => items.find((it) => it.id === visibleItems[i].id))
              .filter((it): it is NonNullable<typeof it> => !!it && isCellEditable(col.key, it.rowType, gridView))
              .filter((it) => {
                const cur = (it as unknown as Record<string, unknown>)[fieldKey];
                if (ownPostPrice(it)) return cur != null || it.materialPrice != null || it.laborPrice != null;
                return clearedValue === null ? cur != null : (cur ?? '') !== clearedValue;
              });
            if (targets.length === 0) break;
            // Hoeveelheid wissen bij een post met meetregels haalt die weg (#96): eerst vragen.
            const dropsLines = fieldKey === 'quantity' && targets.some((it) => it.measurementLines?.length);
            if (dropsLines && !window.confirm(i18next.t('grid:measurement.replaceConfirm'))) break;
            pushHistory(items, `Clear ${col.key}`);
            for (const it of targets) {
              // Zoals typen in de Prijs-kolom (useGridEditing): een geïmporteerd
              // materiaal-/loonbedrag van de post gaat mee, anders blijft de prijs staan.
              if (ownPostPrice(it)) {
                if (it.materialPrice != null) updateItem(it.id, 'materialPrice', null);
                if (it.laborPrice != null) updateItem(it.id, 'laborPrice', null);
              }
              updateItem(it.id, fieldKey, clearedValue);
            }
          }
          break;
        }
        default:
          // Niet doortypen in een verborgen kolom (de cursor stond erop toen hij werd verborgen).
          if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && columns[activeCol]?.editable && colVisible(activeCol) && visibleItems) {
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
      copyItems, getGridRows, columns, cellSelectionStart, cellSelectionEnd, editIfPossible, gridView, colVisible, visibleIndices, firstVisibleCol, lastVisibleCol]
  );

  return { handleKeyDown };
}
