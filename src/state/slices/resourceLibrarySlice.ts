import type { StateCreator } from 'zustand';
import type { ResourceLibraryItem } from '@/types/costModel';
import { parseLibraryJson } from '@/services/pricing/libraryJson';
import { builtInLibraryItems, DEFAULT_PRICE_COUNTRY } from '@/services/pricing/priceLibraries';

export { parseLibraryJson };

export interface ResourceLibrarySlice {
  resourceLibrary: ResourceLibraryItem[];
  resourcePickerOpen: boolean;
  resourcePickerParentId: string | null;
  /** Said in the picker when it opens, e.g. after importing a price library. */
  resourcePickerNotice: string | null;
  setResourceLibrary: (items: ResourceLibraryItem[]) => void;
  loadLibraryFromJson: (json: unknown) => void;
  openResourcePicker: (parentId: string | null, notice?: string | null) => void;
  closeResourcePicker: () => void;
}

export const createResourceLibrarySlice: StateCreator<ResourceLibrarySlice> = (set) => {
  return {
    resourceLibrary: builtInLibraryItems(DEFAULT_PRICE_COUNTRY),
    resourcePickerOpen: false,
    resourcePickerParentId: null,
    resourcePickerNotice: null,
    setResourceLibrary: (resourceLibrary) => set({ resourceLibrary }),
    loadLibraryFromJson: (json) => {
      const items = parseLibraryJson(json);
      if (items.length > 0) {
        set({ resourceLibrary: items });
      }
    },
    openResourcePicker: (parentId, notice = null) => set({ resourcePickerOpen: true, resourcePickerParentId: parentId, resourcePickerNotice: notice }),
    closeResourcePicker: () => set({ resourcePickerOpen: false, resourcePickerParentId: null, resourcePickerNotice: null }),
  };
};
