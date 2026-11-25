import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useAppStore } from '@/state/appStore';
import i18next from '@/i18n/config';

let node: HTMLDivElement, root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  node = document.createElement('div'); document.body.append(node); root = createRoot(node);
});
afterEach(async () => { await act(async () => root.unmount()); node.remove(); });

describe('knownbug 39: Ctrl+, opent de voorkeuren', () => {
  it('roept onOpenSettings aan bij Ctrl+, en Cmd+,', async () => {
    const open = vi.fn();
    function Harness() { useKeyboardShortcuts({ onOpenSettings: open }); return null; }
    await act(async () => root.render(<Harness />));
    const press = (init: KeyboardEventInit) => {
      const event = new KeyboardEvent('keydown', { key: ',', bubbles: true, cancelable: true, ...init });
      document.body.dispatchEvent(event);
      return event;
    };
    expect(press({ ctrlKey: true }).defaultPrevented).toBe(true);
    press({ metaKey: true });
    press({}); // zonder Ctrl niets
    expect(open).toHaveBeenCalledTimes(2);
  });
});

describe('knownbug 30: Ctrl+X na een sleepselectie', () => {
  it('knipt de regels van het gesleepte celbereik, niet de eerder actieve regel', async () => {
    await i18next.changeLanguage('en');
    useAppStore.setState({ documents: [], activeDocumentId: '', items: [], undoStack: [], redoStack: [], activeContentTab: 'grid', clipboardItems: [] });
    const s = useAppStore.getState();
    s.addDocument({ id: 'kb30', items: [] });
    const chapter = s.addChapter(null);
    const post = s.addItem(chapter);
    const a = s.addRegel(post); const b = s.addRegel(post, a); const c = s.addRegel(post, b);
    const rowOf = (id: string) => useAppStore.getState().getGridRows().findIndex((r) => r.id === id);
    // Eerst regel a actief, dan een sleepselectie over b..c (geen click: de muis
    // ging op een andere cel omhoog, dus activeRow blijft a).
    useAppStore.getState().setActiveCell(rowOf(a), 2, a);
    useAppStore.getState().setCellSelection({ row: rowOf(b), col: 2 }, { row: rowOf(c), col: 3 });
    function Harness() { useKeyboardShortcuts(); return null; }
    await act(async () => root.render(<Harness />));
    const grid = document.createElement('div'); grid.className = 'cost-grid-wrapper'; grid.tabIndex = 0; document.body.append(grid);
    await act(async () => { grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', ctrlKey: true, bubbles: true, cancelable: true })); });
    grid.remove();
    const cut = (useAppStore.getState().clipboardItems ?? []).map((i) => i.id);
    expect(useAppStore.getState().clipboardMode).toBe('cut');
    expect(cut).toEqual(expect.arrayContaining([b, c]));
    expect(cut).not.toContain(a);
  });

  it('een achtergebleven bereik van één cel (klik op de inklap-chevron) knipt de actieve regel', async () => {
    await i18next.changeLanguage('en');
    useAppStore.setState({ documents: [], activeDocumentId: '', items: [], undoStack: [], redoStack: [], activeContentTab: 'grid', clipboardItems: [] });
    const s = useAppStore.getState();
    s.addDocument({ id: 'kb30b', items: [] });
    const chapterH = s.addChapter(null);
    const postInH = s.addItem(chapterH);
    s.addRegel(postInH);
    const other = s.addChapter(null);
    const postA = s.addItem(other);
    const rowOf = (id: string) => useAppStore.getState().getGridRows().findIndex((r) => r.id === id);
    // Post A is actief; daarna een mousedown op de chevron van hoofdstuk H.
    // Die zet een bereik van één cel, de click wordt door de chevron gestopt.
    useAppStore.getState().setActiveCell(rowOf(postA), 2, postA);
    useAppStore.getState().setCellSelection({ row: rowOf(chapterH), col: 2 }, { row: rowOf(chapterH), col: 2 });
    function Harness() { useKeyboardShortcuts(); return null; }
    await act(async () => root.render(<Harness />));
    const grid = document.createElement('div'); grid.className = 'cost-grid-wrapper'; grid.tabIndex = 0; document.body.append(grid);
    await act(async () => { grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', ctrlKey: true, bubbles: true, cancelable: true })); });
    grid.remove();
    const cut = (useAppStore.getState().clipboardItems ?? []).map((i) => i.id);
    expect(cut).toContain(postA);
    expect(cut).not.toContain(chapterH);
    expect(cut).not.toContain(postInH);
  });
});
