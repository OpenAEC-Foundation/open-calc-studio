import { getHostRoot, toHostCoords } from '@/lib/hostRoot';
import React, { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ROW_HEIGHT, getColumnsForView, hiddenByQuantityToggle, isColumnHidden } from './gridConstants';
import { useAppStore } from '@/state/appStore';
import { ColumnHeaderMenu } from './ColumnHeaderMenu';
import type { GridColumn } from '@/types/costModel';
import { getGridCellDisplayValue } from '@/services/clipboard/excelClipboard';

export const GridHeader: React.FC = () => {
  // useTranslation zorgt óók voor een herrender bij taalwissel, zodat
  // getColumnsForView de labels in de nieuwe taal oplost.
  const { t } = useTranslation('grid');
  const gridView = useAppStore((s) => s.gridView);
  const columnWidths = useAppStore((s) =>
    s.gridView === 'wpcalc' ? s.wpcalcColumnWidths
    : s.gridView === 'inschrijfstaat' ? s.inschrijfstaatColumnWidths
    : s.columnWidths
  );
  const setColumnWidth = useAppStore((s) => s.setColumnWidth);
  const showHoeveelheid = useAppStore((s) => s.showHoeveelheid);
  const hiddenColumns = useAppStore((s) => s.hiddenColumns);
  const setColumnHidden = useAppStore((s) => s.setColumnHidden);
  const selectedColumns = useAppStore((s) => s.selectedColumns);
  const selectColumn = useAppStore((s) => s.selectColumn);
  const resizing = useRef<{ index: number; startX: number; startWidth: number } | null>(null);

  const branchesEnabled = useAppStore((s) => s.schedule.branchesEnabled ?? false);
  const columns = getColumnsForView(gridView, branchesEnabled);

  const [menu, setMenu] = useState<{ x: number; y: number; column: GridColumn } | null>(null);

  // A column is collapsed to width 0 when hidden via the menu, or (legacy) the
  // hoeveelheid toggle is off.
  const isHidden = useCallback(
    (col: GridColumn) =>
      hiddenByQuantityToggle(col.key, gridView, showHoeveelheid) || isColumnHidden(hiddenColumns, gridView, col.key),
    [showHoeveelheid, hiddenColumns, gridView]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, index: number) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = columnWidths[index] ?? columns[index].width;
      resizing.current = { index, startX, startWidth };

      const handleMouseMove = (me: MouseEvent) => {
        if (!resizing.current) return;
        const diff = me.clientX - resizing.current.startX;
        setColumnWidth(resizing.current.index, resizing.current.startWidth + diff);
      };

      const handleMouseUp = () => {
        resizing.current = null;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        getHostRoot().classList.remove('cursor-col-resizing');
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      getHostRoot().classList.add('cursor-col-resizing');
    },
    [columnWidths, setColumnWidth, columns]
  );

  /** Dubbelklik op het sleepbalkje: de kolom zo breed als de breedste tekst erin, zoals in Excel. */
  const autoFitColumn = useCallback((index: number) => {
    const col = columns[index];
    const ctx = document.createElement('canvas').getContext('2d');
    if (!col || !ctx) return;
    const sample = getHostRoot().querySelector('.grid-cell') ?? getHostRoot();
    const cs = getComputedStyle(sample);
    const isDesc = col.key === 'description';
    let widest = 0;
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    for (const item of useAppStore.getState().getGridRows()) {
      const text = getGridCellDisplayValue(item, col.key);
      if (!text) continue;
      // Omschrijving: inspringing per niveau plus ruimte voor de inklapknop.
      const indent = isDesc ? (item.depth ?? 0) * 16 + 4 + 18 : 0;
      for (const line of text.split('\n')) widest = Math.max(widest, ctx.measureText(line).width + indent);
    }
    ctx.font = `600 ${cs.fontSize} ${cs.fontFamily}`;
    widest = Math.max(widest, ctx.measureText(col.abbr ? `${col.label} (${col.abbr})` : col.label).width);
    const padding = 4 + 4 + 2; // celopvulling links en rechts, plus de rand
    setColumnWidth(index, Math.min(600, Math.ceil(widest + padding)));
  }, [columns, setColumnWidth]);

  const zichtbareKeys = columns.filter((c) => !isHidden(c)).map((c) => c.key);

  const handleHeaderClick = useCallback(
    (e: React.MouseEvent, col: GridColumn) => {
      const mode = (e.ctrlKey || e.metaKey) ? 'toggle' : e.shiftKey ? 'range' : 'set';
      selectColumn(col.key, mode, zichtbareKeys);
    },
    [selectColumn, zichtbareKeys]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, col: GridColumn) => {
      e.preventDefault();
      // Rechtsklik buiten de selectie verplaatst de selectie naar die kolom —
      // zo werkt het menu altijd op wat je op dat moment ziet oplichten.
      if (!selectedColumns.includes(col.key)) {
        selectColumn(col.key, 'set', zichtbareKeys);
      }
      setMenu({ ...toHostCoords(e.clientX, e.clientY), column: col });
    },
    [selectedColumns, selectColumn, zichtbareKeys]
  );

  const headerHeight = ROW_HEIGHT * 2;
  const headerWidth = columns.reduce((s, col, i) => {
    if (isHidden(col)) return s;
    return s + (columnWidths[i] ?? col.width);
  }, 0);
  return (
    <div className="grid-header" style={{ height: headerHeight, width: headerWidth, minWidth: headerWidth }}>
      {columns.map((col, i) => {
        const hidden = isHidden(col);
        // Show a thin indicator on the next visible column when the column
        // immediately before it is hidden, so the user can restore it.
        const prevCol = i > 0 ? columns[i - 1] : null;
        const showRestoreLeft = !hidden && prevCol != null && isHidden(prevCol);
        return (
          <div
            key={col.key}
            className={`grid-header-cell${selectedColumns.includes(col.key) ? ' is-selected' : ''}`}
            style={{ width: hidden ? 0 : (columnWidths[i] ?? col.width), padding: hidden ? 0 : undefined, borderRightWidth: hidden ? 0 : undefined, height: headerHeight, overflow: 'hidden', position: 'relative' }}
            title={col.tooltip}
            onClick={(e) => handleHeaderClick(e, col)}
            onContextMenu={(e) => handleContextMenu(e, col)}
          >
            {showRestoreLeft && prevCol && (
              <button
                type="button"
                className="grid-header-hidden-indicator"
                aria-label={t('columnMenu.showHidden', { name: prevCol.label })}
                title={t('columnMenu.showHidden', { name: prevCol.label })}
                onClick={(e) => {
                  e.stopPropagation();
                  // Verborgen met de lintknop Hoeveelheid: die knop weer aanzetten, anders komt de kolom niet terug.
                  if (hiddenByQuantityToggle(prevCol.key, gridView, showHoeveelheid)) useAppStore.getState().toggleHoeveelheid();
                  else setColumnHidden(gridView, prevCol.key, false);
                }}
              />
            )}
            <span className="grid-header-label">{col.label}</span>
            {col.abbr && <span className="grid-header-abbr">({col.abbr})</span>}
            <div
              className="grid-header-resize"
              onMouseDown={(e) => handleMouseDown(e, i)}
              onDoubleClick={(e) => { e.stopPropagation(); autoFitColumn(i); }}
            />
          </div>
        );
      })}
      {menu && (
        <ColumnHeaderMenu
          selectedColumns={selectedColumns}
          x={menu.x}
          y={menu.y}
          column={menu.column}
          columns={columns}
          gridView={gridView}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
};
