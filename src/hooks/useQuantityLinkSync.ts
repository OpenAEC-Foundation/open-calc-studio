/**
 * Auto-sync CostItem.quantity from quantityLink sources.
 * Runs globally; triggers when subSheets, the PDF workspace or ifcQuantities change.
 */
import { useEffect } from 'react';
import { useAppStore } from '@/state/appStore';
import { createPdfQuantityResolver } from '@/services/pdf/pdfWorkspace';

export function useQuantityLinkSync() {
  const items = useAppStore(s => s.items);
  const subSheets = useAppStore(s => s.subSheets);
  const pdfWorkspace = useAppStore(s => s.schedule.pdfWorkspace);
  const ifcQuantities = useAppStore(s => s.ifcQuantities);
  const updateItem = useAppStore(s => s.updateItem);

  useEffect(() => {
    const pdf = createPdfQuantityResolver(pdfWorkspace);
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
        newValue = pdf.resolve(link);
      } else if (link.source === 'ifc') {
        const q = ifcQuantities.find(q => q.fragmentId === link.fragmentId);
        if (q) newValue = q[link.quantity] ?? null;
      }

      if (newValue !== null && isFinite(newValue) && newValue !== item.quantity) {
        updateItem(item.id, 'quantity', newValue);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subSheets, ifcQuantities, pdfWorkspace]);
}
