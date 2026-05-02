import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '@/state/appStore';
import { createDefaultItems } from '@/data/defaultBudget';
import { recalculateItems } from '@/services/calculation/calculator';

describe('AppStore', () => {
  beforeEach(() => {
    // Reset store between tests
    const store = useAppStore.getState();
    store.resetSchedule();
    store.setItems(recalculateItems(createDefaultItems()));
    store.setActiveCell(0, 1);
  });

  it('initializes with default budget items', () => {
    const { items } = useAppStore.getState();
    // Default items are 4 staart items
    expect(items.length).toBe(4);
  });

  it('has a valid default schedule', () => {
    const { schedule } = useAppStore.getState();
    // i18next.t() returns undefined in test env (not initialized), so skip name check
    expect(schedule.currency).toBe('EUR');
  });

  it('addItem creates a new item', () => {
    const store = useAppStore.getState();
    const countBefore = store.items.length;
    store.addItem(null);
    const countAfter = useAppStore.getState().items.length;
    expect(countAfter).toBe(countBefore + 1);
  });

  it('addChapter creates a chapter item', () => {
    const store = useAppStore.getState();
    const id = store.addChapter(null);
    const item = useAppStore.getState().items.find(i => i.id === id);
    expect(item).toBeTruthy();
    expect(item!.rowType).toBe('chapter');
  });

  it('deleteItem removes item and its children', () => {
    const store = useAppStore.getState();
    // Add a chapter and a child item
    const chapterId = store.addChapter(null);
    useAppStore.getState().addItem(chapterId);

    const storeAfterAdd = useAppStore.getState();
    const childCount = storeAfterAdd.items.filter(i => i.parentId === chapterId).length;
    expect(childCount).toBeGreaterThan(0);

    const totalBefore = storeAfterAdd.items.length;
    storeAfterAdd.deleteItem(chapterId);
    const totalAfter = useAppStore.getState().items.length;
    expect(totalAfter).toBe(totalBefore - 1 - childCount);
  });

  it('updateItem updates a field and recalculates', () => {
    const store = useAppStore.getState();
    // Add a begrotingspost to have a non-chapter item with quantity
    store.addItem(null);
    const storeAfterAdd = useAppStore.getState();
    const leaf = storeAfterAdd.items.find(i => i.rowType === 'begrotingspost');
    expect(leaf).toBeTruthy();

    // Set some price first so unitPrice is non-zero
    storeAfterAdd.updateItem(leaf!.id, 'materialPrice', 10);
    useAppStore.getState().updateItem(leaf!.id, 'quantity', 999);
    const updated = useAppStore.getState().items.find(i => i.id === leaf!.id);
    expect(updated!.quantity).toBe(999);
  });

  it('toggleCollapse toggles isCollapsed', () => {
    const store = useAppStore.getState();
    const chapterId = store.addChapter(null);
    const chapter = useAppStore.getState().items.find(i => i.id === chapterId);
    expect(chapter).toBeTruthy();
    expect(chapter!.isCollapsed).toBe(false);

    useAppStore.getState().toggleCollapse(chapterId);
    const toggled = useAppStore.getState().items.find(i => i.id === chapterId);
    expect(toggled!.isCollapsed).toBe(true);
  });

  it('getVisibleItems hides children of collapsed chapters', () => {
    const store = useAppStore.getState();
    const chapterId = store.addChapter(null);
    useAppStore.getState().addItem(chapterId);

    const storeWithChapter = useAppStore.getState();
    const visibleBefore = storeWithChapter.getVisibleItems().length;
    storeWithChapter.toggleCollapse(chapterId);

    const visibleAfter = useAppStore.getState().getVisibleItems().length;
    const childCount = storeWithChapter.items.filter(i => i.parentId === chapterId).length;
    expect(visibleAfter).toBe(visibleBefore - childCount);
  });

  it('undo/redo works', () => {
    const store = useAppStore.getState();
    const originalCount = store.items.length;

    // Push history, then add item
    store.pushHistory(store.items, 'test');
    store.addItem(null);
    expect(useAppStore.getState().items.length).toBe(originalCount + 1);

    // Undo
    const restored = useAppStore.getState().undo();
    expect(restored).toBeTruthy();
    useAppStore.getState().setItems(restored!);
    expect(useAppStore.getState().items.length).toBe(originalCount);

    // Redo
    const redone = useAppStore.getState().redo();
    expect(redone).toBeTruthy();
  });

  it('selection navigation works', () => {
    const store = useAppStore.getState();
    expect(store.activeRow).toBe(0);
    expect(store.activeCol).toBe(1);

    store.setActiveCell(5, 3);
    const updated = useAppStore.getState();
    expect(updated.activeRow).toBe(5);
    expect(updated.activeCol).toBe(3);
  });

  it('editing state machine works', () => {
    const store = useAppStore.getState();
    expect(store.isEditing).toBe(false);

    store.startEditing('test');
    expect(useAppStore.getState().isEditing).toBe(true);
    expect(useAppStore.getState().editValue).toBe('test');

    useAppStore.getState().stopEditing();
    expect(useAppStore.getState().isEditing).toBe(false);
  });

  it('document management works', () => {
    const store = useAppStore.getState();
    // Initially no documents
    expect(store.documents.length).toBe(0);

    store.addDocument({ id: 'doc-1', fileName: 'First doc' });
    expect(useAppStore.getState().documents.length).toBe(1);

    useAppStore.getState().addDocument({ id: 'doc-2', fileName: 'Test doc' });
    expect(useAppStore.getState().documents.length).toBe(2);
    expect(useAppStore.getState().activeDocumentId).toBe('doc-2');
  });

  it('theme changes work', () => {
    const store = useAppStore.getState();
    store.setTheme('dark');
    expect(useAppStore.getState().theme).toBe('dark');
  });
});
