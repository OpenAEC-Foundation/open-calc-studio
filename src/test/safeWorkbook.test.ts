import { expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { readWorkbook, checkWorkbookBytes } from '@/services/importers/safeWorkbook';
import { runImportWorker } from '@/services/importers/importWorkerClient';
it('reads official SheetJS 0.20.3 workbooks and rejects oversized dimensions without truncating them', () => {
  expect(XLSX.version).toBe('0.20.3');
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['code', 'quantity'], ['A', 0]]), 'Budget');
  const data = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  expect(readWorkbook(data, { type: 'array' }).Sheets.Budget.B2.v).toBe(0);
  wb.Sheets.Budget['!ref'] = 'A1:A100001';
  expect(() => readWorkbook(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }), { type: 'array' })).toThrow('100,000 rows');
});
it('rejects an archive that declares an excessive expanded size before parsing', () => {
  const data = new Uint8Array(68), view = new DataView(data.buffer); data.set([0x50, 0x4b]);
  view.setUint32(0, 0x02014b50, true); view.setUint32(20, 1, true); view.setUint32(24, 300 * 1024 * 1024, true);
  view.setUint32(46, 0x06054b50, true); view.setUint16(56, 1, true); view.setUint32(58, 46, true);
  expect(() => checkWorkbookBytes(data)).toThrow('expands');
});
it('terminates a stalled UI import at its deadline', async () => {
  vi.useFakeTimers(); const terminate = vi.fn();
  class WorkerStub { postMessage = vi.fn(); terminate = terminate; onmessage = null; onerror = null; }
  vi.stubGlobal('Worker', WorkerStub);
  try {
    const result = runImportWorker('tabular', new ArrayBuffer(0), 'a.csv');
    const rejected = expect(result).rejects.toThrow('30 seconds');
    await vi.advanceTimersByTimeAsync(30_001); await rejected; expect(terminate).toHaveBeenCalledOnce();
  } finally { vi.unstubAllGlobals(); vi.useRealTimers(); }
});
