import { beforeEach, expect, it } from 'vitest';
import { useAppStore } from '@/state/appStore';
import { resolveUnsavedDocuments } from '@/services/file/closeDocuments';
const initial = useAppStore.getState();
beforeEach(() => { useAppStore.setState(initial, true); useAppStore.getState().addDocument({ id: 'a', fileName: 'A', isModified: true }); useAppStore.getState().addDocument({ id: 'b', fileName: 'B', isModified: true }); });
it('saves the tab being confirmed instead of the previously active tab', async () => {
  const saved: string[] = [];
  expect(await resolveUnsavedDocuments(async () => 'save', async () => { const s = useAppStore.getState(); saved.push(s.activeDocumentId); s.updateDocument(s.activeDocumentId, { isModified: false }); })).toBe(true);
  expect(saved).toEqual(['a', 'b']);
});
it('does not close if a later tab is cancelled or save fails', async () => {
  expect(await resolveUnsavedDocuments(async name => name === 'A' ? 'discard' : 'cancel', async () => {})).toBe(false);
  expect(await resolveUnsavedDocuments(async () => 'save', async () => {})).toBe(false);
});
it('asks again for a discarded tab edited while another tab was being confirmed', async () => {
  const asked: string[] = [];
  expect(await resolveUnsavedDocuments(async name => {
    asked.push(name);
    if (name === 'B') { useAppStore.getState().setActiveDocument('a'); useAppStore.getState().addChapter(null); }
    return asked.length === 3 ? 'cancel' : 'discard';
  }, async () => {})).toBe(false);
  expect(asked).toEqual(['A', 'B', 'A']);
});
