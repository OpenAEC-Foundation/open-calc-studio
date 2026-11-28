import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '@/state/appStore';
import { setNumberFormatPreference } from '@/utils/formatting';

// knownbugs 49, 52, 276: een celwaarde zetten houdt de opmaak, en MCP
// set_cells_batch volgt hetzelfde pad als set_cell.
let mutationHandler: ((event: { payload: unknown }) => void) | null = null;
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (_name: string, cb: (event: { payload: unknown }) => void) => {
    mutationHandler = cb;
    return () => {};
  }),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => undefined) }));
// Only the main window runs the MCP bridge (knownbug 186).
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ label: 'main' }) }));

const initial = useAppStore.getState();
let sheetId = '';
const cell = (ref: string) => useAppStore.getState().subSheets.find((s) => s.id === sheetId)!.cells[ref];

beforeEach(() => {
  useAppStore.setState(initial, true);
  sheetId = useAppStore.getState().addSubSheet('Cellen');
});
afterEach(() => setNumberFormatPreference(null));

describe('opmaak blijft bij een nieuwe waarde (knownbug 49)', () => {
  it('houdt vet, valutanotatie, decimalen en randen bij typen en leegmaken', () => {
    const s = useAppStore.getState();
    s.setSubSheetCell(sheetId, 'A1', '12');
    s.toggleSubSheetCellBold(sheetId, 'A1');
    s.setSubSheetCellFormat(sheetId, 'A1', 'currency');
    s.setSubSheetCellDecimals(sheetId, 'A1', 3);
    s.setSubSheetCellBorders(sheetId, 'A1', { top: { style: 'solid', width: 1, color: '#000000' } });

    s.setSubSheetCell(sheetId, 'A1', '15');
    expect(cell('A1')).toMatchObject({ value: '15', computed: 15, bold: true, format: 'currency', decimals: 3 });
    expect(cell('A1').borders?.top?.style).toBe('solid');

    // Delete, Knippen en Wissen in de editor schrijven allemaal een lege waarde.
    s.setSubSheetCell(sheetId, 'A1', '');
    expect(cell('A1')).toMatchObject({ value: '', bold: true, format: 'currency', decimals: 3 });
    expect(cell('A1').computed).toBeUndefined();
  });

  it('houdt de opmaak van een formulecel', () => {
    const s = useAppStore.getState();
    s.setSubSheetCell(sheetId, 'A1', '2');
    s.setSubSheetCell(sheetId, 'B1', '=A1*2');
    s.toggleSubSheetCellItalic(sheetId, 'B1');
    s.setSubSheetCell(sheetId, 'B1', '=A1*3');
    expect(cell('B1')).toMatchObject({ value: '=A1*3', computed: 6, italic: true });
  });
});

describe('MCP set_cells_batch (knownbugs 52, 276)', () => {
  const batch = async (cells: Array<{ ref: string; value: string }>) => {
    const { initMcpBridge } = await import('@/services/mcp/mcpBridge');
    const stop = await initMcpBridge();
    mutationHandler!({ payload: { action: 'set_cells_batch', data: { sheetId, cells } } });
    stop();
  };

  it('berekent formules en leest getallen in de notatie van de app', async () => {
    setNumberFormatPreference('en-US');
    await batch([
      { ref: 'A1', value: '6.66' },
      { ref: 'A2', value: '=A1*2' },
      { ref: 'A3', value: '1,250' },
    ]);
    expect(cell('A1').computed).toBe(6.66);
    expect(cell('A2').computed).toBeCloseTo(13.32, 10);
    expect(cell('A3').computed).toBe(1250);
  });

  it('houdt de opmaak en maakt het in één stap ongedaan', async () => {
    const s = useAppStore.getState();
    s.setSubSheetCell(sheetId, 'A1', '1');
    s.toggleSubSheetCellBold(sheetId, 'A1');
    const undoBefore = useAppStore.getState().spreadsheetUndo.length;
    await batch([
      { ref: 'A1', value: '5' },
      { ref: 'B1', value: '=A1+1' },
    ]);
    expect(cell('A1')).toMatchObject({ value: '5', computed: 5, bold: true });
    expect(cell('B1').computed).toBe(6);
    expect(useAppStore.getState().spreadsheetUndo.length).toBe(undoBefore + 1);
  });
});
