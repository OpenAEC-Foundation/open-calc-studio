import { beforeEach, describe, expect, it } from 'vitest';
import { importOpenPdfMeasurements, measurePoints, replaceOpenPdfMeasurements, resolvePdfQuantity } from '@/services/pdf/pdfWorkspace';
import type { PdfSource, PdfWorkspace } from '@/types/pdfWorkspace';
import { useAppStore } from '@/state/appStore';
import { serializeProject, deserializeProject } from '@/services/file/fileService';
import { createDefaultSchedule } from '@/data/defaultBudget';

const source: PdfSource = { id: 'drawing-sha', fileName: 'tekening.pdf', dataBase64: 'JVBERi0xLjQ=', pageScales: { '1': 10 }, measurements: [] };
const payload = (value = 2500) => ({ format: 'open-pdf-studio-measurements', version: 1, fileName: source.fileName, annotations: [
  { id: 'line-1', type: 'measureDistance', page: 1, measureValue: value, measureUnit: 'mm' },
  { id: 'area-1', type: 'measureArea', page: 2, measureValue: 12000000, measureUnit: 'mm²', holes: [[{ x: 1, y: 2 }]] },
] });
const workspace = (): PdfWorkspace => ({ version: 1, activeSourceId: source.id, sources: [replaceOpenPdfMeasurements(source, importOpenPdfMeasurements(payload(), source, 2))] });

describe('persistent PDF measurements', () => {
  beforeEach(() => useAppStore.setState({ documents: [], activeDocumentId: '', items: [], schedule: createDefaultSchedule(), pdfMeasurements: [] }));
  it('retains embedded PDF, calibration, geometry provenance and values through native save/open', () => {
    const w = workspace();
    const schedule = { ...createDefaultSchedule(), pdfWorkspace: w };
    const restored = deserializeProject(serializeProject(schedule, []));
    expect(restored.schedule.pdfWorkspace).toEqual(w);
    useAppStore.getState().addDocument({ id: 'restored', schedule: restored.schedule, items: restored.items });
    expect(useAppStore.getState().pdfMeasurements.map(m => m.value)).toEqual([2.5, 12]);
  });
  it('isolates quantities between documents and preserves edits when an inactive tab closes', () => {
    const st = useAppStore.getState();
    st.addDocument({ id: 'a', schedule: { ...createDefaultSchedule(), pdfWorkspace: workspace() } });
    st.addDocument({ id: 'b' });
    expect(useAppStore.getState().pdfMeasurements).toEqual([]);
    st.setActiveDocument('a');
    expect(useAppStore.getState().pdfMeasurements).toHaveLength(2);
    const updated = workspace(); updated.sources[0].measurements[0].value = 9;
    st.setSchedule({ pdfWorkspace: updated });
    st.removeDocument('b');
    expect(useAppStore.getState().pdfMeasurements[0].value).toBe(9);
  });
  it('reimports with stable IDs and replaces deleted external measurements', () => {
    const first = workspace().sources[0];
    const next = replaceOpenPdfMeasurements(first, importOpenPdfMeasurements(payload(3000), source, 2));
    expect(next.measurements).toHaveLength(2);
    expect(next.measurements[0].id).toBe(first.measurements[0].id);
    expect(next.measurements[0].value).toBe(3);
    expect(replaceOpenPdfMeasurements(next, []).measurements).toEqual([]);
  });
  it('rejects wrong drawing, unknown units, duplicate IDs and pages without changing the source', () => {
    expect(() => importOpenPdfMeasurements({ ...payload(), fileName: 'ander.pdf' }, source, 2)).toThrow();
    const unknown = payload(); unknown.annotations[0].measureUnit = 'px';
    expect(() => importOpenPdfMeasurements(unknown, source, 2)).toThrow();
    const duplicate = payload(); duplicate.annotations[1].id = 'line-1';
    expect(() => importOpenPdfMeasurements(duplicate, source, 2)).toThrow();
    expect(() => importOpenPdfMeasurements(payload(), source, 1)).toThrow();
    expect(source.measurements).toEqual([]);
  });
  it('uses the displayed custom dimension scale instead of stale document-scale values', () => {
    const annotation = { ...payload().annotations[0], measureScale: 10, startX: 0, startY: 0, endX: 300, endY: 400 };
    const data = { ...payload(), annotations: [annotation] };
    expect(importOpenPdfMeasurements(data, source, 2)[0].value).toBe(5);
    expect(importOpenPdfMeasurements(data, source, 2)[0].originalAnnotation).toEqual(annotation);
    annotation.measureScale = -1;
    expect(() => importOpenPdfMeasurements(data, source, 2)).toThrow();
    annotation.measureScale = Infinity;
    expect(() => importOpenPdfMeasurements(data, source, 2)).toThrow();
  });
  it('measures in unzoomed PDF coordinates and requires positive calibration', () => {
    expect(measurePoints([{ x: 0, y: 0 }, { x: 300, y: 400 }], 'length', 10)).toBe(5);
    expect(measurePoints([{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 300 }, { x: 0, y: 300 }], 'area', 10)).toBeCloseTo(6);
    expect(() => measurePoints([{ x: 0, y: 0 }, { x: 1, y: 1 }], 'length', 0)).toThrow();
  });
  it('retains the last estimate quantity when an individual or summed PDF source disappears', () => {
    const w = workspace();
    const line = w.sources[0].measurements[0];
    const individual = { source: 'pdf' as const, measurementId: line.id, kind: 'length' as const };
    const sum = { source: 'pdf' as const, measurementId: '__sum__', kind: 'sum-length' as const };
    expect(resolvePdfQuantity(individual, w)).toBe(2.5);
    expect(resolvePdfQuantity(sum, w)).toBe(2.5);
    w.sources[0].measurements = w.sources[0].measurements.filter(m => m.id !== line.id);
    expect(resolvePdfQuantity(individual, w)).toBeNull();
    expect(resolvePdfQuantity(sum, w)).toBeNull();
    expect(resolvePdfQuantity(individual, undefined)).toBeNull();
  });
});
