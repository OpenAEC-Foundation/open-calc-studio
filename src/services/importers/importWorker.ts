import { importBudget } from '@/lib/importers';
import { parseCsv, parseXlsxTabular } from './genericTabularImporter';
import { importBasCalcFile } from './bascalcImporter';
import { importInschrijfstaatFile } from './inschrijfstaatImporter';

self.onmessage = async (event: MessageEvent<{ kind: string; data: ArrayBuffer; fileName: string }>) => {
  const { kind, data, fileName } = event.data;
  try {
    const result = kind === 'tabular' ? (/\.csv$/i.test(fileName) ? parseCsv(new TextDecoder('utf-8', { fatal: true }).decode(data), fileName) : parseXlsxTabular(data, fileName))
      : kind === 'bascalc' ? importBasCalcFile(data)
      : kind === 'inschrijfstaat' ? await importInschrijfstaatFile(data)
      : await importBudget(data, fileName);
    self.postMessage({ ok: true, result });
  } catch (error) { self.postMessage({ ok: false, error: error instanceof Error ? error.message : 'Import failed.' }); }
};
