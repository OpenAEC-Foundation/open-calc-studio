import { beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useAppStore } from '@/state/appStore';
import { createDefaultItems } from '@/data/defaultBudget';
import { getQuantityOrigin } from '@/services/quantity/quantityOrigin';
import { openQuantitySource } from '@/services/quantity/quantitySourceActions';
import { serializeProject, deserializeProject } from '@/services/file/fileService';
import { QuantityOriginCard } from '@/components/common/QuantityOriginCard';
import { executeDesktopCommand } from '@/services/mcp/desktopCommand';
import { changeLanguage } from '@/i18n/config';
import type { PdfSource } from '@/types/pdfWorkspace';

const initial = useAppStore.getState();
let itemId: string;
const source: PdfSource = { id: 'pdf-sha256-identity', fileName: 'Ground-floor-R2.pdf', dataBase64: 'not-for-export', pageScales: { '3': 100 }, measurements: [{ id: 'area-3', label: 'Floor finish', page: 3, type: 'area', value: 12.5, mmPerPoint: 100, origin: 'open-calc-studio', points: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 0, y: 5 }] }] };
beforeEach(async () => {
  await changeLanguage('en'); useAppStore.setState(initial, true);
  const state = useAppStore.getState(); state.addDocument({ id: 'origin-doc', items: createDefaultItems() });
  const chapter = state.addChapter(null), post = state.addItem(chapter); itemId = state.addRegel(post);
});
function linkPdf() {
  const state = useAppStore.getState(); state.setSchedule({ pdfWorkspace: { version: 1, activeSourceId: source.id, sources: [structuredClone(source)] } });
  state.updateItem(itemId, 'unit', 'm²'); state.updateItem(itemId, 'quantity', 12.5);
  state.updateItem(itemId, 'quantityLink', { source: 'pdf', measurementId: 'area-3', kind: 'area' });
}
function origin() { const state = useAppStore.getState(); return getQuantityOrigin(state.items.find(item => item.id === itemId)!, state); }

describe('quantity provenance', () => {
  it('records the PDF identity, page, origin, scale and measurement calculation', () => {
    linkPdf(); const info = origin();
    expect(info.status).toBe('linked'); expect(info.value).toBe(12.5); expect(info.unit).toBe('m²');
    expect(info.sources[0]).toMatchObject({ id: source.id, name: source.fileName, page: 3, measurementId: 'area-3' });
    expect(info.formula).toContain('polygonArea'); expect(info.formula).toContain('100/1000');
    expect(info.captured?.capturedAt).toBeTruthy(); expect(JSON.stringify(info)).not.toContain(source.dataBase64);
  });
  it('keeps source metadata and the last quantity after deletion and a native round trip', () => {
    linkPdf(); const state = useAppStore.getState();
    state.setSchedule({ pdfWorkspace: { version: 1, activeSourceId: null, sources: [] } });
    const parsed = deserializeProject(serializeProject(useAppStore.getState().schedule, useAppStore.getState().items));
    const info = getQuantityOrigin(parsed.items.find(item => item.id === itemId)!, { schedule: parsed.schedule, subSheets: [] });
    expect(info.status).toBe('missing'); expect(info.currentValue).toBe(12.5); expect(info.sources[0].name).toBe(source.fileName); expect(info.sources[0].page).toBe(3);
  });
  it('shows unit mismatches and a source value that differs from the estimate', () => {
    linkPdf(); const state = useAppStore.getState(); state.updateItem(itemId, 'quantity', 15); state.updateItem(itemId, 'unit', 'm³');
    expect(origin()).toMatchObject({ status: 'different', value: 12.5, currentValue: 15, unitMismatch: true });
  });
  it('shows spreadsheet formulas and treats zero as an available quantity', () => {
    const state = useAppStore.getState(), sheetId = state.addSubSheet('Foundation');
    state.setSubSheetCell(sheetId, 'A1', '=2-2'); state.updateItem(itemId, 'quantity', 0);
    state.updateItem(itemId, 'quantityLink', { source: 'spreadsheet', sheetId, cellRef: 'A1' });
    expect(origin()).toMatchObject({ status: 'linked', label: 'Foundation!A1', formula: '=2-2', value: 0 });
  });
  it('preserves IFC model identity, selected elements and the exact quantity key', () => {
    const state = useAppStore.getState();
    state.setSchedule({ ifcTakeoff: { models: [{ id: 'ifc-sha256', fileName: 'Structure-R4.ifc', elements: [] }], entries: [{ fragmentId: 'selection-id', modelId: 'ifc-sha256', label: 'Concrete walls', elementIds: [12, 34], quantityKey: 'BaseQuantities/NetVolume', volume: 2.4 }] } });
    state.updateItem(itemId, 'unit', 'm³'); state.updateItem(itemId, 'quantity', 2.4);
    state.updateItem(itemId, 'quantityLink', { source: 'ifc', fragmentId: 'selection-id', quantity: 'volume' });
    expect(origin().sources[0]).toMatchObject({ id: 'ifc-sha256', name: 'Structure-R4.ifc', elementIds: [12, 34], quantityKey: 'BaseQuantities/NetVolume' });
    expect(origin().formula).toContain('#12, #34');
  });
  it('navigates to the linked PDF page or spreadsheet cell without editing estimate values', async () => {
    linkPdf(); const state = useAppStore.getState(), before = state.items;
    state.updateDocument('origin-doc', { isModified: false });
    await openQuantitySource(itemId);
    expect(useAppStore.getState()).toMatchObject({ activeContentTab: 'pdf', pdfPage: 3, pdfTargetMeasurementId: 'area-3' });
    expect(useAppStore.getState().items).toBe(before); expect(useAppStore.getState().documents[0].isModified).toBe(false);
    const sheetId = state.addSubSheet('Source'); state.setSubSheetCell(sheetId, 'B2', '25'); state.updateItem(itemId, 'quantityLink', { source: 'spreadsheet', sheetId, cellRef: 'B2' });
    await openQuantitySource(itemId);
    expect(useAppStore.getState()).toMatchObject({ activeContentTab: 'spreadsheet', activeSubSheetId: sheetId, sheetTargetCell: { sheetId, cellRef: 'B2' } });
  });
  it('exposes the same metadata through MCP and warns instead of navigating to a missing source', async () => {
    linkPdf(); const result = await executeDesktopCommand('quantity.origin', { itemId });
    expect(result).toMatchObject({ source: 'pdf', status: 'linked' });
    useAppStore.getState().setSchedule({ pdfWorkspace: { version: 1, activeSourceId: null, sources: [] } });
    await expect(executeDesktopCommand('quantity.openSource', { itemId })).rejects.toThrow('unavailable');
    expect(useAppStore.getState().items.find(item => item.id === itemId)?.quantity).toBe(12.5);
  });
  it('renders an accessible Dutch source card without exposing editing controls', async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    linkPdf(); await changeLanguage('nl'); const node = document.createElement('div'); document.body.append(node); const root = createRoot(node);
    try {
      const item = useAppStore.getState().items.find(item => item.id === itemId)!;
      await act(async () => root.render(<QuantityOriginCard item={item} allowNavigate={false} />));
      expect(node.textContent).toContain('Herkomst hoeveelheid'); expect(node.textContent).toContain('Pagina 3'); expect(node.textContent).toContain(source.fileName);
      expect(node.querySelector('button')).toBeNull();
    } finally { await act(async () => root.unmount()); node.remove(); }
  });
});
