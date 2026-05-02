import type { StateCreator } from 'zustand';
import type { ResourceLibraryItem, ResourceType, CostUnit } from '@/types/costModel';
import { createDefaultResourceLibrary } from '@/data/defaultResourceLibrary';

export interface ResourceLibrarySlice {
  resourceLibrary: ResourceLibraryItem[];
  resourcePickerOpen: boolean;
  resourcePickerParentId: string | null;
  setResourceLibrary: (items: ResourceLibraryItem[]) => void;
  loadLibraryFromJson: (json: unknown) => void;
  openResourcePicker: (parentId: string) => void;
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
    case 'm2': return 'm²';
    case 'm3': return 'm³';
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
function parseLibraryJson(json: unknown): ResourceLibraryItem[] {
  if (!json || typeof json !== 'object') return [];
  const data = json as Record<string, unknown>;
  const resources = data.resources;
  if (!Array.isArray(resources)) return [];

  return resources.map((r: Record<string, unknown>, i: number) => ({
    id: `lib-${i}-${String(r.code ?? '')}`,
    code: String(r.code ?? ''),
    description: String(r.description ?? ''),
    unit: mapLibraryUnit(String(r.unit ?? 'st')),
    resourceType: mapCategoryToResourceType(String(r.category ?? '')),
    defaultUnitPrice: typeof r.defaultUnitPrice === 'number' ? r.defaultUnitPrice : null,
    category: r.subCategory ? String(r.subCategory) : String(r.category ?? ''),
  }));
}

export const createResourceLibrarySlice: StateCreator<ResourceLibrarySlice> = (set) => {
  // Try to load the GWW library from public/libraries/ at startup
  fetch('/libraries/middelen-gww.json')
    .then((res) => res.ok ? res.json() : null)
    .then((json) => {
      if (json) {
        const items = parseLibraryJson(json);
        if (items.length > 0) {
          set({ resourceLibrary: items });
        }
      }
    })
    .catch(() => {/* fallback to defaults */});

  return {
    resourceLibrary: createDefaultResourceLibrary(),
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
