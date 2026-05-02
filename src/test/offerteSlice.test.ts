import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '@/state/appStore';

const getState = () => useAppStore.getState();

describe('offerteSlice v2', () => {
  beforeEach(() => {
    getState().resetOfferte();
  });

  it('addSectionItem creates item with afbeeldingen and subItems arrays', () => {
    const sectionId = getState().addSection('technisch');
    getState().addSectionItem(sectionId);
    const section = getState().offerte.secties.find(s => s.id === sectionId)!;
    expect(section.items[0].afbeeldingen).toEqual([]);
    expect(section.items[0].subItems).toEqual([]);
  });

  it('addImage adds an OfferteImage to a section item', () => {
    const sectionId = getState().addSection('technisch');
    getState().addSectionItem(sectionId);
    const itemId = getState().offerte.secties.find(s => s.id === sectionId)!.items[0].id;

    getState().addImage(sectionId, itemId, { id: 'img1', path: '/test.jpg', thumbnail: 'data:image/jpeg;base64,abc' });

    const item = getState().offerte.secties.find(s => s.id === sectionId)!.items[0];
    expect(item.afbeeldingen).toHaveLength(1);
    expect(item.afbeeldingen[0].path).toBe('/test.jpg');
  });

  it('removeImage removes an image by id', () => {
    const sectionId = getState().addSection('technisch');
    getState().addSectionItem(sectionId);
    const itemId = getState().offerte.secties.find(s => s.id === sectionId)!.items[0].id;
    getState().addImage(sectionId, itemId, { id: 'img1', path: '/test.jpg', thumbnail: 'data:...' });
    getState().removeImage(sectionId, itemId, 'img1');

    const item = getState().offerte.secties.find(s => s.id === sectionId)!.items[0];
    expect(item.afbeeldingen).toHaveLength(0);
  });

  it('updateImage updates caption on an image', () => {
    const sectionId = getState().addSection('technisch');
    getState().addSectionItem(sectionId);
    const itemId = getState().offerte.secties.find(s => s.id === sectionId)!.items[0].id;
    getState().addImage(sectionId, itemId, { id: 'img1', path: '/test.jpg', thumbnail: 'data:...' });
    getState().updateImage(sectionId, itemId, 'img1', { caption: 'Test caption' });

    const item = getState().offerte.secties.find(s => s.id === sectionId)!.items[0];
    expect(item.afbeeldingen[0].caption).toBe('Test caption');
  });

  it('addSubItem appends a string to subItems', () => {
    const sectionId = getState().addSection('technisch');
    getState().addSectionItem(sectionId);
    const itemId = getState().offerte.secties.find(s => s.id === sectionId)!.items[0].id;
    getState().addSubItem(sectionId, itemId, 'Ramen souterrain');

    const item = getState().offerte.secties.find(s => s.id === sectionId)!.items[0];
    expect(item.subItems).toEqual(['Ramen souterrain']);
  });

  it('removeSubItem removes by index', () => {
    const sectionId = getState().addSection('technisch');
    getState().addSectionItem(sectionId);
    const itemId = getState().offerte.secties.find(s => s.id === sectionId)!.items[0].id;
    getState().addSubItem(sectionId, itemId, 'Item A');
    getState().addSubItem(sectionId, itemId, 'Item B');
    getState().removeSubItem(sectionId, itemId, 0);

    const item = getState().offerte.secties.find(s => s.id === sectionId)!.items[0];
    expect(item.subItems).toEqual(['Item B']);
  });

  it('updateSubItem updates text at index', () => {
    const sectionId = getState().addSection('technisch');
    getState().addSectionItem(sectionId);
    const itemId = getState().offerte.secties.find(s => s.id === sectionId)!.items[0].id;
    getState().addSubItem(sectionId, itemId, 'Old text');
    getState().updateSubItem(sectionId, itemId, 0, 'New text');

    const item = getState().offerte.secties.find(s => s.id === sectionId)!.items[0];
    expect(item.subItems).toEqual(['New text']);
  });
});
