import { describe, it, expect } from 'vitest';
import { normalizeUnit } from '@/services/importers/core';

// Knownbug 94: "uren" werd "st"; ook m¹, kg., weken en maanden werden niet omgezet.
describe('normalizeUnit (knownbug 94)', () => {
  it.each([
    ['uren', 'uur'],
    ['Uren', 'uur'],
    ['m¹', 'm'],
    ['kg.', 'kg'],
    ['st.', 'st'],
    ['weken', 'week'],
    ['maanden', 'mnd'],
    ['m2', 'm²'],
    ['stuks', 'st'],
  ])('%s → %s', (raw, unit) => {
    expect(normalizeUnit(raw)).toBe(unit);
  });

  it('valt voor onbekende tekst nog steeds terug op st', () => {
    expect(normalizeUnit('foo')).toBe('st');
    expect(normalizeUnit('')).toBe('st');
    expect(normalizeUnit('.')).toBe('st');
  });
});
