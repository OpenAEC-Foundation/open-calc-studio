import { describe, expect, it } from 'vitest';
import { getColumnsForView, hiddenByQuantityToggle } from '@/components/grid/gridConstants';

// In UI-2 hoort de sleutel 'hoeveelheid' bij de kolom Uren. De knop
// Hoeveelheid liet daardoor de uren verdwijnen.
describe('knop Hoeveelheid', () => {
  it('verbergt in UI-1 de kolom Hoeveelheid', () => {
    expect(hiddenByQuantityToggle('hoeveelheid', 'st', false)).toBe(true);
    expect(hiddenByQuantityToggle('hoeveelheid', 'st', true)).toBe(false);
  });

  it('laat in UI-2 de kolom Uren staan', () => {
    expect(getColumnsForView('wpcalc').some(c => c.key === 'hoeveelheid')).toBe(true);
    expect(hiddenByQuantityToggle('hoeveelheid', 'wpcalc', false)).toBe(false);
  });

  it('raakt andere kolommen niet', () => {
    expect(hiddenByQuantityToggle('quantity', 'st', false)).toBe(false);
  });
});
