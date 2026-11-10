import { beforeEach, expect, it } from 'vitest';
import { useAppStore } from '@/state/appStore';

// knownbugs 121: sub-spreadsheet undo history per tab, and undo/redo marks the document modified.
const initial = useAppStore.getState();
const cell = (ref: string) => useAppStore.getState().subSheets[0]?.cells[ref]?.value;
const doc = (id: string) => useAppStore.getState().documents.find(d => d.id === id)!;

let sheet = '';
beforeEach(() => {
  useAppStore.setState(initial, true);
  const s = useAppStore.getState();
  s.addDocument({ id: 'a', fileName: 'A' });
  sheet = useAppStore.getState().addSubSheet('Sheet');
  useAppStore.getState().setSubSheetCell(sheet, 'A1', '1');
  useAppStore.getState().setSubSheetCell(sheet, 'A1', '2');
  useAppStore.getState().addDocument({ id: 'b', fileName: 'B' });
});

it('keeps the sheet undo history of a tab when switching away and back', () => {
  expect(useAppStore.getState().spreadsheetUndo).toEqual([]);
  useAppStore.getState().setActiveDocument('a');
  expect(cell('A1')).toBe('2');
  useAppStore.getState().undoSpreadsheet();
  expect(cell('A1')).toBe('1');
  useAppStore.getState().setActiveDocument('b');
  useAppStore.getState().setActiveDocument('a');
  useAppStore.getState().redoSpreadsheet();
  expect(cell('A1')).toBe('2');
});

it('keeps the active tab history when a background tab is closed', () => {
  useAppStore.getState().setActiveDocument('a');
  useAppStore.getState().removeDocument('b');
  expect(useAppStore.getState().activeDocumentId).toBe('a');
  useAppStore.getState().undoSpreadsheet();
  expect(cell('A1')).toBe('1');
});

it('marks the document modified on sheet undo and redo', () => {
  useAppStore.getState().setActiveDocument('a');
  useAppStore.getState().updateDocument('a', { isModified: false });
  useAppStore.getState().undoSpreadsheet();
  expect(doc('a').isModified).toBe(true);
  useAppStore.getState().updateDocument('a', { isModified: false });
  useAppStore.getState().redoSpreadsheet();
  expect(doc('a').isModified).toBe(true);
  expect(doc('b').isModified).toBe(false);
});
