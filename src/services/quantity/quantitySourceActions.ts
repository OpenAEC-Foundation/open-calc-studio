import { useAppStore } from '@/state/appStore';
import { getQuantityOrigin } from './quantityOrigin';
import { uiText } from '@/i18n/uiText';

export async function openQuantitySource(itemId: string, sourceIndex = 0) {
  const state = useAppStore.getState(), documentId = state.activeDocumentId;
  const item = state.items.find(item => item.id === itemId);
  if (!item) throw Error(uiText('origin.itemMissing', 'The estimate row no longer exists.'));
  const origin = getQuantityOrigin(item, state), link = item.quantityLink;
  if (!link || origin.status === 'missing') throw Error(uiText('origin.sourceMissing', 'The source is unavailable. The last known quantity has been retained.'));
  if (link.source === 'pdf') {
    const source = origin.sources[sourceIndex];
    if (!source) throw Error(uiText('origin.sourceMissing', 'The source is unavailable. The last known quantity has been retained.'));
    state.setSchedule({ pdfWorkspace: { ...state.schedule.pdfWorkspace!, activeSourceId: source.id } });
    useAppStore.setState({ pdfTargetMeasurementId: source.measurementId ?? null, pdfPage: source.page ?? 1 });
    state.setActiveContentTab('pdf');
    return { view: 'pdf', sourceId: source.id, page: source.page };
  }
  if (link.source === 'spreadsheet') {
    state.setActiveSubSheet(link.sheetId);
    useAppStore.setState({ sheetTargetCell: { sheetId: link.sheetId, cellRef: link.cellRef.toUpperCase() } });
    state.setActiveContentTab('spreadsheet');
    return { view: 'spreadsheet', sheetId: link.sheetId, cellRef: link.cellRef };
  }
  const { getIfcSession, ifcCommand } = await import('@/services/ifc/ifcLiteWorkspace');
  if (useAppStore.getState().activeDocumentId !== documentId) throw Error(uiText('origin.documentChanged', 'The active estimate changed. Open the source again.'));
  const entry = state.schedule.ifcTakeoff?.entries.find(entry => entry.fragmentId === link.fragmentId);
  const loaded = !!entry && getIfcSession(documentId)?.model.id === entry.modelId;
  state.setActiveContentTab('viewer3d');
  if (loaded) { await ifcCommand('select', { elementIds: entry!.elementIds }); await ifcCommand('fit', {}); }
  return { view: 'viewer3d', modelId: entry?.modelId, geometryLoaded: loaded };
}
