import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '@/state/appStore';

const s = () => useAppStore.getState();

beforeEach(() => {
  s().resetSchedule();
  s().setItems([]);
});

describe('eigen prijs op een (bewakings)post telt door', () => {
  it('kale begrotingspost: aantal × prijs/middel', () => {
    const ch = s().addChapter(null);
    const post = s().addItem(ch);
    s().updateItem(post, 'quantity', 1);
    s().updateItem(post, 'normUnitPrice', 550);
    expect(s().items.find(i => i.id === post)!.total).toBe(550);
  });

  it('post met lege bewakingspost en tekstregel eronder: eigen prijs blijft tellen', () => {
    // Praktijkgeval: "Opstellen V&G plan" 1,00 st × 550 met daaronder een
    // lege bewakingspost + tekstregel "door opdrachtgever" — de 550 mag
    // niet verdwijnen doordat de kinderen 0 opleveren.
    const ch = s().addChapter(null);
    const post = s().addItem(ch);
    s().updateItem(post, 'quantity', 1);
    s().updateItem(post, 'normUnitPrice', 550);
    s().addBewakingspost(post);
    s().addTekstregel(post);
    expect(s().items.find(i => i.id === post)!.total).toBe(550);
    expect(s().items.find(i => i.id === ch)!.total).toBe(550);
  });

  it('zodra kinderen rekenen, winnen de kinderen', () => {
    const ch = s().addChapter(null);
    const post = s().addItem(ch);
    s().updateItem(post, 'quantity', 1);
    s().updateItem(post, 'normUnitPrice', 550);
    const bw = s().addBewakingspost(post);
    const regel = s().addRegel(bw);
    s().updateItem(regel, 'quantity', 2);
    s().updateItem(regel, 'normUnitPrice', 100);
    expect(s().items.find(i => i.id === post)!.total).toBe(200);
  });

  it('kale bewakingspost met eigen prijs rekent ook', () => {
    const ch = s().addChapter(null);
    const post = s().addItem(ch);
    const bw = s().addBewakingspost(post);
    s().updateItem(bw, 'quantity', 3);
    s().updateItem(bw, 'normUnitPrice', 50);
    expect(s().items.find(i => i.id === bw)!.total).toBe(150);
    expect(s().items.find(i => i.id === post)!.total).toBe(150);
  });
});
