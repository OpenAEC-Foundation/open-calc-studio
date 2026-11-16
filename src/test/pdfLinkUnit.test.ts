import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '@/state/appStore';
import { createDefaultItems } from '@/data/defaultBudget';
import { applyQuantityLink } from '@/services/quantity/quantitySourceActions';
import { getQuantityOrigin } from '@/services/quantity/quantityOrigin';
import type { QuantityLink } from '@/types/costModel';
import type { PdfSource } from '@/types/pdfWorkspace';

// Linking a PDF measurement via the grid ("Link quantity" → PDF) sets the unit, like the MCP route does.
const initial = useAppStore.getState();
let itemId: string;
const source: PdfSource = { id: 'pdf-unit', fileName: 'plan.pdf', dataBase64: '', pageScales: { '1': 10 }, measurements: [
  { id: 'len', label: 'Wall', page: 1, type: 'length', value: 7.5, mmPerPoint: 10, origin: 'open-calc-studio', points: [] },
  { id: 'area', label: 'Floor', page: 1, type: 'area', value: 12.5, mmPerPoint: 10, origin: 'open-calc-studio', points: [] },
] };
const item = () => useAppStore.getState().items.find(i => i.id === itemId)!;

beforeEach(() => {
  useAppStore.setState(initial, true);
  const state = useAppStore.getState();
  state.addDocument({ id: 'unit-doc', items: createDefaultItems() });
  const chapter = state.addChapter(null), post = state.addItem(chapter);
  itemId = state.addRegel(post);
  state.updateItem(itemId, 'unit', 'st');
  state.updateItem(itemId, 'quantity', 3);
  state.setSchedule({ pdfWorkspace: { version: 1, activeSourceId: source.id, sources: [structuredClone(source)] } });
});

describe('PDF quantity link sets the unit', () => {
  it.each<[QuantityLink, number, string]>([
    [{ source: 'pdf', measurementId: 'len', kind: 'length' }, 7.5, 'm'],
    [{ source: 'pdf', measurementId: 'area', kind: 'area' }, 12.5, 'm²'],
    [{ source: 'pdf', measurementId: '__sum__', kind: 'sum-length' }, 7.5, 'm'],
    [{ source: 'pdf', measurementId: '__sum__', kind: 'sum-area' }, 12.5, 'm²'],
  ])('%o → %s %s, overwriting the old unit, without a unit warning', (link, value, unit) => {
    applyQuantityLink(itemId, link, value, 'link');
    expect(item()).toMatchObject({ quantity: value, unit, quantityLink: link });
    expect(getQuantityOrigin(item(), useAppStore.getState())).toMatchObject({ status: 'linked', unitMismatch: false });
  });

  it('one undo restores quantity, unit and link', () => {
    applyQuantityLink(itemId, { source: 'pdf', measurementId: 'area', kind: 'area' }, 12.5, 'link');
    const restored = useAppStore.getState().undo();
    if (restored) useAppStore.getState().setItems(restored);
    expect(item()).toMatchObject({ quantity: 3, unit: 'st' });
    expect(item().quantityLink ?? null).toBeNull();
  });

  it('a spreadsheet link leaves the unit alone', () => {
    const sheet = useAppStore.getState().addSubSheet('Source');
    useAppStore.getState().setSubSheetCell(sheet, 'A1', '4');
    applyQuantityLink(itemId, { source: 'spreadsheet', sheetId: sheet, cellRef: 'A1' }, 4, 'link');
    expect(item()).toMatchObject({ quantity: 4, unit: 'st' });
  });
});
