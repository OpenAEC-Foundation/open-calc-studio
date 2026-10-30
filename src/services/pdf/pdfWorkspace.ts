import { uiText } from '@/i18n/uiText';
import type { PdfPoint, PdfSource, PdfWorkspace, SavedPdfMeasurement } from '@/types/pdfWorkspace';
import type { QuantityLink } from '@/types/costModel';

export function emptyPdfWorkspace(): PdfWorkspace {
  return { version: 1, activeSourceId: null, sources: [] };
}
export function pdfQuantities(workspace?: PdfWorkspace) {
  return (workspace?.sources ?? []).flatMap(source => source.measurements.map(m => ({
    id: m.id, label: `${source.fileName} — ${m.label} (p. ${m.page})`,
    type: m.type, page: m.page, value: m.value,
  })));
}

type PdfEntry = { source: PdfSource; measurement: SavedPdfMeasurement };
export interface PdfQuantityResolver {
  measurements(link: Extract<QuantityLink, { source: 'pdf' }>): readonly PdfEntry[];
  resolve(link: Extract<QuantityLink, { source: 'pdf' }>): number | null;
}
/** Batch-local index. Create a fresh resolver after mutating its input workspace. */
export function createPdfQuantityResolver(workspace?: PdfWorkspace): PdfQuantityResolver {
  const byKind = new Map<string, PdfEntry[]>(), byId = new Map<string, PdfEntry[]>(), totals = new Map<string, number>();
  let indexed = false;
  const index = () => {
    if (indexed) return; indexed = true;
    for (const source of workspace?.sources ?? []) for (const measurement of source.measurements) {
      const entry = { source, measurement }, key = `${measurement.type}:${measurement.id}`;
      const group = byKind.get(measurement.type) ?? []; group.push(entry); byKind.set(measurement.type, group);
      const matches = byId.get(key) ?? []; matches.push(entry); byId.set(key, matches);
      totals.set(measurement.type, (totals.get(measurement.type) ?? 0) + measurement.value);
    }
  };
  const measurements = (link: Extract<QuantityLink, { source: 'pdf' }>): readonly PdfEntry[] => {
    index(); const kind = link.kind.replace('sum-', '');
    return (link.kind.startsWith('sum-') ? byKind.get(kind) : byId.get(`${kind}:${link.measurementId}`)) ?? [];
  };
  return { measurements, resolve: link => {
    index();
    if (link.kind.startsWith('sum-')) return totals.get(link.kind.replace('sum-', '')) ?? null;
    return measurements(link)[0]?.measurement.value ?? null;
  } };
}
/** Standalone calls always see changes, including mutable SDK inputs. */
export function resolvePdfQuantity(link: Extract<QuantityLink, { source: 'pdf' }>, workspace?: PdfWorkspace): number | null {
  return createPdfQuantityResolver(workspace).resolve(link);
}
export function measurePoints(points: PdfPoint[], type: 'length' | 'area', mmPerPoint: number): number {
  if (!Number.isFinite(mmPerPoint) || mmPerPoint <= 0) throw new Error(uiText("pdf.error.calibrate", "Calibrate the scale first."));
  if (points.length < (type === 'area' ? 3 : 2) || points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) throw new Error(uiText("pdf.error.points", "Not enough valid measurement points."));
  if (type === 'length') return points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - points[i].x, p.y - points[i].y), 0) * mmPerPoint / 1000;
  const twiceArea = points.reduce((sum, p, i) => { const next = points[(i + 1) % points.length]; return sum + p.x * next.y - next.x * p.y; }, 0);
  return Math.abs(twiceArea) / 2 * (mmPerPoint / 1000) ** 2;
}
export async function createPdfSource(file: File): Promise<PdfSource> {
  if (file.size > 30 * 1024 * 1024) throw new Error(uiText("pdf.error.size", "Use an embedded PDF up to 30 MB."));
  const data = new Uint8Array(await file.arrayBuffer());
  if (!new TextDecoder().decode(data.slice(0, 1024)).includes('%PDF-')) throw new Error(uiText("pdf.error.notPdf", "This file is not a PDF."));
  const digest = await crypto.subtle.digest('SHA-256', data);
  const id = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  let binary = '';
  for (let i = 0; i < data.length; i += 8192) binary += String.fromCharCode(...data.subarray(i, i + 8192));
  return { id, fileName: file.name, dataBase64: btoa(binary), pageScales: {}, measurements: [] };
}
/** Preserve Open PDF Studio's authoritative values (including holes and arcs). */
export function importOpenPdfMeasurements(json: unknown, source: PdfSource, pageCount: number): SavedPdfMeasurement[] {
  const input = json as Record<string, unknown> | null;
  if (!input || input.format !== 'open-pdf-studio-measurements' || input.version !== 1 || !Array.isArray(input.annotations)) throw new Error(uiText("pdf.error.export", "Use the measurement export from the Open Calc integration in Open PDF Studio."));
  if (input.fileName !== source.fileName) throw new Error(uiText("pdf.error.drawing", "The exported PDF name does not match the selected PDF."));
  const seen = new Set<string>();
  const factors: Record<string, number> = { mm: .001, cm: .01, m: 1, in: .0254, ft: .3048 };
  return input.annotations.map((raw: unknown) => {
    if (!raw || typeof raw !== 'object') throw new Error(uiText("pdf.error.annotation", "Invalid annotation."));
    const a = raw as Record<string, unknown>;
    const type = a.type === 'measureArea' ? 'area' : ['measureDistance', 'measurePerimeter'].includes(String(a.type)) ? 'length' : null;
    if (!type || typeof a.id !== 'string' || !a.id || seen.has(a.id)) throw new Error(uiText("pdf.error.id", "Unknown measurement type or duplicate measurement ID."));
    seen.add(a.id);
    if (!Number.isInteger(a.page) || Number(a.page) < 1 || Number(a.page) > pageCount) throw new Error(uiText("pdf.error.page", "The measurement refers to an invalid PDF page."));
    const unit = String(a.measureUnit ?? '').replace(/2$/, '²');
    const baseUnit = type === 'area' ? unit.replace(/²$/, '') : unit;
    const factor = factors[baseUnit];
    if (!factor || (type === 'area' && !unit.endsWith('²')) || typeof a.measureValue !== 'number' || !Number.isFinite(a.measureValue) || a.measureValue < 0) throw new Error(uiText("pdf.error.value", "The measurement has no valid value or calibrated unit."));
    let value = a.measureValue;
    // Dimension overrides in Open PDF Studio affect the displayed distance,
    // while measureValue can still contain the document-scale distance.
    if (a.type === 'measureDistance' && a.measureScale != null && a.measureScale !== 0) {
      if (typeof a.measureScale !== 'number' || !Number.isFinite(a.measureScale) || a.measureScale <= 0 ||
          [a.startX, a.startY, a.endX, a.endY].some(v => typeof v !== 'number' || !Number.isFinite(v))) {
        throw new Error(uiText("pdf.error.geometry", "The distance measurement has an invalid custom scale or geometry."));
      }
      value = Math.hypot(Number(a.endX) - Number(a.startX), Number(a.endY) - Number(a.startY)) * a.measureScale;
    }
    value *= factor ** (type === 'area' ? 2 : 1);
    if (!Number.isFinite(value)) throw new Error(uiText("pdf.error.tooLarge", "The measured value is too large."));
    return { id: `${source.id}:opps:${a.id}`, annotationId: a.id, label: String(a.subject || a.label || a.text || a.type), type, page: Number(a.page), value, points: [], mmPerPoint: null, origin: 'open-pdf-studio', originalAnnotation: raw };
  });
}
export function replaceOpenPdfMeasurements(source: PdfSource, measurements: SavedPdfMeasurement[]): PdfSource {
  return { ...source, measurements: [...source.measurements.filter(m => m.origin !== 'open-pdf-studio'), ...measurements] };
}
