import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '@/state/appStore';

/**
 * insertRegelBelow — de gedeelde actie achter de +-knop links bij de rij en
 * de lint-knoppen ("+ Regel" / "Rekenregel").
 */
describe('insertRegelBelow', () => {
  beforeEach(() => {
    const store = useAppStore.getState();
    store.resetSchedule();
    store.setItems([]);
  });

  const s = () => useAppStore.getState();

  it('lege begroting: maakt hoofdstuk + post + regel aan', () => {
    const id = s().insertRegelBelow(null);
    const items = s().items;
    const regel = items.find((i) => i.id === id);
    expect(regel?.rowType).toBe('regel');
    const post = items.find((i) => i.id === regel?.parentId);
    expect(post?.rowType).toBe('begrotingspost');
    const chapter = items.find((i) => i.id === post?.parentId);
    expect(chapter?.rowType).toBe('chapter');
  });

  it('op een regel: nieuwe regel als broertje direct eronder', () => {
    const chapterId = s().addChapter(null);
    const postId = s().addItem(chapterId);
    const r1 = s().addRegel(postId);
    const r2 = s().addRegel(postId);

    const nieuw = s().insertRegelBelow(r1);
    const items = s().items;
    const regel = items.find((i) => i.id === nieuw);
    expect(regel?.rowType).toBe('regel');
    expect(regel?.parentId).toBe(postId);
    // Direct onder r1, dus vóór r2 in de array
    const idxNieuw = items.findIndex((i) => i.id === nieuw);
    const idxR1 = items.findIndex((i) => i.id === r1);
    const idxR2 = items.findIndex((i) => i.id === r2);
    expect(idxNieuw).toBe(idxR1 + 1);
    expect(idxNieuw).toBeLessThan(idxR2);
  });

  it('op een begrotingspost: regel als laatste kind ín de post', () => {
    const chapterId = s().addChapter(null);
    const postId = s().addItem(chapterId);
    s().addRegel(postId);

    const nieuw = s().insertRegelBelow(postId);
    const regel = s().items.find((i) => i.id === nieuw);
    expect(regel?.rowType).toBe('regel');
    expect(regel?.parentId).toBe(postId);
    // Laatste kind van de post
    const kinderen = s().items.filter((i) => i.parentId === postId);
    expect(kinderen[kinderen.length - 1].id).toBe(nieuw);
  });

  it('op een hoofdstuk: regel in de laatste post van dat hoofdstuk', () => {
    const chapterId = s().addChapter(null);
    s().addItem(chapterId); // post 1
    const post2 = s().addItem(chapterId); // post 2 (laatste)

    const nieuw = s().insertRegelBelow(chapterId);
    const regel = s().items.find((i) => i.id === nieuw);
    expect(regel?.parentId).toBe(post2);
  });

  it('op een hoofdstuk zonder posten: maakt eerst een post aan', () => {
    const chapterId = s().addChapter(null);
    const nieuw = s().insertRegelBelow(chapterId);
    const regel = s().items.find((i) => i.id === nieuw);
    const post = s().items.find((i) => i.id === regel?.parentId);
    expect(post?.rowType).toBe('begrotingspost');
    expect(post?.parentId).toBe(chapterId);
  });
});
