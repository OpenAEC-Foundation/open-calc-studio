import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import i18next from '@/i18n/config';
import ExcelCellPicker from '@/components/common/ExcelCellPicker';
import { parseExcelFile, pickerCellValue, updateAllExcelLinks } from '@/services/excel/excelLinkService';
import type { CostItem, ExcelLink } from '@/types/costModel';

const files = vi.hoisted(() => new Map<string, Uint8Array>());
vi.mock('@tauri-apps/plugin-fs', () => ({
  readFile: async (path: string) => {
    const bytes = files.get(path);
    if (!bytes) throw Error(`missing ${path}`);
    return bytes;
  },
}));

/** Workbook with one sheet; `cells` maps addresses to values. */
function workbookBytes(cells: Record<string, number | string>): Uint8Array {
  const ws: XLSX.WorkSheet = {};
  const range = { s: { r: Infinity, c: Infinity }, e: { r: 0, c: 0 } };
  for (const [addr, v] of Object.entries(cells)) {
    ws[addr] = { t: typeof v === 'number' ? 'n' : 's', v };
    const { r, c } = XLSX.utils.decode_cell(addr);
    range.s.r = Math.min(range.s.r, r); range.s.c = Math.min(range.s.c, c);
    range.e.r = Math.max(range.e.r, r); range.e.c = Math.max(range.e.c, c);
  }
  ws['!ref'] = XLSX.utils.encode_range(range);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Blad1');
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
}

// Used range B3:D6, B4 = 42.
const OFFSET_SHEET = { B3: 'Item', C3: 'Qty', D6: 'end', B4: 42, C5: 7 };

describe('Excel link service with a sheet that does not start at A1 (knownbugs 79)', () => {
  it('maps picker data back to the real Excel address', async () => {
    const parsed = await parseExcelFile(new File([workbookBytes(OFFSET_SHEET) as BlobPart], 'offset.xlsx'));
    const sheet = parsed.sheets.Blad1;
    expect(sheet.ref).toBe('B3:D6');
    expect(sheet.origin).toEqual({ row: 2, col: 1 });
    expect(sheet.data[1][0]).toBe(42);
    expect(pickerCellValue(sheet, 'B4')).toBe(42);
    expect(pickerCellValue(sheet, 'C5')).toBe(7);
    expect(pickerCellValue(sheet, 'A2')).toBeNull();
  });

  it('refresh reads the stored address', async () => {
    files.set('C:/offset.xlsx', workbookBytes(OFFSET_SHEET));
    const item = { id: 'a', quantity: 1, excelLink: { filePath: 'C:/offset.xlsx', sheet: 'Blad1', cell: 'B4' } } as unknown as CostItem;
    const { updatedItems, errors } = await updateAllExcelLinks([item]);
    expect(errors).toEqual([]);
    expect(updatedItems[0].quantity).toBe(42);
  });
});

describe('ExcelCellPicker', () => {
  let root: Root;
  let node: HTMLDivElement;
  const onSelect = vi.fn<(link: ExcelLink, value: number | null) => void>();
  const onCancel = vi.fn();

  const render = async (open: boolean, initialLink: ExcelLink | null) => {
    await act(async () => {
      root.render(<ExcelCellPicker open={open} initialLink={initialLink} onSelect={onSelect} onCancel={onCancel} />);
    });
    // Let the async file load settle.
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
  };
  const cellWithText = (text: string) =>
    [...node.querySelectorAll<HTMLTableCellElement>('td.excel-picker-cell')].find(td => td.textContent === text)!;
  const clickSelect = async () => {
    const btn = node.querySelector<HTMLButtonElement>('.modal-btn-primary')!;
    await act(async () => { btn.click(); });
  };

  beforeEach(async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18next.changeLanguage('en');
    files.clear();
    onSelect.mockReset();
    node = document.createElement('div');
    document.body.append(node);
    root = createRoot(node);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    node.remove();
  });

  it('stores the clicked cell address on a sheet starting at B3 (knownbugs 79)', async () => {
    files.set('C:/offset.xlsx', workbookBytes(OFFSET_SHEET));
    await render(true, { filePath: 'C:/offset.xlsx', sheet: 'Blad1', cell: 'D6' });
    const headers = [...node.querySelectorAll('th.excel-picker-col-header')].map(th => th.textContent);
    expect(headers).toEqual(['B', 'C', 'D']);
    expect(node.querySelector('td.excel-picker-row-header')!.textContent).toBe('3');
    await act(async () => { cellWithText('42').click(); });
    await clickSelect();
    expect(onSelect).toHaveBeenCalledWith({ filePath: 'C:/offset.xlsx', sheet: 'Blad1', cell: 'B4' }, 42);
  });

  it('does not carry the previous value into the next item (knownbugs 67)', async () => {
    files.set('C:/a.xlsx', workbookBytes({ A1: 42 }));
    files.set('C:/b.xlsx', workbookBytes({ A1: 1, A2: 7 }));

    // Item A: pick the cell with 42.
    await render(true, { filePath: 'C:/a.xlsx', sheet: 'Blad1', cell: 'A1' });
    await act(async () => { cellWithText('42').click(); });
    await clickSelect();
    expect(onSelect).toHaveBeenLastCalledWith({ filePath: 'C:/a.xlsx', sheet: 'Blad1', cell: 'A1' }, 42);

    // Close; the component stays mounted (as in CostGrid).
    await render(false, null);

    // Item B is linked to A2 = 7; press Select straight away.
    await render(true, { filePath: 'C:/b.xlsx', sheet: 'Blad1', cell: 'A2' });
    await clickSelect();
    expect(onSelect).toHaveBeenLastCalledWith({ filePath: 'C:/b.xlsx', sheet: 'Blad1', cell: 'A2' }, 7);
  });

  it('never passes a stale value when the linked file cannot be read', async () => {
    files.set('C:/a.xlsx', workbookBytes({ A1: 42 }));
    await render(true, { filePath: 'C:/a.xlsx', sheet: 'Blad1', cell: 'A1' });
    await act(async () => { cellWithText('42').click(); });
    await render(false, null);

    await render(true, { filePath: 'C:/missing.xlsx', sheet: 'Blad1', cell: 'A1' });
    await clickSelect();
    expect(onSelect).toHaveBeenLastCalledWith({ filePath: 'C:/missing.xlsx', sheet: 'Blad1', cell: 'A1' }, null);
  });
});
