import { describe, it, expect, beforeEach } from 'vitest';
import { clampUiZoom, nextUiZoom, loadUiZoom, saveUiZoom, UI_ZOOM_MIN, UI_ZOOM_MAX } from '@/services/system/uiZoom';

beforeEach(() => {
  try { localStorage.clear(); } catch { /* ignore */ }
});

describe('interface-zoom', () => {
  it('blijft binnen de grenzen', () => {
    expect(clampUiZoom(10)).toBe(UI_ZOOM_MIN);
    expect(clampUiZoom(500)).toBe(UI_ZOOM_MAX);
    expect(clampUiZoom(125)).toBe(125);
    expect(clampUiZoom(NaN)).toBe(100);
  });

  it('stapt voorspelbaar omhoog en omlaag', () => {
    expect(nextUiZoom(100, 1)).toBe(110);
    expect(nextUiZoom(100, -1)).toBe(90);
    // Tussenwaarden vallen op de eerstvolgende vaste stap
    expect(nextUiZoom(105, 1)).toBe(110);
    expect(nextUiZoom(105, -1)).toBe(100);
  });

  it('loopt niet voorbij de uitersten', () => {
    expect(nextUiZoom(UI_ZOOM_MAX, 1)).toBe(UI_ZOOM_MAX);
    expect(nextUiZoom(UI_ZOOM_MIN, -1)).toBe(UI_ZOOM_MIN);
  });

  it('onthoudt de keuze tussen sessies', () => {
    expect(loadUiZoom()).toBe(100);
    saveUiZoom(125);
    expect(loadUiZoom()).toBe(125);
  });

  it('negeert onzin in de opslag', () => {
    localStorage.setItem('ocs-ui-zoom', 'kaas');
    expect(loadUiZoom()).toBe(100);
  });
});
