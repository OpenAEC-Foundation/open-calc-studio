import { expect, it } from 'vitest';
import { parseLibraryJson } from '@/state/slices/resourceLibrarySlice';
import library from '@/data/nl-price-library.json';

it('does not use undated reference prices as active Dutch prices', () => {
  const items = parseLibraryJson(library);
  expect(items.length).toBe(98);
  expect(items.every(i => i.defaultUnitPrice === null && !!i.source)).toBe(true);
  expect(items.some(i => i.referenceUnitPrice !== null)).toBe(true);
  expect(new Set(items.map(i => i.id)).size).toBe(items.length);
});
it('preserves area and volume units and blocks ambiguous legacy units', () => {
  const resources = ['m²','m³','are','st/wk'].map((unit, i) => ({ code: String(i), unit, resourceType: 'materiaal' }));
  const items = parseLibraryJson({ resources });
  expect(items.slice(0, 2).map(i => i.unit)).toEqual(['m²','m³']);
  expect(items.slice(2).every(i => i.unitSupported === false)).toBe(true);
  expect(items.every(i => i.resourceType === 'materiaal')).toBe(true);
});
