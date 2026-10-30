import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { useAppStore } from '@/state/appStore';
import { saveMobileDraft, restoreMobileDraft } from '@/components/mobile/mobileDraft';
import { localStore } from '@/utils/browserStorage';
import { parseLibraryJson } from '@/state/slices/resourceLibrarySlice';
import { serializeProject, deserializeProject } from '@/services/file/fileService';
import { createPdfSource, importOpenPdfMeasurements } from '@/services/pdf/pdfWorkspace';
import { parseTakeoff, aggregateTakeoff } from '@/services/ifc/ifcTakeoff';

const initial = useAppStore.getState();
const findings: { id: string; observed: unknown }[] = [];
const record = (id: string, observed: unknown) => findings.push({ id, observed });
const key = 'ocs-mobile-draft-v1';
beforeEach(() => { useAppStore.setState(initial, true); localStore.removeItem(key); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
afterAll(() => {
  const output = process.env.OCS_RESEARCH_OUTPUT ?? '/tmp/ocs-first-four-observations.json';
  writeFileSync(output, JSON.stringify({
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    scope: 'Synthetic in-process observations, not browser/OS crash or exploit tests', findings,
  }, null, 2) + '\n');
});

it('R1: persisted mobile draft keeps embedded PDF, IFC takeoff and sheet data', () => {
  const state = useAppStore.getState(); state.addDocument({ fileName: 'Research draft' });
  const pdf = { version: 1 as const, activeSourceId: 'pdf-a', sources: [{ id: 'pdf-a', fileName: 'drawing.pdf', dataBase64: 'JVBERi0xLjQ=', pageScales: { '1': 10 }, measurements: [{ id: 'm1', label: 'Length', type: 'length' as const, page: 1, value: 5, points: [{ x: 0, y: 0 }, { x: 500, y: 0 }], mmPerPoint: 10, origin: 'open-calc-studio' as const }] }] };
  const ifc = { models: [{ id: 'ifc-a', fileName: 'model.ifc', elements: [] }], entries: [{ fragmentId: 'takeoff-a', modelId: 'ifc-a', label: 'Wall', elementIds: [20], quantityKey: 'NetVolume', volume: 2.4 }] };
  state.setSchedule({ pdfWorkspace: pdf, ifcTakeoff: ifc });
  const sheet = state.addSubSheet('Quantity'); state.setSubSheetCell(sheet, 'A1', '123');
  expect(saveMobileDraft()).toBe(true);
  useAppStore.setState(initial, true);
  expect(restoreMobileDraft()).toBe(true);
  const restored = useAppStore.getState();
  expect(restored.schedule.pdfWorkspace).toEqual(pdf); expect(restored.schedule.ifcTakeoff).toEqual(ifc);
  expect(restored.subSheets[0].cells.A1.value).toBe('123');
  record('R1', { pdfCalibrationAndMeasurements: true, ifcTakeoff: true, spreadsheet: true });
});

it('R2: the mobile draft keeps only the last active document and omits snapshots', () => {
  const state = useAppStore.getState(); state.addDocument({ fileName: 'A' });
  state.addDocument({ fileName: 'B' }); state.createSnapshot('Before revision', 'concept');
  expect(useAppStore.getState().documents).toHaveLength(2);
  expect(useAppStore.getState().snapshots).toHaveLength(1);
  expect(saveMobileDraft()).toBe(true);
  useAppStore.setState(initial, true); expect(restoreMobileDraft()).toBe(true);
  expect(useAppStore.getState().documents.map(d => d.fileName)).toEqual(['B']);
  expect(useAppStore.getState().snapshots).toHaveLength(0);
  record('R2', { documentsBefore: 2, documentsRecovered: 1, snapshotsBefore: 1, snapshotsRecovered: 0 });
});

it('R3: quota denial reports a saved draft although it exists only in memory', async () => {
  useAppStore.getState().addDocument({ fileName: 'Quota probe' });
  const nativeSet = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError'); });
  expect(saveMobileDraft()).toBe(true);
  expect(window.localStorage.getItem(key)).toBeNull();
  expect(localStore.getItem(key)).not.toBeNull();
  nativeSet.mockRestore();
  vi.resetModules();
  const fresh = await import('@/utils/browserStorage');
  expect(fresh.localStore.getItem(key)).toBeNull();
  record('R3', { saveReportedSuccess: true, durableRecordExists: false, freshModuleCanReadDraft: false });
});

it('P1: reordering a catalogue changes the identity of an unchanged article', () => {
  const a = { code: 'A', description: 'Brick', unit: 'st', defaultUnitPrice: 1, source: 'Owned fixture', priceDate: '2026-10-30' };
  const b = { ...a, code: 'B' };
  const old = parseLibraryJson({ resources: [a, b] }), next = parseLibraryJson({ resources: [b, a] });
  expect(old[0].id).not.toBe(next[1].id);
  record('P1', { code: 'A', idBefore: old[0].id, idAfterReorder: next[1].id });
});

it('P2: ordinary project serialization does not carry the active price catalogue', () => {
  const state = useAppStore.getState(); state.addDocument({ fileName: 'Price provenance' });
  const catalogue = parseLibraryJson({ resources: [{ code: 'A', unit: 'st', defaultUnitPrice: 12, source: 'Owned catalogue', priceDate: '2026-10-30' }] });
  state.setResourceLibrary(catalogue);
  const chapter = state.addChapter(null), post = state.addItem(chapter), row = state.addRegel(post);
  state.updateItem(row, 'resourceLibraryId', catalogue[0].id); state.updateItem(row, 'normUnitPrice', 12);
  const current = useAppStore.getState();
  const restored = deserializeProject(serializeProject(current.schedule, current.items));
  expect(restored.resourceLibrary).toEqual([]);
  expect(restored.items.find(item => item.id === row)?.resourceLibraryId).toBe(catalogue[0].id);
  expect(restored.items.find(item => item.id === row)?.normUnitPrice).toBe(12);
  record('P2', { copiedPricePreserved: true, libraryReferencePreserved: true, catalogueAndItsSourceDatePreserved: false, caveat: 'host save can preserve an original embedded hostProject catalogue' });
});

it('P3: unknown source units are blocked for selection rather than silently converted', () => {
  const row = parseLibraryJson({ resources: [{ code: 'A', unit: 'pallet', defaultUnitPrice: 500 }] })[0];
  expect(row.unitSupported).toBe(false); expect(row.originalUnit).toBe('pallet');
  record('P3', { originalUnit: row.originalUnit, selectionAllowed: row.unitSupported });
});

it('V1: same PDF filename can refer to different content identities', async () => {
  const a = await createPdfSource(new File(['%PDF-1.4\nrevision A'], 'plan.pdf'));
  const b = await createPdfSource(new File(['%PDF-1.4\nrevision B'], 'plan.pdf'));
  expect(a.id).not.toBe(b.id);
  const payload = { format: 'open-pdf-studio-measurements', version: 1, fileName: 'plan.pdf', annotations: [{ id: 'a1', type: 'measureDistance', page: 1, measureValue: 3, measureUnit: 'm' }] };
  expect(importOpenPdfMeasurements(payload, a, 1)[0].value).toBe(3);
  expect(importOpenPdfMeasurements(payload, b, 1)[0].value).toBe(3);
  record('V1', { contentHashDistinguishesRevisions: true, externalMeasurementExportAcceptedForBothSameNamedRevisions: true, caveat: 'synthetic PDF headers; this tests identity/import validation, not PDF rendering' });
});

it('V2: IFC Express IDs can change while GlobalIds and quantities remain identical', async () => {
  const bytes = readFileSync('test/fixtures/ifc-lite/wall-quantities.ifc');
  const a = await parseTakeoff(Uint8Array.from(bytes).buffer, 'model.ifc');
  const renumbered = new TextEncoder().encode(bytes.toString().replace(/#20\b/g, '#120'));
  const b = await parseTakeoff(renumbered.buffer, 'model.ifc');
  expect(a.id).not.toBe(b.id);
  const old = a.elements.find(element => element.expressId === 20)!;
  const next = b.elements.find(element => element.expressId === 120)!;
  expect(next.globalId).toBe(old.globalId);
  expect(aggregateTakeoff(b, [120], 'Qto_WallBaseQuantities/NetVolume').value).toBe(2.4);
  expect(() => aggregateTakeoff(b, [20], 'Qto_WallBaseQuantities/NetVolume')).toThrow();
  record('V2', { unchangedGlobalId: old.globalId, expressIdBefore: 20, expressIdAfter: 120, oldSelectionInvalidInNewRevision: true, netVolume: 2.4 });
});
