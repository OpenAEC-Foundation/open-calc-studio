import type { StateCreator } from 'zustand';
import type { GridColumn } from '@/types/costModel';
import { columnWidthKey } from '@/components/grid/gridConstants';
import type { GridView } from './uiSlice';

export interface ViewSlice {
  scrollTop: number;
  viewportHeight: number;
  /**
   * Door de gebruiker versleepte kolombreedtes, per weergave en kolomsleutel
   * ("st:description" → 420). Ontbreekt een sleutel, dan geldt de
   * standaardbreedte van de kolom; lees altijd via getColumnWidth.
   */
  columnWidths: Record<string, number>;
  setScrollTop: (v: number) => void;
  setViewportHeight: (v: number) => void;
  /** Breedte van een kolom in de actieve weergave, nooit smaller dan minWidth. */
  setColumnWidth: (column: Pick<GridColumn, 'key' | 'minWidth'>, width: number) => void;
}

export const createViewSlice: StateCreator<ViewSlice> = (set, get) => ({
  scrollTop: 0,
  viewportHeight: 600,
  columnWidths: {},
  setScrollTop: (scrollTop) => set({ scrollTop }),
  setViewportHeight: (viewportHeight) => set({ viewportHeight }),
  setColumnWidth: (column, width) =>
    set((state) => {
      const view: GridView = (get() as { gridView?: GridView }).gridView ?? 'st';
      return {
        columnWidths: {
          ...state.columnWidths,
          [columnWidthKey(view, column.key)]: Math.max(column.minWidth, width),
        },
      };
    }),
});
