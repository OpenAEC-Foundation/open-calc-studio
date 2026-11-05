import { describe, expect, it } from 'vitest';
import { doesNotFit, fittedRect } from '@/services/system/fitWindow';

// Het venster opent op 1400 × 900; op een laptopscherm viel de onderkant weg.
describe('venster past op het scherm', () => {
  const venster = { width: 1400, height: 900 };

  it('maximaliseert op een 1920 × 1080-laptop met 150% schaal', () => {
    // 1400 × 900 bij 150% is 2100 × 1350 echte pixels; werkgebied zonder taakbalk 1920 × 1008.
    expect(doesNotFit({ width: 2100, height: 1350 }, { width: 1920, height: 1008 })).toBe(true);
  });

  it('maximaliseert ook als alleen de hoogte niet past', () => {
    expect(doesNotFit(venster, { width: 1920, height: 860 })).toBe(true);
  });

  it('laat het venster met rust op een groot scherm', () => {
    expect(doesNotFit(venster, { width: 1920, height: 1032 })).toBe(false);
  });

  it('laat het venster met rust als het precies past', () => {
    expect(doesNotFit(venster, { width: 1400, height: 900 })).toBe(false);
  });
});

// Na "verkleinen" moet het venster ook passen, niet terug naar 1400 × 900.
describe('passende grootte voor verkleinen', () => {
  it('is 90% van het werkgebied, in het midden', () => {
    expect(fittedRect({ position: { x: 0, y: 0 }, size: { width: 1920, height: 1008 } }))
      .toEqual({ position: { x: 96, y: 51 }, size: { width: 1728, height: 907 } });
  });

  it('houdt rekening met een tweede scherm dat niet op 0,0 begint', () => {
    const r = fittedRect({ position: { x: 1920, y: 0 }, size: { width: 1280, height: 680 } });
    expect(r.position.x).toBe(1920 + 64);
    expect(r.size).toEqual({ width: 1152, height: 612 });
  });
});
