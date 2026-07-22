import { useEffect } from 'react';
import { useAppStore } from '@/state/appStore';
import { useFileOperations } from './useFileOperations';
import { copyItemsToExcel } from '@/services/clipboard/excelClipboard';
import { isFooterRow } from '@/services/grid/gridRows';

/** Get the selected items (multi-select or single active row).
 *  Selectie-indices zijn grid-rij-indices — vertalen via de gerenderde
 *  rijenlijst (getGridRows), anders slaan kopiëren/knippen/verwijderen
 *  de verkeerde items aan zodra er footerrijen in het grid staan. */
function getSelectedItems() {
  const state = useAppStore.getState();
  const gridRows = state.getGridRows();
  const indices = state.getSelectedRowIndices();
  return indices
    .filter((i) => i >= 0 && i < gridRows.length)
    .map((i) => gridRows[i])
    .filter((it) => !isFooterRow(it.id));
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
      const ctrl = e.ctrlKey || e.metaKey;
      const { isEditing } = useAppStore.getState();
      const isInInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;

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
        if (isEditing || isInInput) return;
        e.preventDefault();
        const selected = getSelectedItems();
        if (selected.length > 0) {
          copyItems(selected);
          // Also put TSV on system clipboard for Excel paste
          copyItemsToExcel(selected);
        }
      } else if (ctrl && e.key === 'x') {
        if (isEditing || isInInput) return;
        e.preventDefault();
        const selected = getSelectedItems();
        if (selected.length > 0) cutItems(selected);
      } else if (ctrl && e.key === 'v') {
        if (isEditing || isInInput) return;
        e.preventDefault();
        pasteItems();
      } else if (ctrl && e.key === 'p') {
        e.preventDefault();
        import('../services/print/printService').then(({ printBudget }) => {
          const { schedule, items } = useAppStore.getState();
          const { reportView } = useAppStore.getState();
          printBudget(schedule, items, reportView);
        });
      } else if (ctrl && e.key === 'Enter') {
        e.preventDefault();
        // Nieuwe regel direct onder het actieve item — op identiteit, en via
        // de gedeelde insertRegelBelow (zelfde gedrag als de +-knop).
        const { activeItemId, items: cur } = useAppStore.getState();
        const activeItem = cur.find((i) => i.id === activeItemId);
        pushHistory(items, 'Nieuwe regel');
        insertRegelBelow(activeItem?.id ?? null);
      } else if (e.key === 'Delete' && !isEditing && !isInInput) {
        // Delete selected rows
        const selected = getSelectedItems();
        if (selected.length > 0) {
          e.preventDefault();
          pushHistory(items, 'Verwijderen');
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
