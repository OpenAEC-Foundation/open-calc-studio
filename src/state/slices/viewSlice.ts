import type { StateCreator } from 'zustand';
import { GRID_COLUMNS, WPCALC_COLUMNS, INSCHRIJFSTAAT_COLUMNS } from '@/components/grid/gridConstants';
import type { GridView } from './uiSlice';

export interface ViewSlice {
  scrollTop: number;
  viewportHeight: number;
  columnWidths: number[];
  wpcalcColumnWidths: number[];
  inschrijfstaatColumnWidths: number[];
  setScrollTop: (v: number) => void;
  setViewportHeight: (v: number) => void;
  setColumnWidth: (index: number, width: number) => void;
  getActiveColumnWidths: () => number[];
}

export const createViewSlice: StateCreator<ViewSlice> = (set, get) => ({
  scrollTop: 0,
  viewportHeight: 600,
  columnWidths: GRID_COLUMNS.map((col) => col.width),
  wpcalcColumnWidths: WPCALC_COLUMNS.map((col) => col.width),
  inschrijfstaatColumnWidths: INSCHRIJFSTAAT_COLUMNS.map((col) => col.width),
  setScrollTop: (scrollTop) => set({ scrollTop }),
  setViewportHeight: (viewportHeight) => set({ viewportHeight }),
  setColumnWidth: (index, width) =>
    set((state) => {
      const store = get() as any;
      const view: GridView = store.gridView ?? 'st';
      if (view === 'wpcalc') {
        const widths = [...state.wpcalcColumnWidths];
        widths[index] = Math.max(WPCALC_COLUMNS[index]?.minWidth ?? 30, width);
        return { wpcalcColumnWidths: widths };
      }
      if (view === 'inschrijfstaat') {
        const widths = [...state.inschrijfstaatColumnWidths];
        widths[index] = Math.max(INSCHRIJFSTAAT_COLUMNS[index]?.minWidth ?? 30, width);
        return { inschrijfstaatColumnWidths: widths };
      }
      const widths = [...state.columnWidths];
      widths[index] = Math.max(GRID_COLUMNS[index]?.minWidth ?? 30, width);
      return { columnWidths: widths };
    }),
  getActiveColumnWidths: () => {
    const state = get() as any;
    const view: GridView = state.gridView ?? 'st';
    if (view === 'wpcalc') return state.wpcalcColumnWidths;
    if (view === 'inschrijfstaat') return state.inschrijfstaatColumnWidths;
    return state.columnWidths;
  },
});
