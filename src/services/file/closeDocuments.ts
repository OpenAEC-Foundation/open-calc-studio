import { useAppStore } from '@/state/appStore';
import { projectContentKey, serializeDocument } from './documentSnapshot';

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
