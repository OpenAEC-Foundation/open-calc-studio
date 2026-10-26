import type { ImportResult } from '../services/importers/types';
export type { ImportResult } from '../services/importers/types';

/** Browser import API: load only the parser needed for the selected file. */
export async function importBudget(data: ArrayBuffer, fileName: string): Promise<ImportResult> {
  const extension = fileName.split('.').pop()?.toLowerCase();
  const text = () => new TextDecoder().decode(data);
  // Some legacy .calc/.mdb files actually contain a native JSON project.
  if (['ocs', 'ifccalc', 'ifcx', 'json'].includes(extension ?? '') ||
      (['calc', 'mdb'].includes(extension ?? '') && text().trimStart().startsWith('{'))) {
    const { deserializeProject } = await import('../services/file/fileService');
    const project = deserializeProject(text());
    return { schedule: project.schedule, items: project.items, companyInfo: project.companyInfo, warnings: [], format: 'ocs' };
  }
  switch (extension) {
    case 'xpwe': case 'xc4': case 'xml':
      return (await import('../services/exchange/xmlBudget')).importXmlBudget(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(data), fileName);
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
      const { parseCsv, parseXlsxTabular, autoDetectMapping, buildFromMapping } = await import('../services/importers/genericTabularImporter');
      const table = extension === 'csv' ? parseCsv(text(), fileName) : parseXlsxTabular(data, fileName);
      return buildFromMapping(table, autoDetectMapping(table.headers));
    }
    case 'rsx': return (await import('../services/importers/rsxImporter')).importRsx(text());
    case 'cuf': return (await import('../services/importers/cufImporter')).importCuf(text());
    default: throw new Error(`Unsupported budget format: ${extension || '(none)'}`);
  }
}
