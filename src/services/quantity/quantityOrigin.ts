import type { CostItem, CostSchedule, QuantityLink, SubSheet } from '@/types/costModel';
import type { IfcQuantity } from '@/state/slices/linkableSourcesSlice';
import { resolvePdfQuantity } from '@/services/pdf/pdfWorkspace';

export interface QuantityOrigin {
  source: 'manual' | 'spreadsheet' | 'pdf' | 'ifc' | 'excel';
  label: string;
  sources: { id: string; name: string; page?: number; measurementId?: string; elementIds?: number[]; quantityKey?: string }[];
  formula: string;
  value: number | null;
  unit: string;
  capturedAt?: string;
}
export interface QuantityOriginContext { schedule: CostSchedule; subSheets: SubSheet[]; ifcQuantities?: IfcQuantity[] }
export interface QuantityOriginInfo extends QuantityOrigin { status: 'manual' | 'linked' | 'missing' | 'different'; currentValue: number | null; unitMismatch: boolean; captured?: QuantityOrigin }

/** Metadata only: never embed PDF bytes, model geometry or spreadsheet contents. */
export function resolveQuantityOrigin(link: QuantityLink, context: QuantityOriginContext): QuantityOrigin | null {
  if (link.source === 'spreadsheet') {
    const sheet = context.subSheets.find(sheet => sheet.id === link.sheetId);
    const cell = sheet?.cells[link.cellRef.toUpperCase()];
    const value = cell ? cell.computed ?? Number.parseFloat(cell.value) : NaN;
    if (!sheet || !cell || !Number.isFinite(value)) return null;
    return { source: 'spreadsheet', label: `${sheet.name}!${link.cellRef.toUpperCase()}`, sources: [{ id: sheet.id, name: sheet.name }], formula: cell.value.startsWith('=') ? cell.value : `${sheet.name}!${link.cellRef.toUpperCase()}`, value, unit: '' };
  }
  if (link.source === 'pdf') {
    const kind = link.kind === 'sum-area' ? 'area' : link.kind === 'sum-length' ? 'length' : link.kind;
    const summed = link.kind.startsWith('sum-');
    const sources = (context.schedule.pdfWorkspace?.sources ?? []).flatMap(source => source.measurements.filter(measurement => measurement.type === kind && (summed || measurement.id === link.measurementId)).map(measurement => ({ source, measurement })));
    const value = resolvePdfQuantity(link, context.schedule.pdfWorkspace);
    if (value === null || !sources.length) return null;
    return { source: 'pdf', label: summed ? `Σ ${kind}` : sources[0].measurement.label, sources: sources.map(({ source, measurement }) => ({ id: source.id, name: source.fileName, page: measurement.page, measurementId: measurement.id })),
      formula: summed ? sources.map(({ measurement }) => measurement.value).join(' + ') : sources[0].measurement.origin === 'open-pdf-studio' ? `Open PDF Studio · #${sources[0].measurement.annotationId ?? sources[0].measurement.id}` : `${kind === 'area' ? 'polygonArea' : 'polylineLength'}(PDF points) × (${sources[0].measurement.mmPerPoint}/1000)${kind === 'area' ? '²' : ''}`, value, unit: kind === 'area' ? 'm²' : 'm' };
  }
  const takeoff = context.schedule.ifcTakeoff;
  const entry = takeoff?.entries.find(entry => entry.fragmentId === link.fragmentId);
  const model = takeoff?.models.find(model => model.id === entry?.modelId);
  const fallback = context.ifcQuantities?.find(entry => entry.fragmentId === link.fragmentId);
  const value = entry?.[link.quantity] ?? fallback?.[link.quantity];
  if (value == null || !Number.isFinite(value)) return null;
  return { source: 'ifc', label: entry?.label ?? fallback?.label ?? link.fragmentId, sources: [{ id: model?.id ?? entry?.modelId ?? link.fragmentId, name: model?.fileName ?? link.fragmentId, elementIds: entry?.elementIds, quantityKey: entry?.quantityKey }],
    formula: entry ? `${entry.quantityKey} · Σ(${entry.elementIds.map(id => `#${id}`).join(', ')})` : link.quantity, value, unit: ({ volume: 'm³', area: 'm²', length: 'm', count: 'st' })[link.quantity] };
}
export function captureQuantityOrigin(link: QuantityLink, context: QuantityOriginContext): QuantityOrigin | undefined {
  const origin = resolveQuantityOrigin(link, context);
  return origin ? { ...origin, capturedAt: new Date().toISOString() } : undefined;
}
export function getQuantityOrigin(item: CostItem, context: QuantityOriginContext): QuantityOriginInfo {
  const captured = item.quantityOrigin;
  if (!item.quantityLink) {
    if (item.excelLink) return { source: 'excel', label: `${item.excelLink.sheet}!${item.excelLink.cell}`, sources: [{ id: item.excelLink.filePath, name: item.excelLink.filePath }], formula: `${item.excelLink.sheet}!${item.excelLink.cell}`, value: item.quantity, unit: item.unit, status: 'missing', currentValue: item.quantity, unitMismatch: false };
    return { source: 'manual', label: '', sources: [], formula: '', value: item.quantity, unit: item.unit, status: 'manual', currentValue: item.quantity, unitMismatch: false };
  }
  const resolved = resolveQuantityOrigin(item.quantityLink, context);
  const origin = resolved ?? captured ?? { source: item.quantityLink.source, label: '', sources: [], formula: '', value: null, unit: item.unit };
  return { ...origin, captured, currentValue: item.quantity, status: !resolved ? 'missing' : resolved.value !== item.quantity ? 'different' : 'linked', unitMismatch: !!origin.unit && origin.unit !== item.unit };
}
