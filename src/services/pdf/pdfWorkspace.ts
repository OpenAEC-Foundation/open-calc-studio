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
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const extent = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  // Een dubbelklik (twee gelijke punten na elkaar) of een laatste klik op (of vlak naast) het
  // eerste hoekpunt om de vorm te sluiten is geen kruising: die punten eerst weglaten.
  const outline = areaOutline(points, extent);
  if (outline.length < 3) throw new Error(uiText("pdf.error.points", "Not enough valid measurement points."));
  // Een kruisende omtrek (vlinderdas) geeft met de schoenveterformule een verkeerde, vaak 0,
  // oppervlakte; weigeren in plaats van stil fout meten (knownbug 159).
  if (polygonSelfIntersects(outline)) throw new Error(uiText('pdf.error.selfIntersecting', 'The area outline crosses itself. Click the corners in order around the shape.'));
  const twiceArea = outline.reduce((sum, p, i) => { const next = outline[(i + 1) % outline.length]; return sum + p.x * next.y - next.x * p.y; }, 0);
  // Alle punten op één lijn: geen oppervlakte, dus geen geldige meting.
  if (!(Math.abs(twiceArea) > 1e-9 * extent * extent)) throw new Error(uiText("pdf.error.points", "Not enough valid measurement points."));
  return Math.abs(twiceArea) / 2 * (mmPerPoint / 1000) ** 2;
}
/**
 * Waarde van een opgeslagen eigen meting bij een nieuwe schaal. Een oudere meting die de
 * strengere controle van `measurePoints` niet meer doorstaat (knownbug 159) blokkeert het
 * kalibreren niet: die schaalt mee met de verhouding van de oude en nieuwe schaal.
 */
export function remeasure(m: SavedPdfMeasurement, mmPerPoint: number): number {
  try { return measurePoints(m.points, m.type, mmPerPoint); } catch (error) {
    if (!m.mmPerPoint || !Number.isFinite(mmPerPoint) || mmPerPoint <= 0) throw error;
    return m.value * (mmPerPoint / m.mmPerPoint) ** (m.type === 'area' ? 2 : 1);
  }
}
/**
 * Omtrek zonder dubbele punten: een punt dat (bijna) op het vorige ligt valt weg, net als een
 * laatste punt dat (bijna) op het eerste ligt. "Bijna" is 0,5% van de afmeting van de vorm, maar
 * minstens 2 PDF-punten (een paar schermpixels), en nooit meer dan 5% van de afmeting.
 */
function areaOutline(points: PdfPoint[], extent: number): PdfPoint[] {
  const tolerance = Math.max(0.005 * extent, Math.min(2, 0.05 * extent));
  const near = (a: PdfPoint, b: PdfPoint) => Math.hypot(a.x - b.x, a.y - b.y) <= tolerance;
  const outline: PdfPoint[] = [];
  for (const p of points) if (!outline.length || !near(outline[outline.length - 1], p)) outline.push(p);
  while (outline.length > 1 && near(outline[outline.length - 1], outline[0])) outline.pop();
  return outline;
}
/** Kruisen of raken twee niet-aangrenzende randen van de gesloten polygoon elkaar? */
function polygonSelfIntersects(points: PdfPoint[]): boolean {
  const n = points.length;
  const cross = (o: PdfPoint, a: PdfPoint, b: PdfPoint) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const within = (a: PdfPoint, b: PdfPoint, p: PdfPoint) => Math.min(a.x, b.x) <= p.x && p.x <= Math.max(a.x, b.x) && Math.min(a.y, b.y) <= p.y && p.y <= Math.max(a.y, b.y);
  const intersects = (a: PdfPoint, b: PdfPoint, c: PdfPoint, d: PdfPoint) => {
    const d1 = Math.sign(cross(c, d, a)), d2 = Math.sign(cross(c, d, b)), d3 = Math.sign(cross(a, b, c)), d4 = Math.sign(cross(a, b, d));
    if (d1 * d2 < 0 && d3 * d4 < 0) return true;
    return (d1 === 0 && within(c, d, a)) || (d2 === 0 && within(c, d, b)) || (d3 === 0 && within(a, b, c)) || (d4 === 0 && within(a, b, d));
  };
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // de laatste rand grenst aan de eerste
      if (intersects(points[i], points[(i + 1) % n], points[j], points[(j + 1) % n])) return true;
    }
  }
  return false;
}
/**
 * Volgnummer voor een nieuwe eigen meting van dit type: het hoogste bestaande nummer + 1, zodat
 * er na een verwijdering geen twee metingen met hetzelfde label ontstaan (knownbug 156).
 */
export function nextMeasurementNumber(measurements: readonly SavedPdfMeasurement[], type: 'length' | 'area'): number {
  let highest = 0;
  for (const m of measurements) {
    if (m.type !== type || m.origin !== 'open-calc-studio') continue;
    const n = Number(/(\d+)\s*$/.exec(m.label)?.[1]);
    if (Number.isSafeInteger(n) && n > highest) highest = n;
  }
  return highest + 1;
}
export async function createPdfSource(file: File): Promise<PdfSource> {
  if (file.size > 30 * 1024 * 1024) throw new Error(uiText("pdf.error.size", "Use an embedded PDF up to 30 MB."));
  const data = new Uint8Array(await file.arrayBuffer());
  if (!new TextDecoder().decode(data.slice(0, 1024)).includes('%PDF-')) throw new Error(uiText("pdf.error.notPdf", "This file is not a PDF."));
  const digest = await crypto.subtle.digest('SHA-256', data);
  const id = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  let binary = '';
  for (let i = 0; i < data.length; i += 8192) binary += String.fromCharCode(...data.subarray(i, i + 8192));
  return { id, fileName: file.name, dataBase64: btoa(binary), pageScales: {}, measurements: [], revision: { label: file.name, importedAt: new Date().toISOString() } };
}
/** Preserve Open PDF Studio's authoritative values (including holes and arcs). */
export function importOpenPdfMeasurements(json: unknown, source: PdfSource, pageCount: number, options: { allowUnverifiedSource?: boolean } = {}): SavedPdfMeasurement[] {
  const input = json as Record<string, unknown> | null;
  if (!input || input.format !== 'open-pdf-studio-measurements' || input.version !== 1 || !Array.isArray(input.annotations)) throw new Error(uiText("pdf.error.export", "Use the measurement export from the Open Calc integration in Open PDF Studio."));
  if (input.fileName !== source.fileName) throw new Error(uiText("pdf.error.drawing", "The exported PDF name does not match the selected PDF."));
  const hash = input.sourceHash ?? input.pdfSha256;
  if (hash != null && (typeof hash !== 'string' || hash.toLowerCase() !== source.id.toLowerCase())) throw new Error(uiText('pdf.error.hash', 'The measurement export belongs to a different PDF revision.'));
  if (hash == null && options.allowUnverifiedSource !== true) throw new Error(uiText('pdf.error.unverified', 'This export has no PDF hash. Explicitly confirm the drawing and revision before importing.'));
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
    return { id: `${source.id}:opps:${a.id}`, annotationId: a.id, label: String(a.subject || a.label || a.text || a.type), type, page: Number(a.page), value, points: [], mmPerPoint: null, origin: 'open-pdf-studio', originalAnnotation: raw, sourceVerified: hash != null };
  });
}
export function replaceOpenPdfMeasurements(source: PdfSource, measurements: SavedPdfMeasurement[]): PdfSource {
  return { ...source, measurements: [...source.measurements.filter(m => m.origin !== 'open-pdf-studio'), ...measurements] };
}
