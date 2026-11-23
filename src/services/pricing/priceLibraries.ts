// Built-in price library per country (issue #93). The country is stored per
// estimate in `schedule.priceCountry`; an estimate without one uses the Dutch
// library, as before. A country without a library has no built-in resources:
// never fall back silently to another country's prices.
import type { CostSchedule, ResourceLibraryItem } from '@/types/costModel';
import { PRICE_LIBRARY_FILES } from '@/data/price-libraries';
import { catalogueIdOf, parseLibraryJson } from './libraryJson';

export const DEFAULT_PRICE_COUNTRY = 'NL';

/** Countries that have a built-in library, in registry order. */
export const PRICE_LIBRARY_COUNTRIES: readonly string[] = Object.keys(PRICE_LIBRARY_FILES);

/** Catalogue IDs of all built-in libraries; their articles are swapped when the country changes. */
const BUILT_IN_CATALOGUES = new Set(Object.values(PRICE_LIBRARY_FILES).map(catalogueIdOf));

/** The price-library country of an estimate (upper-case ISO code), NL when unset or invalid. */
export function priceCountryOf(schedule: Pick<CostSchedule, 'priceCountry'> | null | undefined): string {
  const code = schedule?.priceCountry;
  return typeof code === 'string' && /^[a-z]{2}$/i.test(code) ? code.toUpperCase() : DEFAULT_PRICE_COUNTRY;
}

export function hasPriceLibrary(country: string): boolean {
  return Object.prototype.hasOwnProperty.call(PRICE_LIBRARY_FILES, country);
}

const parsed = new Map<string, ResourceLibraryItem[]>();

/** The built-in articles for a country; empty when it has no library. */
export function builtInLibraryItems(country: string): ResourceLibraryItem[] {
  if (!hasPriceLibrary(country)) return [];
  let items = parsed.get(country);
  if (!items) {
    items = parseLibraryJson(PRICE_LIBRARY_FILES[country]);
    parsed.set(country, items);
  }
  // A copy, so edits through the store (MCP update_resource) never reach the cache.
  return items.map(item => ({ ...item }));
}

/** True for the catalogue ID of a built-in country library: an own library never gets one. */
export function isBuiltInCatalogueId(id: string): boolean {
  return BUILT_IN_CATALOGUES.has(id);
}

export function isBuiltInLibraryItem(item: Pick<ResourceLibraryItem, 'catalogueId'>): boolean {
  return item.catalogueId !== undefined && BUILT_IN_CATALOGUES.has(item.catalogueId);
}

/**
 * The library list for another country: the built-in articles of `country`
 * first, then everything the user imported or added, unchanged.
 */
export function withBuiltInLibrary(current: ResourceLibraryItem[], country: string): ResourceLibraryItem[] {
  return [...builtInLibraryItems(country), ...current.filter(item => !isBuiltInLibraryItem(item))];
}
