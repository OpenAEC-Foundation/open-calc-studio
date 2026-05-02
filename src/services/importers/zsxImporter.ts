import { parseXml, getText, getNumber, children, normalizeUnit } from './xmlHelpers';
import type { ResourceLibraryItem, ResourceType } from '@/types/costModel';

export interface ZsxImportResult {
  resources: ResourceLibraryItem[];
  warnings: string[];
}

function mapType(raw: string): ResourceType {
  const t = raw.toLowerCase().trim();
  if (t === 'arbeid') return 'arbeid';
  if (t === 'materiaal') return 'materiaal';
  if (t === 'materieel') return 'materieel';
  if (t === 'onderaanneming' || t === 'onderaannemer') return 'onderaannemer';
  return 'overig';
}

let idCounter = 0;
function genId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `zsx-${Date.now()}-${++idCounter}`;
}

/**
 * ZSX prijzenbestand importer.
 * Reads a CROW/Dutch-industry style price list XML and returns
 * a list of ResourceLibraryItem entries suitable for the resource library.
 */
export function importZsx(xml: string): ZsxImportResult {
  const doc = parseXml(xml);
  const root = doc.documentElement;
  const warnings: string[] = [];
  const resources: ResourceLibraryItem[] = [];

  if (!root) {
    warnings.push('ZSX document heeft geen root element.');
    return { resources, warnings };
  }

  const middelen = children(root, 'Middel');
  if (middelen.length === 0) {
    warnings.push('ZSX bevat geen <Middel> elementen.');
  }

  middelen.forEach((m) => {
    const code = m.getAttribute('code') ?? '';
    const naam =
      m.getAttribute('naam') ??
      m.getAttribute('omschrijving') ??
      getText(m, 'Naam') ??
      getText(m, 'Omschrijving') ??
      '';
    const typeAttr = m.getAttribute('type') ?? getText(m, 'Type') ?? '';
    const resourceType = mapType(typeAttr);
    const unit = normalizeUnit(getText(m, 'Eenheid'));
    const price = getNumber(m, 'Prijs');

    resources.push({
      id: genId(),
      code,
      description: naam,
      unit,
      resourceType,
      defaultUnitPrice: Number.isFinite(price) ? price : null,
      category: m.getAttribute('categorie') ?? '',
    });
  });

  return { resources, warnings };
}

/**
 * Convenience alias mirroring the task-spec contract — each item exposes a
 * `unitPrice` and `name` field in addition to the slice-native shape.
 */
export interface ZsxResource extends ResourceLibraryItem {
  readonly name: string;
  readonly unitPrice: number | null;
}

export function toZsxResource(item: ResourceLibraryItem): ZsxResource {
  return Object.assign({}, item, {
    name: item.description,
    unitPrice: item.defaultUnitPrice,
  });
}
