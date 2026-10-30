import 'fake-indexeddb/auto';
import { beforeEach, expect, it, vi } from 'vitest';
import { useAppStore } from '@/state/appStore';
import { captureRecovery, listRecovery, removeRecovery, restoreRecovery, writeRecovery } from '@/services/file/recovery';
import { documentChangedSince, serializeDocument } from '@/services/file/documentSnapshot';
const initial = useAppStore.getState();
beforeEach(async () => { useAppStore.setState(initial, true); for (const r of await listRecovery()) await removeRecovery(r.id); });
it('commits every tab, PDF calibration, sheets and snapshots, restoring copies without file paths', async () => {
  const s = useAppStore.getState(); s.addDocument({ fileName: 'A', filePath: '/tmp/original.ifcCalc' });
  s.setSchedule({ pdfWorkspace: { version: 1, activeSourceId: 'pdf', sources: [{ id: 'pdf', fileName: 'plan.pdf', dataBase64: 'JVBERg==', pageScales: { '1': 20 }, measurements: [] }] } });
  s.createSnapshot('A version', 'concept');
  const sheet = s.addSubSheet('Quantities'); s.setSubSheetCell(sheet, 'A1', '123');
  s.addDocument({ fileName: 'B' }); s.createSnapshot('B version', 'concept'); s.updateDocument(useAppStore.getState().activeDocumentId, { isModified: true });
  const record = captureRecovery('window-a')!; await writeRecovery(record);
  useAppStore.setState(initial, true);
  restoreRecovery((await listRecovery())[0]);
  const restored = useAppStore.getState(); expect(restored.documents).toHaveLength(2); expect(restored.snapshots[0].label).toBe('B version');
  expect(restored.documents.every(d => d.filePath === null && d.isModified)).toBe(true);
  restored.setActiveDocument(restored.documents[0].id);
  expect(useAppStore.getState().schedule.pdfWorkspace?.sources[0].pageScales['1']).toBe(20);
  expect(useAppStore.getState().snapshots[0].label).toBe('A version'); expect(useAppStore.getState().subSheets[0].cells.A1.value).toBe('123');
});
it('does not report a successful save when the persistent transaction fails', async () => {
  useAppStore.getState().addDocument({ isModified: true });
  const spy = vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError'); });
  try { await expect(writeRecovery(captureRecovery('quota')!)).rejects.toThrow('Full'); } finally { spy.mockRestore(); }
  expect(await listRecovery()).toEqual([]);
});
it('validates every recovery project before changing any document', () => {
  useAppStore.getState().addDocument({ isModified: true }); const record = captureRecovery('corrupt')!;
  record.documents.push({ fileName: 'broken', originalPath: null, json: 'not JSON' });
  const before = useAppStore.getState().documents;
  expect(() => restoreRecovery(record)).toThrow(); expect(useAppStore.getState().documents).toBe(before);
});
it('keeps edits made while a save was pending dirty, even after a tab switch', () => {
  const s = useAppStore.getState(); s.addDocument({ id: 'save-doc' });
  const chapter = s.addChapter(null), doc = useAppStore.getState().documents[0];
  const saved = serializeDocument(useAppStore.getState(), doc);
  s.updateItem(chapter, 'description', 'New edit'); s.addDocument({ fileName: 'Other' });
  expect(documentChangedSince(useAppStore.getState(), 'save-doc', saved)).toBe(true);
});
