import { checkWorkbookBytes, WORKBOOK_LIMITS } from './safeWorkbook';
let running = 0;
export function runImportWorker<T>(kind: 'tabular' | 'budget' | 'bascalc' | 'inschrijfstaat', data: ArrayBuffer, fileName: string): Promise<T> {
  // Een CSV is tekst, geen ZIP: alleen de grootte controleren, anders wordt
  // een CSV die met "PK" begint als kapotte ZIP geweigerd (knownbug 102).
  if (!/\.csv$/i.test(fileName)) checkWorkbookBytes(new Uint8Array(data));
  else if (data.byteLength > WORKBOOK_LIMITS.bytes) throw Error('Spreadsheet exceeds 64 MiB.');
  if (running >= 4) return Promise.reject(Error('Four imports are already running. Wait for an import to finish.'));
  return new Promise<T>((resolve, reject) => {
    const worker = new Worker(new URL('./importWorker.ts', import.meta.url), { type: 'module' });
    running++;
    let complete = false;
    const finish = (error?: Error, result?: T) => {
      if (complete) return; complete = true; clearTimeout(timer); running--; worker.terminate();
      if (error) reject(error); else resolve(result!);
    };
    const timer = setTimeout(() => finish(Error('Spreadsheet import exceeded 30 seconds. No data was imported.')), 30_000);
    worker.onmessage = event => {
      if (event.data?.ok) return finish(undefined, event.data.result);
      const error = Error(event.data?.error ?? 'Import failed.');
      if (typeof event.data?.errorName === 'string') error.name = event.data.errorName;
      finish(error);
    };
    worker.onerror = () => finish(Error('Spreadsheet import worker failed. No data was imported.'));
    try { worker.postMessage({ kind, data, fileName }); } catch (e) { finish(e instanceof Error ? e : Error('Import failed.')); }
  });
}
