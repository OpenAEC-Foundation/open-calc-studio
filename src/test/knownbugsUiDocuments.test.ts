import { beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '@/state/appStore';

const initial = useAppStore.getState();
beforeEach(() => {
  useAppStore.setState(initial, true);
  for (const id of ['a', 'b', 'c', 'd']) useAppStore.getState().addDocument({ id, fileName: id.toUpperCase() });
});

describe('knownbug 116: een gesplitst document sluiten', () => {
  it('zet de gesplitste weergave uit als het gesplitste document sluit', () => {
    const s = useAppStore.getState();
    s.setActiveDocument('a');
    s.setSplitDocumentId('b');
    useAppStore.getState().removeDocument('b');
    const after = useAppStore.getState();
    expect(after.splitDocumentId).toBeNull();
    expect(after.splitView).toBe(false);
  });

  it('laat de gesplitste weergave staan als een ander document sluit', () => {
    const s = useAppStore.getState();
    s.setActiveDocument('a');
    s.setSplitDocumentId('b');
    useAppStore.getState().removeDocument('c');
    expect(useAppStore.getState().splitDocumentId).toBe('b');
    expect(useAppStore.getState().splitView).toBe(true);
  });
});

describe('knownbug 261: het actieve tabblad sluiten', () => {
  it('kiest het tabblad op dezelfde plek in plaats van het eerste', () => {
    useAppStore.getState().setActiveDocument('c');
    useAppStore.getState().removeDocument('c');
    expect(useAppStore.getState().activeDocumentId).toBe('d');
  });

  it('kiest het vorige tabblad als het laatste sluit', () => {
    useAppStore.getState().setActiveDocument('d');
    useAppStore.getState().removeDocument('d');
    expect(useAppStore.getState().activeDocumentId).toBe('c');
    expect(useAppStore.getState().items).toBe(useAppStore.getState().documents.find(d => d.id === 'c')!.items);
  });
});
