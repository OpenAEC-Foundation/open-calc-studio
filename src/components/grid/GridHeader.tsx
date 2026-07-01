import React, { useCallback, useRef, useState } from 'react';
import { ROW_HEIGHT, getColumnsForView, isColumnHidden } from './gridConstants';
import { useAppStore } from '@/state/appStore';
import { ColumnHeaderMenu } from './ColumnHeaderMenu';
import type { GridColumn } from '@/types/costModel';

export const GridHeader: React.FC = () => {
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
  const resizing = useRef<{ index: number; startX: number; startWidth: number } | null>(null);

  const branchesEnabled = useAppStore((s) => s.schedule.branchesEnabled ?? false);
  const columns = getColumnsForView(gridView, branchesEnabled);

  const [menu, setMenu] = useState<{ x: number; y: number; column: GridColumn } | null>(null);

  // A column is collapsed to width 0 when hidden via the menu, or (legacy) the
  // hoeveelheid toggle is off.
  const isHidden = useCallback(
    (col: GridColumn) =>
      (col.key === 'hoeveelheid' && !showHoeveelheid) || isColumnHidden(hiddenColumns, gridView, col.key),
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
        document.documentElement.classList.remove('cursor-col-resizing');
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.documentElement.classList.add('cursor-col-resizing');
    },
    [columnWidths, setColumnWidth, columns]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, col: GridColumn) => {
      e.preventDefault();
      setMenu({ x: e.clientX, y: e.clientY, column: col });
    },
    []
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
            className="grid-header-cell"
            style={{ width: hidden ? 0 : (columnWidths[i] ?? col.width), height: headerHeight, overflow: 'hidden', position: 'relative' }}
            title={col.tooltip}
            onContextMenu={(e) => handleContextMenu(e, col)}
          >
            {showRestoreLeft && prevCol && (
              <div
                className="grid-header-hidden-indicator"
                title={`Verborgen kolom “${prevCol.label}” tonen`}
                onClick={(e) => { e.stopPropagation(); setColumnHidden(gridView, prevCol.key, false); }}
              />
            )}
            <span className="grid-header-label">{col.label}</span>
            {col.abbr && <span className="grid-header-abbr">({col.abbr})</span>}
            <div
              className="grid-header-resize"
              onMouseDown={(e) => handleMouseDown(e, i)}
            />
          </div>
        );
      })}
      {menu && (
        <ColumnHeaderMenu
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
