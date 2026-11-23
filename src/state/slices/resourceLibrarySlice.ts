import type { StateCreator } from 'zustand';
import type { ResourceLibraryItem } from '@/types/costModel';
import { parseLibraryJson } from '@/services/pricing/libraryJson';
import { builtInLibraryItems, DEFAULT_PRICE_COUNTRY } from '@/services/pricing/priceLibraries';

export { parseLibraryJson };

export interface ResourceLibrarySlice {
  resourceLibrary: ResourceLibraryItem[];
  resourcePickerOpen: boolean;
  resourcePickerParentId: string | null;
  setResourceLibrary: (items: ResourceLibraryItem[]) => void;
  loadLibraryFromJson: (json: unknown) => void;
  openResourcePicker: (parentId: string | null) => void;
  closeResourcePicker: () => void;
}

export const createResourceLibrarySlice: StateCreator<ResourceLibrarySlice> = (set) => {
  return {
    resourceLibrary: builtInLibraryItems(DEFAULT_PRICE_COUNTRY),
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
