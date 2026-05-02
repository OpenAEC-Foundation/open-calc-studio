import React from 'react';
import { useTranslation } from 'react-i18next';
import { GridCell } from './GridCell';
import type { CostItem, GridColumn } from '@/types/costModel';

export type DropPosition = 'before' | 'after' | 'inside';

interface Props {
  item: CostItem;
  rowIndex: number;
  activeRow: number;
  activeCol: number;
  isSelected: boolean;
  hideTotal: boolean;
  isChapterFooter?: boolean;
  rowHeight: number;
  columns: GridColumn[];
  columnWidths: number[];
  resourceTotals?: Record<string, number>;
  cellSelectionMinRow?: number;
  cellSelectionMaxRow?: number;
  cellSelectionMinCol?: number;
  cellSelectionMaxCol?: number;
  dropHintPosition?: DropPosition | null;
  isDragging?: boolean;
  onCellClick: (row: number, col: number, shiftKey: boolean) => void;
  onCellDoubleClick: (row: number, col: number) => void;
  onCellMouseDown: (row: number, col: number, shiftKey: boolean) => void;
  onCellMouseEnter: (row: number, col: number) => void;
  onToggleCollapse: (id: string) => void;
  onAddRow: (rowIndex: number) => void;
  onDragStartRow?: (e: React.DragEvent, rowIndex: number, itemId: string) => void;
  onDragOverRow?: (e: React.DragEvent, rowIndex: number, itemId: string, rowType: CostItem['rowType']) => void;
  onDragLeaveRow?: (e: React.DragEvent, rowIndex: number) => void;
  onDropRow?: (e: React.DragEvent, rowIndex: number, itemId: string) => void;
  onDragEndRow?: (e: React.DragEvent) => void;
}

export const GridRow: React.FC<Props> = React.memo(
  ({ item, rowIndex, activeRow, activeCol, isSelected, hideTotal, isChapterFooter, rowHeight, columns, columnWidths, resourceTotals, cellSelectionMinRow, cellSelectionMaxRow, cellSelectionMinCol, cellSelectionMaxCol, dropHintPosition, isDragging, onCellClick, onCellDoubleClick, onCellMouseDown, onCellMouseEnter, onToggleCollapse, onAddRow, onDragStartRow, onDragOverRow, onDragLeaveRow, onDropRow, onDragEndRow }) => {
    const { t } = useTranslation();
    const isActiveRow = rowIndex === activeRow;

    const rowWidth = columnWidths.reduce((s, w, i) => s + (w ?? columns[i]?.width ?? 0), 0);
    let className = 'grid-row';
    if (isChapterFooter) className += ' chapter-footer';
    else if (item.rowType === 'chapter') className += ' chapter';
    else if (item.rowType === 'bewakingspost') className += ' bewakingspost';
    else if (item.rowType === 'regel') className += ' regel';
    else if (item.rowType === 'tekstregel') className += ' tekstregel';
    else if (item.rowType === 'witregel') className += ' witregel';
    if (isActiveRow) className += ' grid-row-active';
    if (isSelected) className += ' grid-row-selected';
    if (isDragging) className += ' dragging';
    if (dropHintPosition === 'before') className += ' drop-before';
    else if (dropHintPosition === 'after') className += ' drop-after';
    else if (dropHintPosition === 'inside') className += ' drop-inside';

    const canDrag = !isChapterFooter && !item.id.startsWith('footer:');

    return (
      <div
        className={className}
        data-row-index={rowIndex}
        style={{ height: rowHeight, position: 'relative', width: rowWidth, minWidth: rowWidth }}
        onDragOver={canDrag && onDragOverRow ? (e) => onDragOverRow(e, rowIndex, item.id, item.rowType) : undefined}
        onDragLeave={canDrag && onDragLeaveRow ? (e) => onDragLeaveRow(e, rowIndex) : undefined}
        onDrop={canDrag && onDropRow ? (e) => onDropRow(e, rowIndex, item.id) : undefined}
      >
        {canDrag && onDragStartRow && (
          <div
            className="grid-row-drag-handle"
            draggable
            onDragStart={(e) => onDragStartRow(e, rowIndex, item.id)}
            onDragEnd={onDragEndRow}
            title="Drag to reorder"
          />
        )}
        {columns.map((col, colIndex) => {
          const isCellInSelection = cellSelectionMinRow != null && cellSelectionMaxRow != null &&
            cellSelectionMinCol != null && cellSelectionMaxCol != null &&
            rowIndex >= cellSelectionMinRow && rowIndex <= cellSelectionMaxRow &&
            colIndex >= cellSelectionMinCol && colIndex <= cellSelectionMaxCol;
          return (
            <div
              key={col.key}
              onClick={(e) => onCellClick(rowIndex, colIndex, e.shiftKey)}
              onDoubleClick={() => onCellDoubleClick(rowIndex, colIndex)}
              onMouseDown={(e) => { if (e.button === 0) onCellMouseDown(rowIndex, colIndex, e.shiftKey); }}
              onMouseEnter={() => onCellMouseEnter(rowIndex, colIndex)}
              style={{ cursor: 'default', width: columnWidths[colIndex] ?? col.width, flexShrink: 0, display: 'flex' }}
            >
              <GridCell
                item={item}
                column={col}
                colWidth={columnWidths[colIndex] ?? col.width}
                rowIndex={rowIndex}
                isActive={isActiveRow && colIndex === activeCol}
                isCellSelected={isCellInSelection}
                hideTotal={hideTotal}
                isChapterFooter={isChapterFooter}
                resourceTotals={resourceTotals}
                onToggleCollapse={col.key === 'description' ? () => onToggleCollapse(item.id) : undefined}
              />
            </div>
          );
        })}
        <button
          className="grid-row-add-btn"
          title={t('addRow')}
          onClick={(e) => { e.stopPropagation(); onAddRow(rowIndex); }}
        >+</button>
      </div>
    );
  },
  (prev, next) =>
    prev.item === next.item &&
    prev.rowIndex === next.rowIndex &&
    prev.activeRow === next.activeRow &&
    prev.activeCol === next.activeCol &&
    prev.isSelected === next.isSelected &&
    prev.hideTotal === next.hideTotal &&
    prev.isChapterFooter === next.isChapterFooter &&
    prev.rowHeight === next.rowHeight &&
    prev.columns === next.columns &&
    prev.columnWidths === next.columnWidths &&
    prev.resourceTotals === next.resourceTotals &&
    prev.cellSelectionMinRow === next.cellSelectionMinRow &&
    prev.cellSelectionMaxRow === next.cellSelectionMaxRow &&
    prev.cellSelectionMinCol === next.cellSelectionMinCol &&
    prev.cellSelectionMaxCol === next.cellSelectionMaxCol &&
    prev.dropHintPosition === next.dropHintPosition &&
    prev.isDragging === next.isDragging &&
    prev.onAddRow === next.onAddRow
);

GridRow.displayName = 'GridRow';
