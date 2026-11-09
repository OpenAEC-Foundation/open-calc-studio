import { beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useAppStore } from '@/state/appStore';
import { createDefaultItems } from '@/data/defaultBudget';
import { useQuantityLinkSync } from '@/hooks/useQuantityLinkSync';

// knownbugs #47: dependent sheet formulas must recalculate when a cell changes.
const initial = useAppStore.getState();
let sheetId: string;
const cell = (ref: string) => useAppStore.getState().subSheets.find(s => s.id === sheetId)!.cells[ref];

beforeEach(() => {
  useAppStore.setState(initial, true);
  sheetId = useAppStore.getState().addSubSheet('Recalc');
});

describe('sheet formula recalculation', () => {
  it('updates a chain A1 -> A2 -> A3 when A1 changes', () => {
    const s = useAppStore.getState();
    s.setSubSheetCell(sheetId, 'A1', '1');
    s.setSubSheetCell(sheetId, 'A2', '=A1*2');
    s.setSubSheetCell(sheetId, 'A3', '=A2+1');
    expect(cell('A2').computed).toBe(2);
    expect(cell('A3').computed).toBe(3);
    s.setSubSheetCell(sheetId, 'A1', '10');
    expect(cell('A2').computed).toBe(20);
    expect(cell('A3').computed).toBe(21);
  });

  it('fills in a formula that was entered before the cell it refers to', () => {
    const s = useAppStore.getState();
    s.setSubSheetCell(sheetId, 'B2', '=SUM(B1:B1)*3');
    s.setSubSheetCell(sheetId, 'B1', '4');
    expect(cell('B2').computed).toBe(12);
  });

  it('stops at circular references instead of looping', () => {
    const s = useAppStore.getState();
    s.setSubSheetCell(sheetId, 'C1', '=C2+1');
    s.setSubSheetCell(sheetId, 'C2', '=C1+1');
    s.setSubSheetCell(sheetId, 'C3', '5');
    expect(cell('C1').computed).toBeUndefined();
    expect(cell('C2').computed).toBeUndefined();
    expect(cell('C3').computed).toBe(5);
  });

  it('updates a linked estimate quantity when a cell upstream of the link changes', async () => {
    const s = useAppStore.getState();
    s.addDocument({ id: 'recalc-doc', items: createDefaultItems() });
    const chapter = s.addChapter(null), post = s.addItem(chapter), itemId = s.addRegel(post);
    // Opening a document swaps in its own sheets, so create the sheet afterwards.
    sheetId = s.addSubSheet('Linked');
    s.setSubSheetCell(sheetId, 'A1', '1');
    s.setSubSheetCell(sheetId, 'A2', '=A1*2');
    s.setSubSheetCell(sheetId, 'A3', '=A2+1');
    s.updateItem(itemId, 'quantityLink', { source: 'spreadsheet', sheetId, cellRef: 'A3' });

    function Sync() { useQuantityLinkSync(); return null; }
    const host = document.createElement('div');
    const root = createRoot(host);
    await act(async () => { root.render(<Sync />); });
    const quantity = () => useAppStore.getState().items.find(i => i.id === itemId)!.quantity;
    expect(quantity()).toBe(3);

    await act(async () => { useAppStore.getState().setSubSheetCell(sheetId, 'A1', '10'); });
    expect(quantity()).toBe(21);
    await act(async () => { root.unmount(); });
  });
});
