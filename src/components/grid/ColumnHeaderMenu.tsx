import React, { useEffect, useRef } from 'react';
import type { GridColumn } from '@/types/costModel';
import { useAppStore } from '@/state/appStore';
import { isColumnHideable, isColumnHidden } from './gridConstants';

interface Props {
  x: number;
  y: number;
  /** The column that was right-clicked (used for the "Verberg kolom" action). */
  column: GridColumn;
  /** All columns of the current view (for the toggle checkbox list). */
  columns: GridColumn[];
  gridView: string;
  onClose: () => void;
}

export const ColumnHeaderMenu: React.FC<Props> = ({ x, y, column, columns, gridView, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const hiddenColumns = useAppStore((s) => s.hiddenColumns);
  const toggleColumnHidden = useAppStore((s) => s.toggleColumnHidden);
  const setColumnHidden = useAppStore((s) => s.setColumnHidden);
  const showAllColumns = useAppStore((s) => s.showAllColumns);

  // Close on outside click / Escape
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Keep menu within the viewport
  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    if (rect.right > window.innerWidth) menuRef.current.style.left = `${x - rect.width}px`;
    if (rect.bottom > window.innerHeight) menuRef.current.style.top = `${y - rect.height}px`;
  }, [x, y]);

  // Columns the user is allowed to toggle
  const toggleable = columns.filter((c) => isColumnHideable(c.key));
  const anyHidden = toggleable.some((c) => isColumnHidden(hiddenColumns, gridView, c.key));

  const canHideClicked = isColumnHideable(column.key);

  return (
    <div ref={menuRef} className="grid-context-menu column-header-menu" style={{ left: x, top: y }}>
      <button
        className="grid-context-menu-item"
        disabled={!canHideClicked}
        onClick={() => {
          if (!canHideClicked) return;
          toggleColumnHidden(gridView, column.key);
          onClose();
        }}
      >
        <span>Verberg kolom “{column.label}”</span>
      </button>

      <div className="grid-context-menu-separator" />

      <div className="column-header-menu-section-title">Kolommen tonen / verbergen</div>
      <div className="column-header-menu-list">
        {toggleable.map((c) => {
          const hidden = isColumnHidden(hiddenColumns, gridView, c.key);
          return (
            <label key={c.key} className="column-header-menu-check">
              <input
                type="checkbox"
                checked={!hidden}
                onChange={() => setColumnHidden(gridView, c.key, hidden ? false : true)}
              />
              <span>{c.label}</span>
            </label>
          );
        })}
      </div>

      <div className="grid-context-menu-separator" />

      <button
        className="grid-context-menu-item"
        disabled={!anyHidden}
        onClick={() => {
          showAllColumns(gridView);
          onClose();
        }}
      >
        <span>Alle kolommen tonen</span>
      </button>
    </div>
  );
};
