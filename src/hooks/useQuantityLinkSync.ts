/**
 * Auto-sync CostItem.quantity from quantityLink sources.
 * Runs globally; triggers when subSheets, pdfMeasurements or ifcQuantities change.
 */
import { useEffect } from 'react';
import { useAppStore } from '@/state/appStore';

export function useQuantityLinkSync() {
  const items = useAppStore(s => s.items);
  const subSheets = useAppStore(s => s.subSheets);
  const pdfMeasurements = useAppStore(s => s.pdfMeasurements);
  const ifcQuantities = useAppStore(s => s.ifcQuantities);
  const updateItem = useAppStore(s => s.updateItem);

  useEffect(() => {
    for (const item of items) {
      const link = item.quantityLink;
      if (!link) continue;

      let newValue: number | null = null;

      if (link.source === 'spreadsheet') {
        const sheet = subSheets.find(s => s.id === link.sheetId);
        const cell = sheet?.cells[link.cellRef];
        if (cell) {
          newValue = cell.computed ?? parseFloat(cell.value);
          if (!isFinite(newValue)) newValue = null;
        }
      } else if (link.source === 'pdf') {
        if (link.kind === 'sum-length') {
          newValue = pdfMeasurements.filter(m => m.type === 'length').reduce((s, m) => s + m.value, 0);
        } else if (link.kind === 'sum-area') {
          newValue = pdfMeasurements.filter(m => m.type === 'area').reduce((s, m) => s + m.value, 0);
        } else {
          const m = pdfMeasurements.find(m => m.id === link.measurementId);
          if (m) newValue = m.value;
        }
      } else if (link.source === 'ifc') {
        const q = ifcQuantities.find(q => q.fragmentId === link.fragmentId);
        if (q) newValue = q[link.quantity] ?? null;
      }

      if (newValue !== null && isFinite(newValue) && newValue !== item.quantity) {
        updateItem(item.id, 'quantity', newValue);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subSheets, pdfMeasurements, ifcQuantities]);
}
