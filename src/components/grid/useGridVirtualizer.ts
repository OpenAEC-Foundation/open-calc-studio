import { useMemo } from 'react';
import { ROW_HEIGHT, OVERSCAN } from './gridConstants';

interface VirtualizerResult {
  startIndex: number;
  endIndex: number;
  totalHeight: number;
  offsetY: number;
  visibleCount: number;
  /** Cumulative Y offsets per row index (for variable heights) */
  rowOffsets: number[];
}

export function useGridVirtualizer(
  totalRows: number,
  scrollTop: number,
  viewportHeight: number,
  /** Optional per-row height function. Returns ROW_HEIGHT by default. */
  getRowHeight?: (index: number) => number,
): VirtualizerResult {
  return useMemo(() => {
    // Build cumulative offsets
    const rowOffsets = new Array<number>(totalRows + 1);
    rowOffsets[0] = 0;
    for (let i = 0; i < totalRows; i++) {
      rowOffsets[i + 1] = rowOffsets[i] + (getRowHeight ? getRowHeight(i) : ROW_HEIGHT);
    }
    const totalHeight = rowOffsets[totalRows] ?? 0;

    // Binary search for first visible row
    let lo = 0, hi = totalRows - 1;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (rowOffsets[mid + 1] <= scrollTop) lo = mid + 1;
      else hi = mid;
    }
    const firstVisible = lo;

    // Find last visible
    let lastVisible = firstVisible;
    while (lastVisible < totalRows - 1 && rowOffsets[lastVisible + 1] < scrollTop + viewportHeight) {
      lastVisible++;
    }

    const visibleCount = lastVisible - firstVisible + 1;
    const startIndex = Math.max(0, firstVisible - OVERSCAN);
    const endIndex = Math.min(totalRows - 1, lastVisible + OVERSCAN);
    const offsetY = rowOffsets[startIndex] ?? 0;

    return { startIndex, endIndex, totalHeight, offsetY, visibleCount, rowOffsets };
  }, [totalRows, scrollTop, viewportHeight, getRowHeight]);
}
