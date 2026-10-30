import type { StateCreator } from 'zustand';
import type { ResourceLibraryItem, ResourceType, CostUnit } from '@/types/costModel';
import dutchLibrary from '@/data/nl-price-library.json';

export interface ResourceLibrarySlice {
  resourceLibrary: ResourceLibraryItem[];
  resourcePickerOpen: boolean;
  resourcePickerParentId: string | null;
  setResourceLibrary: (items: ResourceLibraryItem[]) => void;
  loadLibraryFromJson: (json: unknown) => void;
  openResourcePicker: (parentId: string | null) => void;
  closeResourcePicker: () => void;
}

/** Map GWW category name to ResourceType */
function mapCategoryToResourceType(category: string): ResourceType {
  const c = category.toUpperCase();
  if (c.includes('MANUREN') || c.includes('PERSONEEL')) return 'arbeid';
  if (c.includes('MACHINE')) return 'materieel';
  if (c.includes('ONDERAANNEMING')) return 'onderaannemer';
  if (c.includes('ZAND') || c.includes('GRIND') || c.includes('PRODUKT') || c.includes('BESTRATING')) return 'materiaal';
  return 'overig';
}

/** Map unit string from library JSON to CostUnit */
function mapLibraryUnit(unit: string): CostUnit {
  const u = unit.toLowerCase().trim();
  switch (u) {
    case 'uur': return 'uur';
    case 'm': case 'm1': return 'm';
    case 'm2': case 'm²': return 'm²';
    case 'm3': case 'm³': return 'm³';
    case 'kg': return 'kg';
    case 'ton': return 'ton';
    case 'st': case 'stuk': return 'st';
    case 'dag': case 'dgn': return 'dgn';
    case 'km': return 'km';
    case 'week': return 'week';
    case 'mnd': return 'mnd';
    case 'post': return 'post';
    case 'ls': return 'ls';
    case '%': return '%';
    case 'pm': return 'pm';
    case 'keer': return 'keer';
    default: return 'st';
  }
}

/** Parse a library JSON file (from public/libraries/) into ResourceLibraryItem[] */
export function parseLibraryJson(json: unknown): ResourceLibraryItem[] {
  if (!json || typeof json !== 'object') return [];
  const data = json as Record<string, unknown>;
  const resources = data.resources;
  if (!Array.isArray(resources)) return [];

  const catalogueId = String(data.id ?? data.catalogueId ?? data.name ?? 'user-library');
  const ids = new Set<string>();
  return resources.map((raw: unknown) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('Invalid catalogue article.');
    const r = raw as Record<string, unknown>;
    const articleId = String(r.id ?? r.code ?? '');
    if (!articleId) throw Error('Each catalogue article requires an id or code.');
    const id = `${encodeURIComponent(catalogueId)}:${encodeURIComponent(articleId)}`;
    if (ids.has(id)) throw Error(`Duplicate catalogue article: ${articleId}`);
    ids.add(id);
    if (r.defaultUnitPrice != null && (typeof r.defaultUnitPrice !== 'number' || !Number.isFinite(r.defaultUnitPrice) || r.defaultUnitPrice < 0)) throw Error('Catalogue prices must be finite, nonnegative numbers.');
    return {
    catalogueId,
    catalogueVersion: String(data.version ?? 'unversioned'),
    currency: typeof (r.currency ?? data.currency) === 'string' ? String(r.currency ?? data.currency) : undefined,
    source: typeof r.source === 'string' ? r.source : undefined,
    priceDate: typeof r.priceDate === 'string' ? r.priceDate : null,
    referenceUnitPrice: typeof r.referenceUnitPrice === 'number' ? r.referenceUnitPrice : null,
    originalUnit: String(r.unit ?? 'st'),
    unitSupported: ['uur','m','m1','m2','m²','m3','m³','kg','ton','st','stuk','dag','dgn','km','week','mnd','post','ls','%','pm','keer'].includes(String(r.unit ?? 'st').toLowerCase().trim()),
    id,
    code: String(r.code ?? ''),
    description: String(r.description ?? ''),
    unit: mapLibraryUnit(String(r.unit ?? 'st')),
    resourceType: ['arbeid','materiaal','materieel','onderaannemer','overig'].includes(String(r.resourceType)) ? r.resourceType as ResourceType : mapCategoryToResourceType(String(r.category ?? '')),
    defaultUnitPrice: typeof r.defaultUnitPrice === 'number' ? r.defaultUnitPrice : null,
    category: r.subCategory ? String(r.subCategory) : String(r.category ?? ''),
  }; });
}

export const createResourceLibrarySlice: StateCreator<ResourceLibrarySlice> = (set) => {
  return {
    resourceLibrary: parseLibraryJson(dutchLibrary),
    resourcePickerOpen: false,
    resourcePickerParentId: null,
    setResourceLibrary: (resourceLibrary) => set({ resourceLibrary }),
    loadLibraryFromJson: (json) => {
      const items = parseLibraryJson(json);
      if (items.length > 0) {
        set({ resourceLibrary: items });
      }
    },
    openResourcePicker: (parentId) => set({ resourcePickerOpen: true, resourcePickerParentId: parentId }),
    closeResourcePicker: () => set({ resourcePickerOpen: false, resourcePickerParentId: null }),
  };
};
