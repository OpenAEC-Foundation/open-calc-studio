import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { GridColumn } from '@/types/costModel';
import { useAppStore } from '@/state/appStore';
import type { GridView } from '@/state/slices/uiSlice';
import { hiddenByQuantityToggle, isColumnHideable, isColumnHidden } from './gridConstants';

interface Props {
  x: number;
  y: number;
  /** The column that was right-clicked (used for the "Verberg kolom" action). */
  column: GridColumn;
  /** All columns of the current view (for the toggle checkbox list). */
  columns: GridColumn[];
  /** Aangeklikte kolomselectie; verbergen werkt op alle geselecteerde kolommen. */
  selectedColumns?: string[];
  gridView: string;
  onClose: () => void;
}

export const ColumnHeaderMenu: React.FC<Props> = ({ x, y, column, columns, selectedColumns = [], gridView, onClose }) => {
  const { t } = useTranslation('grid');
  const menuRef = useRef<HTMLDivElement>(null);
  const hiddenColumns = useAppStore((s) => s.hiddenColumns);
  const setColumnHidden = useAppStore((s) => s.setColumnHidden);
  const showAllColumns = useAppStore((s) => s.showAllColumns);
  // De lintknop Hoeveelheid verbergt dezelfde kolom langs een andere weg; het menu toont en herstelt beide.
  const showHoeveelheid = useAppStore((s) => s.showHoeveelheid);
  const toggleHoeveelheid = useAppStore((s) => s.toggleHoeveelheid);
  const viaRibbon = (key: string) => hiddenByQuantityToggle(key, gridView as GridView, showHoeveelheid);
  const isHidden = (key: string) => isColumnHidden(hiddenColumns, gridView, key) || viaRibbon(key);
  const show = (key: string) => {
    if (viaRibbon(key)) toggleHoeveelheid();
    if (isColumnHidden(hiddenColumns, gridView, key)) setColumnHidden(gridView, key, false);
  };

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
  const anyHidden = toggleable.some((c) => isHidden(c.key));

  // Verbergen werkt op de kolomselectie; is er niets geselecteerd, dan op de
  // aangeklikte kolom. Structurele kolommen (bv. omschrijving) blijven staan.
  const teVerbergen = (selectedColumns.length > 0 ? selectedColumns : [column.key])
    .filter((k) => isColumnHideable(k));
  const meervoud = teVerbergen.length > 1;
  const label = meervoud
    ? t('columnMenu.hideColumns', { count: teVerbergen.length })
    : t('columnMenu.hideColumn', { name: columns.find((c) => c.key === teVerbergen[0])?.label ?? column.label });

  return (
    <div ref={menuRef} className="grid-context-menu column-header-menu" style={{ left: x, top: y }}>
      <button
        className="grid-context-menu-item"
        disabled={teVerbergen.length === 0}
        title={teVerbergen.length === 0 ? t('columnMenu.cannotHide') : undefined}
        onClick={() => {
          if (teVerbergen.length === 0) return;
          for (const key of teVerbergen) setColumnHidden(gridView, key, true);
          onClose();
        }}
      >
        <span>{label}</span>
      </button>

      <div className="grid-context-menu-separator" />

      <div className="column-header-menu-section-title">{t('columnMenu.showHide')}</div>
      <div className="column-header-menu-list">
        {toggleable.map((c) => {
          const hidden = isHidden(c.key);
          return (
            <label key={c.key} className="column-header-menu-check">
              <input
                type="checkbox"
                checked={!hidden}
                onChange={() => (hidden ? show(c.key) : setColumnHidden(gridView, c.key, true))}
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
          if (columns.some((c) => viaRibbon(c.key))) toggleHoeveelheid();
          onClose();
        }}
      >
        <span>{t('columnMenu.showAll')}</span>
      </button>
    </div>
  );
};
