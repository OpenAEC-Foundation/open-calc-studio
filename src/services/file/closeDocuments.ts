import { useAppStore } from '@/state/appStore';
import { projectContentKey, serializeDocument } from './documentSnapshot';
import { discardRecoveryOnClose, resumeRecovery } from './recovery';

/** Approve each dirty tab; edits arriving during another prompt need fresh approval. */
export async function resolveUnsavedDocuments(ask: (name: string) => Promise<'save' | 'discard' | 'cancel'>, save: () => Promise<void>): Promise<boolean> {
  const discarded = new Map<string, string>();
  for (;;) {
    const state = useAppStore.getState();
    const doc = state.documents.find(doc => doc.isModified && discarded.get(doc.id) !== projectContentKey(serializeDocument(state, doc)));
    if (!doc) return true;
    state.setActiveDocument(doc.id);
    const current = useAppStore.getState(), active = current.documents.find(d => d.id === doc.id)!;
    const key = projectContentKey(serializeDocument(current, active));
    const result = await ask(doc.fileName);
    if (result === 'cancel') return false;
    if (result === 'discard') discarded.set(doc.id, key);
    else {
      if (!useAppStore.getState().documents.some(d => d.id === doc.id)) continue;
      useAppStore.getState().setActiveDocument(doc.id);
      await save();
      if (useAppStore.getState().documents.find(d => d.id === doc.id)?.isModified) return false;
    }
  }
}

/**
 * Close the window once every dirty tab is saved or deliberately discarded. The window's recovery
 * journal goes first: "Don't save" must not come back as recovery next time (knownbugs 263).
 */
export async function confirmAndCloseWindow(ask: (name: string) => Promise<'save' | 'discard' | 'cancel'>, save: () => Promise<void>, destroy: () => Promise<void>): Promise<boolean> {
  if (!await resolveUnsavedDocuments(ask, save)) return false;
  await discardRecoveryOnClose();
  try { await destroy(); } catch (error) { resumeRecovery(); throw error; }
  return true;
}
