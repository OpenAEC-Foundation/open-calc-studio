import { describe, expect, it } from 'vitest';
import { getColumnsForView, hiddenByQuantityToggle, isCellEditable, isHoursColumn } from '@/components/grid/gridConstants';
import { getGridCellDisplayValue } from '@/services/clipboard/excelClipboard';
import type { CostItem } from '@/types/costModel';

// De kolom Uren in UI-2 had de sleutel 'hoeveelheid'; de knop Hoeveelheid liet
// daardoor de uren verdwijnen. Uren heeft nu een eigen sleutel met dezelfde inhoud.
describe('knop Hoeveelheid', () => {
  it('verbergt in UI-1 de kolom Hoeveelheid', () => {
    expect(hiddenByQuantityToggle('hoeveelheid', 'st', false)).toBe(true);
    expect(hiddenByQuantityToggle('hoeveelheid', 'st', true)).toBe(false);
  });

  it('kent in UI-2 geen kolom Hoeveelheid, wel Uren met een eigen sleutel', () => {
    const keys = getColumnsForView('wpcalc').map(c => c.key);
    expect(keys).not.toContain('hoeveelheid');
    expect(keys).toContain('uren');
    expect(hiddenByQuantityToggle('uren', 'wpcalc', false)).toBe(false);
  });

  it('raakt andere kolommen niet', () => {
    expect(hiddenByQuantityToggle('quantity', 'st', false)).toBe(false);
  });
});

describe('kolom Uren', () => {
  const regel = { id: 'r', rowType: 'regel', quantity: 2, normQuantity: 3, normFactor: 1.5 } as unknown as CostItem;

  it('toont dezelfde berekening als Hoeveelheid (aantal × norm / capaciteit)', () => {
    expect(isHoursColumn('uren')).toBe(true);
    expect(isHoursColumn('hoeveelheid')).toBe(true);
    expect(isHoursColumn('quantity')).toBe(false);
    expect(getGridCellDisplayValue(regel, 'uren')).toBe(getGridCellDisplayValue(regel, 'hoeveelheid'));
    expect(getGridCellDisplayValue(regel, 'uren')).not.toBe('');
  });

  it('is op dezelfde rijen bewerkbaar als Hoeveelheid', () => {
    for (const rowType of ['regel', 'tekstregel', 'begrotingspost', 'bewakingspost', 'hoofdstuk']) {
      expect(isCellEditable('uren', rowType, 'wpcalc')).toBe(isCellEditable('hoeveelheid', rowType, 'st'));
    }
  });
});
