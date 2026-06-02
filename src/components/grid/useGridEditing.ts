import { useCallback } from 'react';
import { useAppStore } from '@/state/appStore';
import { getColumnsForView } from './gridConstants';
import { parseNlNumber } from '@/utils/formatting';
import type { CostItem, CostUnit } from '@/types/costModel';

export function useGridEditing() {
  const { updateItem, pushHistory, items, gridView, prorateUrenForChapter } = useAppStore();

  const columns = getColumnsForView(gridView);

  const commitEdit = useCallback(
    (item: CostItem, colIndex: number, value: string) => {
      const col = columns[colIndex];
      if (!col || !col.editable) return;

      // WPCalc: editing the Uren cell on a chapter rescales all regel-norms in
      // that chapter naar rato (totaal aantal uren per hoofdstuk).
      if (gridView === 'wpcalc' && col.key === 'hoeveelheid' && item.rowType === 'chapter') {
        const newTotal = parseNlNumber(value);
        if (newTotal != null && !isNaN(newTotal)) {
          pushHistory(items, 'Uren hoofdstuk naar rato');
          prorateUrenForChapter(item.id, newTotal);
        }
        return;
      }

      pushHistory(items, `Edit ${col.key}`);

      // Map grid column keys to CostItem field names
      const keyMap: Record<string, string> = {
        productienorm: 'normQuantity',
        productiecapaciteit: 'normFactor',
        hoeveelheid: 'quantity',
      };
      const fieldKey = keyMap[col.key] ?? col.key;

      switch (col.type) {
        case 'text':
          updateItem(item.id, fieldKey, value);
          break;
        case 'number':
        case 'currency':
          updateItem(item.id, fieldKey, parseNlNumber(value));
          break;
        case 'unit-select':
          updateItem(item.id, fieldKey, value as CostUnit);
          break;
        case 'vn-select':
          updateItem(item.id, fieldKey, value);
          break;
        case 'tarief-select':
          updateItem(item.id, 'tariefGroep', value);
          break;
      }
    },
    [columns, updateItem, pushHistory, items, gridView, prorateUrenForChapter]
  );

  return { commitEdit };
}
