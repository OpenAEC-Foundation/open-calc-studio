import { parseXml, getText, getNumberOrDefault, children } from './xmlHelpers';

export interface NormEntry {
  id: string;
  code: string;
  middelCode: string;
  description: string;
  factor: number;
  divisor: number;
  unit: string;
}

export interface NsxImportResult {
  norms: NormEntry[];
  warnings: string[];
}

let idCounter = 0;
function genId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `nsx-${Date.now()}-${++idCounter}`;
}

/**
 * NSX normenbestand importer.
 * Reads a norm-entry XML file (per middel: norm code, factor, divisor, unit)
 * and returns a list of NormEntry reference-table records.
 *
 * There is currently no norms slice in the store, so imported norms are
 * returned to the caller for logging / status display only. Full integration
 * into the resource library is a v0.7.0 follow-up.
 */
export function importNsx(xml: string): NsxImportResult {
  const doc = parseXml(xml);
  const root = doc.documentElement;
  const warnings: string[] = [];
  const norms: NormEntry[] = [];

  if (!root) {
    warnings.push('NSX document heeft geen root element.');
    return { norms, warnings };
  }

  const entries = children(root, 'Norm');
  if (entries.length === 0) {
    warnings.push('NSX bevat geen <Norm> elementen.');
  }

  entries.forEach((n) => {
    norms.push({
      id: genId(),
      code: n.getAttribute('code') ?? '',
      middelCode: n.getAttribute('middelcode') ?? '',
      description: n.getAttribute('omschrijving') ?? '',
      factor: getNumberOrDefault(n, 'Factor', 1),
      divisor: getNumberOrDefault(n, 'Deler', 1),
      unit: getText(n, 'Eenheid'),
    });
  });

  return { norms, warnings };
}
