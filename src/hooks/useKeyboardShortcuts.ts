import { useEffect } from 'react';
import i18next from 'i18next';
import { useAppStore } from '@/state/appStore';
import { useFileOperations } from './useFileOperations';
import { copyItemsToExcel } from '@/services/clipboard/excelClipboard';
import { selectedGridItems } from '@/services/grid/selectedItems';
import { eventInsideHost } from '@/lib/hostRoot';

/** Get the selected items (multi-select or single active row).
 *  Selectie-indices zijn grid-rij-indices — vertalen via de gerenderde
 *  rijenlijst (getGridRows), anders slaan kopiëren/knippen/verwijderen
 *  de verkeerde items aan zodra er footerrijen in het grid staan. */
function getSelectedItems() {
  const state = useAppStore.getState();
  const gridRows = state.getGridRows();
  const indices = state.getSelectedRowIndices();
  return selectedGridItems(gridRows, indices);
}

export function useKeyboardShortcuts() {
  const {
    insertRegelBelow, undo, redo, setItems, items, pushHistory,
    activeRow, deleteItem, activeCol,
    copyItems, cutItems, pasteItems, clipboardItems,
  } = useAppStore();
  const { newFile, saveFile, saveFileAs, openFile } = useFileOperations();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!eventInsideHost(e)) return;
      const ctrl = e.ctrlKey || e.metaKey;
      const { isEditing } = useAppStore.getState();
      if (e.defaultPrevented) return;
      const target = e.target instanceof Element ? e.target : null;
      const isInInput = !!target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]');
      const inDialog = !!target?.closest('[role="dialog"], [role="alertdialog"], .modal-dialog, .backstage-overlay');
      const inGrid = !!target?.closest('.cost-grid-wrapper') && ['grid', 'viewer3d'].includes(useAppStore.getState().activeContentTab);
      // Text editors own undo and clipboard; dialogs own their keyboard scope.
      if (inDialog || (isInInput && ctrl && ['z', 'y'].includes(e.key.toLowerCase()))) return;

      if (ctrl && e.key === 'z') {
        e.preventDefault();
        const restored = undo();
        if (restored) setItems(restored);
      } else if (ctrl && e.key === 'y') {
        e.preventDefault();
        const restored = redo();
        if (restored) setItems(restored);
      } else if (ctrl && e.key === 'n') {
        e.preventDefault();
        newFile();
      } else if (ctrl && e.shiftKey && (e.key === 'S' || e.key === 's')) {
        e.preventDefault();
        void saveFileAs();
      } else if (ctrl && e.key === 's') {
        e.preventDefault();
        void saveFile();
      } else if (ctrl && e.key === 'o') {
        e.preventDefault();
        void openFile();
      } else if (ctrl && e.key === 'c') {
        if (isEditing || isInInput || !inGrid) return;
        e.preventDefault();
        const selected = getSelectedItems();
        if (selected.length > 0) {
          copyItems(selected);
          // Also put TSV on system clipboard for Excel paste
          copyItemsToExcel(selected);
        }
      } else if (ctrl && e.key === 'x') {
        if (isEditing || isInInput || !inGrid) return;
        e.preventDefault();
        const selected = getSelectedItems();
        if (selected.length > 0) cutItems(selected);
      } else if (ctrl && e.key === 'v') {
        if (isEditing || isInInput || !inGrid) return;
        e.preventDefault();
        pasteItems();
      } else if (ctrl && (e.key === '+' || e.key === '=')) {
        // App-brede zoom, zoals Ctrl+= in een browser
        e.preventDefault();
        useAppStore.getState().stepUiZoom(1);
      } else if (ctrl && (e.key === '-' || e.key === '_')) {
        e.preventDefault();
        useAppStore.getState().stepUiZoom(-1);
      } else if (ctrl && e.key === '0') {
        e.preventDefault();
        useAppStore.getState().setUiZoom(100);
      } else if (ctrl && e.key === 'p') {
        e.preventDefault();
        import('../services/print/printService').then(({ printBudget }) => {
          const { schedule, items } = useAppStore.getState();
          const { reportView } = useAppStore.getState();
          printBudget(schedule, items, reportView);
        });
      } else if (ctrl && e.key === 'Enter' && inGrid && !isInInput) {
        e.preventDefault();
        // Nieuwe regel direct onder het actieve item — op identiteit, en via
        // de gedeelde insertRegelBelow (zelfde gedrag als de +-knop).
        const { activeItemId, items: cur } = useAppStore.getState();
        const activeItem = cur.find((i) => i.id === activeItemId);
        pushHistory(items, i18next.t('history.newRow'));
        insertRegelBelow(activeItem?.id ?? null);
      } else if (e.key === 'Delete' && inGrid && !isEditing && !isInInput) {
        // Delete selected rows
        const selected = getSelectedItems();
        if (selected.length > 0) {
          e.preventDefault();
          pushHistory(items, i18next.t('history.delete'));
          for (let i = selected.length - 1; i >= 0; i--) {
            deleteItem(selected[i].id);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [insertRegelBelow, undo, redo, setItems, items, pushHistory, activeRow, activeCol, deleteItem, newFile, saveFile, saveFileAs, openFile, copyItems, cutItems, pasteItems, clipboardItems]);
}
