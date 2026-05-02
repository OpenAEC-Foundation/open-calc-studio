import React, { useCallback, useRef } from 'react';
import { ROW_HEIGHT, getColumnsForView } from './gridConstants';
import { useAppStore } from '@/state/appStore';

export const GridHeader: React.FC = () => {
  const gridView = useAppStore((s) => s.gridView);
  const columnWidths = useAppStore((s) =>
    s.gridView === 'wpcalc' ? s.wpcalcColumnWidths
    : s.gridView === 'inschrijfstaat' ? s.inschrijfstaatColumnWidths
    : s.columnWidths
  );
  const setColumnWidth = useAppStore((s) => s.setColumnWidth);
  const showHoeveelheid = useAppStore((s) => s.showHoeveelheid);
  const resizing = useRef<{ index: number; startX: number; startWidth: number } | null>(null);

  const columns = getColumnsForView(gridView);

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

  const headerHeight = ROW_HEIGHT * 2;
  const headerWidth = columns.reduce((s, col, i) => {
    if (col.key === 'hoeveelheid' && !showHoeveelheid) return s;
    return s + (columnWidths[i] ?? col.width);
  }, 0);
  return (
    <div className="grid-header" style={{ height: headerHeight, width: headerWidth, minWidth: headerWidth }}>
      {columns.map((col, i) => (
        <div
          key={col.key}
          className="grid-header-cell"
          style={{ width: (col.key === 'hoeveelheid' && !showHoeveelheid) ? 0 : (columnWidths[i] ?? col.width), height: headerHeight, overflow: 'hidden' }}
          title={col.tooltip}
        >
          <span className="grid-header-label">{col.label}</span>
          {col.abbr && <span className="grid-header-abbr">({col.abbr})</span>}
          <div
            className="grid-header-resize"
            onMouseDown={(e) => handleMouseDown(e, i)}
          />
        </div>
      ))}
    </div>
  );
};
