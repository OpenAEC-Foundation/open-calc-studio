import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import i18next from '@/i18n/config';
import { useAppStore } from '@/state/appStore';
import type { CostItem } from '@/types/costModel';

const files = vi.hoisted(() => new Map<string, Uint8Array>());
vi.mock('@tauri-apps/plugin-fs', () => ({
  readFile: async (path: string) => {
    const bytes = files.get(path);
    if (!bytes) throw Error(`missing ${path}`);
    return bytes;
  },
}));

// HomeTab-test: de verversing blijft hangen tot de test hem loslaat.
const refresh = vi.hoisted(() => ({ hold: null as null | Promise<void> }));
vi.mock('@/services/excel/excelLinkService', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/services/excel/excelLinkService')>();
  return {
    ...real,
    updateAllExcelLinks: async (items: CostItem[]) => {
      const result = await real.updateAllExcelLinks(items);
      if (refresh.hold) await refresh.hold;
      return result;
    },
  };
});

const { updateAllExcelLinks, pickerCellValue, parseExcelFile } = await import('@/services/excel/excelLinkService');
const { default: HomeTab } = await import('@/components/ribbon/HomeTab');

function bookBytes(ws: XLSX.WorkSheet): Uint8Array {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Blad1');
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
}
const linked = (id: string, cell: string, quantity = 1, filePath = 'C:/link.xlsx') =>
  ({ id, quantity, excelLink: { filePath, sheet: 'Blad1', cell } }) as unknown as CostItem;

describe('Excel-koppeling: foutcellen (knownbug 80)', () => {
  it('maakt van #DIV/0! en #N/A geen hoeveelheid', async () => {
    files.set('C:/err.xlsx', bookBytes({ '!ref': 'A1:A2', A1: { t: 'e', v: 0x07, w: '#DIV/0!' }, A2: { t: 'e', v: 0x2a, w: '#N/A' } } as XLSX.WorkSheet));
    const { updatedItems, errors } = await updateAllExcelLinks([linked('a', 'A1', 5, 'C:/err.xlsx'), linked('b', 'A2', 6, 'C:/err.xlsx')]);
    expect(updatedItems.map((i) => i.quantity)).toEqual([5, 6]);
    expect(errors).toEqual([expect.stringContaining('#DIV/0!'), expect.stringContaining('#N/A')]);
  });
});

describe('Excel-koppeling: getallen als tekst (knownbug 83)', () => {
  beforeEach(() => {
    files.set('C:/link.xlsx', bookBytes(XLSX.utils.aoa_to_sheet([['6,5', '1.234,5', '0', '12abc', '7.25']])));
  });

  it('leest Nederlandse decimalen in tekstcellen volledig bij verversen', async () => {
    const { updatedItems, errors } = await updateAllExcelLinks([linked('a', 'A1'), linked('b', 'B1'), linked('c', 'C1'), linked('e', 'E1')]);
    expect(updatedItems.map((i) => i.quantity)).toEqual([6.5, 1234.5, 0, 7.25]);
    expect(errors).toEqual([]);
  });

  it('weigert tekst die geen getal is in plaats van het begin te nemen', async () => {
    const { updatedItems, errors } = await updateAllExcelLinks([linked('d', 'D1', 3)]);
    expect(updatedItems[0].quantity).toBe(3);
    expect(errors).toEqual([expect.stringContaining('D1')]);
  });

  it('de celkiezer toont dezelfde waarde', async () => {
    const parsed = await parseExcelFile(new File([files.get('C:/link.xlsx')! as BlobPart], 'link.xlsx'));
    const sheet = parsed.sheets.Blad1;
    expect(pickerCellValue(sheet, 'A1')).toBe(6.5);
    expect(pickerCellValue(sheet, 'C1')).toBe(0);
    expect(pickerCellValue(sheet, 'D1')).toBeNull();
  });
});

describe('Excel-koppeling verversen in het lint (knownbug 84)', () => {
  let node: HTMLDivElement;
  let root: Root;
  const initial = useAppStore.getState();
  const s = () => useAppStore.getState();

  beforeEach(async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    await i18next.changeLanguage('en');
    useAppStore.setState(initial, true);
    s().addDocument({ id: 'kb-excel', items: [] });
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    files.set('C:/link.xlsx', bookBytes(XLSX.utils.aoa_to_sheet([[42]])));
    node = document.createElement('div'); document.body.append(node); root = createRoot(node);
  });
  afterEach(async () => { refresh.hold = null; await act(async () => root.unmount()); node.remove(); vi.restoreAllMocks(); });

  it('houdt wijzigingen die tijdens een trage verversing zijn gedaan', async () => {
    const chapter = s().addChapter(null);
    const post = s().addItem(chapter);
    s().updateItem(post, 'description', 'Oud');
    s().updateItem(post, 'quantity', 1);
    s().setItems(s().items.map((i) => (i.id === post ? { ...i, excelLink: { filePath: 'C:/link.xlsx', sheet: 'Blad1', cell: 'A1' } } : i)));
    let release!: () => void;
    refresh.hold = new Promise<void>((r) => { release = r; });

    await act(async () => root.render(<HomeTab />));
    const button = [...document.querySelectorAll<HTMLButtonElement>('button')]
      .find((b) => b.textContent?.includes(i18next.t('home.updateExcel', { ns: 'ribbon' })));
    expect(button).toBeTruthy();
    await act(async () => { button!.click(); });
    // Tijdens het lezen past de gebruiker de omschrijving aan.
    s().updateItem(post, 'description', 'Nieuw');
    await act(async () => { release(); await new Promise((r) => setTimeout(r, 0)); });

    const item = s().items.find((i) => i.id === post)!;
    expect(item.quantity).toBe(42);
    expect(item.description).toBe('Nieuw');
  });
});
