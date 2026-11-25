import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useAppStore } from '@/state/appStore';
import { SubSheetEditor } from '@/components/grid/SubSheetEditor';

// knownbugs 55, 57: Ctrl+Z/Cmd+Z in een deelspreadsheet maakt alleen een
// bewerking in dát blad ongedaan.
const initial = useAppStore.getState();
let a = '';
let b = '';
const value = (sheetId: string, ref: string) =>
  useAppStore.getState().subSheets.find((s) => s.id === sheetId)!.cells[ref]?.value;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  useAppStore.setState(initial, true);
  const s = useAppStore.getState();
  a = s.addSubSheet('A');
  b = s.addSubSheet('B');
  s.setSubSheetCell(a, 'A1', 'a1');
  s.setSubSheetCell(a, 'A1', 'a2');
  s.setSubSheetCell(b, 'A1', 'b1');
});

describe('stapel per blad (knownbug 55)', () => {
  it('maakt alleen de laatste bewerking van het gekozen blad ongedaan', () => {
    useAppStore.getState().undoSpreadsheet(a);
    expect(value(a, 'A1')).toBe('a1');
    expect(value(b, 'A1')).toBe('b1');

    useAppStore.getState().redoSpreadsheet(a);
    expect(value(a, 'A1')).toBe('a2');
    expect(value(b, 'A1')).toBe('b1');
  });

  it('een bewerking in een ander blad wist de redo van dit blad niet', () => {
    useAppStore.getState().undoSpreadsheet(a);
    useAppStore.getState().setSubSheetCell(b, 'A2', 'x');
    useAppStore.getState().redoSpreadsheet(a);
    expect(value(a, 'A1')).toBe('a2');
  });

  it('veel bewerkingen in blad B duwen de stappen van blad A niet weg', () => {
    for (let n = 0; n < 60; n++) useAppStore.getState().setSubSheetCell(b, 'A1', `b${n}`);
    const steps = (id: string) =>
      useAppStore.getState().spreadsheetUndo.filter((e) => e.sheetId === id).length;
    expect(steps(b)).toBe(50);
    expect(steps(a)).toBe(2);
    useAppStore.getState().undoSpreadsheet(a);
    useAppStore.getState().undoSpreadsheet(a);
    expect(value(a, 'A1')).toBeUndefined();
  });

  it('doet niets als het blad zelf geen geschiedenis heeft', () => {
    const c = useAppStore.getState().addSubSheet('C');
    useAppStore.getState().undoSpreadsheet(c);
    expect(value(a, 'A1')).toBe('a2');
    expect(value(b, 'A1')).toBe('b1');
  });
});

describe('sneltoetsen in de editor (knownbugs 55, 57)', () => {
  let node: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    node = document.createElement('div');
    document.body.append(node);
    root = createRoot(node);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    node.remove();
  });

  const press = async (init: KeyboardEventInit) => {
    const container = node.querySelector<HTMLElement>('.subsheet-container')!;
    container.focus();
    await act(async () => {
      container.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
    });
  };

  it('Ctrl+Z in blad A raakt blad B niet', async () => {
    await act(async () => root.render(<SubSheetEditor sheetId={a} />));
    await press({ key: 'z', ctrlKey: true });
    expect(value(a, 'A1')).toBe('a1');
    expect(value(b, 'A1')).toBe('b1');
  });

  it('Cmd+Z en Cmd+Shift+Z werken op macOS in het blad, niet in de begroting', async () => {
    await act(async () => root.render(<SubSheetEditor sheetId={a} />));
    let bubbled = 0;
    const onWindow = () => { bubbled++; };
    window.addEventListener('keydown', onWindow);
    try {
      await press({ key: 'z', metaKey: true });
      expect(value(a, 'A1')).toBe('a1');
      await press({ key: 'z', metaKey: true, shiftKey: true });
      expect(value(a, 'A1')).toBe('a2');
      expect(bubbled).toBe(0);
    } finally {
      window.removeEventListener('keydown', onWindow);
    }
  });
});
