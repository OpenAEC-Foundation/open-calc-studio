/**
 * Knownbugs uit "Tabel, invoer en bediening": 20, 22, 23, 24, 27, 31–35, 46.
 * 26, 29, 37, 38 en 44 zijn kleine wijzigingen in handlers; die test je in de app.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '@/state/appStore';
import { useGridNavigation } from '@/components/grid/useGridNavigation';
import { useGridEditing } from '@/components/grid/useGridEditing';
import { GridCellEditor } from '@/components/grid/GridCellEditor';
import { GridContextMenu } from '@/components/grid/GridContextMenu';
import FindReplaceDialog from '@/components/grid/FindReplaceDialog';
import HomeTab from '@/components/ribbon/HomeTab';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { getColumnsForView } from '@/components/grid/gridConstants';
import type { CostItem } from '@/types/costModel';
import { tsvCell } from '@/services/clipboard/excelClipboard';
import i18next from '@/i18n/config';

const initial = useAppStore.getState();
const s = () => useAppStore.getState();
const item = (id: string) => s().items.find((i) => i.id === id)!;
const rowOf = (id: string) => s().getGridRows().findIndex((r) => r.id === id);
const colOf = (key: string) => getColumnsForView(s().gridView, !!s().schedule.branchesEnabled).findIndex((c) => c.key === key);
const select = (id: string, col = 2) => s().setActiveCell(rowOf(id), col, id);
/** Kinderen van een ouder in zichtbare volgorde. */
const childrenOf = (parentId: string | null) => s().getGridRows()
  .filter((r) => (r.parentId ?? null) === parentId && !r.id.startsWith('footer:'))
  .map((r) => r.description);

let node: HTMLDivElement, root: Root;
let chapter: string, post: string, a: string, b: string, c: string;

async function render(el: React.ReactNode) { await act(async () => root.render(el)); }
async function clickButton(label: string) {
  const btn = [...document.querySelectorAll<HTMLButtonElement>('button')]
    .find((x) => x.querySelector('span')?.textContent?.trim() === label || x.textContent?.trim() === label || x.title === label || x.getAttribute('aria-label') === label);
  expect(btn, `button ${label}`).toBeTruthy();
  await act(async () => btn!.click());
}
async function typeInto(el: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await i18next.changeLanguage('en');
  useAppStore.setState(initial, true);
  s().addDocument({ id: 'kb-grid', items: [] });
  chapter = s().addChapter(null);
  s().updateItem(chapter, 'description', 'H1');
  post = s().addItem(chapter);
  s().updateItem(post, 'description', 'P');
  a = s().addRegel(post); s().updateItem(a, 'description', 'A');
  b = s().addRegel(post, a); s().updateItem(b, 'description', 'B');
  c = s().addRegel(post, b); s().updateItem(c, 'description', 'C');
  useAppStore.setState({ undoStack: [], redoStack: [] });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  node = document.createElement('div'); document.body.append(node); root = createRoot(node);
});
afterEach(async () => { await act(async () => root.unmount()); node.remove(); vi.restoreAllMocks(); });

// --- hulpcomponenten om de hooks te kunnen aanroepen -----------------------
let navKeyDown: (e: React.KeyboardEvent) => void = () => {};
function NavHarness() {
  const rows = s().getGridRows();
  const { handleKeyDown } = useGridNavigation(rows.length, rows);
  navKeyDown = handleKeyDown;
  return null;
}
const key = (k: string, extra: Partial<React.KeyboardEvent> = {}) =>
  ({ key: k, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, preventDefault() {}, ...extra }) as React.KeyboardEvent;

let commit: (item: CostItem, col: number, value: string) => void = () => {};
function EditHarness() { commit = useGridEditing().commitEdit; return null; }

function ShortcutHarness() { useKeyboardShortcuts(); return null; }

describe('knownbug 22 — Delete clears the real field, only where editable', () => {
  it('Prod.norm: clears normQuantity, no stray "productienorm" field', async () => {
    s().updateItem(a, 'normQuantity', 2);
    select(a, colOf('productienorm'));
    await render(<NavHarness />);
    await act(async () => navKeyDown(key('Delete')));
    expect(item(a).normQuantity).toBeNull();
    expect((item(a) as unknown as Record<string, unknown>).productienorm).toBeUndefined();
    expect(s().undoStack).toHaveLength(1);
  });
  it('Unit on a chapter is not editable: nothing changes, no undo step', async () => {
    select(chapter, colOf('unit'));
    const before = item(chapter).unit;
    await render(<NavHarness />);
    await act(async () => navKeyDown(key('Delete')));
    expect(item(chapter).unit).toBe(before);
    expect(s().undoStack).toHaveLength(0);
  });
  it('Price on an imported post also clears its material/labour price', async () => {
    const lone = s().addItem(chapter);
    s().updateItem(lone, 'quantity', 2);
    s().updateItem(lone, 'materialPrice', 7);
    select(lone, colOf('normUnitPrice'));
    await render(<NavHarness />);
    await act(async () => navKeyDown(key('Delete')));
    expect(item(lone).materialPrice).toBeNull();
    expect(s().undoStack).toHaveLength(1);
  });
  it('an already empty cell adds no undo step', async () => {
    select(a, colOf('productienorm'));
    s().updateItem(a, 'normQuantity', null);
    await render(<NavHarness />);
    await act(async () => navKeyDown(key('Delete')));
    expect(s().undoStack).toHaveLength(0);
  });
});

describe('knownbug 46 — invalid number input adds no undo step', () => {
  it('"abc" in Quantity keeps the redo list', async () => {
    await render(<EditHarness />);
    s().pushHistory(s().items, 'x');
    s().undo();
    expect(s().redoStack).toHaveLength(1);
    await act(async () => commit(item(a), colOf('quantity'), 'abc'));
    expect(s().redoStack).toHaveLength(1);
    expect(s().undoStack).toHaveLength(0);
  });
});

describe('knownbug 20 — Tab in the cell editor skips hidden columns', () => {
  it('jumps over a hidden Prod.norm column', async () => {
    useAppStore.setState({ hiddenColumns: { 'st:productienorm': true } });
    const q = colOf('quantity');
    select(a, q);
    await render(<GridCellEditor item={item(a)} colIndex={q} style={{}} onCommit={() => {}} />);
    const input = node.querySelector('input')!;
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })));
    expect(s().activeCol).not.toBe(colOf('productienorm'));
    expect(s().activeCol).toBeGreaterThan(q);
  });
});

describe('knownbug 24 — Ctrl+Z works with Caps Lock on', () => {
  it('Ctrl+"Z" (Caps Lock) undoes; Ctrl+Shift+Z redoes', async () => {
    await render(<ShortcutHarness />);
    s().pushHistory(s().items, 'rename');
    s().updateItem(a, 'description', 'changed');
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Z', ctrlKey: true })); });
    expect(item(a).description).toBe('A');
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Z', ctrlKey: true, shiftKey: true })); });
    expect(item(a).description).toBe('changed');
  });
});

describe('knownbug 23 — find/replace', () => {
  it('replace-all changes both code and description, and "$\'" stays literal', async () => {
    s().updateItem(a, 'code', 'BET');
    s().updateItem(a, 'description', 'Beton storten');
    await render(<FindReplaceDialog open onClose={vi.fn()} />);
    const [find, repl] = node.querySelectorAll('input');
    await typeInto(find, 'bet');
    await typeInto(repl, "X$'");
    await clickButton(i18next.t('findReplace.all', { ns: 'grid' }));
    expect(item(a).code).toBe("X$'");
    expect(item(a).description).toBe("X$'on storten");
    expect(s().undoStack).toHaveLength(1);
  });
});

describe('context menu — knownbugs 31, 34, 35', () => {
  const menu = (id: string) => <GridContextMenu x={0} y={0} rowIndex={rowOf(id)} itemId={id} onClose={() => {}} />;

  it('31: insert above the first child lands above it', async () => {
    select(a);
    await render(menu(a));
    await clickButton(i18next.t('insertRowAbove'));
    const kids = childrenOf(post);
    expect(kids.slice(1)).toEqual(['A', 'B', 'C']);
    expect(kids).toHaveLength(4);
  });

  it('31: insert above on a chapter makes the first child', async () => {
    select(chapter);
    await render(menu(chapter));
    await clickButton(i18next.t('insertRowAbove'));
    expect(childrenOf(chapter)[1]).toBe('P');
    expect(childrenOf(chapter)).toHaveLength(2);
  });

  it('34: outdenting A and B keeps their order', async () => {
    select(a);
    s().setSelectionRange(rowOf(a), rowOf(b));
    await render(menu(a));
    await clickButton(i18next.t('outdent'));
    expect(childrenOf(post)).toEqual(['C']);
    expect(childrenOf(chapter)).toEqual(['P', 'A', 'B']);
    expect(item(a).depth).toBe(item(post).depth);
  });

  it('34: a top-level chapter with its post selected: the post still outdents', async () => {
    select(chapter);
    s().setSelectionRange(rowOf(chapter), rowOf(post));
    await render(menu(chapter));
    await clickButton(i18next.t('outdent'));
    expect(item(post).parentId ?? null).toBeNull();
  });

  it('34: nothing to outdent adds no undo step', async () => {
    select(chapter);
    await render(menu(chapter));
    await clickButton(i18next.t('outdent'));
    expect(s().undoStack).toHaveLength(0);
  });

  it('31: insert above on a top-level post puts the line inside it', async () => {
    const loose = s().addItem(null); s().updateItem(loose, 'description', 'Loose');
    useAppStore.setState({ undoStack: [] });
    select(loose);
    await render(menu(loose));
    await clickButton(i18next.t('insertRowAbove'));
    const added = s().items.filter((i) => i.rowType === 'regel' && i.parentId == null);
    expect(added).toHaveLength(0);
    expect(childrenOf(loose)).toHaveLength(1);
  });

  it('35: a selected chapter does not move along into another chapter', async () => {
    const h2 = s().addChapter(null); s().updateItem(h2, 'description', 'H2');
    const h3 = s().addChapter(null); s().updateItem(h3, 'description', 'H3');
    const p2 = s().addItem(h2); s().updateItem(p2, 'description', 'P2');
    select(c);
    s().setSelectionRange(rowOf(c), rowOf(p2));
    await render(menu(c));
    await clickButton(i18next.t('grid:contextMenu.moveTo'));
    await clickButton('H3');
    expect(item(h2).parentId ?? null).toBeNull();
    expect(childrenOf(h3)).toEqual(['C', 'P2']);
  });

  it('35: move to chapter appends at the end with the right depth, also for a selection', async () => {
    const h2 = s().addChapter(null);
    s().updateItem(h2, 'description', 'H2');
    const p2 = s().addItem(h2); s().updateItem(p2, 'description', 'P2');
    select(a);
    s().setSelectionRange(rowOf(a), rowOf(b));
    await render(menu(a));
    await clickButton(i18next.t('grid:contextMenu.moveTo'));
    await clickButton('H2');
    expect(childrenOf(h2)).toEqual(['P2', 'A', 'B']);
    expect(item(a).depth).toBe(item(p2).depth);
  });
});

describe('ribbon — knownbugs 32, 33', () => {
  it('33: New chapter on a row makes a top-level chapter after the current one', async () => {
    const h2 = s().addChapter(null); s().updateItem(h2, 'description', 'H2');
    select(b);
    await render(<HomeTab />);
    await clickButton(i18next.t('home.chapter', { ns: 'ribbon' }));
    const chapters = s().getGridRows().filter((i) => i.rowType === 'chapter');
    expect(chapters).toHaveLength(3);
    expect(chapters.every((ch) => ch.parentId == null)).toBe(true);
    // Het nieuwe hoofdstuk staat direct na H1, vóór het later toegevoegde H2.
    expect(chapters.map((ch) => ch.description)[0]).toBe('H1');
    expect(chapters.map((ch) => ch.description)[2]).toBe('H2');
  });

  it('32: New post on a row lands right after the current post', async () => {
    const p2 = s().addItem(chapter); s().updateItem(p2, 'description', 'P2');
    select(b);
    await render(<HomeTab />);
    await clickButton(i18next.t('home.budgetPost', { ns: 'ribbon' }));
    const kids = childrenOf(chapter);
    expect(kids[0]).toBe('P');
    expect(kids[2]).toBe('P2');
    expect(kids).toHaveLength(3);
  });

  it('32: New post on a chapter lands last in that chapter', async () => {
    select(chapter);
    await render(<HomeTab />);
    await clickButton(i18next.t('home.budgetPost', { ns: 'ribbon' }));
    const kids = childrenOf(chapter);
    expect(kids[0]).toBe('P');
    expect(kids).toHaveLength(2);
  });
});

describe('knownbug 27 — TSV cells with tabs or line breaks are quoted', () => {
  it('quotes and doubles quotes only when needed', () => {
    expect(tsvCell('plain')).toBe('plain');
    expect(tsvCell('a\tb')).toBe('"a\tb"');
    expect(tsvCell('line 1\nline 2')).toBe('"line 1\nline 2"');
    expect(tsvCell('12" pipe')).toBe('"12"" pipe"');
  });
});
