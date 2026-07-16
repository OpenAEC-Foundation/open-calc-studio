import { useCallback } from 'react';
import { useAppStore } from '@/state/appStore';
import { getColumnsForView } from './gridConstants';
import { parseNumericInput } from '@/utils/numericInput';
import type { CostItem, CostUnit } from '@/types/costModel';

export function useGridEditing() {
  const { updateItem, pushHistory, items, gridView, prorateUrenForChapter } = useAppStore();

  const columns = getColumnsForView(gridView);

  const commitEdit = useCallback(
    (item: CostItem, colIndex: number, value: string) => {
      const col = columns[colIndex];
      if (!col || !col.editable) return;

      // WPCalc: de uren-som op de hoofdstuk-FOOTERRIJ bewerken herrekent alle
      // regel-normen in dat hoofdstuk naar rato.
      if (item.id.startsWith('footer:') && col.key === 'hoeveelheid') {
        const newTotal = parseNumericInput(value);
        if (newTotal != null && !isNaN(newTotal)) {
          pushHistory(items, 'Uren hoofdstuk naar rato');
          prorateUrenForChapter(item.id.replace('footer:', ''), newTotal);
        }
        return;
      }
      // Synthetische footerrijen verder nooit als item updaten
      if (item.id.startsWith('footer:')) return;

      pushHistory(items, `Edit ${col.key}`);

      // Map grid column keys to CostItem field names
      const keyMap: Record<string, string> = {
        productienorm: 'normQuantity',
        productiecapaciteit: 'normFactor',
        hoeveelheid: 'quantity',
        // UI-2 'Hst'-kolom: hoofdstuknummer leeft op CostItem.code — zonder
        // deze mapping schrijft de edit naar een niet-bestaand veld en
        // "gebeurt er niks" bij het wijzigen van een hoofdstuknummer.
        chapterCode: 'code',
      };
      const fieldKey = keyMap[col.key] ?? col.key;

      switch (col.type) {
        case 'text':
          updateItem(item.id, fieldKey, value);
          break;
        case 'number':
        case 'currency': {
          // Accepteert ook formules: "=12,2*2,22" of "12.2*2.2"
          const parsed = parseNumericInput(value);
          // Ongeldige (niet-lege) invoer wist de waarde niet
          if (parsed === null && value.trim() !== '') break;
          updateItem(item.id, fieldKey, parsed);
          break;
        }
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
