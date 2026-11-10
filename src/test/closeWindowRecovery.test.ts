import 'fake-indexeddb/auto';
import { beforeEach, expect, it } from 'vitest';
import { useAppStore } from '@/state/appStore';
import { confirmAndCloseWindow } from '@/services/file/closeDocuments';
import { captureRecovery, listRecovery, recoveryWindowId, removeRecovery, resumeRecovery, writeRecovery } from '@/services/file/recovery';

// knownbugs 263: "Don't save" on close must not come back as recovery next time.
const initial = useAppStore.getState();
const journal = async () => (await listRecovery()).map(r => r.id);
beforeEach(async () => {
  resumeRecovery();
  useAppStore.setState(initial, true);
  for (const r of await listRecovery()) await removeRecovery(r.id);
  useAppStore.getState().addDocument({ id: 'a', fileName: 'A', isModified: true });
  await writeRecovery(captureRecovery(recoveryWindowId())!);
  await writeRecovery({ ...captureRecovery('older-crash')!, id: 'older-crash' });
});

it('drops this window journal on "Don\'t save" and does not write it again on pagehide', async () => {
  const late = captureRecovery(recoveryWindowId()); // captured before the close, written after (queued flush)
  let destroyed = false;
  expect(await confirmAndCloseWindow(async () => 'discard', async () => {}, async () => { destroyed = true; })).toBe(true);
  expect(destroyed).toBe(true);
  expect(await journal()).toEqual(['older-crash']);
  // What the pagehide flush does: capture, then write or remove.
  expect(captureRecovery(recoveryWindowId())).toBeNull();
  await writeRecovery(late!);
  expect(await journal()).toEqual(['older-crash']);
});

it('keeps the journal when the close is cancelled', async () => {
  let destroyed = false;
  expect(await confirmAndCloseWindow(async () => 'cancel', async () => {}, async () => { destroyed = true; })).toBe(false);
  expect(destroyed).toBe(false);
  expect((await journal()).sort()).toEqual(['older-crash', recoveryWindowId()].sort());
  expect(captureRecovery(recoveryWindowId())).not.toBeNull();
});

it('drops the journal after saving every tab', async () => {
  const save = async () => { const s = useAppStore.getState(); s.updateDocument(s.activeDocumentId, { isModified: false }); };
  expect(await confirmAndCloseWindow(async () => 'save', save, async () => {})).toBe(true);
  expect(await journal()).toEqual(['older-crash']);
});

it('keeps journaling when the window fails to close', async () => {
  await expect(confirmAndCloseWindow(async () => 'discard', async () => {}, async () => { throw Error('no'); })).rejects.toThrow('no');
  const record = captureRecovery(recoveryWindowId());
  expect(record).not.toBeNull();
  await writeRecovery(record!);
  expect(await journal()).toContain(recoveryWindowId());
});
