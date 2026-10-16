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

/** A missing PDF source never turns a saved estimate quantity into zero. */
export function resolvePdfQuantity(link: Extract<QuantityLink, { source: 'pdf' }>, workspace?: PdfWorkspace): number | null {
  const measurements = workspace?.sources.flatMap(source => source.measurements) ?? [];
  const kind = link.kind === 'sum-length' ? 'length' : link.kind === 'sum-area' ? 'area' : link.kind;
  if (link.kind === 'sum-length' || link.kind === 'sum-area') {
    const matching = measurements.filter(measurement => measurement.type === kind);
    return matching.length ? matching.reduce((sum, measurement) => sum + measurement.value, 0) : null;
  }
  return measurements.find(measurement => measurement.id === link.measurementId && measurement.type === kind)?.value ?? null;
}
export function measurePoints(points: PdfPoint[], type: 'length' | 'area', mmPerPoint: number): number {
  if (!Number.isFinite(mmPerPoint) || mmPerPoint <= 0) throw new Error('Kalibreer eerst de schaal.');
  if (points.length < (type === 'area' ? 3 : 2) || points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) throw new Error('Onvoldoende geldige meetpunten.');
  if (type === 'length') return points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - points[i].x, p.y - points[i].y), 0) * mmPerPoint / 1000;
  const twiceArea = points.reduce((sum, p, i) => { const next = points[(i + 1) % points.length]; return sum + p.x * next.y - next.x * p.y; }, 0);
  return Math.abs(twiceArea) / 2 * (mmPerPoint / 1000) ** 2;
}
export async function createPdfSource(file: File): Promise<PdfSource> {
  if (file.size > 30 * 1024 * 1024) throw new Error('Gebruik voor deze ingebedde PDF maximaal 30 MB.');
  const data = new Uint8Array(await file.arrayBuffer());
  if (!new TextDecoder().decode(data.slice(0, 1024)).includes('%PDF-')) throw new Error('Dit bestand is geen PDF.');
  const digest = await crypto.subtle.digest('SHA-256', data);
  const id = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  let binary = '';
  for (let i = 0; i < data.length; i += 8192) binary += String.fromCharCode(...data.subarray(i, i + 8192));
  return { id, fileName: file.name, dataBase64: btoa(binary), pageScales: {}, measurements: [] };
}
/** Preserve Open PDF Studio's authoritative values (including holes and arcs). */
export function importOpenPdfMeasurements(json: unknown, source: PdfSource, pageCount: number): SavedPdfMeasurement[] {
  const input = json as Record<string, unknown> | null;
  if (!input || input.format !== 'open-pdf-studio-measurements' || input.version !== 1 || !Array.isArray(input.annotations)) throw new Error('Gebruik de metingenexport van de Open Calc-koppeling in Open PDF Studio.');
  if (input.fileName !== source.fileName) throw new Error('De PDF-naam in de export komt niet overeen met de geselecteerde PDF.');
  const seen = new Set<string>();
  const factors: Record<string, number> = { mm: .001, cm: .01, m: 1, in: .0254, ft: .3048 };
  return input.annotations.map((raw: unknown) => {
    if (!raw || typeof raw !== 'object') throw new Error('Ongeldige annotatie.');
    const a = raw as Record<string, unknown>;
    const type = a.type === 'measureArea' ? 'area' : ['measureDistance', 'measurePerimeter'].includes(String(a.type)) ? 'length' : null;
    if (!type || typeof a.id !== 'string' || !a.id || seen.has(a.id)) throw new Error('Onbekend meettype of dubbele meet-ID.');
    seen.add(a.id);
    if (!Number.isInteger(a.page) || Number(a.page) < 1 || Number(a.page) > pageCount) throw new Error('Meting verwijst naar een ongeldige PDF-pagina.');
    const unit = String(a.measureUnit ?? '').replace(/2$/, '²');
    const baseUnit = type === 'area' ? unit.replace(/²$/, '') : unit;
    const factor = factors[baseUnit];
    if (!factor || (type === 'area' && !unit.endsWith('²')) || typeof a.measureValue !== 'number' || !Number.isFinite(a.measureValue) || a.measureValue < 0) throw new Error('Meting mist een geldige waarde of gekalibreerde eenheid.');
    let value = a.measureValue;
    // Dimension overrides in Open PDF Studio affect the displayed distance,
    // while measureValue can still contain the document-scale distance.
    if (a.type === 'measureDistance' && a.measureScale != null && a.measureScale !== 0) {
      if (typeof a.measureScale !== 'number' || !Number.isFinite(a.measureScale) || a.measureScale <= 0 ||
          [a.startX, a.startY, a.endX, a.endY].some(v => typeof v !== 'number' || !Number.isFinite(v))) {
        throw new Error('Afstandsmeting heeft een ongeldige aangepaste schaal of geometrie.');
      }
      value = Math.hypot(Number(a.endX) - Number(a.startX), Number(a.endY) - Number(a.startY)) * a.measureScale;
    }
    value *= factor ** (type === 'area' ? 2 : 1);
    if (!Number.isFinite(value)) throw new Error('Meetwaarde is te groot.');
    return { id: `${source.id}:opps:${a.id}`, annotationId: a.id, label: String(a.subject || a.label || a.text || a.type), type, page: Number(a.page), value, points: [], mmPerPoint: null, origin: 'open-pdf-studio', originalAnnotation: raw };
  });
}
export function replaceOpenPdfMeasurements(source: PdfSource, measurements: SavedPdfMeasurement[]): PdfSource {
  return { ...source, measurements: [...source.measurements.filter(m => m.origin !== 'open-pdf-studio'), ...measurements] };
}
