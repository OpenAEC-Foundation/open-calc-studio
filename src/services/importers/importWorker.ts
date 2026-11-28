import { importBudget } from '@/lib/importers';
import { decodeCsvText, parseCsv, parseXlsxTabular } from './genericTabularImporter';
import { importBasCalcFile } from './bascalcImporter';
import { importInschrijfstaatFile } from './inschrijfstaatImporter';

self.onmessage = async (event: MessageEvent<{ kind: string; data: ArrayBuffer; fileName: string }>) => {
  const { kind, data, fileName } = event.data;
  try {
    const result = kind === 'tabular' ? (/\.csv$/i.test(fileName) ? parseCsv(decodeCsvText(data), fileName) : parseXlsxTabular(data, fileName))
      : kind === 'bascalc' ? importBasCalcFile(data)
      : kind === 'inschrijfstaat' ? await importInschrijfstaatFile(data)
      : await importBudget(data, fileName);
    self.postMessage({ ok: true, result });
  } catch (error) {
    // De naam gaat mee, zodat de aanroeper bv. NotBasCalcError kan herkennen.
    self.postMessage({ ok: false, error: error instanceof Error ? error.message : 'Import failed.', errorName: error instanceof Error ? error.name : undefined });
  }
};
