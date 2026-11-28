import type { ImportResult } from '../services/importers/types';
import { isIfcxExchangeJson } from '../services/importers/ifcxDetection';
export type { ImportResult } from '../services/importers/types';

/** Naam van het wortelelement, na de XML-declaratie, commentaar en doctype. */
function xmlRootName(xml: string): string | null {
  return /^\uFEFF?\s*(?:<\?[\s\S]*?\?>\s*|<!--[\s\S]*?-->\s*|<!DOCTYPE[^>]*>\s*)*<([A-Za-z_][\w.:-]*)/.exec(xml)?.[1] ?? null;
}

/** Browser import API: load only the parser needed for the selected file. */
export async function importBudget(data: ArrayBuffer, fileName: string): Promise<ImportResult> {
  const extension = fileName.split('.').pop()?.toLowerCase();
  if (['xls', 'xlsx', 'csv'].includes(extension ?? '') && typeof document !== 'undefined' && typeof Worker !== 'undefined') {
    return (await import('../services/importers/importWorkerClient')).runImportWorker<ImportResult>('budget', data, fileName);
  }
  const text = () => new TextDecoder().decode(data);
  if (['ifcx', 'json'].includes(extension ?? '') && isIfcxExchangeJson(text())) {
    return (await import('../services/importers/ifcxImporter')).importIfcx(text());
  }
  // Some legacy .calc/.mdb files actually contain a native JSON project.
  if (['ocs', 'ifccalc', 'ifcx', 'json'].includes(extension ?? '') ||
      (['calc', 'mdb'].includes(extension ?? '') && text().trimStart().startsWith('{'))) {
    const { deserializeProject } = await import('../services/file/fileService');
    const project = deserializeProject(text());
    return { schedule: project.schedule, items: project.items, companyInfo: project.companyInfo, warnings: [], format: 'ocs' };
  }
  switch (extension) {
    case 'xpwe': case 'xc4': case 'xml': {
      const xml = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(data);
      // De TRADXML-export is ook .xml, met <Begroting> als wortel (knownbug 112).
      if (extension === 'xml' && xmlRootName(xml) === 'Begroting') return (await import('../services/importers/tradxmlImporter')).importTradxml(xml);
      return (await import('../services/exchange/xmlBudget')).importXmlBudget(xml, fileName);
    }
    case 'bc3': return (await import('../services/importers/bc3Importer')).importBc3File(data);
    case 'onlv': case 'onlb': return (await import('../services/importers/onlvImporter')).importOnlvFile(data);
    case 'x81': case 'x82': case 'x83': case 'x84': case 'x86': case 'x87':
      return (await import('../services/importers/gaebImporter')).importGaeb(text());
    case 'dnc': return { ...await (await import('../services/importers/dncImporter')).importDncFile(data, fileName), format: 'dnc' };
    case 'xtb': return { ...await (await import('../services/importers/xtbImporter')).importXtbFile(data), format: 'xtb' };
    case 'xls': return { ...(await import('../services/importers/bascalcImporter')).importBasCalcFile(data), warnings: [], format: 'bascalc' };
    case 'calc': case 'mdb': {
      (await import('./browserBuffer')).installBuffer();
      return { ...(await import('../services/importers/wpcalcImporter')).importWpCalcFile(data), warnings: [], format: 'wpcalc' };
    }
    case 'csv': case 'xlsx': {
      const { decodeCsvText, parseCsv, parseXlsxTabular, autoDetectMapping, buildFromMapping } = await import('../services/importers/genericTabularImporter');
      const table = extension === 'csv' ? parseCsv(decodeCsvText(data), fileName) : parseXlsxTabular(data, fileName);
      return buildFromMapping(table, autoDetectMapping(table.headers));
    }
    case 'rsx': return (await import('../services/importers/rsxImporter')).importRsx(text());
    case 'cuf': return (await import('../services/importers/cufImporter')).importCuf(text());
    default: throw new Error(`Unsupported budget format: ${extension || '(none)'}`);
  }
}
