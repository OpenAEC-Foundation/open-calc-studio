import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '@/state/appStore';
import { ResourcePicker } from '@/components/library/ResourcePicker';
import { parseLibraryJson } from '@/state/slices/resourceLibrarySlice';
import { reviewBudget } from '@/services/review/budgetReview';
import { changeLanguage } from '@/i18n/config';
import type { CostItem } from '@/types/costModel';

const s = () => useAppStore.getState();
const initial = useAppStore.getState();
const byId = (id: string) => s().items.find((item) => item.id === id)!;

// ── knownbug 190: een uur-artikel uit de prijzenbibliotheek ───────────────
describe('knownbug 190 — library article with unit "uur" gets exactly its library price', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let descriptor: PropertyDescriptor | undefined;

  beforeEach(async () => {
    await changeLanguage('en');
    useAppStore.setState(initial, true);
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    if (descriptor) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', descriptor);
    else delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  async function pick(resource: Record<string, unknown>): Promise<CostItem> {
    s().addDocument();
    const chapter = s().addChapter(null);
    const post = s().addItem(chapter);
    s().setResourceLibrary(parseLibraryJson({ id: 'lib', currency: 'EUR', resources: [resource] }));
    s().openResourcePicker(post);
    await act(async () => root.render(createElement(ResourcePicker)));
    await act(async () => container.querySelector<HTMLButtonElement>('.resource-picker-add-btn')!.click());
    const row = s().items.find((item) => item.rowType === 'regel')!;
    s().updateItem(row.id, 'quantity', 10);
    return byId(row.id);
  }

  it('a priced labour article (€50/h) costs 10 × 50 = 500, not 1140', async () => {
    const row = await pick({ id: 'tim', code: 'AR.001', description: 'Timmerman', unit: 'uur', resourceType: 'arbeid', defaultUnitPrice: 50 });
    expect(row.unit).toBe('uur');
    expect(row.tariefGroep).toBeNull();
    expect(row.laborPrice).toBeNull();
    expect(row.normUnitPrice).toBe(50);
    expect(row.total).toBe(500);
  });

  it('a priced equipment article per hour gets no hidden labour either', async () => {
    const row = await pick({ id: 'kraan', code: 'MT.001', description: 'Kraan', unit: 'uur', resourceType: 'materieel', defaultUnitPrice: 80 });
    expect(row.resourceType).toBe('materieel');
    expect(row.laborPrice).toBeNull();
    expect(row.total).toBe(800);
  });

  it('an unpriced labour article stays without price, and the review reports the missing price', async () => {
    const row = await pick({ id: 'tim', code: 'AR.001', description: 'Timmerman', unit: 'uur', resourceType: 'arbeid', defaultUnitPrice: null });
    expect(row.tariefGroep).toBeNull();
    expect(row.laborPrice).toBeNull();
    expect(row.normUnitPrice).toBeNull();
    expect(row.total).toBe(0);
    const { issues } = reviewBudget(s() as never);
    expect(issues.some((issue) => issue.itemId === row.id && issue.code === 'missing-price')).toBe(true);
  });

  it('a non-hourly article is unchanged: 10 × €12 = 120', async () => {
    const row = await pick({ id: 'steen', code: 'MA.001', description: 'Baksteen', unit: 'st', resourceType: 'materiaal', defaultUnitPrice: 12 });
    expect(row.laborPrice).toBeNull();
    expect(row.total).toBe(120);
  });
});

// ── knownbug 25: plakken en knippen ───────────────────────────────────────
function bouw() {
  const ch1 = s().addChapter(null);
  s().updateItem(ch1, 'description', 'H1');
  const post1 = s().addItem(ch1);
  s().updateItem(post1, 'description', 'Post 1.1');
  const regel1 = s().addRegel(post1);
  s().updateItem(regel1, 'description', 'Regel 1.1.1');
  const ch2 = s().addChapter(null);
  s().updateItem(ch2, 'description', 'H2');
  const post2 = s().addItem(ch2);
  s().updateItem(post2, 'description', 'Post 2.1');
  const regel2 = s().addRegel(post2);
  s().updateItem(regel2, 'description', 'Regel 2.1.1');
  return { ch1, post1, regel1, ch2, post2, regel2 };
}

/** Zet de actieve rij op een item (zoals een klik in het raster). */
function selecteer(id: string) {
  const index = s().getGridRows().findIndex((row) => row.id === id);
  expect(index).toBeGreaterThanOrEqual(0);
  s().setActiveCell(index, 1);
  expect(s().activeItemId).toBe(id);
}

const met = (description: string) => s().items.filter((item) => item.description === description);
const kinderen = (parentId: string | null) => s().items.filter((item) => (item.parentId ?? null) === parentId).map((item) => item.description);

describe('knownbug 25 — pasted and cut rows land at the paste target', () => {
  beforeEach(() => {
    useAppStore.setState(initial, true);
    s().addDocument();
    s().setItems([]);
    s().setGridView('st');
  });

  it('copying Post 1.1 onto Post 2.1 puts the copy in H2, directly after Post 2.1', () => {
    const { ch1, post1, ch2, post2 } = bouw();
    s().copyItems([byId(post1)]);
    selecteer(post2);
    s().pasteItems();
    expect(kinderen(ch1)).toEqual(['Post 1.1']);
    expect(kinderen(ch2)).toEqual(['Post 2.1', 'Post 1.1']);
    // Het kind reist mee onder de kopie
    const kopie = met('Post 1.1').find((item) => item.id !== post1)!;
    expect(kinderen(kopie.id)).toEqual(['Regel 1.1.1']);
    expect(kopie.depth).toBe(1);
  });

  it('pasted copies get fresh ids and fresh IFC GUIDs (also their children)', () => {
    const { post1, regel1, post2 } = bouw();
    s().copyItems([byId(post1)]);
    selecteer(post2);
    s().pasteItems();
    const ids = s().items.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    const guids = s().items.map((item) => item.ifcGuid).filter(Boolean);
    expect(new Set(guids).size).toBe(guids.length);
    const kopieRegel = met('Regel 1.1.1').find((item) => item.id !== regel1)!;
    expect(kopieRegel.ifcGuid).toMatch(/^[0-9A-Za-z_$]{22}$/);
  });

  it('cut + paste moves Post 1.1 to H2 (one copy, original gone, same identity)', () => {
    const { ch1, post1, ch2, post2 } = bouw();
    const guid = byId(post1).ifcGuid;
    s().cutItems([byId(post1)]);
    selecteer(post2);
    s().pasteItems();
    expect(kinderen(ch1)).toEqual([]);
    expect(kinderen(ch2)).toEqual(['Post 2.1', 'Post 1.1']);
    expect(met('Post 1.1')).toHaveLength(1);
    expect(met('Regel 1.1.1')).toHaveLength(1);
    // Een verplaatsing: hetzelfde object, dus dezelfde IFC-GUID en id
    expect(met('Post 1.1')[0].ifcGuid).toBe(guid);
    expect(met('Post 1.1')[0].id).toBe(post1);
    expect(s().clipboardItems).toEqual([]);
    // Ongedaan maken zet alles terug
    const vorige = s().undo();
    expect(vorige).not.toBeNull();
    s().setItems(vorige!);
    expect(kinderen(ch1)).toEqual(['Post 1.1']);
    expect(kinderen(ch2)).toEqual(['Post 2.1']);
  });

  it('a regel pasted on a begrotingspost goes inside that post', () => {
    const { regel1, post2 } = bouw();
    s().copyItems([byId(regel1)]);
    selecteer(post2);
    s().pasteItems();
    expect(kinderen(post2)).toEqual(['Regel 2.1.1', 'Regel 1.1.1']);
  });

  it('a regel pasted on a regel becomes its sibling in the other post', () => {
    const { regel1, post2, regel2 } = bouw();
    s().copyItems([byId(regel1)]);
    selecteer(regel2);
    s().pasteItems();
    expect(kinderen(post2)).toEqual(['Regel 2.1.1', 'Regel 1.1.1']);
  });

  it('a begrotingspost pasted on a regel goes after that regel\'s post, never inside a post', () => {
    const { post1, ch2, regel2 } = bouw();
    s().copyItems([byId(post1)]);
    selecteer(regel2);
    s().pasteItems();
    expect(kinderen(ch2)).toEqual(['Post 2.1', 'Post 1.1']);
  });

  it('a regel pasted on a chapter goes into the last post of that chapter', () => {
    const { regel1, ch2, post2 } = bouw();
    s().copyItems([byId(regel1)]);
    selecteer(ch2);
    s().pasteItems();
    expect(kinderen(ch2)).toEqual(['Post 2.1']);
    expect(kinderen(post2)).toEqual(['Regel 2.1.1', 'Regel 1.1.1']);
  });

  it('a chapter pasted on a post goes to the top level after that chapter', () => {
    const { ch1, post2 } = bouw();
    s().copyItems([byId(ch1)]);
    selecteer(post2);
    s().pasteItems();
    expect(kinderen(null)).toEqual(['H1', 'H2', 'H1']);
  });

  it('a copy keeps working after its source post is deleted (no invisible orphan)', () => {
    const { post1, post2 } = bouw();
    s().copyItems([byId(post1)]);
    s().deleteItem(post1);
    selecteer(post2);
    s().pasteItems();
    const kopie = met('Post 1.1')[0];
    expect(kopie).toBeDefined();
    expect(s().getGridRows().some((row) => row.id === kopie.id)).toBe(true);
  });

  it('cut + paste on one of the cut rows leaves the rows where they were', () => {
    const { ch1, post1, regel1 } = bouw();
    s().cutItems([byId(post1)]);
    selecteer(regel1);
    s().pasteItems();
    expect(kinderen(ch1)).toEqual(['Post 1.1']);
    expect(kinderen(post1)).toEqual(['Regel 1.1.1']);
    expect(met('Post 1.1')).toHaveLength(1);
  });

  it('pasting into another document puts the copy under the target there, not as orphan', () => {
    const { post1 } = bouw();
    const docA = s().activeDocumentId;
    s().copyItems([byId(post1)]);
    s().addDocument();
    const chB = s().addChapter(null);
    s().updateItem(chB, 'description', 'HB');
    const postB = s().addItem(chB);
    s().updateItem(postB, 'description', 'Post B');
    selecteer(postB);
    s().pasteItems();
    expect(kinderen(chB)).toEqual(['Post B', 'Post 1.1']);
    const kopie = met('Post 1.1')[0];
    expect(kinderen(kopie.id)).toEqual(['Regel 1.1.1']);
    // Kopiëren laat document A ongemoeid
    const a = s().documents.find((doc) => doc.id === docA)!;
    expect(a.items.filter((item) => item.description === 'Post 1.1')).toHaveLength(1);
  });

  it('cut in document A and paste in document B moves the rows out of A', () => {
    const { ch1, post1 } = bouw();
    const docA = s().activeDocumentId;
    s().cutItems([byId(post1)]);
    s().addDocument();
    const chB = s().addChapter(null);
    const postB = s().addItem(chB);
    selecteer(postB);
    s().pasteItems();
    expect(met('Post 1.1')).toHaveLength(1);
    expect(met('Regel 1.1.1')).toHaveLength(1);
    const a = s().documents.find((doc) => doc.id === docA)!;
    expect(a.items.some((item) => item.description === 'Post 1.1' || item.description === 'Regel 1.1.1')).toBe(false);
    expect(a.items.some((item) => item.id === ch1)).toBe(true);
    expect(a.isModified).toBe(true);
    // A kan de verplaatsing ongedaan maken
    s().setActiveDocument(docA);
    const vorige = s().undo();
    expect(vorige?.some((item) => item.description === 'Post 1.1')).toBe(true);
  });
});
