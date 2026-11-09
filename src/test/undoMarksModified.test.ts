import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '@/state/appStore';
import { captureRecovery } from '@/services/file/recovery';

// knownbugs 114 / issue #66 point 2: edit, save, Ctrl+Z must leave the document modified.
const initial = useAppStore.getState();
let lineId: string;
const doc = () => useAppStore.getState().documents.find(d => d.id === 'undo-doc')!;
const markSaved = () => useAppStore.getState().updateDocument('undo-doc', { isModified: false });

beforeEach(() => {
  useAppStore.setState(initial, true);
  const s = useAppStore.getState();
  s.addDocument({ id: 'undo-doc', items: [] });
  lineId = s.addRegel(s.addItem(s.addChapter(null)));
  useAppStore.setState({ undoStack: [], redoStack: [] });
  s.pushHistory(useAppStore.getState().items, 'edit'); // as the grid does before an edit
  s.updateItem(lineId, 'quantity', 5);
  markSaved();
});

describe('undo/redo after save', () => {
  it('undo marks the saved document modified, so close asks and recovery keeps it', () => {
    const s = useAppStore.getState();
    const restored = s.undo();
    expect(restored).not.toBeNull();
    s.setItems(restored!);
    expect(useAppStore.getState().items.find(i => i.id === lineId)!.quantity).not.toBe(5);
    expect(doc().isModified).toBe(true);
    expect(captureRecovery('rec')).not.toBeNull();
  });

  it('redo marks the saved document modified', () => {
    const s = useAppStore.getState();
    s.setItems(s.undo()!);
    markSaved();
    s.setItems(useAppStore.getState().redo()!);
    expect(useAppStore.getState().items.find(i => i.id === lineId)!.quantity).toBe(5);
    expect(doc().isModified).toBe(true);
  });

  it('undo with an empty stack does not mark the document modified', () => {
    useAppStore.setState({ undoStack: [], redoStack: [] });
    expect(useAppStore.getState().undo()).toBeNull();
    expect(useAppStore.getState().redo()).toBeNull();
    expect(doc().isModified).toBe(false);
  });
});
